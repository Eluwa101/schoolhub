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
  '009_school_theme_profile_preferences.sql',
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename varchar(255) PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows: existingRows } = await client.query('SELECT filename FROM schema_migrations');
    let applied = new Set(existingRows.map((row) => row.filename));

    if (!applied.size) {
      const { rows: bootstrapRows } = await client.query(`
        SELECT
          to_regclass('public.schools') IS NOT NULL AS has_schools,
          to_regclass('public.profiles') IS NOT NULL AS has_profiles,
          to_regclass('public.session') IS NOT NULL AS has_session
      `);

      const bootstrap = bootstrapRows[0];
      if (bootstrap?.has_schools && bootstrap?.has_profiles && bootstrap?.has_session) {
        await client.query(
          'INSERT INTO schema_migrations (filename) SELECT unnest($1::text[]) ON CONFLICT (filename) DO NOTHING',
          [migrations]
        );
        applied = new Set(migrations);
        console.log('ℹ️  Existing schema detected. Bootstrapped migration history.\n');
      }
    }

    for (const file of migrations) {
      if (applied.has(file)) {
        console.log(`Skipping ${file} (already applied).`);
        continue;
      }

      const filePath = path.join(__dirname, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      process.stdout.write(`Running ${file}...`);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [file]);
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
