function attachTenant(req, res, next) {
  if (req.session && req.session.user) {
    req.schoolId = req.session.user.schoolId;
    res.locals.currentUser = req.session.user;
    res.locals.schoolId = req.schoolId;
  }
  next();
}

module.exports = { attachTenant };
