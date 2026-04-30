const { supabaseAdmin } = require('../utils/supabaseClient');

async function getGradesByStudent(studentId, schoolId, { term, academicYear } = {}) {
  let query = supabaseAdmin
    .from('grades')
    .select(`
      *,
      subjects:subject_id (id, name, code),
      teacher:teacher_id (first_name, last_name)
    `)
    .eq('student_id', studentId)
    .eq('school_id', schoolId)
    .order('graded_at', { ascending: false });

  if (term) query = query.eq('term', term);
  if (academicYear) query = query.eq('academic_year', academicYear);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getGradesByClassSubject(classId, subjectId, schoolId, { term, academicYear } = {}) {
  let query = supabaseAdmin
    .from('grades')
    .select(`
      *,
      student:student_id (id, first_name, last_name)
    `)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('school_id', schoolId)
    .order('graded_at', { ascending: false });

  if (term) query = query.eq('term', term);
  if (academicYear) query = query.eq('academic_year', academicYear);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function upsertGrade({ schoolId, studentId, subjectId, classId, teacherId, assessmentType, score, maxScore, term, academicYear, notes }) {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .insert({
      school_id: schoolId,
      student_id: studentId,
      subject_id: subjectId,
      class_id: classId,
      teacher_id: teacherId,
      assessment_type: assessmentType,
      score,
      max_score: maxScore || 100,
      term,
      academic_year: academicYear,
      notes: notes || null,
      graded_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateGrade(id, schoolId, updates) {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .update({ ...updates, graded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getAverageGradeByClassSubject(classId, subjectId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select('score, max_score')
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('school_id', schoolId);
  if (error) throw error;

  if (!data.length) return 0;
  const total = data.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0);
  return Math.round(total / data.length);
}

async function getSchoolGradeStats(schoolId) {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select('score, max_score, subjects:subject_id(name), classes:class_id(name)')
    .eq('school_id', schoolId);
  if (error) throw error;

  if (!data.length) return { average: 0, total: 0 };
  const total = data.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0);
  return { average: Math.round(total / data.length), total: data.length };
}

module.exports = {
  getGradesByStudent,
  getGradesByClassSubject,
  upsertGrade,
  updateGrade,
  getAverageGradeByClassSubject,
  getSchoolGradeStats,
};
