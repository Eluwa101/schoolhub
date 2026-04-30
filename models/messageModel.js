const { supabaseAdmin } = require('../utils/supabaseClient');

async function getInbox(userId, schoolId, { page = 1, limit = 20 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('messages')
    .select(`
      *,
      sender:sender_id (id, first_name, last_name, role, avatar_url)
    `, { count: 'exact' })
    .eq('recipient_id', userId)
    .eq('school_id', schoolId)
    .is('parent_message_id', null)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { messages: data, total: count };
}

async function getSent(userId, schoolId, { page = 1, limit = 20 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('messages')
    .select(`
      *,
      recipient:recipient_id (id, first_name, last_name, role, avatar_url)
    `, { count: 'exact' })
    .eq('sender_id', userId)
    .eq('school_id', schoolId)
    .is('parent_message_id', null)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { messages: data, total: count };
}

async function getThread(parentMessageId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select(`
      *,
      sender:sender_id (id, first_name, last_name, role, avatar_url)
    `)
    .eq('parent_message_id', parentMessageId)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function getMessageById(id, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select(`
      *,
      sender:sender_id (id, first_name, last_name, role, avatar_url),
      recipient:recipient_id (id, first_name, last_name, role, avatar_url)
    `)
    .eq('id', id)
    .eq('school_id', schoolId)
    .single();
  if (error) throw error;
  return data;
}

async function sendMessage({ schoolId, senderId, recipientId, subject, body, parentMessageId }) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      school_id: schoolId,
      sender_id: senderId,
      recipient_id: recipientId,
      subject,
      body,
      parent_message_id: parentMessageId || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function markAsRead(messageId, userId) {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ is_read: true })
    .eq('id', messageId)
    .eq('recipient_id', userId);
  if (error) throw error;
}

async function getUnreadCount(userId, schoolId) {
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('school_id', schoolId)
    .eq('is_read', false);
  if (error) return 0;
  return count;
}

module.exports = {
  getInbox,
  getSent,
  getThread,
  getMessageById,
  sendMessage,
  markAsRead,
  getUnreadCount,
};
