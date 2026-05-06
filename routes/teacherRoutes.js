const express = require('express');
const multer = require('multer');
const router = express.Router();
const { isAuthenticated, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/teacherController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const teacherOnly = [isAuthenticated, requireRole('teacher', 'school_admin', 'super_admin')];

router.get('/dashboard', ...teacherOnly, ctrl.getDashboard);
router.get('/classes', ...teacherOnly, ctrl.getMyClasses);

router.get('/attendance/:classId', ...teacherOnly, ctrl.getAttendance);
router.post('/attendance/:classId', ...teacherOnly, ctrl.postAttendance);

router.get('/grades/:classId/:subjectId', ...teacherOnly, ctrl.getGradebook);
router.post('/grades', ...teacherOnly, ctrl.postGrade);

router.get('/assignments', ...teacherOnly, ctrl.getAssignments);
router.post('/assignments', ...teacherOnly, upload.single('file'), ctrl.postAssignment);
router.get('/assignments/:id/submissions', ...teacherOnly, ctrl.getSubmissions);
router.post('/assignments/:id/grade/:studentId', ...teacherOnly, ctrl.postGradeSubmission);

router.get('/timetable', ...teacherOnly, ctrl.getTimetable);
router.post('/timetable', ...teacherOnly, ctrl.postTimetableEntry);
router.put('/timetable/:id', ...teacherOnly, ctrl.putTimetableEntry);
router.patch('/timetable/:id', ...teacherOnly, ctrl.patchTimetableEntry);
router.delete('/timetable/:id', ...teacherOnly, ctrl.deleteTimetableEntry);

router.get('/messages', ...teacherOnly, ctrl.getMessages);
router.post('/messages', ...teacherOnly, ctrl.postMessage);

router.get('/students', ...teacherOnly, ctrl.getStudents);
router.get('/students/:studentId', ...teacherOnly, ctrl.getStudentProfile);
router.post('/students/:studentId/notes', ...teacherOnly, ctrl.postStudentNote);

module.exports = router;
