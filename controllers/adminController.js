const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { getSchoolById, updateSchool, getSchoolStats } = require('../models/schoolModel');
const { getProfilesBySchool, toggleUserActive: toggleActiveModel } = require('../models/userModel');
const { getClassesBySchool, createClass, updateClass, deleteClass, getStudentsInClass, enrollStudent } = require('../models/classModel');
const { getSubjectsBySchool, createSubject, updateSubject, deleteSubject, assignSubjectToClass } = require('../models/subjectModel');
const { getAnnouncements: fetchAnnouncements, createAnnouncement, deleteAnnouncement } = require('../models/announcementModel');
const { getAuditLogs } = require('../models/auditModel');
const { getSchoolAttendanceStats } = require('../models/attendanceModel');
const { createInviteToken } = require('../utils/inviteToken');
const { sendInviteEmail } = require('../utils/mailer');
const { slugify } = require('../utils/helpers');

// Dashboard
async function getDashboard(req, res, next) {
  try {
    const [stats, { logs }] = await Promise.all([
      getSchoolStats(req.schoolId),
      getAuditLogs(req.schoolId, { limit: 10 }),
    ]);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats,
      recentActivity: logs,
    });
  } catch (err) {
    next(err);
  }
}

// School Settings
async function getSettings(req, res, next) {
  try {
    const school = await getSchoolById(req.schoolId);
    res.render('admin/school-settings', { title: 'School Settings', school });
  } catch (err) {
    next(err);
  }
}

async function postSettings(req, res, next) {
  try {
    const { name, address, phone, email, website, termStart, termEnd } = req.body;
    let logoUrl = undefined;

    if (req.file) {
      const fileName = `${req.schoolId}/logo/${Date.now()}-${req.file.originalname}`;
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('schoolhub')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage.from('schoolhub').getPublicUrl(fileName);
        logoUrl = urlData.publicUrl;
      }
    }

    const updates = { name, address, phone, email, website, term_start: termStart || null, term_end: termEnd || null };
    if (logoUrl) updates.logo_url = logoUrl;

    await updateSchool(req.schoolId, updates);
    req.flash('success', 'School settings updated.');
    res.redirect('/admin/settings');
  } catch (err) {
    req.flash('error', `Failed to update settings: ${err.message}`);
    res.redirect('/admin/settings');
  }
}

// User Management
async function getUsers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const role = req.query.role || null;
    const { users, total } = await getProfilesBySchool(req.schoolId, { role, page });
    res.render('admin/manage-users', {
      title: 'Manage Users',
      users,
      total,
      page,
      totalPages: Math.ceil(total / 20),
      currentRole: role || '',
    });
  } catch (err) {
    next(err);
  }
}

async function postInviteUser(req, res, next) {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      req.flash('error', 'Email and role are required.');
      return res.redirect('/admin/users');
    }

    const validRoles = ['teacher', 'student', 'parent', 'school_admin'];
    if (!validRoles.includes(role)) {
      req.flash('error', 'Invalid role.');
      return res.redirect('/admin/users');
    }

    const { data: school } = await supabaseAdmin.from('schools').select('name').eq('id', req.schoolId).single();
    const inviter = req.user;

    const invite = await createInviteToken({
      schoolId: req.schoolId,
      email,
      role,
      invitedBy: inviter.userId,
    });

    const inviteUrl = `${process.env.APP_URL}/auth/invite?token=${invite.token}`;
    const emailSent = await sendInviteEmail({
      to: email,
      role,
      schoolName: school.name,
      inviteUrl,
      inviterName: `${inviter.firstName} ${inviter.lastName}`,
    }).then(() => true).catch(() => false);

    if (emailSent) {
      req.flash('success', `Invitation email sent to ${email}.`);
    } else {
      req.flash('success', `Invite created for ${email}. Share this link manually: ${inviteUrl}`);
    }
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', `Failed to create invitation: ${err.message}`);
    res.redirect('/admin/users');
  }
}

async function toggleUserActiveHandler(req, res, next) {
  try {
    const { id } = req.params;
    await toggleActiveModel(id, req.schoolId);
    req.flash('success', 'User status updated.');
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', `Failed to update user status: ${err.message}`);
    res.redirect('/admin/users');
  }
}

async function getUserProfile(req, res, next) {
  try {
    const { id } = req.params;
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .eq('school_id', req.schoolId)
      .single();

    if (error || !profile) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    let linkedStudents = [];
    let availableStudents = [];

    if (profile.role === 'parent') {
      const { data: links } = await supabaseAdmin
        .from('parent_students')
        .select('student:student_id(id, first_name, last_name)')
        .eq('parent_id', id);
      linkedStudents = links?.map(l => l.student).filter(Boolean) || [];

      const { users: allStudents } = await getProfilesBySchool(req.schoolId, { role: 'student' });
      const linkedIds = new Set(linkedStudents.map(s => s.id));
      availableStudents = allStudents.filter(s => !linkedIds.has(s.id));
    }

    res.render('admin/user-profile', {
      title: `${profile.first_name} ${profile.last_name}`,
      profile,
      linkedStudents,
      availableStudents,
    });
  } catch (err) {
    next(err);
  }
}

async function postLinkChild(req, res, next) {
  try {
    const { id } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      req.flash('error', 'Please select a student.');
      return res.redirect(`/admin/users/${id}`);
    }

    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', studentId)
      .eq('school_id', req.schoolId)
      .single();

    if (!student) {
      req.flash('error', 'Student not found in this school.');
      return res.redirect(`/admin/users/${id}`);
    }

    const { error } = await supabaseAdmin
      .from('parent_students')
      .upsert({ parent_id: id, student_id: studentId }, { onConflict: 'parent_id,student_id' });

    if (error) throw error;

    req.flash('success', 'Student linked to parent successfully.');
    res.redirect(`/admin/users/${id}`);
  } catch (err) {
    req.flash('error', `Failed to link student: ${err.message}`);
    res.redirect(`/admin/users/${req.params.id}`);
  }
}

async function postUnlinkChild(req, res, next) {
  try {
    const { id, studentId } = req.params;
    const { error } = await supabaseAdmin
      .from('parent_students')
      .delete()
      .eq('parent_id', id)
      .eq('student_id', studentId);

    if (error) throw error;

    req.flash('success', 'Student unlinked from parent.');
    res.redirect(`/admin/users/${id}`);
  } catch (err) {
    req.flash('error', `Failed to unlink student: ${err.message}`);
    res.redirect(`/admin/users/${req.params.id}`);
  }
}

// Class Management
async function getClasses(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const { classes, total } = await getClassesBySchool(req.schoolId, { page });
    const { users: teachers } = await getProfilesBySchool(req.schoolId, { role: 'teacher' });
    res.render('admin/manage-classes', {
      title: 'Manage Classes',
      classes,
      teachers,
      total,
      page,
      totalPages: Math.ceil(total / 20),
    });
  } catch (err) {
    next(err);
  }
}

async function postCreateClass(req, res, next) {
  try {
    const { name, gradeLevel, academicYear, classTeacherId } = req.body;
    if (!name || !academicYear) {
      req.flash('error', 'Class name and academic year are required.');
      return res.redirect('/admin/classes');
    }
    await createClass({ schoolId: req.schoolId, name, gradeLevel, academicYear, classTeacherId: classTeacherId || null });
    req.flash('success', `Class "${name}" created.`);
    res.redirect('/admin/classes');
  } catch (err) {
    req.flash('error', `Failed to create class: ${err.message}`);
    res.redirect('/admin/classes');
  }
}

async function putClass(req, res, next) {
  try {
    const { id } = req.params;
    const { name, gradeLevel, academicYear, classTeacherId } = req.body;
    await updateClass(id, req.schoolId, {
      name, grade_level: gradeLevel, academic_year: academicYear,
      class_teacher_id: classTeacherId || null,
    });
    req.flash('success', 'Class updated.');
    res.redirect('/admin/classes');
  } catch (err) {
    req.flash('error', `Failed to update class: ${err.message}`);
    res.redirect('/admin/classes');
  }
}

async function deleteClassHandler(req, res, next) {
  try {
    await deleteClass(req.params.id, req.schoolId);
    req.flash('success', 'Class deleted.');
    res.redirect('/admin/classes');
  } catch (err) {
    req.flash('error', `Failed to delete class: ${err.message}`);
    res.redirect('/admin/classes');
  }
}

async function getClassDetail(req, res, next) {
  try {
    const { getClassById } = require('../models/classModel');
    const cls = await getClassById(req.params.id, req.schoolId);
    const students = await getStudentsInClass(req.params.id, req.schoolId);
    const { users: allStudents } = await getProfilesBySchool(req.schoolId, { role: 'student' });
    res.render('admin/class-detail', { title: `Class: ${cls.name}`, cls, students, allStudents });
  } catch (err) {
    next(err);
  }
}

async function postEnrollStudents(req, res, next) {
  try {
    const { classId } = req.params;
    let studentIds = req.body.studentIds;
    if (!studentIds) { req.flash('error', 'No students selected.'); return res.redirect(`/admin/classes/${classId}`); }
    if (!Array.isArray(studentIds)) studentIds = [studentIds];

    const { classes } = await getClassesBySchool(req.schoolId);
    const cls = classes?.find(c => c.id === classId);
    const academicYear = cls?.academic_year || new Date().getFullYear().toString();

    await Promise.all(studentIds.map(sid => enrollStudent({ studentId: sid, classId, academicYear })));
    req.flash('success', `${studentIds.length} student(s) enrolled.`);
    res.redirect(`/admin/classes/${classId}`);
  } catch (err) {
    req.flash('error', `Failed to enroll students: ${err.message}`);
    res.redirect(`/admin/classes/${req.params.classId}`);
  }
}

// Subject Management
async function getSubjects(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const { subjects, total } = await getSubjectsBySchool(req.schoolId, { page });
    const { classes } = await getClassesBySchool(req.schoolId);
    const { users: teachers } = await getProfilesBySchool(req.schoolId, { role: 'teacher' });
    res.render('admin/manage-subjects', {
      title: 'Manage Subjects',
      subjects,
      classes,
      teachers,
      total,
      page,
      totalPages: Math.ceil(total / 20),
    });
  } catch (err) {
    next(err);
  }
}

async function postCreateSubject(req, res, next) {
  try {
    const { name, code, description } = req.body;
    if (!name) {
      req.flash('error', 'Subject name is required.');
      return res.redirect('/admin/subjects');
    }
    await createSubject({ schoolId: req.schoolId, name, code, description });
    req.flash('success', `Subject "${name}" created.`);
    res.redirect('/admin/subjects');
  } catch (err) {
    req.flash('error', `Failed to create subject: ${err.message}`);
    res.redirect('/admin/subjects');
  }
}

async function postAssignSubjectToClass(req, res, next) {
  try {
    const { classId, subjectId, teacherId } = req.body;
    if (!classId || !subjectId) {
      req.flash('error', 'Class and subject are required.');
      return res.redirect('/admin/subjects');
    }
    await assignSubjectToClass({ classId, subjectId, teacherId: teacherId || null });
    req.flash('success', 'Subject assigned to class.');
    res.redirect('/admin/subjects');
  } catch (err) {
    req.flash('error', `Failed to assign subject: ${err.message}`);
    res.redirect('/admin/subjects');
  }
}

async function deleteSubjectHandler(req, res, next) {
  try {
    await deleteSubject(req.params.id, req.schoolId);
    req.flash('success', 'Subject deleted.');
    res.redirect('/admin/subjects');
  } catch (err) {
    req.flash('error', `Failed to delete subject: ${err.message}`);
    res.redirect('/admin/subjects');
  }
}

// Timetable
async function getTimetable(req, res, next) {
  try {
    const { classes } = await getClassesBySchool(req.schoolId);
    const { subjects } = await getSubjectsBySchool(req.schoolId);
    const { users: teachers } = await getProfilesBySchool(req.schoolId, { role: 'teacher' });

    let timetableEntries = [];
    const classId = req.query.classId;
    if (classId) {
      const { data } = await supabaseAdmin
        .from('timetable')
        .select('*, subjects:subject_id(name), classes:class_id(name), teacher:teacher_id(first_name, last_name)')
        .eq('school_id', req.schoolId)
        .eq('class_id', classId)
        .order('day_of_week')
        .order('start_time');
      timetableEntries = data || [];
    }

    res.render('admin/timetable', {
      title: 'Timetable',
      classes,
      subjects,
      teachers,
      timetableEntries,
      selectedClassId: classId || null,
    });
  } catch (err) {
    next(err);
  }
}

async function postTimetable(req, res, next) {
  try {
    const { classId, subjectId, teacherId, dayOfWeek, startTime, endTime, room } = req.body;
    if (!classId || !subjectId || !dayOfWeek || !startTime || !endTime) {
      req.flash('error', 'Class, subject, day, start time, and end time are required.');
      return res.redirect(`/admin/timetable${classId ? `?classId=${classId}` : ''}`);
    }
    const { error } = await supabaseAdmin.from('timetable').insert({
      school_id: req.schoolId,
      class_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId || null,
      day_of_week: parseInt(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room || null,
    });
    if (error) throw error;
    req.flash('success', 'Timetable entry added.');
    res.redirect(`/admin/timetable?classId=${classId}`);
  } catch (err) {
    req.flash('error', `Failed to add timetable entry: ${err.message}`);
    res.redirect(`/admin/timetable${req.body.classId ? `?classId=${req.body.classId}` : ''}`);
  }
}

async function deleteTimetableEntry(req, res, next) {
  try {
    const { id } = req.params;
    const { classId } = req.query;
    const { error } = await supabaseAdmin.from('timetable').delete().eq('id', id).eq('school_id', req.schoolId);
    if (error) throw error;
    req.flash('success', 'Timetable entry removed.');
    res.redirect(`/admin/timetable${classId ? `?classId=${classId}` : ''}`);
  } catch (err) {
    req.flash('error', `Failed to remove timetable entry: ${err.message}`);
    res.redirect(`/admin/timetable${req.query.classId ? `?classId=${req.query.classId}` : ''}`);
  }
}

// Announcements
async function getAnnouncements(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const { announcements, total } = await fetchAnnouncements(req.schoolId, { page });
    const { classes } = await getClassesBySchool(req.schoolId);
    res.render('admin/announcements', {
      title: 'Announcements',
      announcements,
      classes,
      total,
      page,
      totalPages: Math.ceil(total / 20),
    });
  } catch (err) {
    next(err);
  }
}

async function postAnnouncement(req, res, next) {
  try {
    const { title, body, targetRole, targetClassId, isPinned } = req.body;
    if (!title || !body) {
      req.flash('error', 'Title and body are required.');
      return res.redirect('/admin/announcements');
    }
    await createAnnouncement({
      schoolId: req.schoolId,
      authorId: req.user.userId,
      title,
      body,
      targetRole: targetRole || 'all',
      targetClassId: targetClassId || null,
      isPinned: isPinned === 'on',
    });
    req.flash('success', 'Announcement posted.');
    res.redirect('/admin/announcements');
  } catch (err) {
    req.flash('error', `Failed to post announcement: ${err.message}`);
    res.redirect('/admin/announcements');
  }
}

async function deleteAnnouncementHandler(req, res, next) {
  try {
    await deleteAnnouncement(req.params.id, req.schoolId);
    req.flash('success', 'Announcement deleted.');
    res.redirect('/admin/announcements');
  } catch (err) {
    req.flash('error', `Failed to delete announcement: ${err.message}`);
    res.redirect('/admin/announcements');
  }
}

// Reports
async function getReports(req, res, next) {
  try {
    const [stats, attendanceStats, { logs }] = await Promise.all([
      getSchoolStats(req.schoolId),
      getSchoolAttendanceStats(req.schoolId),
      getAuditLogs(req.schoolId, { limit: 50 }),
    ]);
    res.render('admin/reports', {
      title: 'Reports',
      stats,
      attendanceStats,
      logs,
    });
  } catch (err) {
    next(err);
  }
}

async function exportReports(req, res, next) {
  try {
    const { type } = req.query;
    let csvData = '';
    let filename = 'export.csv';

    if (type === 'attendance') {
      const { data } = await supabaseAdmin
        .from('attendance')
        .select('date, status, student:student_id(first_name, last_name), class:class_id(name), subject:subject_id(name)')
        .eq('school_id', req.schoolId)
        .order('date', { ascending: false })
        .limit(5000);

      filename = 'attendance-export.csv';
      csvData = 'Date,Student,Class,Subject,Status\n';
      data.forEach(r => {
        csvData += `${r.date},${r.student?.first_name} ${r.student?.last_name},${r.class?.name},${r.subject?.name},${r.status}\n`;
      });
    } else if (type === 'grades') {
      const { data } = await supabaseAdmin
        .from('grades')
        .select('student:student_id(first_name, last_name), subject:subject_id(name), class:class_id(name), assessment_type, score, max_score, term, academic_year, graded_at')
        .eq('school_id', req.schoolId)
        .order('graded_at', { ascending: false })
        .limit(5000);

      filename = 'grades-export.csv';
      csvData = 'Student,Subject,Class,Assessment,Score,Max Score,Term,Academic Year,Date\n';
      data.forEach(r => {
        csvData += `${r.student?.first_name} ${r.student?.last_name},${r.subject?.name},${r.class?.name},${r.assessment_type},${r.score},${r.max_score},${r.term},${r.academic_year},${r.graded_at?.substring(0, 10)}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (err) {
    req.flash('error', `Failed to export data: ${err.message}`);
    res.redirect('/admin/reports');
  }
}

module.exports = {
  getDashboard,
  getSettings,
  postSettings,
  getUsers,
  postInviteUser,
  toggleUserActive: toggleUserActiveHandler,
  getUserProfile,
  postLinkChild,
  postUnlinkChild,
  getClasses,
  postCreateClass,
  putClass,
  deleteClassHandler,
  getClassDetail,
  postEnrollStudents,
  getSubjects,
  postCreateSubject,
  postAssignSubjectToClass,
  deleteSubjectHandler,
  getTimetable,
  postTimetable,
  deleteTimetableEntry,
  getAnnouncements,
  postAnnouncement,
  deleteAnnouncementHandler,
  getReports,
  exportReports,
};
