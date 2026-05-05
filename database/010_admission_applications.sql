-- Migration 010: Admission applications for parent self-registration

CREATE TABLE IF NOT EXISTS admission_applications (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  parent_email        varchar(255) NOT NULL,
  parent_first_name   varchar(100) NOT NULL,
  parent_last_name    varchar(100) NOT NULL,
  parent_phone        varchar(50),
  student_first_name  varchar(100) NOT NULL,
  student_last_name   varchar(100) NOT NULL,
  student_dob         date,
  student_gender      varchar(20),
  desired_grade_level varchar(20),
  notes               text,
  status              varchar(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected')),
  assigned_class_id   uuid REFERENCES classes(id) ON DELETE SET NULL,
  student_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  admin_notes         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_admission_school_id ON admission_applications(school_id);
CREATE INDEX idx_admission_status ON admission_applications(school_id, status);
CREATE INDEX idx_admission_parent_id ON admission_applications(parent_id);

ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members view admissions" ON admission_applications
  FOR SELECT USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "School members modify admissions" ON admission_applications
  FOR ALL USING (
    school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- Allow public inserts so parents can submit applications before having a profile
CREATE POLICY "Public can insert admissions" ON admission_applications
  FOR INSERT WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_admission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admission_updated_at
  BEFORE UPDATE ON admission_applications
  FOR EACH ROW EXECUTE FUNCTION update_admission_updated_at();
