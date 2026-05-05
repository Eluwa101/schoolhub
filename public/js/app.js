// SchoolHub Client-Side JS

document.addEventListener('DOMContentLoaded', () => {
  function getOpenModals() {
    return Array.from(document.querySelectorAll('.modal-overlay')).filter(modal => !modal.classList.contains('hidden'));
  }

  function syncModalState() {
    document.body.classList.toggle('overflow-hidden', getOpenModals().length > 0);
  }

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

  // Desktop sidebar collapse/expand
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  if (collapseBtn && sidebar) {
    // Restore saved state
    const savedCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (savedCollapsed) sidebar.classList.add('sidebar-collapsed');

    collapseBtn.addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', isCollapsed);
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

  // Notification bell
  const notifBtn = document.getElementById('notif-btn');
  const notifDropdown = document.getElementById('notif-dropdown');
  const notifList = document.getElementById('notif-list');
  const notifBadge = document.getElementById('notif-badge');
  const notifCountLabel = document.getElementById('notif-count-label');
  let notifLoaded = false;

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const typeIcons = {
    announcement: '📢',
    assignment: '📝',
    submission: '📬',
    action: '⚡',
  };

  async function loadNotifications() {
    if (!notifList) return;
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const { notifications, unreadMessages } = await res.json();

      // Update message badge too
      const msgBadge = document.getElementById('unread-badge');
      if (msgBadge) {
        if (unreadMessages > 0) {
          msgBadge.textContent = unreadMessages > 99 ? '99+' : unreadMessages;
          msgBadge.classList.remove('hidden');
        } else {
          msgBadge.classList.add('hidden');
        }
      }

      // Update notif count badge
      if (notifBadge) {
        const total = notifications.length;
        if (total > 0) {
          notifBadge.textContent = total > 9 ? '9+' : total;
          notifBadge.classList.remove('hidden');
        } else {
          notifBadge.classList.add('hidden');
        }
        if (notifCountLabel) notifCountLabel.textContent = total > 0 ? `${total} new` : 'All caught up';
      }

      if (!notifications.length) {
        notifList.innerHTML = '<div class="px-4 py-8 text-center text-sm text-gray-400">You\'re all caught up!</div>';
        return;
      }

      notifList.innerHTML = notifications.map(n => `
        <a href="${n.href || '#'}" class="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition">
          <span class="text-lg flex-shrink-0 mt-0.5">${typeIcons[n.type] || '🔔'}</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-800 truncate">${n.title}</p>
            <p class="text-xs text-gray-400 truncate">${n.body || ''}</p>
          </div>
          <span class="text-xs text-gray-400 flex-shrink-0 mt-0.5">${timeAgo(n.time)}</span>
        </a>
      `).join('');

      notifLoaded = true;
    } catch {}
  }

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOpen = !notifDropdown.classList.contains('hidden');
      document.querySelectorAll('.notif-dropdown-close').forEach(d => d.classList.add('hidden'));
      if (isOpen) {
        notifDropdown.classList.add('hidden');
      } else {
        notifDropdown.classList.remove('hidden');
        notifDropdown.classList.add('notif-dropdown-close');
        if (!notifLoaded) await loadNotifications();
      }
    });
    document.addEventListener('click', () => notifDropdown.classList.add('hidden'));
  }

  // Load notifications on page load (for badge count)
  if (notifBadge) loadNotifications();

  // Shared modal behavior
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        syncModalState();
      }
    });

    const observer = new MutationObserver(syncModalState);
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openModals = getOpenModals();
    const topModal = openModals[openModals.length - 1];
    if (topModal) {
      topModal.classList.add('hidden');
      syncModalState();
    }
  });

  syncModalState();

  // Confirm destructive actions
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!confirm(el.dataset.confirm)) e.preventDefault();
    });
  });
});
