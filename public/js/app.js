// SchoolHub Client-Side JS

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar toggle (mobile)
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('-translate-x-full');
      backdrop && backdrop.classList.toggle('hidden');
    });
    backdrop && backdrop.addEventListener('click', () => {
      sidebar.classList.add('-translate-x-full');
      backdrop.classList.add('hidden');
    });
  }

  // User menu dropdown
  const userBtn = document.getElementById('user-menu-btn');
  const userDropdown = document.getElementById('user-menu-dropdown');
  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => userDropdown.classList.add('hidden'));
  }

  // Auto-dismiss flash messages after 5 seconds
  document.querySelectorAll('.flash-msg').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, 5000);
  });

  // Loading state on form submit
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', () => {
      const btn = form.querySelector('button[type=submit]');
      if (btn && !btn.dataset.noLoading) {
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner mr-2"></span>Loading...';
        // Restore after 10s in case of error
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }, 10000);
      }
    });
  });

  // Poll unread message count
  async function updateUnreadBadge() {
    try {
      const res = await fetch('/api/unread-count');
      if (!res.ok) return;
      const { count } = await res.json();
      const badge = document.getElementById('unread-badge');
      if (badge) {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : count;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    } catch {}
  }

  // Only poll if logged in (badge exists)
  if (document.getElementById('unread-badge')) {
    updateUnreadBadge();
    setInterval(updateUnreadBadge, 30000);
  }

  // Confirm destructive actions
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!confirm(el.dataset.confirm)) e.preventDefault();
    });
  });
});
