const express = require('express');
const multer = require('multer');
const passport = require('passport');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const {
  getLogin, postLogin,
  getRegister, postRegister, registerValidation,
  getInvite, postInvite, inviteValidation,
  googleCallback, getSetup, postSetup,
  logout,
  getForgotPassword, postForgotPassword,
  getResetPassword, postResetPassword,
  getProfileSettings, postProfileSettings,
} = require('../controllers/authController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/login', getLogin);
router.post('/login', postLogin);

router.get('/register', getRegister);
router.post('/register', registerValidation, postRegister);

router.get('/invite', getInvite);
router.post('/invite', inviteValidation, postInvite);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login', failureFlash: true, session: false }),
  googleCallback
);

router.get('/setup', getSetup);
router.post('/setup', postSetup);

router.post('/logout', logout);

router.get('/forgot-password', getForgotPassword);
router.post('/forgot-password', postForgotPassword);

router.get('/reset-password', getResetPassword);
router.post('/reset-password', postResetPassword);

router.get('/profile', isAuthenticated, getProfileSettings);
router.post('/profile', isAuthenticated, upload.single('avatar'), postProfileSettings);

module.exports = router;
