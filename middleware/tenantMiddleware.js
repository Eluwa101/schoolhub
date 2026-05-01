const { getSchoolById } = require('../models/schoolModel');
const { normalizeSchoolTheme, normalizeSchoolPreferences } = require('../utils/helpers');

async function attachTenant(req, res, next) {
  try {
    if (req.session && req.session.user) {
      req.schoolId = req.session.user.schoolId;
      res.locals.currentUser = req.session.user;
      res.locals.schoolId = req.schoolId;

      if (req.schoolId) {
        const school = await getSchoolById(req.schoolId);
        const schoolTheme = normalizeSchoolTheme(school?.theme_settings);
        const schoolPreferences = normalizeSchoolPreferences(school?.preferences);

        res.locals.currentSchool = school;
        res.locals.schoolTheme = schoolTheme;
        res.locals.schoolPreferences = schoolPreferences;

        if (req.session.user) {
          req.session.user.schoolName = school?.name || req.session.user.schoolName;
          req.session.user.schoolSlug = school?.slug || req.session.user.schoolSlug;
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { attachTenant };
