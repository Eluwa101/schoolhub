const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { supabase, supabaseAdmin } = require('../utils/supabaseClient');
const { getSchoolById, updateSchool, getSchoolStats } = require('../models/schoolModel');
const { getProfilesBySchool, getActiveProfilesBySchool, toggleUserActive: toggleActiveModel, createProfile } = require('../models/userModel');
const { getClassesBySchool, getAllClassesBySchool, getClassById, createClass, updateClass, deleteClass, getStudentsInClass, enrollStudent, removeStudentFromClass } = require('../models/classModel');
const { getSubjectsBySchool, getAllSubjectsBySchool, createSubject, updateSubject, deleteSubject, assignSubjectToClass } = require('../models/subjectModel');
const { getAnnouncements: fetchAnnouncements, createAnnouncement, deleteAnnouncement } = require('../models/announcementModel');
const { getAuditLogs } = require('../models/auditModel');
const { getSchoolAttendanceStats } = require('../models/attendanceModel');
const { getInbox, getSent, getMessageById, getThread, sendMessage, markConversationAsRead } = require('../models/messageModel');
const { createInviteToken } = require('../utils/inviteToken');
const { sendInviteEmail, sendNewMessageEmail, sendAnnouncementEmail } = require('../utils/mailer');
const { parseCsvBuffer, toCsv } = require('../utils/csv');
const { selectConversation, resolveReplyRecipient, buildConversationThread } = require('../utils/messageCenter');
const { slugify, normalizeSchoolTheme, normalizeSchoolPreferences } = require('../utils/helpers');
const { getApplicationsBySchool, getApplicationById, updateApplicationStatus, deleteApplication, getPendingCount } = require('../models/admissionModel');

function csvValue(row, keys) {
  for (const key of keys) {
    if (row[key]) return row[key].trim();
  }
  return '';
}

function generateTemporaryPassword() {
  return `SchoolHub!${crypto.randomBytes(6).toString('hex')}`;
}

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
    res.render('admin/school-settings', {
      title: 'School Settings',
      school,
      schoolTheme: normalizeSchoolTheme(school?.theme_settings),
      schoolPreferences: normalizeSchoolPreferences(school?.preferences),
    });
  } catch (err) {
    next(err);
  }
}

async function postSettings(req, res, next) {
  try {
    const {
      name,
      address,
      phone,
      email,
      website,
      termStart,
      termEnd,
      brandPrimary,
      brandSecondary,
      accentColor,
      surfaceTint,
      dateLocale,
      uiDensity,
      senderEmail,
    } = req.body;
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

    const updates = {
      name,
      address,
      phone,
      email,
      website,
      term_start: termStart || null,
      term_end: termEnd || null,
      theme_settings: normalizeSchoolTheme({
        primary: brandPrimary,
        secondary: brandSecondary,
        accent: accentColor,
        surface: surfaceTint,
      }),
      preferences: normalizeSchoolPreferences({ dateLocale, uiDensity, senderEmail }),
    };
    if (logoUrl) updates.logo_url = logoUrl;

    await updateSchool(req.schoolId, updates);
    if (req.session?.user) {
      req.session.user.schoolName = name;
    }
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
    const importReport = req.session.importReport || null;
    delete req.session.importReport;
    res.render('admin/manage-users', {
      title: 'Manage Users',
      users,
      total,
      page,
      totalPages: Math.ceil(total / 20),
      currentRole: role || '',
      importReport,
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

async function getUserImportTemplate(req, res, next) {
  try {
    const sample = [
      {
        email: 'student1@example.com',
        first_name: 'Ada',
        last_name: 'Okafor',
        role: 'student',
        phone: '+2348000000001',
        class_name: 'Grade 10A',
        academic_year: '2026/2027',
      },
      {
        email: 'teacher1@example.com',
        first_name: 'Musa',
        last_name: 'Bello',
        role: 'teacher',
        phone: '+2348000000002',
        class_name: '',
        academic_year: '',
      },
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="schoolhub-user-import-template.csv"');
    res.send(toCsv(sample));
  } catch (err) {
    next(err);
  }
}

async function postBulkImportUsers(req, res, next) {
  try {
    if (!req.file) {
      req.flash('error', 'Please upload a CSV file.');
      return res.redirect('/admin/users');
    }

    const rows = parseCsvBuffer(req.file.buffer).filter((row) => Object.values(row).some(Boolean));
    if (!rows.length) {
      req.flash('error', 'The uploaded CSV is empty.');
      return res.redirect('/admin/users');
    }

    const validRoles = new Set(['teacher', 'student', 'parent', 'school_admin']);
    const classes = await getAllClassesBySchool(req.schoolId);
    const classByName = new Map(classes.map((cls) => [cls.name.trim().toLowerCase(), cls]));

    const { data: authDirectory } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const knownEmails = new Set((authDirectory?.users || []).map((user) => String(user.email || '').toLowerCase()));

    const reportRows = [];
    let createdCount = 0;
    let enrolledCount = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const email = csvValue(row, ['email']).toLowerCase();
      const firstName = csvValue(row, ['first_name', 'firstname', 'first']);
      const lastName = csvValue(row, ['last_name', 'lastname', 'last']);
      const role = csvValue(row, ['role']).toLowerCase() || 'student';
      const phone = csvValue(row, ['phone', 'phone_number']);
      const className = csvValue(row, ['class_name', 'classname']);
      const academicYear = csvValue(row, ['academic_year', 'academicyear']);

      if (!email || !firstName || !lastName) {
        reportRows.push({ row: index + 2, email, status: 'Skipped', note: 'Missing email, first name, or last name.' });
        continue;
      }
      if (!validRoles.has(role)) {
        reportRows.push({ row: index + 2, email, status: 'Skipped', note: `Unsupported role "${role}".` });
        continue;
      }
      if (knownEmails.has(email)) {
        reportRows.push({ row: index + 2, email, status: 'Skipped', note: 'User already exists.' });
        continue;
      }

      const temporaryPassword = generateTemporaryPassword();
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      });

      if (authError || !authUser?.user) {
        reportRows.push({ row: index + 2, email, status: 'Error', note: authError?.message || 'Failed to create auth user.' });
        continue;
      }

      try {
        await createProfile({
          id: authUser.user.id,
          schoolId: req.schoolId,
          role,
          firstName,
          lastName,
          phone: phone || null,
        });

        if (role === 'student' && className) {
          const matchingClass = classByName.get(className.trim().toLowerCase());
          if (matchingClass) {
            await enrollStudent({
              studentId: authUser.user.id,
              classId: matchingClass.id,
              academicYear: academicYear || matchingClass.academic_year || new Date().getFullYear().toString(),
            });
            enrolledCount++;
            reportRows.push({
              row: index + 2,
              email,
              status: 'Created',
              note: `Created account and enrolled in ${matchingClass.name}.`,
            });
          } else {
            reportRows.push({
              row: index + 2,
              email,
              status: 'Created',
              note: `Created account, but class "${className}" was not found.`,
            });
          }
        } else {
          reportRows.push({
            row: index + 2,
            email,
            status: 'Created',
            note: 'Created account and sent password setup email.',
          });
        }

        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.APP_URL}/auth/reset-password`,
        }).catch(() => null);

        createdCount++;
        knownEmails.add(email);
      } catch (err) {
        reportRows.push({ row: index + 2, email, status: 'Error', note: err.message });
      }
    }

    req.session.importReport = {
      summary: {
        processed: rows.length,
        created: createdCount,
        enrolled: enrolledCount,
        skipped: reportRows.filter((row) => row.status === 'Skipped').length,
        errors: reportRows.filter((row) => row.status === 'Error').length,
      },
      rows: reportRows,
    };

    req.flash('success', `Processed ${rows.length} row(s). Created ${createdCount} account(s).`);
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', `Bulk import failed: ${err.message}`);
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
    const teachers = await getActiveProfilesBySchool(req.schoolId, { roles: ['teacher'] });
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
    const cls = await getClassById(req.params.id, req.schoolId);
    const students = await getStudentsInClass(req.params.id, req.schoolId);
    const [allStudents, teachers] = await Promise.all([
      getActiveProfilesBySchool(req.schoolId, { roles: ['student'] }),
      getActiveProfilesBySchool(req.schoolId, { roles: ['teacher'] }),
    ]);
    const enrolledIds = new Set(students.map((enrollment) => enrollment.student?.id).filter(Boolean));
    const availableStudents = allStudents.filter((student) => !enrolledIds.has(student.id));
    res.render('admin/class-detail', {
      title: `Class: ${cls.name}`,
      cls,
      students,
      allStudents: availableStudents,
      teachers,
    });
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

    const classes = await getAllClassesBySchool(req.schoolId);
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

async function deleteClassStudent(req, res, next) {
  try {
    const { classId, studentId } = req.params;
    await removeStudentFromClass(studentId, classId);
    req.flash('success', 'Student removed from class.');
    res.redirect(`/admin/classes/${classId}`);
  } catch (err) {
    req.flash('error', `Failed to remove student: ${err.message}`);
    res.redirect(`/admin/classes/${req.params.classId}`);
  }
}

// Subject Management
async function getSubjects(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const { subjects, total } = await getSubjectsBySchool(req.schoolId, { page });
    const [classes, teachers] = await Promise.all([
      getAllClassesBySchool(req.schoolId),
      getActiveProfilesBySchool(req.schoolId, { roles: ['teacher'] }),
    ]);
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

async function getTimetable(req, res, next) {
  try {
    const [classes, subjects, teachers] = await Promise.all([
      getAllClassesBySchool(req.schoolId),
      getAllSubjectsBySchool(req.schoolId),
      getActiveProfilesBySchool(req.schoolId, { roles: ['teacher'] }),
    ]);

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
    const conflicts = await checkTimetableConflict(req.schoolId, classId, dayOfWeek, startTime, endTime);
    if (conflicts.length) {
      const c = conflicts[0];
      req.flash('error', `Time conflict: ${c.subjects?.name || 'another subject'} is already scheduled ${c.start_time}–${c.end_time} on this day.`);
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

async function putTimetableEntry(req, res, next) {
  try {
    const { id } = req.params;
    const { classId, subjectId, teacherId, dayOfWeek, startTime, endTime, room } = req.body;
    if (!subjectId || !dayOfWeek || !startTime || !endTime) {
      req.flash('error', 'Subject, day, start time, and end time are required.');
      return res.redirect(`/admin/timetable${classId ? `?classId=${classId}` : ''}`);
    }
    if (classId) {
      const conflicts = await checkTimetableConflict(req.schoolId, classId, dayOfWeek, startTime, endTime, id);
      if (conflicts.length) {
        const c = conflicts[0];
        req.flash('error', `Time conflict: ${c.subjects?.name || 'another subject'} is already scheduled ${c.start_time}–${c.end_time} on this day.`);
        return res.redirect(`/admin/timetable?classId=${classId}`);
      }
    }
    const { error } = await supabaseAdmin.from('timetable').update({
      subject_id: subjectId,
      teacher_id: teacherId || null,
      day_of_week: parseInt(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room || null,
    }).eq('id', id).eq('school_id', req.schoolId);
    if (error) throw error;
    req.flash('success', 'Timetable entry updated.');
    res.redirect(`/admin/timetable${classId ? `?classId=${classId}` : ''}`);
  } catch (err) {
    req.flash('error', `Failed to update entry: ${err.message}`);
    res.redirect(`/admin/timetable${req.body.classId ? `?classId=${req.body.classId}` : ''}`);
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
    const classes = await getAllClassesBySchool(req.schoolId);
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
    const { title, body, targetRole, targetClassId, isPinned, sendEmail } = req.body;
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

    // Broadcast email notification (best-effort, non-blocking)
    if (sendEmail === 'on') {
      const school = await getSchoolById(req.schoolId);
      const senderEmail = school?.preferences?.senderEmail || process.env.EMAIL_FROM;
      const appUrl = process.env.APP_URL || '';

      let roleFilter = null;
      if (targetRole && targetRole !== 'all') roleFilter = targetRole;

      let userQuery = supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('school_id', req.schoolId)
        .eq('is_active', true);
      if (roleFilter) userQuery = userQuery.eq('role', roleFilter);
      if (targetClassId) {
        const { data: classStudents } = await supabaseAdmin
          .from('student_classes')
          .select('student_id')
          .eq('class_id', targetClassId);
        const studentIds = (classStudents || []).map(s => s.student_id);
        if (studentIds.length) userQuery = userQuery.in('id', studentIds);
        else userQuery = userQuery.eq('id', 'none');
      }

      const { data: recipients } = await userQuery.limit(500);
      if (recipients?.length) {
        Promise.all(recipients.map(async p => {
          try {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(p.id);
            if (authUser?.user?.email) {
              await sendAnnouncementEmail({
                to: authUser.user.email,
                schoolName: school?.name || 'Your School',
                announcementTitle: title,
                announcementBody: body,
                appUrl,
                senderEmail,
              });
            }
          } catch {}
        })).catch(() => {});
      }
    }

    req.flash('success', sendEmail === 'on' ? 'Announcement posted and emails queued.' : 'Announcement posted.');
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

// Messages
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

    res.render('admin/messages', {
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

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(recipientId);
    if (authUser?.user?.email) {
      sendNewMessageEmail({
        to: authUser.user.email,
        senderName: `${req.user.firstName} ${req.user.lastName || ''}`,
        messageSubject: subject,
        appUrl: process.env.APP_URL,
      }).catch(() => {});
    }

    const conversationId = parentMessageId || createdMessage.id;
    req.flash('success', parentMessageId ? 'Reply sent.' : 'Message sent.');
    res.redirect(`/admin/messages?tab=${returnTab || (parentMessageId ? 'inbox' : 'sent')}&messageId=${conversationId}`);
  } catch (err) {
    req.flash('error', `Failed to send message: ${err.message}`);
    res.redirect('/admin/messages');
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

    // Grade averages per subject
    const { data: gradeData } = await supabaseAdmin
      .from('grades')
      .select('score, max_score, subjects:subject_id(name), classes:class_id(name)')
      .eq('school_id', req.schoolId);

    const subjectGradeMap = {};
    (gradeData || []).forEach(g => {
      const sName = g.subjects?.name || 'Unknown';
      if (!subjectGradeMap[sName]) subjectGradeMap[sName] = [];
      subjectGradeMap[sName].push((g.score / g.max_score) * 100);
    });
    const subjectPerformance = Object.entries(subjectGradeMap).map(([name, scores]) => ({
      name,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    })).sort((a, b) => b.avg - a.avg);

    // Attendance breakdown
    const { data: attData } = await supabaseAdmin
      .from('attendance')
      .select('status')
      .eq('school_id', req.schoolId);
    const attBreakdown = { present: 0, absent: 0, late: 0, excused: 0 };
    (attData || []).forEach(r => { attBreakdown[r.status] = (attBreakdown[r.status] || 0) + 1; });

    // Assignment completion per class
    const { data: assignData } = await supabaseAdmin
      .from('assignments')
      .select('id, classes:class_id(name), assignment_submissions(count)')
      .eq('school_id', req.schoolId)
      .limit(100);
    const classSubmissionMap = {};
    (assignData || []).forEach(a => {
      const cls = a.classes?.name || 'Unknown';
      if (!classSubmissionMap[cls]) classSubmissionMap[cls] = { submissions: 0, assignments: 0 };
      classSubmissionMap[cls].assignments++;
      classSubmissionMap[cls].submissions += parseInt(a.assignment_submissions?.[0]?.count || 0);
    });
    const classCompletion = Object.entries(classSubmissionMap).map(([name, d]) => ({
      name,
      rate: d.assignments > 0 ? Math.round((d.submissions / (d.assignments * (stats.students || 1))) * 100) : 0,
    }));

    res.render('admin/reports', {
      title: 'Reports',
      stats,
      attendanceStats,
      logs,
      subjectPerformance,
      attBreakdown,
      classCompletion,
    });
  } catch (err) {
    next(err);
  }
}

async function exportReports(req, res, next) {
  try {
    const { type, dateFrom, dateTo, classId, format = 'csv' } = req.query;
    const school = await getSchoolById(req.schoolId);
    const schoolName = school?.name || 'SchoolHub';

    let headers = [];
    let rows = [];
    let filename = 'export';
    let title = 'Report';

    if (type === 'attendance') {
      let q = supabaseAdmin
        .from('attendance')
        .select('date, status, student:student_id(first_name, last_name), class:class_id(name), subject:subject_id(name)')
        .eq('school_id', req.schoolId)
        .order('date', { ascending: false })
        .limit(10000);
      if (dateFrom) q = q.gte('date', dateFrom);
      if (dateTo)   q = q.lte('date', dateTo);
      if (classId)  q = q.eq('class_id', classId);
      const { data } = await q;
      filename = `attendance-${dateFrom || 'all'}`;
      title = 'Attendance Report';
      headers = ['Date', 'Student', 'Class', 'Subject', 'Status'];
      rows = (data || []).map(r => [
        r.date,
        `${r.student?.first_name || ''} ${r.student?.last_name || ''}`.trim(),
        r.class?.name || '',
        r.subject?.name || '',
        r.status,
      ]);
    } else if (type === 'grades') {
      let q = supabaseAdmin
        .from('grades')
        .select('student:student_id(first_name, last_name), subject:subject_id(name), class:class_id(name), assessment_type, score, max_score, term, academic_year, graded_at')
        .eq('school_id', req.schoolId)
        .order('graded_at', { ascending: false })
        .limit(10000);
      if (dateFrom) q = q.gte('graded_at', dateFrom);
      if (dateTo)   q = q.lte('graded_at', dateTo + 'T23:59:59');
      if (classId)  q = q.eq('class_id', classId);
      const { data } = await q;
      filename = `grades-${dateFrom || 'all'}`;
      title = 'Grades Report';
      headers = ['Student', 'Subject', 'Class', 'Assessment', 'Score', 'Max Score', 'Percentage', 'Term', 'Academic Year', 'Date'];
      rows = (data || []).map(r => {
        const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0;
        return [
          `${r.student?.first_name || ''} ${r.student?.last_name || ''}`.trim(),
          r.subject?.name || '',
          r.class?.name || '',
          r.assessment_type,
          r.score,
          r.max_score,
          `${pct}%`,
          r.term,
          r.academic_year,
          r.graded_at?.substring(0, 10) || '',
        ];
      });
    } else if (type === 'students') {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('first_name, last_name, email, phone, created_at, is_active')
        .eq('school_id', req.schoolId)
        .eq('role', 'student')
        .order('last_name');
      filename = 'students-export';
      title = 'Student List';
      headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Enrolled', 'Active'];
      rows = (data || []).map(r => [
        r.first_name,
        r.last_name,
        r.email || '',
        r.phone || '',
        r.created_at?.substring(0, 10) || '',
        r.is_active ? 'Yes' : 'No',
      ]);
    } else if (type === 'assignments') {
      let q = supabaseAdmin
        .from('assignments')
        .select('title, classes:class_id(name), subjects:subject_id(name), due_date, max_score, assignment_submissions(count)')
        .eq('school_id', req.schoolId)
        .order('due_date', { ascending: false })
        .limit(5000);
      if (dateFrom) q = q.gte('due_date', dateFrom);
      if (dateTo)   q = q.lte('due_date', dateTo);
      if (classId)  q = q.eq('class_id', classId);
      const { data } = await q;
      filename = 'assignments-export';
      title = 'Assignments Report';
      headers = ['Title', 'Class', 'Subject', 'Due Date', 'Max Score', 'Submissions'];
      rows = (data || []).map(r => [
        r.title,
        r.classes?.name || '',
        r.subjects?.name || '',
        r.due_date,
        r.max_score,
        r.assignment_submissions?.[0]?.count || 0,
      ]);
    } else {
      req.flash('error', 'Invalid export type.');
      return res.redirect('/admin/reports');
    }

    if (format === 'xlsx') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = schoolName;
      workbook.created = new Date();
      const sheet = workbook.addWorksheet(title);
      sheet.addRow(headers);
      const hrow = sheet.getRow(1);
      hrow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      hrow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      hrow.height = 24;
      rows.forEach(r => sheet.addRow(r));
      sheet.columns.forEach((col, i) => { col.width = Math.max((headers[i] || '').length + 6, 14); });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      await workbook.xlsx.write(res);
      return;
    }

    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: rows.length && headers.length > 6 ? 'landscape' : 'portrait' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      doc.pipe(res);
      // Header
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1e1b4b').text(schoolName, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(13).font('Helvetica').fillColor('#374151').text(title, { align: 'center' });
      if (dateFrom || dateTo) {
        doc.fontSize(9).fillColor('#6b7280').text(`Period: ${dateFrom || 'start'} – ${dateTo || 'present'}`, { align: 'center' });
      }
      doc.moveDown(1);
      // Table
      const pageW = doc.page.width - 80;
      const colW = Math.floor(pageW / headers.length);
      let y = doc.y;
      const drawRow = (cells, bgColor, textColor, bold, rowH) => {
        doc.rect(40, y, pageW, rowH).fill(bgColor);
        cells.forEach((cell, i) => {
          doc.fillColor(textColor).fontSize(8)
             .font(bold ? 'Helvetica-Bold' : 'Helvetica')
             .text(String(cell ?? ''), 44 + i * colW, y + (rowH - 8) / 2, { width: colW - 6, ellipsis: true, lineBreak: false });
        });
        y += rowH;
      };
      drawRow(headers, '#4f46e5', '#ffffff', true, 22);
      rows.forEach((row, ri) => {
        if (y > doc.page.height - 70) { doc.addPage({ layout: doc.options.layout }); y = 40; }
        drawRow(row, ri % 2 === 0 ? '#f8fafc' : '#ffffff', '#374151', false, 18);
      });
      doc.end();
      return;
    }

    // Default: CSV
    function csvEsc(v) {
      const s = String(v ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
    }
    let csvData = headers.map(csvEsc).join(',') + '\n';
    rows.forEach(row => { csvData += row.map(csvEsc).join(',') + '\n'; });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send(csvData);
  } catch (err) {
    req.flash('error', `Failed to export data: ${err.message}`);
    res.redirect('/admin/reports');
  }
}

// Admissions Management
async function getAdmissions(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const status = req.query.status || null;
    const { applications, total } = await getApplicationsBySchool(req.schoolId, { page, status });
    const classes = await getAllClassesBySchool(req.schoolId);
    const pendingCount = await getPendingCount(req.schoolId);

    res.render('admin/admissions', {
      title: 'Admissions',
      applications,
      total,
      page,
      totalPages: Math.ceil(total / 30),
      currentStatus: status || '',
      classes,
      pendingCount,
    });
  } catch (err) {
    next(err);
  }
}

async function postAdmitStudents(req, res, next) {
  try {
    let { applicationIds, classId, action } = req.body;
    if (!applicationIds) {
      req.flash('error', 'No applications selected.');
      return res.redirect('/admin/admissions');
    }
    if (!Array.isArray(applicationIds)) applicationIds = [applicationIds];

    if (action === 'reject') {
      await Promise.all(applicationIds.map(id =>
        updateApplicationStatus(id, req.schoolId, {
          status: 'rejected',
          reviewedBy: req.user.userId,
        })
      ));
      req.flash('success', `${applicationIds.length} application(s) rejected.`);
      return res.redirect('/admin/admissions');
    }

    // Admit: create student accounts + link parents
    let admitted = 0;
    let errors = 0;

    for (const appId of applicationIds) {
      try {
        const app = await getApplicationById(appId, req.schoolId);
        if (!app || app.status !== 'pending') continue;

        const tempPassword = `SchoolHub!${crypto.randomBytes(6).toString('hex')}`;
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: `student.${app.student_first_name.toLowerCase()}.${app.student_last_name.toLowerCase()}.${Date.now().toString(36)}@schoolhub.internal`,
          password: tempPassword,
          email_confirm: true,
        });

        if (authError || !authData?.user) { errors++; continue; }

        const studentProfile = await createProfile({
          id: authData.user.id,
          schoolId: req.schoolId,
          role: 'student',
          firstName: app.student_first_name,
          lastName: app.student_last_name,
        });

        // Link parent to student
        if (app.parent_id) {
          await supabaseAdmin
            .from('parent_students')
            .upsert({ parent_id: app.parent_id, student_id: authData.user.id }, { onConflict: 'parent_id,student_id' });
        }

        // Enroll in class if selected
        const targetClassId = classId || app.assigned_class_id;
        if (targetClassId) {
          const classes = await getAllClassesBySchool(req.schoolId);
          const cls = classes.find(c => c.id === targetClassId);
          if (cls) {
            await enrollStudent({
              studentId: authData.user.id,
              classId: targetClassId,
              academicYear: cls.academic_year || new Date().getFullYear().toString(),
            });
          }
        }

        await updateApplicationStatus(appId, req.schoolId, {
          status: 'accepted',
          reviewedBy: req.user.userId,
          assignedClassId: targetClassId || null,
          studentId: authData.user.id,
        });

        // Send password reset so student can set their own password
        if (app.parent_id) {
          const { data: parentAuth } = await supabaseAdmin.auth.admin.getUserById(app.parent_id);
          if (parentAuth?.user?.email) {
            sendNewMessageEmail({
              to: parentAuth.user.email,
              senderName: req.session.user.schoolName,
              messageSubject: `Admission Accepted — ${app.student_first_name} ${app.student_last_name}`,
              appUrl: process.env.APP_URL,
            }).catch(() => {});
          }
        }

        admitted++;
      } catch (e) {
        errors++;
      }
    }

    req.flash('success', `${admitted} student(s) admitted successfully.${errors ? ` ${errors} failed.` : ''}`);
    res.redirect('/admin/admissions');
  } catch (err) {
    req.flash('error', `Admission failed: ${err.message}`);
    res.redirect('/admin/admissions');
  }
}

async function deleteAdmissionHandler(req, res, next) {
  try {
    await deleteApplication(req.params.id, req.schoolId);
    req.flash('success', 'Application removed.');
    res.redirect('/admin/admissions');
  } catch (err) {
    req.flash('error', `Failed to remove application: ${err.message}`);
    res.redirect('/admin/admissions');
  }
}

module.exports = {
  getDashboard,
  getSettings,
  postSettings,
  getUsers,
  postInviteUser,
  getUserImportTemplate,
  postBulkImportUsers,
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
  deleteClassStudent,
  getSubjects,
  postCreateSubject,
  postAssignSubjectToClass,
  deleteSubjectHandler,
  getTimetable,
  postTimetable,
  putTimetableEntry,
  patchTimetableEntry,
  deleteTimetableEntry,
  getAnnouncements,
  postAnnouncement,
  deleteAnnouncementHandler,
  getMessages,
  postMessage,
  getReports,
  exportReports,
  getAdmissions,
  postAdmitStudents,
  deleteAdmissionHandler,
};
