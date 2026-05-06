-- Teacher notes on students
CREATE TABLE IF NOT EXISTS teacher_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_notes_student ON teacher_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_notes_school  ON teacher_notes(school_id);

-- RLS
ALTER TABLE teacher_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members can read notes" ON teacher_notes
  FOR SELECT USING (school_id IN (
    SELECT school_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "teachers insert own notes" ON teacher_notes
  FOR INSERT WITH CHECK (teacher_id = auth.uid());
