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
