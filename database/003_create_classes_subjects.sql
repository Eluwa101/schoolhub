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
