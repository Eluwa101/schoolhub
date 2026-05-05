const express = require('express');
const router = express.Router();
const { isAuthenticated, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/parentController');

const parentOnly = [isAuthenticated, requireRole('parent')];

router.get('/dashboard', ...parentOnly, ctrl.getDashboard);
router.get('/child/:studentId/progress', ...parentOnly, ctrl.getChildProgress);
router.get('/messages', ...parentOnly, ctrl.getMessages);
router.post('/messages', ...parentOnly, ctrl.postMessage);

router.post('/view-as/:studentId', ...parentOnly, ctrl.postViewAsStudent);
router.post('/exit-view', ...parentOnly, ctrl.postExitView);

module.exports = router;
