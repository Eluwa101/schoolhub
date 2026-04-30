-- Migration: Create schools table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schools (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        varchar(255) NOT NULL,
  slug        varchar(100) UNIQUE NOT NULL,
  logo_url    text,
  address     text,
  phone       varchar(50),
  email       varchar(255),
  website     varchar(255),
  term_start  date,
  term_end    date,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- Anyone with a valid session can view their school
CREATE POLICY "Users view own school" ON schools
  FOR SELECT USING (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- Only service role can insert/update/delete schools (handled server-side)
-- Migration: Create profiles table (extends auth.users)

CREATE TYPE user_role AS ENUM (
  'super_admin',
  'school_admin',
  'teacher',
  'student',
  'parent'
);

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id   uuid REFERENCES schools(id) ON DELETE SET NULL,
  role        user_role NOT NULL DEFAULT 'student',
  first_name  varchar(100) NOT NULL,
  last_name   varchar(100) NOT NULL,
  phone       varchar(50),
  avatar_url  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_profiles_school_id ON profiles(school_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view profiles in their school" ON profiles
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());
-- Migration: Classes, subjects, and join tables

CREATE TABLE IF NOT EXISTS classes (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name             varchar(100) NOT NULL,
  grade_level      varchar(20),
  academic_year    varchar(20) NOT NULL,
  class_teacher_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_classes_school_id ON classes(school_id);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view classes" ON classes
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "School members modify classes" ON classes
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS subjects (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        varchar(100) NOT NULL,
  code        varchar(20),
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_subjects_school_id ON subjects(school_id);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view subjects" ON subjects
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "School members modify subjects" ON subjects
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS class_subjects (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(class_id, subject_id)
);

ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view class_subjects" ON class_subjects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id
        AND c.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "School members modify class_subjects" ON class_subjects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id
        AND c.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS student_classes (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_year varchar(20) NOT NULL,
  enrolled_at   timestamptz DEFAULT now(),
  UNIQUE(student_id, class_id, academic_year)
);

ALTER TABLE student_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view student_classes" ON student_classes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id
        AND c.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "School members modify student_classes" ON student_classes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = class_id
        AND c.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS parent_students (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(parent_id, student_id)
);

ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view parent_students" ON parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = parent_id
        AND p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "School members modify parent_students" ON parent_students
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = parent_id
        AND p.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );
-- Migration: Timetable and attendance

CREATE TABLE IF NOT EXISTS timetable (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id     uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id   uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  room         varchar(50)
);

CREATE INDEX idx_timetable_school_id ON timetable(school_id);
CREATE INDEX idx_timetable_class_id ON timetable(class_id);

ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view timetable" ON timetable
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "School members modify timetable" ON timetable
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- -------------------------------------------------------

CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

CREATE TABLE IF NOT EXISTS attendance (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  date       date NOT NULL,
  status     attendance_status NOT NULL DEFAULT 'present',
  notes      text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(school_id, class_id, student_id, subject_id, date)
);

CREATE INDEX idx_attendance_school_id ON attendance(school_id);
CREATE INDEX idx_attendance_student_id ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(date);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view attendance" ON attendance
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "School members modify attendance" ON attendance
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
-- Migration: Grades and assignments

CREATE TABLE IF NOT EXISTS grades (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id      uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assessment_type varchar(100) NOT NULL,
  score           decimal(6,2) NOT NULL,
  max_score       decimal(6,2) NOT NULL DEFAULT 100,
  term            varchar(50) NOT NULL,
  academic_year   varchar(20) NOT NULL,
  notes           text,
  graded_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_grades_school_id ON grades(school_id);
CREATE INDEX idx_grades_student_id ON grades(student_id);
CREATE INDEX idx_grades_subject_id ON grades(subject_id);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view grades" ON grades
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "School members modify grades" ON grades
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS assignments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       varchar(255) NOT NULL,
  description text,
  due_date    date NOT NULL,
  file_url    text,
  max_score   decimal(6,2) DEFAULT 100,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_assignments_school_id ON assignments(school_id);
CREATE INDEX idx_assignments_class_id ON assignments(class_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view assignments" ON assignments
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "School members modify assignments" ON assignments
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url     text,
  notes        text,
  submitted_at timestamptz DEFAULT now(),
  score        decimal(6,2),
  feedback     text,
  graded_at    timestamptz,
  graded_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(assignment_id, student_id)
);

ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view submissions" ON assignment_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND a.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "School members modify submissions" ON assignment_submissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id
        AND a.school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    )
  );
-- Migration: Messages and announcements

CREATE TABLE IF NOT EXISTS messages (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject           varchar(255) NOT NULL,
  body              text NOT NULL,
  parent_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  is_read           boolean NOT NULL DEFAULT false,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_school_id ON messages(school_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own messages" ON messages
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND (sender_id = auth.uid() OR recipient_id = auth.uid())
  );
CREATE POLICY "Users send messages" ON messages
  FOR INSERT WITH CHECK (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
    AND sender_id = auth.uid()
  );
CREATE POLICY "Recipients mark read" ON messages
  FOR UPDATE USING (recipient_id = auth.uid());

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS announcements (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title            varchar(255) NOT NULL,
  body             text NOT NULL,
  target_role      varchar(50) NOT NULL DEFAULT 'all',
  target_class_id  uuid REFERENCES classes(id) ON DELETE SET NULL,
  is_pinned        boolean NOT NULL DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX idx_announcements_school_id ON announcements(school_id);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members view announcements" ON announcements
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "School members modify announcements" ON announcements
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
-- Migration: Invite tokens and audit logs

CREATE TABLE IF NOT EXISTS invite_tokens (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email      varchar(255) NOT NULL,
  role       user_role NOT NULL,
  token      varchar(128) UNIQUE NOT NULL,
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  used_at    timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX idx_invite_tokens_school_id ON invite_tokens(school_id);

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School admins view invite tokens" ON invite_tokens
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   uuid REFERENCES schools(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      varchar(100) NOT NULL,
  entity_type varchar(100),
  entity_id   uuid,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_school_id ON audit_logs(school_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School admins view audit logs" ON audit_logs
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );
-- Migration: Session table for connect-pg-simple
-- Run this in your Supabase SQL editor or via psql

CREATE TABLE IF NOT EXISTS session (
  sid    varchar NOT NULL COLLATE "default",
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
