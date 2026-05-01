const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { supabase, supabaseAdmin } = require('../utils/supabaseClient');
const { createProfile, getProfileById, updateProfile } = require('../models/userModel');
const { createSchool, getSchoolBySlug } = require('../models/schoolModel');
const { verifyInviteToken, markTokenUsed } = require('../utils/inviteToken');
const { slugify, rolePrefix } = require('../utils/helpers');
const { sendPasswordResetEmail } = require('../utils/mailer');

function buildSession(profile, school) {
  return {
    userId: profile.id,
    schoolId: profile.school_id,
    role: profile.role,
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: profile.email || '',
    avatarUrl: profile.avatar_url || '',
    schoolName: school?.name || '',
    schoolSlug: school?.slug || '',
  };
}

// GET /auth/login
function getLogin(req, res) {
  if (req.session.user) return res.redirect(`/${rolePrefix(req.session.user.role)}/dashboard`);
  res.render('auth/login', { title: 'Sign In', layout: 'layout' });
}

// POST /auth/login
async function postLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error', 'Email and password are required.');
      return res.redirect('/auth/login');
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/auth/login');
    }

    const profile = await getProfileById(data.user.id);
    if (!profile) {
      req.flash('error', 'Account setup incomplete. Please contact your administrator.');
      return res.redirect('/auth/login');
    }

    if (!profile.is_active) {
      req.flash('error', 'Your account has been deactivated. Contact your school administrator.');
      return res.redirect('/auth/login');
    }

    const { data: school } = await supabaseAdmin.from('schools').select('name, slug').eq('id', profile.school_id).single();

    req.session.user = buildSession(profile, school);
    req.session.save(() => res.redirect(`/${rolePrefix(profile.role)}/dashboard`));
  } catch (err) {
    next(err);
  }
}

// GET /auth/register
function getRegister(req, res) {
  if (req.session.user) return res.redirect(`/${rolePrefix(req.session.user.role)}/dashboard`);
  res.render('auth/register', { title: 'Create School Account', layout: 'layout' });
}

// POST /auth/register — creates a new school + school_admin account
const registerValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('schoolName').trim().notEmpty().withMessage('School name is required'),
];

async function postRegister(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join('. '));
      return res.redirect('/auth/register');
    }

    const { firstName, lastName, email, password, schoolName, phone, address } = req.body;

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      req.flash('error', authError.message);
      return res.redirect('/auth/register');
    }

    // Create school
    const slug = slugify(schoolName) + '-' + Date.now().toString(36);
    const school = await createSchool({ name: schoolName, slug, phone: phone || null, address: address || null });

    // Create profile as school_admin
    const profile = await createProfile({
      id: authData.user.id,
      schoolId: school.id,
      role: 'school_admin',
      firstName,
      lastName,
    });

    req.session.user = buildSession(profile, school);
    req.flash('success', `Welcome to SchoolHub! Your school "${schoolName}" has been created.`);
    req.session.save(() => res.redirect('/admin/dashboard'));
  } catch (err) {
    req.flash('error', `Registration failed: ${err.message}`);
    res.redirect('/auth/register');
  }
}

// GET /auth/invite?token=xxx
async function getInvite(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) {
      req.flash('error', 'Invalid invite link.');
      return res.redirect('/auth/login');
    }

    const invite = await verifyInviteToken(token);
    if (!invite) {
      req.flash('error', 'This invite link has expired or already been used.');
      return res.redirect('/auth/login');
    }

    res.render('auth/invite', {
      title: 'Accept Invitation',
      invite,
      token,
      layout: 'layout',
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/invite
const inviteValidation = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
];

async function postInvite(req, res, next) {
  try {
    const { token, firstName, lastName, password } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join('. '));
      return res.redirect(`/auth/invite?token=${token}`);
    }

    const invite = await verifyInviteToken(token);
    if (!invite) {
      req.flash('error', 'This invite link has expired or already been used.');
      return res.redirect('/auth/login');
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    });

    if (authError) {
      req.flash('error', authError.message);
      return res.redirect(`/auth/invite?token=${token}`);
    }

    // Create profile
    const profile = await createProfile({
      id: authData.user.id,
      schoolId: invite.school_id,
      role: invite.role,
      firstName,
      lastName,
    });

    // Mark token used
    await markTokenUsed(token);

    const { data: school } = await supabaseAdmin.from('schools').select('name, slug').eq('id', invite.school_id).single();

    req.session.user = buildSession(profile, school);
    req.flash('success', `Welcome to ${invite.schools.name}!`);
    req.session.save(() => res.redirect(`/${rolePrefix(profile.role)}/dashboard`));
  } catch (err) {
    req.flash('error', `Failed to complete registration: ${err.message}`);
    res.redirect(`/auth/invite?token=${req.body.token || ''}`);
  }
}

// GET /auth/google — handled by passport
// GET /auth/google/callback
async function googleCallback(req, res, next) {
  try {
    const googleUser = req.user;
    if (!googleUser) return res.redirect('/auth/login');

    if (!googleUser.isNewUser && googleUser.profile) {
      const profile = googleUser.profile;
      if (!profile.is_active) {
        req.flash('error', 'Your account has been deactivated.');
        return res.redirect('/auth/login');
      }
      req.session.user = buildSession(profile, profile.schools);
      return req.session.save(() => res.redirect(`/${rolePrefix(profile.role)}/dashboard`));
    }

    // New user — store temp data and redirect to setup
    req.session.pendingGoogle = {
      userId: googleUser.id,
      email: googleUser.email,
      displayName: googleUser.displayName,
      avatarUrl: googleUser.avatarUrl,
    };
    return req.session.save(() => res.redirect('/auth/setup'));
  } catch (err) {
    next(err);
  }
}

// GET /auth/setup — for new Google users
function getSetup(req, res) {
  if (!req.session.pendingGoogle) return res.redirect('/auth/login');
  res.render('auth/register', {
    title: 'Set Up Your School',
    googleSetup: true,
    pendingUser: req.session.pendingGoogle,
    layout: 'layout',
  });
}

// POST /auth/setup
async function postSetup(req, res, next) {
  try {
    if (!req.session.pendingGoogle) return res.redirect('/auth/login');
    const { userId, email, displayName, avatarUrl } = req.session.pendingGoogle;
    const { firstName, lastName, schoolName, phone, address } = req.body;

    const slug = slugify(schoolName) + '-' + Date.now().toString(36);
    const school = await createSchool({ name: schoolName, slug, phone, address });

    const nameParts = displayName?.split(' ') || [];
    const profile = await createProfile({
      id: userId,
      schoolId: school.id,
      role: 'school_admin',
      firstName: firstName || nameParts[0] || 'Admin',
      lastName: lastName || nameParts.slice(1).join(' ') || 'User',
      avatarUrl,
    });

    delete req.session.pendingGoogle;
    req.session.user = buildSession(profile, school);
    req.flash('success', `Welcome! Your school "${schoolName}" has been created.`);
    req.session.save(() => res.redirect('/admin/dashboard'));
  } catch (err) {
    req.flash('error', `Setup failed: ${err.message}`);
    res.redirect('/auth/setup');
  }
}

// POST /auth/logout
function logout(req, res) {
  req.session.destroy(() => res.redirect('/auth/login'));
}

// GET /auth/forgot-password
function getForgotPassword(req, res) {
  res.render('auth/forgot-password', { title: 'Forgot Password', layout: 'layout' });
}

// POST /auth/forgot-password
async function postForgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.APP_URL}/auth/reset-password`,
    });
    // Always show success to prevent email enumeration
    req.flash('success', 'If that email is registered, a reset link has been sent.');
    res.redirect('/auth/forgot-password');
  } catch (err) {
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/auth/forgot-password');
  }
}

// GET /auth/reset-password
function getResetPassword(req, res) {
  res.render('auth/reset-password', { title: 'Reset Password', layout: 'layout' });
}

// POST /auth/reset-password
async function postResetPassword(req, res, next) {
  try {
    const { password, confirmPassword, accessToken } = req.body;
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/auth/reset-password');
    }

    // Exchange token for session, then update password
    const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: '' });
    if (error) {
      req.flash('error', 'Invalid or expired reset link.');
      return res.redirect('/auth/reset-password');
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      req.flash('error', updateError.message);
      return res.redirect('/auth/reset-password');
    }

    req.flash('success', 'Password updated. Please log in.');
    res.redirect('/auth/login');
  } catch (err) {
    req.flash('error', `Password reset failed: ${err.message}`);
    res.redirect('/auth/reset-password');
  }
}

async function getProfileSettings(req, res, next) {
  try {
    const profile = await getProfileById(req.user.userId);
    res.render('auth/profile', {
      title: 'My Profile',
      profile,
      layout: 'layout',
    });
  } catch (err) {
    next(err);
  }
}

async function postProfileSettings(req, res, next) {
  try {
    const { firstName, lastName, phone } = req.body;
    const updates = {
      first_name: firstName?.trim() || req.user.firstName,
      last_name: lastName?.trim() || req.user.lastName,
      phone: phone?.trim() || null,
    };

    if (req.file) {
      const fileName = `${req.schoolId}/avatars/${req.user.userId}/${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('schoolhub')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage.from('schoolhub').getPublicUrl(fileName);
        updates.avatar_url = urlData.publicUrl;
      }
    }

    const profile = await updateProfile(req.user.userId, updates);
    if (req.session?.user) {
      req.session.user.firstName = profile.first_name;
      req.session.user.lastName = profile.last_name;
      req.session.user.avatarUrl = profile.avatar_url || '';
    }

    req.flash('success', 'Profile updated successfully.');
    res.redirect('/auth/profile');
  } catch (err) {
    req.flash('error', `Failed to update profile: ${err.message}`);
    res.redirect('/auth/profile');
  }
}

module.exports = {
  getLogin,
  postLogin,
  getRegister,
  postRegister,
  registerValidation,
  getInvite,
  postInvite,
  inviteValidation,
  googleCallback,
  getSetup,
  postSetup,
  logout,
  getForgotPassword,
  postForgotPassword,
  getResetPassword,
  postResetPassword,
  getProfileSettings,
  postProfileSettings,
};
