const { supabaseAdmin } = require('../utils/supabaseClient');
const { getClassesForTeacher, getStudentsInClass } = require('../models/classModel');
const { getSubjectsForTeacher } = require('../models/subjectModel');
const { getAttendanceByClassDate, bulkUpsertAttendance } = require('../models/attendanceModel');
const { getGradesByClassSubject, upsertGrade } = require('../models/gradeModel');
const { getAssignmentsByTeacher, getAssignmentById, createAssignment, getSubmissionsForAssignment, gradeSubmission } = require('../models/assignmentModel');
const { getInbox, getSent, sendMessage, getThread, getMessageById, markConversationAsRead } = require('../models/messageModel');
const { getActiveProfilesBySchool } = require('../models/userModel');
const { sendAssignmentNotificationEmail, sendNewMessageEmail } = require('../utils/mailer');
const { selectConversation, resolveReplyRecipient, buildConversationThread } = require('../utils/messageCenter');

async function getDashboard(req, res, next) {
  try {
    const teacherId = req.user.userId;
    const schoolId = req.schoolId;

    const today = new Date().getDay();
    const { data: todayClasses } = await supabaseAdmin
      .from('timetable')
      .select('*, subjects:subject_id(name), classes:class_id(name)')
      .eq('school_id', schoolId)
      .eq('teacher_id', teacherId)
      .eq('day_of_week', today)
      .order('start_time');

    const { assignments: pendingAssignments } = await getAssignmentsByTeacher(teacherId, schoolId, { limit: 5 });
    const { messages: recentMessages } = await getInbox(teacherId, schoolId, { limit: 5 });

    res.render('teacher/dashboard', {
      title: 'Teacher Dashboard',
      todayClasses: todayClasses || [],
      pendingAssignments,
      recentMessages,
    });
  } catch (err) {
    next(err);
  }
}

async function getMyClasses(req, res, next) {
  try {
    const classSubjects = await getClassesForTeacher(req.user.userId, req.schoolId);
    res.render('teacher/my-classes', { title: 'My Classes', classSubjects });
  } catch (err) {
    next(err);
  }
}

async function getAttendance(req, res, next) {
  try {
    const { classId } = req.params;
    const date = req.query.date || new Date().toISOString().substring(0, 10);
    const subjectId = req.query.subjectId || null;

    const students = await getStudentsInClass(classId, req.schoolId);
    const existingRecords = await getAttendanceByClassDate(classId, req.schoolId, date, subjectId);

    const attendanceMap = {};
    existingRecords.forEach(r => { attendanceMap[r.student_id] = r; });

    const { data: subjects } = await supabaseAdmin
      .from('class_subjects')
      .select('subjects:subject_id(id, name)')
      .eq('class_id', classId)
      .eq('teacher_id', req.user.userId);

    res.render('teacher/attendance', {
      title: 'Mark Attendance',
      classId,
      students,
      attendanceMap,
      date,
      subjectId,
      subjects: subjects?.map(s => s.subjects) || [],
    });
  } catch (err) {
    next(err);
  }
}

async function postAttendance(req, res, next) {
  try {
    const { classId } = req.params;
    const { date, subjectId, attendance } = req.body;

    if (!attendance || !date) {
      req.flash('error', 'Attendance data and date are required.');
      return res.redirect(`/teacher/attendance/${classId}`);
    }

    const records = Object.entries(attendance).map(([studentId, status]) => ({
      school_id: req.schoolId,
      class_id: classId,
      student_id: studentId,
      subject_id: subjectId || null,
      teacher_id: req.user.userId,
      date,
      status,
    }));

    await bulkUpsertAttendance(records);
    req.flash('success', `Attendance saved for ${records.length} students.`);
    res.redirect(`/teacher/attendance/${classId}?date=${date}${subjectId ? `&subjectId=${subjectId}` : ''}`);
  } catch (err) {
    req.flash('error', `Failed to save attendance: ${err.message}`);
    res.redirect(`/teacher/attendance/${req.params.classId}`);
  }
}

async function getGradebook(req, res, next) {
  try {
    const { classId, subjectId } = req.params;
    const term = req.query.term || '';
    const academicYear = req.query.academicYear || '';

    const students = await getStudentsInClass(classId, req.schoolId);
    const grades = await getGradesByClassSubject(classId, subjectId, req.schoolId, { term, academicYear });

    const gradeMap = {};
    grades.forEach(g => {
      if (!gradeMap[g.student_id]) gradeMap[g.student_id] = [];
      gradeMap[g.student_id].push(g);
    });

    const { data: subjectData } = await supabaseAdmin.from('subjects').select('name').eq('id', subjectId).single();
    const { data: classData } = await supabaseAdmin.from('classes').select('name').eq('id', classId).single();

    res.render('teacher/gradebook', {
      title: 'Gradebook',
      classId,
      subjectId,
      students,
      gradeMap,
      subjectName: subjectData?.name,
      className: classData?.name,
      term,
      academicYear,
    });
  } catch (err) {
    next(err);
  }
}

async function postGrade(req, res, next) {
  try {
    const { studentId, subjectId, classId, assessmentType, score, maxScore, term, academicYear, notes } = req.body;
    await upsertGrade({
      schoolId: req.schoolId,
      studentId,
      subjectId,
      classId,
      teacherId: req.user.userId,
      assessmentType,
      score: parseFloat(score),
      maxScore: parseFloat(maxScore) || 100,
      term,
      academicYear,
      notes,
    });
    req.flash('success', 'Grade saved.');
    res.redirect(`/teacher/grades/${classId}/${subjectId}?term=${term}&academicYear=${academicYear}`);
  } catch (err) {
    req.flash('error', `Failed to save grade: ${err.message}`);
    const { classId, subjectId, term, academicYear } = req.body;
    res.redirect(`/teacher/grades/${classId}/${subjectId}?term=${term || ''}&academicYear=${academicYear || ''}`);
  }
}

async function getAssignments(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const { assignments, total } = await getAssignmentsByTeacher(req.user.userId, req.schoolId, { page });
    const classSubjects = await getClassesForTeacher(req.user.userId, req.schoolId);

    const { data: allSubjects } = await supabaseAdmin
      .from('subjects')
      .select('id, name')
      .eq('school_id', req.schoolId);

    res.render('teacher/assignments', {
      title: 'Assignments',
      assignments,
      classSubjects,
      allSubjects: allSubjects || [],
      total,
      page,
      totalPages: Math.ceil(total / 20),
    });
  } catch (err) {
    next(err);
  }
}

async function postAssignment(req, res, next) {
  try {
    const { classId, subjectId, title, description, dueDate, maxScore } = req.body;
    let fileUrl = null;

    if (req.file) {
      const fileName = `${req.schoolId}/assignments/${Date.now()}-${req.file.originalname}`;
      const { data, error } = await supabaseAdmin.storage.from('schoolhub').upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
      });
      if (!error) {
        const { data: urlData } = supabaseAdmin.storage.from('schoolhub').getPublicUrl(fileName);
        fileUrl = urlData.publicUrl;
      }
    }

    const assignment = await createAssignment({
      schoolId: req.schoolId,
      classId,
      subjectId,
      teacherId: req.user.userId,
      title,
      description,
      dueDate,
      fileUrl,
      maxScore: parseFloat(maxScore) || 100,
    });

    // Notify students via email (best-effort)
    const students = await getStudentsInClass(classId, req.schoolId);
    const { data: classData } = await supabaseAdmin.from('classes').select('name').eq('id', classId).single();

    students.forEach(async (enrollment) => {
      if (enrollment.student?.id) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(enrollment.student.id);
        if (authUser?.user?.email) {
          sendAssignmentNotificationEmail({
            to: authUser.user.email,
            teacherName: `${req.user.firstName} ${req.user.lastName || ''}`,
            assignmentTitle: title,
            className: classData?.name,
            dueDate,
            appUrl: process.env.APP_URL,
          }).catch(() => {});
        }
      }
    });

    req.flash('success', 'Assignment created.');
    res.redirect('/teacher/assignments');
  } catch (err) {
    req.flash('error', `Failed to create assignment: ${err.message}`);
    res.redirect('/teacher/assignments');
  }
}

async function getSubmissions(req, res, next) {
  try {
    const assignment = await getAssignmentById(req.params.id, req.schoolId);
    if (!assignment) { req.flash('error', 'Assignment not found.'); return res.redirect('/teacher/assignments'); }
    const submissions = await getSubmissionsForAssignment(req.params.id);
    res.render('teacher/submissions', { title: `Submissions: ${assignment.title}`, assignment, submissions });
  } catch (err) {
    next(err);
  }
}

async function postGradeSubmission(req, res, next) {
  try {
    const { id: assignmentId, studentId } = req.params;
    const { score, feedback } = req.body;
    await gradeSubmission({ assignmentId, studentId, score: parseFloat(score), feedback, gradedBy: req.user.userId });
    req.flash('success', 'Submission graded.');
    res.redirect(`/teacher/assignments/${assignmentId}/submissions`);
  } catch (err) {
    req.flash('error', `Failed to grade submission: ${err.message}`);
    res.redirect(`/teacher/assignments/${req.params.id}/submissions`);
  }
}

async function getTimetable(req, res, next) {
  try {
    const teacherId = req.user.userId;
    const schoolId = req.schoolId;

    const classSubjects = await getClassesForTeacher(teacherId, schoolId);
    const classMap = new Map();
    classSubjects.forEach(cs => { if (cs.classes?.id) classMap.set(cs.classes.id, cs.classes); });
    const classes = [...classMap.values()];

    const selectedClassId = req.query.classId || classes[0]?.id || null;

    let timetableEntries = [];
    if (selectedClassId) {
      const { data } = await supabaseAdmin
        .from('timetable')
        .select('*, subjects:subject_id(name), classes:class_id(name), teacher:teacher_id(first_name, last_name)')
        .eq('school_id', schoolId)
        .eq('class_id', selectedClassId)
        .order('day_of_week')
        .order('start_time');
      timetableEntries = data || [];
    }

    const { data: subjects } = await supabaseAdmin.from('subjects').select('id, name').eq('school_id', schoolId).order('name');
    const teachers = await getActiveProfilesBySchool(schoolId, { roles: ['teacher'] });

    res.render('teacher/timetable', {
      title: 'Timetable',
      classes,
      subjects: subjects || [],
      teachers,
      timetableEntries,
      selectedClassId,
    });
  } catch (err) {
    next(err);
  }
}

async function checkTimetableConflict(schoolId, classId, dayOfWeek, startTime, endTime, excludeId = null) {
  let q = supabaseAdmin
    .from('timetable')
    .select('id, start_time, end_time, subjects:subject_id(name)')
    .eq('school_id', schoolId)
    .eq('class_id', classId)
    .eq('day_of_week', parseInt(dayOfWeek))
    .lt('start_time', endTime)
    .gt('end_time', startTime);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q;
  return data || [];
}

async function postTimetableEntry(req, res, next) {
  try {
    const teacherId = req.user.userId;
    const { classId, subjectId, assignedTeacherId, dayOfWeek, startTime, endTime, room } = req.body;
    if (!classId || !subjectId || !dayOfWeek || !startTime || !endTime) {
      req.flash('error', 'Class, subject, day, start time, and end time are required.');
      return res.redirect(`/teacher/timetable${classId ? `?classId=${classId}` : ''}`);
    }
    const classSubjects = await getClassesForTeacher(teacherId, req.schoolId);
    const hasAccess = classSubjects.some(cs => cs.classes?.id === classId);
    if (!hasAccess) {
      req.flash('error', 'You do not have access to this class.');
      return res.redirect('/teacher/timetable');
    }
    const conflicts = await checkTimetableConflict(req.schoolId, classId, dayOfWeek, startTime, endTime);
    if (conflicts.length) {
      const c = conflicts[0];
      req.flash('error', `Time conflict: ${c.subjects?.name || 'another subject'} is already scheduled ${c.start_time}–${c.end_time} on this day.`);
      return res.redirect(`/teacher/timetable?classId=${classId}`);
    }
    const { error } = await supabaseAdmin.from('timetable').insert({
      school_id: req.schoolId,
      class_id: classId,
      subject_id: subjectId,
      teacher_id: assignedTeacherId || teacherId,
      day_of_week: parseInt(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room || null,
    });
    if (error) throw error;
    req.flash('success', 'Timetable entry added.');
    res.redirect(`/teacher/timetable?classId=${classId}`);
  } catch (err) {
    req.flash('error', `Failed to add entry: ${err.message}`);
    res.redirect(`/teacher/timetable${req.body.classId ? `?classId=${req.body.classId}` : ''}`);
  }
}

async function putTimetableEntry(req, res, next) {
  try {
    const { id } = req.params;
    const { classId, subjectId, assignedTeacherId, dayOfWeek, startTime, endTime, room } = req.body;
    if (classId && dayOfWeek && startTime && endTime) {
      const conflicts = await checkTimetableConflict(req.schoolId, classId, dayOfWeek, startTime, endTime, id);
      if (conflicts.length) {
        const c = conflicts[0];
        req.flash('error', `Time conflict: ${c.subjects?.name || 'another subject'} is already scheduled ${c.start_time}–${c.end_time} on this day.`);
        return res.redirect(`/teacher/timetable?classId=${classId}`);
      }
    }
    const { error } = await supabaseAdmin.from('timetable').update({
      subject_id: subjectId,
      teacher_id: assignedTeacherId || null,
      day_of_week: parseInt(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room || null,
    }).eq('id', id).eq('school_id', req.schoolId);
    if (error) throw error;
    req.flash('success', 'Entry updated.');
    res.redirect(`/teacher/timetable${classId ? `?classId=${classId}` : ''}`);
  } catch (err) {
    req.flash('error', `Failed to update entry: ${err.message}`);
    res.redirect(`/teacher/timetable${req.body.classId ? `?classId=${req.body.classId}` : ''}`);
  }
}

async function patchTimetableEntry(req, res, next) {
  try {
    const { id } = req.params;
    const updates = {};
    if (req.body.dayOfWeek !== undefined) updates.day_of_week = parseInt(req.body.dayOfWeek);
    const { error } = await supabaseAdmin.from('timetable').update(updates).eq('id', id).eq('school_id', req.schoolId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function deleteTimetableEntry(req, res, next) {
  try {
    const { id } = req.params;
    const { classId } = req.query;
    const { error } = await supabaseAdmin.from('timetable').delete().eq('id', id).eq('school_id', req.schoolId);
    if (error) throw error;
    req.flash('success', 'Entry removed.');
    res.redirect(`/teacher/timetable${classId ? `?classId=${classId}` : ''}`);
  } catch (err) {
    req.flash('error', `Failed to remove entry: ${err.message}`);
    res.redirect(`/teacher/timetable${req.query.classId ? `?classId=${req.query.classId}` : ''}`);
  }
}

async function getMessages(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const tab = req.query.tab || 'inbox';
    const messageId = req.query.messageId || '';
    let messages = [], total = 0;

    if (tab === 'sent') {
      ({ messages, total } = await getSent(req.user.userId, req.schoolId, { page }));
    } else {
      ({ messages, total } = await getInbox(req.user.userId, req.schoolId, { page }));
    }

    const contacts = await getActiveProfilesBySchool(req.schoolId, {
      excludeUserId: req.user.userId,
      roles: ['school_admin', 'teacher', 'parent'],
    });
    const selectedConversation = selectConversation(messages, messageId) || messages[0] || null;
    let conversation = null;
    let replyRecipient = null;
    let selectedMessage = null;

    if (selectedConversation) {
      await markConversationAsRead(selectedConversation.id, req.user.userId, req.schoolId);
      selectedMessage = await getMessageById(selectedConversation.id, req.schoolId);
      const thread = await getThread(selectedConversation.id, req.schoolId);
      conversation = buildConversationThread(selectedMessage, thread);
      replyRecipient = resolveReplyRecipient({ root: selectedMessage }, req.user.userId);
    }

    res.render('teacher/messages', {
      title: 'Messages',
      messages,
      tab,
      total,
      page,
      totalPages: Math.ceil(total / 20),
      contacts,
      selectedConversation,
      selectedMessage,
      conversation,
      replyRecipient,
    });
  } catch (err) {
    next(err);
  }
}

async function postMessage(req, res, next) {
  try {
    const { recipientId, subject, body, parentMessageId, returnTab } = req.body;
    const createdMessage = await sendMessage({
      schoolId: req.schoolId,
      senderId: req.user.userId,
      recipientId,
      subject,
      body,
      parentMessageId: parentMessageId || null,
    });

    // Notify recipient
    const { data: recipient } = await supabaseAdmin.from('profiles').select('id').eq('id', recipientId).single();
    if (recipient) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(recipientId);
      if (authUser?.user?.email) {
        sendNewMessageEmail({
          to: authUser.user.email,
          senderName: `${req.user.firstName} ${req.user.lastName || ''}`,
          messageSubject: subject,
          appUrl: process.env.APP_URL,
        }).catch(() => {});
      }
    }

    const conversationId = parentMessageId || createdMessage.id;
    req.flash('success', parentMessageId ? 'Reply sent.' : 'Message sent.');
    res.redirect(`/teacher/messages?tab=${returnTab || (parentMessageId ? 'inbox' : 'sent')}&messageId=${conversationId}`);
  } catch (err) {
    req.flash('error', `Failed to send message: ${err.message}`);
    res.redirect('/teacher/messages');
  }
}

module.exports = {
  getDashboard,
  getMyClasses,
  getAttendance,
  postAttendance,
  getGradebook,
  postGrade,
  getAssignments,
  postAssignment,
  getSubmissions,
  postGradeSubmission,
  getTimetable,
  postTimetableEntry,
  putTimetableEntry,
  patchTimetableEntry,
  deleteTimetableEntry,
  getMessages,
  postMessage,
};
