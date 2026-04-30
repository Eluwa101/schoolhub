const { supabaseAdmin } = require('../utils/supabaseClient');

async function logAction({ schoolId, userId, action, entityType, entityId, metadata = {} }) {
  const { error } = await supabaseAdmin
    .from('audit_logs')
    .insert({
      school_id: schoolId || null,
      user_id: userId || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata,
    });
  if (error) console.error('Audit log error:', error.message);
}

async function getAuditLogs(schoolId, { page = 1, limit = 20 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('audit_logs')
    .select(`
      *,
      user:user_id (id, first_name, last_name, role)
    `, { count: 'exact' })
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { logs: data, total: count };
}

module.exports = { logAction, getAuditLogs };
