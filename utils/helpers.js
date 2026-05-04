const slugifyLib = require('slugify');

const DEFAULT_SCHOOL_THEME = {
  primary: '#4f46e5',
  secondary: '#0ea5e9',
  accent: '#14b8a6',
  surface: '#f8fafc',
};

const DEFAULT_SCHOOL_PREFERENCES = {
  dateLocale: 'en-GB',
  uiDensity: 'comfortable',
};

function slugify(text) {
  return slugifyLib(text, { lower: true, strict: true });
}

function formatDate(date, locale = 'en-GB') {
  if (!date) return '';
  return new Date(date).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(date, locale = 'en-GB') {
  if (!date) return '';
  return new Date(date).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

function dayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || '';
}

function gradeColor(percentage) {
  if (percentage >= 80) return 'text-green-600';
  if (percentage >= 60) return 'text-blue-600';
  if (percentage >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

function letterGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 75) return 'B+';
  if (percentage >= 70) return 'B';
  if (percentage >= 65) return 'C+';
  if (percentage >= 60) return 'C';
  if (percentage >= 55) return 'D+';
  if (percentage >= 50) return 'D';
  return 'F';
}

function paginate(items, page, perPage = 20) {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const offset = (currentPage - 1) * perPage;
  return {
    items: items.slice(offset, offset + perPage),
    currentPage,
    totalPages,
    totalItems,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}

function truncate(str, maxLength = 100) {
  if (!str) return '';
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

function normalizeHex(color, fallback) {
  const value = String(color || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return fallback;
}

function normalizeSchoolTheme(theme) {
  const t = theme && typeof theme === 'object' ? theme : {};
  return {
    primary: normalizeHex(t.primary, DEFAULT_SCHOOL_THEME.primary),
    secondary: normalizeHex(t.secondary, DEFAULT_SCHOOL_THEME.secondary),
    accent: normalizeHex(t.accent, DEFAULT_SCHOOL_THEME.accent),
    surface: normalizeHex(t.surface, DEFAULT_SCHOOL_THEME.surface),
  };
}

function normalizeSchoolPreferences(preferences) {
  const p = preferences && typeof preferences === 'object' ? preferences : {};
  const dateLocale = ['en-GB', 'en-US'].includes(p.dateLocale)
    ? p.dateLocale
    : DEFAULT_SCHOOL_PREFERENCES.dateLocale;
  const uiDensity = ['comfortable', 'compact'].includes(p.uiDensity)
    ? p.uiDensity
    : DEFAULT_SCHOOL_PREFERENCES.uiDensity;

  return {
    dateLocale,
    uiDensity,
  };
}

function hexToRgba(hex, alpha = 1) {
  const normalized = normalizeHex(hex, '#4f46e5').replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Maps DB role values to URL route prefix (school_admin → admin)
function rolePrefix(role) {
  if (role === 'school_admin' || role === 'super_admin') return 'admin';
  return role;
}

module.exports = {
  DEFAULT_SCHOOL_THEME,
  DEFAULT_SCHOOL_PREFERENCES,
  slugify,
  formatDate,
  formatDateTime,
  formatTime,
  dayName,
  gradeColor,
  letterGrade,
  paginate,
  truncate,
  normalizeSchoolTheme,
  normalizeSchoolPreferences,
  hexToRgba,
  rolePrefix,
};
