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
