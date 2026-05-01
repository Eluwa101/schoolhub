function selectConversation(conversations, messageId) {
  if (!messageId || !conversations.length) return null;
  return conversations.find((conversation) => conversation.id === messageId) || null;
}

function resolveReplyRecipient(conversation, userId) {
  if (!conversation) return null;
  const root = conversation.root;
  if (!root) return null;
  return root.sender_id === userId ? root.recipient : root.sender;
}

function buildConversationThread(root, replies = []) {
  return [root, ...replies].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

module.exports = {
  selectConversation,
  resolveReplyRecipient,
  buildConversationThread,
};
