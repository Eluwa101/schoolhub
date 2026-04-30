const { supabaseAdmin } = require('../utils/supabaseClient');
const { getClassesForStudent } = require('../models/classModel');
const { getGradesByStudent } = require('../models/gradeModel');
const { getAttendanceSummaryByStudent, getAttendanceByStudent } = require('../models/attendanceModel');
const { getAssignmentsForStudent, getSubmissionByStudent, upsertSubmission } = require('../models/assignmentModel');
const { getAnnouncements } = require('../models/announcementModel');
const { generateReportCard } = require('../utils/pdfGenerator');

async function getDashboard(req, res, next) {
  try {
    const studentId = req.user.userId;
    const schoolId = req.schoolId;

    const classEnrollments = await getClassesForStudent(studentId, schoolId);
    const classIds = classEnrollments.map(e => e.class?.id).filter(Boolean);

    const today = new Date().getDay();
    let todayClasses = [];
    if (classIds.length) {
      const { data } = await supabaseAdmin
        .from('timetable')
        .select('*, subjects:subject_id(name), classes:class_id(name), teacher:teacher_id(first_name, last_name)')
        .eq('school_id', schoolId)
        .in('class_id', classIds)
        .eq('day_of_week', today)
        .order('start_time');
      todayClasses = data || [];
    }

    const upcomingAssignments = await getAssignmentsForStudent(studentId, schoolId, classIds);
    const upcoming = upcomingAssignments.filter(a => new Date(a.due_date) >= new Date()).slice(0, 5);

    const { announcements } = await getAnnouncements(schoolId, { role: req.user.role, limit: 5 });
    const attendanceSummary = await getAttendanceSummaryByStudent(studentId, schoolId);

    res.render('student/dashboard', {
      title: 'Student Dashboard',
      todayClasses,
      upcomingAssignments: upcoming,
      announcements,
      attendanceSummary,
    });
  } catch (err) {
    next(err);
  }
}

async function getTimetable(req, res, next) {
  try {
    const studentId = req.user.userId;
    const classEnrollments = await getClassesForStudent(studentId, req.schoolId);
    const classIds = classEnrollments.map(e => e.class?.id).filter(Boolean);

    let timetable = [];
    if (classIds.length) {
      const { data } = await supabaseAdmin
        .from('timetable')
        .select('*, subjects:subject_id(name), classes:class_id(name), teacher:teacher_id(first_name, last_name)')
        .eq('school_id', req.schoolId)
        .in('class_id', classIds)
        .order('day_of_week')
        .order('start_time');
      timetable = data || [];
    }

    const byDay = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    timetable.forEach(entry => {
      if (byDay[entry.day_of_week]) byDay[entry.day_of_week].push(entry);
    });

    res.render('student/timetable', { title: 'My Timetable', byDay });
  } catch (err) {
    next(err);
  }
}

async function getGrades(req, res, next) {
  try {
    const term = req.query.term || '';
    const academicYear = req.query.academicYear || '';
    const grades = await getGradesByStudent(req.user.userId, req.schoolId, { term, academicYear });

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

    const overallAvg = Object.values(subjectMap).length > 0
      ? Math.round(Object.values(subjectMap).reduce((s, sub) => s + sub.average, 0) / Object.values(subjectMap).length)
      : 0;

    res.render('student/grades', {
      title: 'My Grades',
      subjectMap,
      overallAvg,
      term,
      academicYear,
    });
  } catch (err) {
    next(err);
  }
}

async function getReportCard(req, res, next) {
  try {
    const term = req.query.term || 'Term 1';
    const academicYear = req.query.academicYear || new Date().getFullYear().toString();
    const grades = await getGradesByStudent(req.user.userId, req.schoolId, { term, academicYear });
    const attendance = await getAttendanceSummaryByStudent(req.user.userId, req.schoolId);
    const { data: school } = await supabaseAdmin.from('schools').select('name').eq('id', req.schoolId).single();

    res.render('student/report-card', {
      title: 'Report Card',
      grades,
      attendance,
      school,
      term,
      academicYear,
      student: req.user,
    });
  } catch (err) {
    next(err);
  }
}

async function downloadReportCardPdf(req, res, next) {
  try {
    const term = req.query.term || 'Term 1';
    const academicYear = req.query.academicYear || new Date().getFullYear().toString();
    const grades = await getGradesByStudent(req.user.userId, req.schoolId, { term, academicYear });
    const attendance = await getAttendanceSummaryByStudent(req.user.userId, req.schoolId);
    const { data: school } = await supabaseAdmin.from('schools').select('name').eq('id', req.schoolId).single();

    const student = {
      first_name: req.user.firstName,
      last_name: req.user.lastName || '',
    };

    generateReportCard({ student, school, grades, attendance, term, academicYear, res });
  } catch (err) {
    next(err);
  }
}

async function getAssignments(req, res, next) {
  try {
    const classEnrollments = await getClassesForStudent(req.user.userId, req.schoolId);
    const classIds = classEnrollments.map(e => e.class?.id).filter(Boolean);
    const assignments = await getAssignmentsForStudent(req.user.userId, req.schoolId, classIds);

    const now = new Date();
    const upcoming = assignments.filter(a => new Date(a.due_date) >= now);
    const past = assignments.filter(a => new Date(a.due_date) < now);

    res.render('student/assignments', {
      title: 'My Assignments',
      upcoming,
      past,
    });
  } catch (err) {
    next(err);
  }
}

async function postSubmitAssignment(req, res, next) {
  try {
    const { id: assignmentId } = req.params;
    const { notes } = req.body;
    let fileUrl = null;

    if (req.file) {
      const fileName = `${req.schoolId}/submissions/${req.user.userId}/${Date.now()}-${req.file.originalname}`;
      const { data, error } = await supabaseAdmin.storage.from('schoolhub').upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
      });
      if (!error) {
        const { data: urlData } = supabaseAdmin.storage.from('schoolhub').getPublicUrl(fileName);
        fileUrl = urlData.publicUrl;
      }
    }

    await upsertSubmission({ assignmentId, studentId: req.user.userId, fileUrl, notes });
    req.flash('success', 'Assignment submitted.');
    res.redirect('/student/assignments');
  } catch (err) {
    next(err);
  }
}

async function getStudentAnnouncements(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const { announcements, total } = await getAnnouncements(req.schoolId, { role: req.user.role, page });
    res.render('student/announcements', {
      title: 'Announcements',
      announcements,
      total,
      page,
      totalPages: Math.ceil(total / 20),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard,
  getTimetable,
  getGrades,
  getReportCard,
  downloadReportCardPdf,
  getAssignments,
  postSubmitAssignment,
  getStudentAnnouncements,
};
