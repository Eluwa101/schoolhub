const { supabaseAdmin } = require('../utils/supabaseClient');

async function getAttendanceByClassDate(classId, schoolId, date, subjectId = null) {
  let query = supabaseAdmin
    .from('attendance')
    .select(`
      *,
      student:student_id (id, first_name, last_name)
    `)
    .eq('class_id', classId)
    .eq('school_id', schoolId)
    .eq('date', date);

  if (subjectId) query = query.eq('subject_id', subjectId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getAttendanceByStudent(studentId, schoolId, { term, limit = 100 } = {}) {
  let query = supabaseAdmin
    .from('attendance')
    .select(`
      *,
      classes:class_id (name),
      subjects:subject_id (name)
    `)
    .eq('student_id', studentId)
    .eq('school_id', schoolId)
    .order('date', { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function upsertAttendance({ schoolId, classId, studentId, subjectId, teacherId, date, status, notes }) {
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .upsert({
      school_id: schoolId,
      class_id: classId,
      student_id: studentId,
      subject_id: subjectId || null,
      teacher_id: teacherId || null,
      date,
      status,
      notes: notes || null,
    }, { onConflict: 'school_id,class_id,student_id,subject_id,date' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function bulkUpsertAttendance(records) {
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .upsert(records, { onConflict: 'school_id,class_id,student_id,subject_id,date' })
    .select();
  if (error) throw error;
  return data;
}

async function getAttendanceSummaryByStudent(studentId, schoolId) {
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .select('status')
    .eq('student_id', studentId)
    .eq('school_id', schoolId);
  if (error) throw error;

  const summary = { present: 0, absent: 0, late: 0, excused: 0, total: data.length };
  data.forEach(r => { summary[r.status] = (summary[r.status] || 0) + 1; });
  return summary;
}

async function getSchoolAttendanceStats(schoolId) {
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .select('status')
    .eq('school_id', schoolId);
  if (error) throw error;

  const total = data.length;
  const present = data.filter(r => r.status === 'present').length;
  return { total, present, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
}

module.exports = {
  getAttendanceByClassDate,
  getAttendanceByStudent,
  upsertAttendance,
  bulkUpsertAttendance,
  getAttendanceSummaryByStudent,
  getSchoolAttendanceStats,
};
