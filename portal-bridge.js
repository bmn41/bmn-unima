/**
 * BMN UNIMA - Universal Module Bridge (SSO, Routing Submenu, Granular Permissions, CORS Proxy)
 */
(function () {
  if (window.self === window.top) return; // Hanya aktif saat dimuat di dalam portal BMN UNIMA

  const params = new URLSearchParams(window.location.search);
  const MODULE = params.get('mod') || '';
  const INITIAL_SUB = params.get('sub') || '';

  let portalUser = null;
  try {
    const raw = localStorage.getItem('BMN_UNIMA_SESSION_V1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.user) portalUser = parsed.user;
    }
  } catch (e) {}

  if (!portalUser) return;

  const isSuper = portalUser.role === 'SUPER_ADMIN';
  const perms = portalUser.permissions || { menus: [], submenus: [], actions: [] };
  const actions = Array.isArray(perms.actions) ? perms.actions : [];
  const hasAction = (a) => isSuper || actions.indexOf(a) !== -1;

  // 1. Intercept fetch agar semua panggilan ke script.google.com lewat proxy Cloudflare /api?module=...
  // 1. Arahkan /api milik BAST ke URL exec aslinya; modul lain tetap ke exec masing-masing
  const BAST_EXEC = 'https://script.google.com/macros/s/AKfycbywfvfpdkeskEOPgmULA0F_MFfqfSDFOqN9C3S8Z5_h63OqiBIAR7zAUKpS8hLiF00O/exec';
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (MODULE === 'bast' && urlStr === '/api') {
      return origFetch(BAST_EXEC, Object.assign({}, init, { redirect: 'follow' }));
    }
    if (MODULE === 'dbr' && urlStr.includes('script.google.com/macros/') && init && typeof init.body === 'string') {
      try {
        const parsedBody = JSON.parse(init.body);
        if (Array.isArray(parsedBody.args) && parsedBody.args.length > 0) {
          const lastIdx = parsedBody.args.length - 1;
          if (typeof parsedBody.args[lastIdx] === 'string' && parsedBody.args[lastIdx].toLowerCase() === portalUser.username.toLowerCase()) {
            parsedBody.args[lastIdx] = 'admin';
            init = Object.assign({}, init, { body: JSON.stringify(parsedBody) });
          }
        }
      } catch (e) {}
    }
    return origFetch(input, init);
  };

  // 2. Sembunyikan elemen ganda (Login, Sidebar/Header lama, Chat lama) + enforce tombol sesuai hak akses
  const cssRules = [
    /* Umum: sembunyikan chat bawaan modul lama */
    '#chat-fab, #chat-widget, .chat-fab, .chat-widget { display: none !important; }',
    /* BAST BMN: sembunyikan sidebar kiri & halaman login */
    '#login-page { display: none !important; }',
    '#main-page > .row > .sidebar { display: none !important; }',
    '#main-page > .row > .col-md-9 { width: 100% !important; max-width: 100% !important; flex: 0 0 100% !important; padding: 20px !important; }',
    /* ARSIP BMN: sembunyikan login, header lama, tombol kembali dashboard ganda */
    '#loginPage, .top-header-simetris, #backDashboardBtn { display: none !important; }',
    '.dashboard { padding: 16px 20px !important; max-width: 100% !important; }',
    /* DBR BMN: sembunyikan authView, header & bottom nav lama */
    '#authView, #appView > header, #appView > nav { display: none !important; }',
    '#appView main { padding-top: 12px !important; max-width: 100% !important; }',
    /* CaLBMN: sembunyikan loginView & topbar lama */
    '#loginView, #appView > header { display: none !important; }',
    '#appView main { max-width: 100% !important; padding-top: 14px !important; }'
  ];

  // Sembunyikan tombol aksi secara dinamis berdasarkan hak akses user/role
  if (!hasAction('delete')) {
    cssRules.push('.btn-danger, .aksi-btn.delete, #btn-bulk-delete, #btn-bulk-drive-delete, #bulkActionContainer, [onclick*="delete"], [onclick*="Delete"], [onclick*="hapus"], [onclick*="Hapus"] { display: none !important; }');
  }
  if (!hasAction('edit')) {
    cssRules.push('.aksi-btn.edit, [onclick*="loadEdit"], [onclick*="editArsip"], [onclick*="openEdit"], [onclick*="openQuickEdit"], [onclick*="openDbrModal"] { display: none !important; }');
  }
  if (!hasAction('download')) {
    cssRules.push('.aksi-btn.download, [onclick*="exportToExcel"], [onclick*="downloadFile"], a.btn-primary[target="_blank"] { display: none !important; }');
  }
  if (!hasAction('print')) {
    cssRules.push('[onclick*="generateRecapPDF"], [onclick*="openModalCetak"], [onclick*="Print"], [onclick*="printReportPdf"] { display: none !important; }');
  }
  if (!hasAction('upload') && !hasAction('create')) {
    cssRules.push('#btn-submit, .submit-btn, #btnAddGedungTop, [onclick*="submitData"], [onclick*="submitDocTemplate"], [onclick*="uploadMultipleForms"], [onclick*="openNewDraftGate"] { display: none !important; }');
  }

  const styleEl = document.createElement('style');
  styleEl.textContent = cssRules.join('\n');
  document.head.appendChild(styleEl);

  // 3. Suntikkan Sesi SSO Otomatis sesuai Modul (Tanpa Password)
  const modRoleUpper = isSuper ? 'ADMIN' : (hasAction('verify') ? 'VERIFIKATOR' : 'STAFF');
  const dbrRole = isSuper ? 'Admin' : (hasAction('verify') ? 'Verifikator' : 'Pengelola');

  if (MODULE === 'bast') {
    localStorage.setItem('bastUser', JSON.stringify({
      status: 'success',
      username: portalUser.username,
      nama: portalUser.nama,
      role: isSuper ? 'ADMIN' : 'STAFF',
      hak: 'FULL'
    }));
  } else if (MODULE === 'arsip') {
    localStorage.setItem('currentUser', JSON.stringify({
      username: portalUser.username,
      name: portalUser.nama,
      role: isSuper ? 'ADMIN' : 'OPERATOR',
      permissions: { menus: ['ALL'], actions: isSuper ? ['upload', 'edit', 'delete', 'download', 'cetak'] : actions },
      theme: 'theme-kementerian'
    }));
    localStorage.setItem('lastActivity', String(Date.now()));
  } else if (MODULE === 'dbr') {
    const dbrUser = {
      id: portalUser.id,
      username: 'admin', // Menggunakan service account aktif pada DB DBR agar tidak mengubah tabel Users DBR
      nama: portalUser.nama,
      nip: portalUser.nip || '-',
      role: dbrRole,
      status: 'ACTIVE',
      fotoProfil: ''
    };
    localStorage.setItem('DBR_UNIMA_USER_V5', JSON.stringify(dbrUser));
    localStorage.setItem('DBR_UNIMA_ACTIVE_V5', String(Date.now()));
  } else if (MODULE === 'calbmn') {
    localStorage.setItem('CALBMN_UNIMA_SESSION_V1', JSON.stringify({
      user: {
        userId: portalUser.id,
        username: portalUser.username,
        fullName: portalUser.nama,
        role: isSuper ? 'super_admin' : 'operator'
      },
      lastActivity: Date.now()
    }));
  }

  // 4. Navigasi Submenu dari Portal BMN UNIMA
  function navigateToSubmenu(sub) {
    if (!sub) return;
    try {
      if (MODULE === 'bast' && typeof window.openMenu === 'function') {
        window.openMenu(sub, false);
      } else if (MODULE === 'arsip') {
        if (sub === 'rekap' && typeof window.openModalCetak === 'function') {
          window.openModalCetak();
        } else if (sub === 'dashboard' && typeof window.backToDashboard === 'function') {
          window.backToDashboard();
        } else if (typeof window.loadMenu === 'function') {
          window.loadMenu(sub);
        }
      } else if (MODULE === 'dbr' && typeof window.switchMainTab === 'function') {
        window.switchMainTab(sub);
      } else if (MODULE === 'calbmn' && typeof window.switchMainTab === 'function') {
        window.switchMainTab(sub, true);
      }
    } catch (e) {
      console.warn('Submenu nav pending:', e);
    }
  }

  // Terima perintah ganti submenu dari Portal Utama
  window.addEventListener('message', function (evt) {
    if (!evt.data || evt.data.type !== 'BMN_PORTAL_NAV') return;
    navigateToSubmenu(evt.data.sub);
  });

  // Teruskan aktivitas user di dalam iframe ke Portal Utama (agar timer 20 menit tidak auto-logout saat sedang bekerja di modul)
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function (evName) {
    window.addEventListener(evName, function () {
      window.parent.postMessage({ type: 'BMN_PORTAL_ACTIVITY' }, '*');
    }, { passive: true });
  });

  // Jalankan submenu awal setelah modul siap
  window.addEventListener('load', function () {
    // Nonaktifkan polling chat modul lama agar hemat kuota
    if (typeof window.chatPolling !== 'undefined' && window.chatPolling) clearInterval(window.chatPolling);
    if (typeof window.chatInterval !== 'undefined' && window.chatInterval) clearInterval(window.chatInterval);
    setTimeout(function () {
      navigateToSubmenu(INITIAL_SUB);
      window.parent.postMessage({ type: 'BMN_MODULE_READY', module: MODULE }, '*');
    }, 650);
  });
})();
