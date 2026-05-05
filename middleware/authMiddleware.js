function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  req.flash('error', 'Please log in to access this page.');
  res.redirect('/auth/login');
}

const { rolePrefix } = require('../utils/helpers');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      req.flash('error', 'Please log in to access this page.');
      return res.redirect('/auth/login');
    }
    // Allow parent to access student routes when viewing as child
    if (roles.includes('student') && req.user.role === 'parent' && req.session?.viewingAsStudent) {
      req.effectiveStudentId = req.session.viewingAsStudent.id;
      return next();
    }
    if (!roles.includes(req.user.role)) {
      req.flash('error', 'You do not have permission to access this page.');
      return res.redirect(`/${rolePrefix(req.user.role)}/dashboard`);
    }
    next();
  };
}

module.exports = { isAuthenticated, requireRole };
