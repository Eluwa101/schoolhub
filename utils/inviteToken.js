const crypto = require('crypto');
const { supabaseAdmin } = require('./supabaseClient');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createInviteToken({ schoolId, email, role, invitedBy }) {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + parseInt(process.env.INVITE_TOKEN_EXPIRY_HOURS || 48));

  const { data, error } = await supabaseAdmin
    .from('invite_tokens')
    .insert({
      school_id: schoolId,
      email: email.toLowerCase(),
      role,
      token,
      invited_by: invitedBy,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function verifyInviteToken(token) {
  const { data, error } = await supabaseAdmin
    .from('invite_tokens')
    .select(`
      *,
      schools:school_id (name, slug),
      inviter:invited_by (first_name, last_name)
    `)
    .eq('token', token)
    .is('used_at', null)
    .single();

  if (error || !data) return null;

  if (new Date(data.expires_at) < new Date()) return null;

  return data;
}

async function markTokenUsed(token) {
  const { error } = await supabaseAdmin
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);

  if (error) throw error;
}

module.exports = { createInviteToken, verifyInviteToken, markTokenUsed };
