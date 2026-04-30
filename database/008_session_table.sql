-- Migration: Session table for connect-pg-simple
-- Run this in your Supabase SQL editor or via psql

CREATE TABLE IF NOT EXISTS session (
  sid    varchar NOT NULL COLLATE "default",
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
