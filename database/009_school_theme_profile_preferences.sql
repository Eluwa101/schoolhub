-- Migration: School theme settings and profile preferences

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS theme_settings jsonb NOT NULL DEFAULT '{
    "primary": "#4f46e5",
    "secondary": "#0ea5e9",
    "accent": "#14b8a6",
    "surface": "#f8fafc"
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{
    "dateLocale": "en-GB",
    "uiDensity": "comfortable"
  }'::jsonb;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
