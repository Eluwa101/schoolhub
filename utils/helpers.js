const slugifyLib = require('slugify');

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

module.exports = {
  slugify,
  formatDate,
  formatDateTime,
  formatTime,
  dayName,
  gradeColor,
  letterGrade,
  paginate,
  truncate,
};
