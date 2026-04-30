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
