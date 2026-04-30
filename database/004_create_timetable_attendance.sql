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
