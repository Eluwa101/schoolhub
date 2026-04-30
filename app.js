require('dotenv').config();
const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const passport = require('passport');
const morgan = require('morgan');
const helmet = require('helmet');
const methodOverride = require('method-override');

const { attachTenant } = require('./middleware/tenantMiddleware');
const helpers = require('./utils/helpers');

// Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const studentRoutes = require('./routes/studentRoutes');
const parentRoutes = require('./routes/parentRoutes');
const apiRoutes = require('./routes/apiRoutes');

// Passport config
require('./config/passport');

const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Method override for PUT/DELETE in forms
app.use(methodOverride('_method'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Session store — pg when DB URL is real, memory store for local dev
const dbUrl = process.env.SUPABASE_DB_URL;
const usePgStore = dbUrl && !dbUrl.includes('placeholder') && dbUrl.length > 50;
const sessionStore = usePgStore
  ? new PgSession({ conString: dbUrl, tableName: 'session', createTableIfMissing: false })
  : new session.MemoryStore();

if (!usePgStore && process.env.NODE_ENV !== 'test') {
  console.warn('[dev] Using in-memory session store — run migrations and set SUPABASE_DB_URL for persistence.');
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'schoolhub-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
  name: 'schoolhub.sid',
}));

// Flash messages
app.use(flash());

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Tenant middleware — attaches schoolId + currentUser to every request
app.use(attachTenant);

// Global template locals
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.info = req.flash('info');
  res.locals.currentPath = req.path;
  res.locals.formatDate = helpers.formatDate;
  res.locals.formatDateTime = helpers.formatDateTime;
  res.locals.formatTime = helpers.formatTime;
  res.locals.dayName = helpers.dayName;
  res.locals.letterGrade = helpers.letterGrade;
  res.locals.truncate = helpers.truncate;
  res.locals.appUrl = process.env.APP_URL || 'http://localhost:3000';
  next();
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/teacher', teacherRoutes);
app.use('/student', studentRoutes);
app.use('/parent', parentRoutes);
app.use('/api', apiRoutes);

// Root redirect
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(`/${req.session.user.role}/dashboard`);
  }
  res.redirect('/auth/login');
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page Not Found', layout: 'layout' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).render('errors/500', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.',
    layout: 'layout',
  });
});

module.exports = app;
