const express = require('express');
const passport = require('passport');
const router = express.Router();
const {
  getLogin, postLogin,
  getRegister, postRegister, registerValidation,
  getInvite, postInvite, inviteValidation,
  googleCallback, getSetup, postSetup,
  logout,
  getForgotPassword, postForgotPassword,
  getResetPassword, postResetPassword,
} = require('../controllers/authController');

router.get('/login', getLogin);
router.post('/login', postLogin);

router.get('/register', getRegister);
router.post('/register', registerValidation, postRegister);

router.get('/invite', getInvite);
router.post('/invite', inviteValidation, postInvite);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login', session: false }),
  googleCallback
);

router.get('/setup', getSetup);
router.post('/setup', postSetup);

router.post('/logout', logout);

router.get('/forgot-password', getForgotPassword);
router.post('/forgot-password', postForgotPassword);

router.get('/reset-password', getResetPassword);
router.post('/reset-password', postResetPassword);

module.exports = router;
