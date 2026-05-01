function parseCsvBuffer(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else {
      current += char;
    }
  }

  if (current.length || row.length) {
    row.push(current.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] || '').trim();
    });
    return record;
  });
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '')
    .toLowerCase();
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const stringValue = value == null ? '' : String(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

module.exports = {
  parseCsvBuffer,
  toCsv,
};
