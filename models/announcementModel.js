const { supabaseAdmin } = require('../utils/supabaseClient');

async function getAnnouncements(schoolId, { role, classId, page = 1, limit = 20 } = {}) {
  let query = supabaseAdmin
    .from('announcements')
    .select(`
      *,
      author:author_id (id, first_name, last_name, role),
      target_class:target_class_id (id, name)
    `, { count: 'exact' })
    .eq('school_id', schoolId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (role && role !== 'school_admin' && role !== 'super_admin') {
    query = query.or(`target_role.eq.all,target_role.eq.${role}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { announcements: data, total: count };
}

async function createAnnouncement({ schoolId, authorId, title, body, targetRole, targetClassId, isPinned }) {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .insert({
      school_id: schoolId,
      author_id: authorId,
      title,
      body,
      target_role: targetRole || 'all',
      target_class_id: targetClassId || null,
      is_pinned: isPinned || false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateAnnouncement(id, schoolId, updates) {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteAnnouncement(id, schoolId) {
  const { error } = await supabaseAdmin
    .from('announcements')
    .delete()
    .eq('id', id)
    .eq('school_id', schoolId);
  if (error) throw error;
}

module.exports = {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
