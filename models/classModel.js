const { supabaseAdmin } = require('../utils/supabaseClient');

async function getClassesBySchool(schoolId, { page = 1, limit = 20 } = {}) {
  const { data, error, count } = await supabaseAdmin
    .from('classes')
    .select(`
      *,
      class_teacher:class_teacher_id (id, first_name, last_name),
      student_count:student_classes(count)
    `, { count: 'exact' })
    .eq('school_id', schoolId)
    .order('name')
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw error;
  return { classes: data, total: count };
}

async function getAllClassesBySchool(schoolId) {
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select(`
      *,
      class_teacher:class_teacher_id (id, first_name, last_name),
      student_count:student_classes(count)
    `)
    .eq('school_id', schoolId)
    .order('name');
  if (error) throw error;
  return data;
}

async function getClassById(id, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select(`
      *,
      class_teacher:class_teacher_id (id, first_name, last_name),
      class_subjects (
        id,
        subjects:subject_id (id, name, code),
        teacher:teacher_id (id, first_name, last_name)
      )
    `)
    .eq('id', id)
    .eq('school_id', schoolId)
    .single();
  if (error) throw error;
  return data;
}

async function createClass({ schoolId, name, gradeLevel, academicYear, classTeacherId }) {
  const { data, error } = await supabaseAdmin
    .from('classes')
    .insert({
      school_id: schoolId,
      name,
      grade_level: gradeLevel,
      academic_year: academicYear,
      class_teacher_id: classTeacherId || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateClass(id, schoolId, updates) {
  const { data, error } = await supabaseAdmin
    .from('classes')
    .update(updates)
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteClass(id, schoolId) {
  const { error } = await supabaseAdmin
    .from('classes')
    .delete()
    .eq('id', id)
    .eq('school_id', schoolId);
  if (error) throw error;
}

async function getStudentsInClass(classId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('student_classes')
    .select(`
      *,
      student:student_id (id, first_name, last_name, avatar_url, is_active)
    `)
    .eq('class_id', classId)
    .order('enrolled_at');
  if (error) throw error;
  return data;
}

async function enrollStudent({ studentId, classId, academicYear }) {
  const { data, error } = await supabaseAdmin
    .from('student_classes')
    .upsert({ student_id: studentId, class_id: classId, academic_year: academicYear })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeStudentFromClass(studentId, classId) {
  const { error } = await supabaseAdmin
    .from('student_classes')
    .delete()
    .eq('student_id', studentId)
    .eq('class_id', classId);
  if (error) throw error;
}

async function getClassesForTeacher(teacherId, schoolId) {
  const [{ data: subjectRows, error: e1 }, { data: homeroomRows, error: e2 }] = await Promise.all([
    supabaseAdmin
      .from('class_subjects')
      .select(`
        id,
        classes:class_id (id, name, grade_level, academic_year, school_id),
        subjects:subject_id (id, name, code)
      `)
      .eq('teacher_id', teacherId),
    supabaseAdmin
      .from('classes')
      .select('id, name, grade_level, academic_year, school_id')
      .eq('class_teacher_id', teacherId)
      .eq('school_id', schoolId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const results = (subjectRows || []).filter(cs => cs.classes?.school_id === schoolId);
  const seenClassIds = new Set(results.map(cs => cs.classes?.id).filter(Boolean));

  (homeroomRows || []).forEach(cls => {
    if (!seenClassIds.has(cls.id)) {
      results.push({ id: null, classes: cls, subjects: null, isHomeroom: true });
    }
  });

  return results;
}

async function getClassesForStudent(studentId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('student_classes')
    .select(`
      academic_year,
      class:class_id (
        id, name, grade_level, academic_year, school_id,
        class_teacher:class_teacher_id (first_name, last_name)
      )
    `)
    .eq('student_id', studentId);
  if (error) throw error;
  return data.filter(sc => sc.class?.school_id === schoolId);
}

module.exports = {
  getClassesBySchool,
  getAllClassesBySchool,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getStudentsInClass,
  enrollStudent,
  removeStudentFromClass,
  getClassesForTeacher,
  getClassesForStudent,
};
