const { supabaseAdmin } = require('../utils/supabaseClient');

async function getProfileById(id) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, schools:school_id (id, name, slug, logo_url)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function getProfilesBySchool(schoolId, { role, page = 1, limit = 20 } = {}) {
  let query = supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .order('last_name', { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  if (role) query = query.eq('role', role);

  const { data, error, count } = await query;
  if (error) throw error;
  return { users: data, total: count };
}

async function createProfile({ id, schoolId, role, firstName, lastName, phone, avatarUrl }) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({
      id,
      school_id: schoolId,
      role,
      first_name: firstName,
      last_name: lastName,
      phone,
      avatar_url: avatarUrl,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateProfile(id, updates) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function toggleUserActive(id, schoolId) {
  const { data: current } = await supabaseAdmin
    .from('profiles')
    .select('is_active')
    .eq('id', id)
    .eq('school_id', schoolId)
    .single();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ is_active: !current.is_active })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getTeachersBySchool(schoolId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email:id')
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('is_active', true)
    .order('last_name');
  if (error) throw error;
  return data;
}

async function getStudentsBySchool(schoolId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .eq('is_active', true)
    .order('last_name');
  if (error) throw error;
  return data;
}

module.exports = {
  getProfileById,
  getProfilesBySchool,
  createProfile,
  updateProfile,
  toggleUserActive,
  getTeachersBySchool,
  getStudentsBySchool,
};
