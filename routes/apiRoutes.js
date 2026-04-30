const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const { supabaseAdmin } = require('../utils/supabaseClient');

// GET /api/students?classId=xxx — for dynamic dropdowns
router.get('/students', isAuthenticated, async (req, res) => {
  try {
    const { classId } = req.query;
    if (classId) {
      const { data } = await supabaseAdmin
        .from('student_classes')
        .select('student:student_id(id, first_name, last_name)')
        .eq('class_id', classId);
      return res.json(data?.map(d => d.student) || []);
    }
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('school_id', req.schoolId)
      .eq('role', 'student')
      .eq('is_active', true)
      .order('last_name');
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subjects?classId=xxx
router.get('/subjects', isAuthenticated, async (req, res) => {
  try {
    const { classId } = req.query;
    if (classId) {
      const { data } = await supabaseAdmin
        .from('class_subjects')
        .select('subjects:subject_id(id, name, code)')
        .eq('class_id', classId);
      return res.json(data?.map(d => d.subjects) || []);
    }
    const { data } = await supabaseAdmin
      .from('subjects')
      .select('id, name, code')
      .eq('school_id', req.schoolId)
      .order('name');
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/classes
router.get('/classes', isAuthenticated, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from('classes')
      .select('id, name, academic_year')
      .eq('school_id', req.schoolId)
      .order('name');
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/unread-count
router.get('/unread-count', isAuthenticated, async (req, res) => {
  try {
    const { count } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', req.user.userId)
      .eq('school_id', req.schoolId)
      .eq('is_read', false);
    res.json({ count: count || 0 });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});

module.exports = router;
