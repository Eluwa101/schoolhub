const { supabaseAdmin } = require('../utils/supabaseClient');

async function getSubjectsBySchool(schoolId, { page = 1, limit = 20 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('subjects')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .order('name')
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { subjects: data, total: count };
}

async function getSubjectById(id, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .select('*')
    .eq('id', id)
    .eq('school_id', schoolId)
    .single();
  if (error) throw error;
  return data;
}

async function createSubject({ schoolId, name, code, description }) {
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .insert({ school_id: schoolId, name, code, description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateSubject(id, schoolId, updates) {
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .update(updates)
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteSubject(id, schoolId) {
  const { error } = await supabaseAdmin
    .from('subjects')
    .delete()
    .eq('id', id)
    .eq('school_id', schoolId);
  if (error) throw error;
}

async function assignSubjectToClass({ classId, subjectId, teacherId }) {
  const { data, error } = await supabaseAdmin
    .from('class_subjects')
    .upsert({ class_id: classId, subject_id: subjectId, teacher_id: teacherId || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getSubjectsForClass(classId) {
  const { data, error } = await supabaseAdmin
    .from('class_subjects')
    .select(`
      id,
      subjects:subject_id (id, name, code),
      teacher:teacher_id (id, first_name, last_name)
    `)
    .eq('class_id', classId);
  if (error) throw error;
  return data;
}

async function getSubjectsForTeacher(teacherId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('class_subjects')
    .select(`
      subjects:subject_id (id, name, code),
      classes:class_id (id, name, school_id)
    `)
    .eq('teacher_id', teacherId);
  if (error) throw error;
  return data.filter(cs => cs.classes?.school_id === schoolId);
}

module.exports = {
  getSubjectsBySchool,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
  assignSubjectToClass,
  getSubjectsForClass,
  getSubjectsForTeacher,
};
