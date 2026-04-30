const express = require('express');
const multer = require('multer');
const router = express.Router();
const { isAuthenticated, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/studentController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const studentOnly = [isAuthenticated, requireRole('student')];

router.get('/dashboard', ...studentOnly, ctrl.getDashboard);
router.get('/timetable', ...studentOnly, ctrl.getTimetable);

router.get('/grades', ...studentOnly, ctrl.getGrades);
router.get('/grades/report-card', ...studentOnly, ctrl.getReportCard);
router.get('/grades/report-card/pdf', ...studentOnly, ctrl.downloadReportCardPdf);

router.get('/assignments', ...studentOnly, ctrl.getAssignments);
router.post('/assignments/:id/submit', ...studentOnly, upload.single('file'), ctrl.postSubmitAssignment);

router.get('/announcements', ...studentOnly, ctrl.getStudentAnnouncements);

module.exports = router;
