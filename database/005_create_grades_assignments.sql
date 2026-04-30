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
