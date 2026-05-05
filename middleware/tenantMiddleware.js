const { getSchoolById } = require('../models/schoolModel');
const { normalizeSchoolTheme, normalizeSchoolPreferences } = require('../utils/helpers');
const { getPendingCount } = require('../models/admissionModel');

const BREADCRUMB_MAP = {
  '/admin/dashboard':     [{ label: 'Dashboard' }],
  '/admin/settings':      [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'School Settings' }],
  '/admin/users':         [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Users' }],
  '/admin/classes':       [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Classes' }],
  '/admin/subjects':      [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Subjects' }],
  '/admin/timetable':     [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Timetable' }],
  '/admin/announcements': [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Announcements' }],
  '/admin/messages':      [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Messages' }],
  '/admin/reports':       [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Reports' }],
  '/admin/admissions':    [{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Admissions' }],

  '/teacher/dashboard':   [{ label: 'Dashboard' }],
  '/teacher/classes':     [{ label: 'Dashboard', href: '/teacher/dashboard' }, { label: 'My Classes' }],
  '/teacher/timetable':   [{ label: 'Dashboard', href: '/teacher/dashboard' }, { label: 'Timetable' }],
  '/teacher/assignments': [{ label: 'Dashboard', href: '/teacher/dashboard' }, { label: 'Assignments' }],
  '/teacher/messages':    [{ label: 'Dashboard', href: '/teacher/dashboard' }, { label: 'Messages' }],
  '/teacher/attendance':  [{ label: 'Dashboard', href: '/teacher/dashboard' }, { label: 'My Classes', href: '/teacher/classes' }, { label: 'Attendance' }],

  '/student/dashboard':      [{ label: 'Dashboard' }],
  '/student/timetable':      [{ label: 'Dashboard', href: '/student/dashboard' }, { label: 'Timetable' }],
  '/student/grades':         [{ label: 'Dashboard', href: '/student/dashboard' }, { label: 'Grades' }],
  '/student/assignments':    [{ label: 'Dashboard', href: '/student/dashboard' }, { label: 'Assignments' }],
  '/student/announcements':  [{ label: 'Dashboard', href: '/student/dashboard' }, { label: 'Announcements' }],
  '/student/messages':       [{ label: 'Dashboard', href: '/student/dashboard' }, { label: 'Messages' }],

  '/parent/dashboard':  [{ label: 'Dashboard' }],
  '/parent/messages':   [{ label: 'Dashboard', href: '/parent/dashboard' }, { label: 'Messages' }],
};

function buildBreadcrumb(path) {
  if (BREADCRUMB_MAP[path]) return BREADCRUMB_MAP[path];
  // Prefix match for dynamic paths like /admin/users/:id, /teacher/attendance/:classId
  const prefix = Object.keys(BREADCRUMB_MAP).find(k => k !== path && path.startsWith(k + '/'));
  if (prefix) {
    const crumbs = [...BREADCRUMB_MAP[prefix]];
    const last = crumbs[crumbs.length - 1];
    if (last && !last.href) crumbs[crumbs.length - 1] = { ...last, href: prefix };
    crumbs.push({ label: 'Detail' });
    return crumbs;
  }
  return null;
}

async function attachTenant(req, res, next) {
  try {
    if (req.session && req.session.user) {
      req.schoolId = req.session.user.schoolId;
      res.locals.currentUser = req.session.user;
      res.locals.schoolId = req.schoolId;
      res.locals.currentPath = req.path;
      res.locals.breadcrumb = buildBreadcrumb(req.path);
      res.locals.viewingAsStudent = req.session.viewingAsStudent || null;

      if (req.schoolId) {
        const school = await getSchoolById(req.schoolId);
        const schoolTheme = normalizeSchoolTheme(school?.theme_settings);
        const schoolPreferences = normalizeSchoolPreferences(school?.preferences);

        res.locals.currentSchool = school;
        res.locals.schoolTheme = schoolTheme;
        res.locals.schoolPreferences = schoolPreferences;

        // Pending admission badge for admins
        const role = req.session.user?.role;
        if (role === 'school_admin' || role === 'super_admin') {
          res.locals.pendingAdmissions = await getPendingCount(req.schoolId).catch(() => 0);
        }

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
