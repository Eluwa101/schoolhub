const express = require('express');
const multer = require('multer');
const router = express.Router();
const { isAuthenticated, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/adminController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const adminOnly = [isAuthenticated, requireRole('school_admin', 'super_admin')];

router.get('/dashboard', ...adminOnly, ctrl.getDashboard);

router.get('/settings', ...adminOnly, ctrl.getSettings);
router.post('/settings', ...adminOnly, upload.single('logo'), ctrl.postSettings);

router.get('/users', ...adminOnly, ctrl.getUsers);
router.post('/users/invite', ...adminOnly, ctrl.postInviteUser);
router.get('/users/import-template', ...adminOnly, ctrl.getUserImportTemplate);
router.post('/users/import', ...adminOnly, upload.single('spreadsheet'), ctrl.postBulkImportUsers);
router.get('/users/:id', ...adminOnly, ctrl.getUserProfile);
router.post('/users/:id/toggle-active', ...adminOnly, ctrl.toggleUserActive);
router.post('/users/:id/link-child', ...adminOnly, ctrl.postLinkChild);
router.delete('/users/:id/unlink-child/:studentId', ...adminOnly, ctrl.postUnlinkChild);

router.get('/classes', ...adminOnly, ctrl.getClasses);
router.post('/classes', ...adminOnly, ctrl.postCreateClass);
router.get('/classes/:id', ...adminOnly, ctrl.getClassDetail);
router.put('/classes/:id', ...adminOnly, ctrl.putClass);
router.delete('/classes/:id', ...adminOnly, ctrl.deleteClassHandler);
router.post('/classes/:classId/enroll-students', ...adminOnly, ctrl.postEnrollStudents);
router.delete('/classes/:classId/students/:studentId', ...adminOnly, ctrl.deleteClassStudent);

router.get('/subjects', ...adminOnly, ctrl.getSubjects);
router.post('/subjects', ...adminOnly, ctrl.postCreateSubject);
router.post('/subjects/assign', ...adminOnly, ctrl.postAssignSubjectToClass);
router.delete('/subjects/:id', ...adminOnly, ctrl.deleteSubjectHandler);

router.get('/timetable', ...adminOnly, ctrl.getTimetable);
router.post('/timetable', ...adminOnly, ctrl.postTimetable);
router.put('/timetable/:id', ...adminOnly, ctrl.putTimetableEntry);
router.patch('/timetable/:id', ...adminOnly, ctrl.patchTimetableEntry);
router.delete('/timetable/:id', ...adminOnly, ctrl.deleteTimetableEntry);

router.get('/announcements', ...adminOnly, ctrl.getAnnouncements);
router.post('/announcements', ...adminOnly, ctrl.postAnnouncement);
router.delete('/announcements/:id', ...adminOnly, ctrl.deleteAnnouncementHandler);

router.get('/messages', ...adminOnly, ctrl.getMessages);
router.post('/messages', ...adminOnly, ctrl.postMessage);

router.get('/reports', ...adminOnly, ctrl.getReports);
router.get('/reports/export', ...adminOnly, ctrl.exportReports);

router.get('/admissions', ...adminOnly, ctrl.getAdmissions);
router.post('/admissions/action', ...adminOnly, ctrl.postAdmitStudents);
router.delete('/admissions/:id', ...adminOnly, ctrl.deleteAdmissionHandler);

module.exports = router;
