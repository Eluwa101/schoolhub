const { supabaseAdmin } = require('../utils/supabaseClient');

async function getSchoolById(id) {
  const { data, error } = await supabaseAdmin
    .from('schools')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function getSchoolBySlug(slug) {
  const { data, error } = await supabaseAdmin
    .from('schools')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) return null;
  return data;
}

async function createSchool({ name, slug, address, phone, email, website }) {
  const { data, error } = await supabaseAdmin
    .from('schools')
    .insert({ name, slug, address, phone, email, website })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateSchool(id, updates) {
  const { data, error } = await supabaseAdmin
    .from('schools')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getSchoolStats(schoolId) {
  const [studentsRes, teachersRes, classesRes, parentsRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'student').eq('is_active', true),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'teacher').eq('is_active', true),
    supabaseAdmin.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'parent').eq('is_active', true),
  ]);

  return {
    students: studentsRes.count || 0,
    teachers: teachersRes.count || 0,
    classes: classesRes.count || 0,
    parents: parentsRes.count || 0,
  };
}

module.exports = { getSchoolById, getSchoolBySlug, createSchool, updateSchool, getSchoolStats };
