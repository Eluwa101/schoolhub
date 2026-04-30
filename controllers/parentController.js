const { supabaseAdmin } = require('../utils/supabaseClient');
const { getGradesByStudent } = require('../models/gradeModel');
const { getAttendanceSummaryByStudent, getAttendanceByStudent } = require('../models/attendanceModel');
const { getClassesForStudent } = require('../models/classModel');
const { getAssignmentsForStudent } = require('../models/assignmentModel');
const { getInbox, getSent, sendMessage, markAsRead, getUnreadCount } = require('../models/messageModel');
const { getProfilesBySchool } = require('../models/userModel');
const { sendNewMessageEmail } = require('../utils/mailer');

async function getLinkedChildren(parentId) {
  const { data, error } = await supabaseAdmin
    .from('parent_students')
    .select('student:student_id (id, first_name, last_name, avatar_url)')
    .eq('parent_id', parentId);
  if (error) throw error;
  return data.map(d => d.student).filter(Boolean);
}

async function getDashboard(req, res, next) {
  try {
    const children = await getLinkedChildren(req.user.userId);
    const childSummaries = await Promise.all(
      children.map(async (child) => {
        const [attendanceSummary, grades] = await Promise.all([
          getAttendanceSummaryByStudent(child.id, req.schoolId),
          getGradesByStudent(child.id, req.schoolId),
        ]);
        const avg = grades.length > 0
          ? Math.round(grades.reduce((s, g) => s + (g.score / g.max_score) * 100, 0) / grades.length)
          : null;
        const unread = await getUnreadCount(req.user.userId, req.schoolId);
        return { child, attendanceSummary, averageGrade: avg, unreadMessages: unread };
      })
    );
    res.render('parent/dashboard', { title: 'Parent Dashboard', childSummaries });
  } catch (err) {
    next(err);
  }
}

async function getChildProgress(req, res, next) {
  try {
    const { studentId } = req.params;

    // Verify parent-child relationship
    const { data: relation } = await supabaseAdmin
      .from('parent_students')
      .select('id')
      .eq('parent_id', req.user.userId)
      .eq('student_id', studentId)
      .single();

    if (!relation) {
      req.flash('error', 'You do not have access to this student.');
      return res.redirect('/parent/dashboard');
    }

    const { data: child } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .eq('id', studentId)
      .single();

    const classEnrollments = await getClassesForStudent(studentId, req.schoolId);
    const classIds = classEnrollments.map(e => e.class?.id).filter(Boolean);

    const [grades, attendance, assignments] = await Promise.all([
      getGradesByStudent(studentId, req.schoolId),
      getAttendanceByStudent(studentId, req.schoolId, { limit: 30 }),
      getAssignmentsForStudent(studentId, req.schoolId, classIds),
    ]);

    const attendanceSummary = await getAttendanceSummaryByStudent(studentId, req.schoolId);

    const subjectMap = {};
    grades.forEach(g => {
      const key = g.subject_id;
      if (!subjectMap[key]) subjectMap[key] = { name: g.subjects?.name, grades: [] };
      subjectMap[key].grades.push(g);
    });
    Object.values(subjectMap).forEach(sub => {
      const total = sub.grades.reduce((s, g) => s + (g.score / g.max_score) * 100, 0);
      sub.average = sub.grades.length > 0 ? Math.round(total / sub.grades.length) : 0;
    });

    res.render('parent/child-progress', {
      title: `${child.first_name}'s Progress`,
      child,
      subjectMap,
      attendance,
      attendanceSummary,
      assignments,
      classEnrollments,
    });
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const tab = req.query.tab || 'inbox';
    let messages = [], total = 0;

    if (tab === 'sent') {
      ({ messages, total } = await getSent(req.user.userId, req.schoolId, { page }));
    } else {
      ({ messages, total } = await getInbox(req.user.userId, req.schoolId, { page }));
    }

    const { users: teachers } = await getProfilesBySchool(req.schoolId, { role: 'teacher' });

    res.render('parent/messages', {
      title: 'Messages',
      messages,
      tab,
      total,
      page,
      totalPages: Math.ceil(total / 20),
      teachers,
    });
  } catch (err) {
    next(err);
  }
}

async function postMessage(req, res, next) {
  try {
    const { recipientId, subject, body, parentMessageId } = req.body;
    await sendMessage({
      schoolId: req.schoolId,
      senderId: req.user.userId,
      recipientId,
      subject,
      body,
      parentMessageId: parentMessageId || null,
    });

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(recipientId);
    if (authUser?.user?.email) {
      sendNewMessageEmail({
        to: authUser.user.email,
        senderName: `${req.user.firstName} ${req.user.lastName || ''}`,
        messageSubject: subject,
        appUrl: process.env.APP_URL,
      }).catch(() => {});
    }

    req.flash('success', 'Message sent.');
    res.redirect('/parent/messages');
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard, getChildProgress, getMessages, postMessage };
