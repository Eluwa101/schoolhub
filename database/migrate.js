require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const migrations = [
  '001_create_schools.sql',
  '002_create_profiles.sql',
  '003_create_classes_subjects.sql',
  '004_create_timetable_attendance.sql',
  '005_create_grades_assignments.sql',
  '006_create_messages_announcements.sql',
  '007_create_invite_tokens_audit.sql',
  '008_session_table.sql',
];

async function run() {
  const connString = process.env.SUPABASE_DB_URL;
  if (!connString || connString.includes('placeholder')) {
    console.error('❌ SUPABASE_DB_URL not configured in .env');
    process.exit(1);
  }

  // pg handles @ in passwords by splitting on the last @ before the hostname
  const client = new Client({ connectionString: connString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      process.stdout.write(`Running ${file}...`);
      await client.query(sql);
      console.log(' ✅');
    }

    console.log('\n✅ All migrations complete.');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
