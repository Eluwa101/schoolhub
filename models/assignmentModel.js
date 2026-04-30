const { supabaseAdmin } = require('../utils/supabaseClient');

async function getAssignmentsByClass(classId, schoolId, { page = 1, limit = 20 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('assignments')
    .select(`
      *,
      subjects:subject_id (id, name),
      teacher:teacher_id (id, first_name, last_name),
      submission_count:assignment_submissions(count)
    `, { count: 'exact' })
    .eq('class_id', classId)
    .eq('school_id', schoolId)
    .order('due_date', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { assignments: data, total: count };
}

async function getAssignmentsByTeacher(teacherId, schoolId, { page = 1, limit = 20 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('assignments')
    .select(`
      *,
      subjects:subject_id (id, name),
      classes:class_id (id, name),
      submission_count:assignment_submissions(count)
    `, { count: 'exact' })
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { assignments: data, total: count };
}

async function getAssignmentById(id, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select(`
      *,
      subjects:subject_id (id, name),
      classes:class_id (id, name),
      teacher:teacher_id (id, first_name, last_name)
    `)
    .eq('id', id)
    .eq('school_id', schoolId)
    .single();
  if (error) throw error;
  return data;
}

async function createAssignment({ schoolId, classId, subjectId, teacherId, title, description, dueDate, fileUrl, maxScore }) {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .insert({
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId,
      title,
      description,
      due_date: dueDate,
      file_url: fileUrl || null,
      max_score: maxScore || 100,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getSubmissionsForAssignment(assignmentId) {
  const { data, error } = await supabaseAdmin
    .from('assignment_submissions')
    .select(`
      *,
      student:student_id (id, first_name, last_name, avatar_url)
    `)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getSubmissionByStudent(assignmentId, studentId) {
  const { data, error } = await supabaseAdmin
    .from('assignment_submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .single();
  if (error) return null;
  return data;
}

async function upsertSubmission({ assignmentId, studentId, fileUrl, notes }) {
  const { data, error } = await supabaseAdmin
    .from('assignment_submissions')
    .upsert({
      assignment_id: assignmentId,
      student_id: studentId,
      file_url: fileUrl || null,
      notes: notes || null,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,student_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function gradeSubmission({ assignmentId, studentId, score, feedback, gradedBy }) {
  const { data, error } = await supabaseAdmin
    .from('assignment_submissions')
    .update({
      score,
      feedback: feedback || null,
      graded_at: new Date().toISOString(),
      graded_by: gradedBy,
    })
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getAssignmentsForStudent(studentId, schoolId, classIds = []) {
  if (!classIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select(`
      *,
      subjects:subject_id (name),
      classes:class_id (name),
      submission:assignment_submissions!left(score, submitted_at, graded_at)
    `)
    .eq('school_id', schoolId)
    .in('class_id', classIds)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return data;
}

module.exports = {
  getAssignmentsByClass,
  getAssignmentsByTeacher,
  getAssignmentById,
  createAssignment,
  getSubmissionsForAssignment,
  getSubmissionByStudent,
  upsertSubmission,
  gradeSubmission,
  getAssignmentsForStudent,
};
