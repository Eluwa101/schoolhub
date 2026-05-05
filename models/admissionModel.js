const { supabaseAdmin } = require('../utils/supabaseClient');

async function getApplicationsBySchool(schoolId, { page = 1, limit = 30, status = null } = {}) {
  let query = supabaseAdmin
    .from('admission_applications')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { applications: data, total: count };
}

async function getApplicationById(id, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('admission_applications')
    .select('*, assigned_class:assigned_class_id(id, name)')
    .eq('id', id)
    .eq('school_id', schoolId)
    .single();
  if (error) throw error;
  return data;
}

async function createApplication({
  schoolId,
  parentId,
  parentEmail,
  parentFirstName,
  parentLastName,
  parentPhone,
  studentFirstName,
  studentLastName,
  studentDob,
  studentGender,
  desiredGradeLevel,
  notes,
}) {
  const { data, error } = await supabaseAdmin
    .from('admission_applications')
    .insert({
      school_id: schoolId,
      parent_id: parentId || null,
      parent_email: parentEmail,
      parent_first_name: parentFirstName,
      parent_last_name: parentLastName,
      parent_phone: parentPhone || null,
      student_first_name: studentFirstName,
      student_last_name: studentLastName,
      student_dob: studentDob || null,
      student_gender: studentGender || null,
      desired_grade_level: desiredGradeLevel || null,
      notes: notes || null,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateApplicationStatus(id, schoolId, { status, reviewedBy, adminNotes, assignedClassId, studentId }) {
  const { data, error } = await supabaseAdmin
    .from('admission_applications')
    .update({
      status,
      reviewed_by: reviewedBy || null,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
      assigned_class_id: assignedClassId || null,
      student_id: studentId || null,
    })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteApplication(id, schoolId) {
  const { error } = await supabaseAdmin
    .from('admission_applications')
    .delete()
    .eq('id', id)
    .eq('school_id', schoolId);
  if (error) throw error;
}

async function getPendingCount(schoolId) {
  const { count, error } = await supabaseAdmin
    .from('admission_applications')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('status', 'pending');
  if (error) return 0;
  return count || 0;
}

module.exports = {
  getApplicationsBySchool,
  getApplicationById,
  createApplication,
  updateApplicationStatus,
  deleteApplication,
  getPendingCount,
};
