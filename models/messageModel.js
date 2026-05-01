const { supabaseAdmin } = require('../utils/supabaseClient');

function groupConversationMessages(messages, userId) {
  const conversations = new Map();

  messages.forEach((message) => {
    const rootId = message.parent_message_id || message.id;
    const existing = conversations.get(rootId);
    const createdAt = new Date(message.created_at);

    if (!existing) {
      const counterpart = message.sender_id === userId ? message.recipient : message.sender;
      conversations.set(rootId, {
        id: rootId,
        subject: message.subject,
        rootMessageId: rootId,
        startedByUser: message.parent_message_id ? false : message.sender_id === userId,
        counterpart,
        latestMessage: message,
        messages: [message],
        unreadCount: message.recipient_id === userId && !message.is_read ? 1 : 0,
        updatedAt: message.created_at,
      });
      return;
    }

    existing.messages.push(message);
    if (createdAt > new Date(existing.updatedAt)) {
      existing.latestMessage = message;
      existing.updatedAt = message.created_at;
      existing.counterpart = message.sender_id === userId ? message.recipient : message.sender;
    }
    if (message.recipient_id === userId && !message.is_read) {
      existing.unreadCount += 1;
    }
  });

  return Array.from(conversations.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function getConversationIndex(userId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select(`
      *,
      sender:sender_id (id, first_name, last_name, role, avatar_url),
      recipient:recipient_id (id, first_name, last_name, role, avatar_url)
    `)
    .eq('school_id', schoolId)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return groupConversationMessages(data || [], userId);
}

async function getInbox(userId, schoolId, { page = 1, limit = 20 } = {}) {
  const conversations = await getConversationIndex(userId, schoolId);
  const inbox = conversations.filter((conversation) => !conversation.startedByUser || conversation.latestMessage?.recipient_id === userId);
  const start = (page - 1) * limit;
  return {
    messages: inbox.slice(start, start + limit),
    total: inbox.length,
  };
}

async function getSent(userId, schoolId, { page = 1, limit = 20 } = {}) {
  const conversations = await getConversationIndex(userId, schoolId);
  const sent = conversations.filter((conversation) => conversation.startedByUser);
  const start = (page - 1) * limit;
  return {
    messages: sent.slice(start, start + limit),
    total: sent.length,
  };
}

async function getThread(parentMessageId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select(`
      *,
      sender:sender_id (id, first_name, last_name, role, avatar_url),
      recipient:recipient_id (id, first_name, last_name, role, avatar_url)
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

async function markConversationAsRead(rootMessageId, userId, schoolId) {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('school_id', schoolId)
    .or(`id.eq.${rootMessageId},parent_message_id.eq.${rootMessageId}`);
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
  getConversationIndex,
  getThread,
  getMessageById,
  sendMessage,
  markAsRead,
  markConversationAsRead,
  getUnreadCount,
};
