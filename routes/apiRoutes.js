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

// GET /api/notifications — lightweight in-app notifications (last 24h)
router.get('/notifications', isAuthenticated, async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const userId = req.user.userId;
    const role = req.user.role;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days
    const notifications = [];

    // Announcements for everyone
    const { data: announcements } = await supabaseAdmin
      .from('announcements')
      .select('id, title, created_at, target_role')
      .eq('school_id', schoolId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    (announcements || []).forEach(a => {
      if (a.target_role === 'all' || a.target_role === role || !a.target_role) {
        notifications.push({ type: 'announcement', title: a.title, body: 'New announcement', time: a.created_at, href: `/${roleHref(role)}/announcements` });
      }
    });

    // Role-specific
    if (role === 'school_admin' || role === 'super_admin') {
      const { count: pendingAdm } = await supabaseAdmin
        .from('admission_applications')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'pending');
      if (pendingAdm > 0) {
        notifications.unshift({ type: 'action', title: `${pendingAdm} admission${pendingAdm > 1 ? 's' : ''} pending`, body: 'Review and admit students', time: new Date().toISOString(), href: '/admin/admissions' });
      }
    } else if (role === 'student') {
      const { data: newAssignments } = await supabaseAdmin
        .from('assignments')
        .select('id, title, due_date, classes:class_id(name)')
        .eq('school_id', schoolId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);
      (newAssignments || []).forEach(a => {
        notifications.unshift({ type: 'assignment', title: a.title, body: `Due ${a.due_date?.substring(0,10)}`, time: a.due_date, href: '/student/assignments' });
      });
    } else if (role === 'teacher') {
      const { data: newSubmissions } = await supabaseAdmin
        .from('assignment_submissions')
        .select('id, submitted_at, assignment:assignment_id(title, teacher_id)')
        .eq('school_id', schoolId)
        .eq('assignment.teacher_id', userId)
        .gte('submitted_at', since)
        .order('submitted_at', { ascending: false })
        .limit(5);
      (newSubmissions || []).filter(s => s.assignment).forEach(s => {
        notifications.unshift({ type: 'submission', title: `New submission: ${s.assignment.title}`, body: 'A student submitted work', time: s.submitted_at, href: '/teacher/assignments' });
      });
    }

    notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Unread messages count for total badge
    const { count: unreadMsgs } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('school_id', schoolId)
      .eq('is_read', false);

    res.json({ notifications: notifications.slice(0, 8), unreadMessages: unreadMsgs || 0 });
  } catch (err) {
    res.status(500).json({ notifications: [], unreadMessages: 0 });
  }
});

// GET /api/messages/:id/thread — used by message-center polling
router.get('/messages/:id/thread', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId;
    const userId = req.user.userId;
    // Only allow participants to fetch the thread
    const { data: root } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, recipient_id')
      .eq('id', id)
      .eq('school_id', schoolId)
      .single();
    if (!root || (root.sender_id !== userId && root.recipient_id !== userId)) {
      return res.status(403).json({ messages: [] });
    }
    const { data: thread } = await supabaseAdmin
      .from('messages')
      .select('id, body, created_at, sender_id, sender:sender_id(first_name, last_name)')
      .eq('school_id', schoolId)
      .or(`id.eq.${id},parent_message_id.eq.${id}`)
      .order('created_at', { ascending: true });
    res.json({ messages: thread || [] });
  } catch (err) {
    res.status(500).json({ messages: [] });
  }
});

function roleHref(role) {
  if (role === 'school_admin' || role === 'super_admin') return 'admin';
  return role;
}

module.exports = router;
