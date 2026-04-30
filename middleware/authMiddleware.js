function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }
  req.flash('error', 'Please log in to access this page.');
  res.redirect('/auth/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      req.flash('error', 'Please log in to access this page.');
      return res.redirect('/auth/login');
    }
    if (!roles.includes(req.user.role)) {
      req.flash('error', 'You do not have permission to access this page.');
      return res.redirect(`/${req.user.role}/dashboard`);
    }
    next();
  };
}

module.exports = { isAuthenticated, requireRole };
