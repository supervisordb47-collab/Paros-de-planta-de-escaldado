(() => {
  const STORAGE_KEY = 'secadas_portal_state_v1';
  const SESSION_KEY = 'secadas_portal_session_v1';

  const $ = (id) => document.getElementById(id);

  const defaultState = () => structuredClone(PORTAL_DEFAULT_DATA);

  function nowISO() { return new Date().toISOString(); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function safe(v) { return String(v ?? '').trim(); }
  function upper(v) { return safe(v).toUpperCase(); }
  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
  }
  function fmtDateOnly(v) {
    if (!v) return '—';
    const d = new Date(`${v}T00:00:00`);
    return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function escapeHtml(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
  function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function toNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function parseDateTimeFromParts(datePart, timePart) {
    const d = safe(datePart);
    const t = safe(timePart);
    if (!d && !t) return null;
    if (d && d.includes('T')) {
      const dt = new Date(d);
      return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
    }
    const isoDateMatch = /^\d{4}-\d{2}-\d{2}$/.test(d);
    const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(d);
    let dateISO = '';
    if (isoDateMatch) {
      dateISO = d;
    } else if (dmyMatch) {
      const [, dd, mm, yyyy] = dmyMatch;
      dateISO = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    const timeISO = t ? t.split(':').slice(0, 3).map((x, i) => i === 0 || i === 1 || i === 2 ? String(x).padStart(2, '0') : x).join(':') : '00:00:00';
    if (!dateISO) return null;
    const dt = new Date(`${dateISO}T${timeISO.length === 5 ? `${timeISO}:00` : timeISO}`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  function isoToDateKey(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function weekStartKey(dateStr = todayISO()) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }

  function inRange(dateStr, startKey, endKey) {
    return !!dateStr && dateStr >= startKey && dateStr <= endKey;
  }

  function normalizeHeader(textValue) {
    return safe(textValue)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function splitPasteRow(line) {
    const raw = safe(line);
    if (!raw) return [];
    if (raw.includes('\t')) return raw.split('\t').map(safe);
    return raw.split(/\s{2,}/).map(safe);
  }

  function parseIntMaybe(v) {
    const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeUser(v) { return upper(v); }
  function hashPassword(pass) {
    try {
      return btoa(unescape(encodeURIComponent(String(pass || ''))));
    } catch {
      return String(pass || '');
    }
  }
  function verifyPassword(stored, entered) {
    const s = String(stored ?? '');
    const e = String(entered ?? '');
    return s === e || s === hashPassword(e);
  }

  function normalizeUsers(users) {
    const out = {};
    Object.entries(users || {}).forEach(([key, user]) => {
      if (!user) return;
      const username = normalizeUser(user.username || key);
      out[username] = {
        ...user,
        username,
        role: user.role || 'operador',
        active: user.active !== false
      };
    });
    return out;
  }

function loadState() {
  const base = defaultState();
  const initial = clone(base);
  initial.settings.github = {
    ...(base.settings.github || {}),
    ...(initial.settings.github || {})
  };
  return initial;
}

function saveState() {
  state.meta = state.meta || {};
  state.meta.updatedAt = nowISO();
  requestSync('state-change');
}

  let state = loadState();
  let session = null;
  let editingRecordId = null;
  let notificationTimer = null;
  const SYNC_TOKEN_KEY = 'secadas_portal_github_token_v1';
  let syncTimer = null;
  let pullTimer = null;
  let syncInFlight = false;
  let syncStatus = {
    mode: 'offline',
    title: 'Sincronización no configurada',
    detail: 'Completa GitHub en Configuración para activar la nube.'
  };

  function currentUser() {
    const username = session?.username ? normalizeUser(session.username) : null;
    return username ? state.users[username] : null;
  }
  function isAdmin() {
    return currentUser()?.role === 'admin';
  }
  function canEditRecord(record) {
    if (isAdmin()) return true;
    const user = currentUser();
    return !!user && record && record.user === user.username;
  }

  function showToast(title, message = '') {
    const box = $('toast');
    if (!box) return;
    box.innerHTML = `${escapeHtml(title)}${message ? `<span class="muted">${escapeHtml(message)}</span>` : ''}`;
    box.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => box.classList.remove('show'), 3200);
  }

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    session = raw ? JSON.parse(raw) : null;
    if (session?.username) session.username = normalizeUser(session.username);
  } catch {
    session = null;
  }
}

function saveSession() {
  try {
    if (!session) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore session storage errors
  }
}


function loadStoredGithubToken() {
  try {
    return sessionStorage.getItem(SYNC_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveStoredGithubToken(token) {
  try {
    if (!token) sessionStorage.removeItem(SYNC_TOKEN_KEY);
    else sessionStorage.setItem(SYNC_TOKEN_KEY, token);
  } catch {
    // ignore session storage errors
  }
}

function encodeBase64Utf8(value) {
  return btoa(unescape(encodeURIComponent(String(value ?? ''))));
}

function decodeBase64Utf8(value) {
  return decodeURIComponent(escape(atob(String(value ?? '').replace(/\s+/g, ''))));
}

function githubPathEncode(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function detectedGithubConfig() {
  const host = location.hostname || '';
  if (!host.endsWith('github.io')) {
    return { owner: '', repo: '' };
  }
  const owner = host.split('.')[0];
  const repo = (location.pathname || '').split('/').filter(Boolean)[0] || '';
  return {
    owner,
    repo,
    branch: 'main',
    path: 'portal-data.json',
    autoSync: true
  };
}

function ensureGithubDefaults() {
  const detected = detectedGithubConfig();
  state.settings.github = {
    owner: '',
    repo: '',
    branch: 'main',
    path: 'portal-data.json',
    autoSync: true,
    ...(state.settings.github || {}),
    ...(detected.owner && !safe(state.settings.github?.owner) ? { owner: detected.owner } : {}),
    ...(detected.repo && !safe(state.settings.github?.repo) ? { repo: detected.repo } : {})
  };
  state.settings.whatsappNumber = safe(state.settings.whatsappNumber || '');
  state.settings.whatsappMessage = safe(state.settings.whatsappMessage || 'Hola, necesito ayuda con el portal de secadas.');
}

function githubConfig() {
  ensureGithubDefaults();
  const g = state.settings.github || {};
  return {
    owner: safe(g.owner),
    repo: safe(g.repo),
    branch: safe(g.branch) || 'main',
    path: safe(g.path) || 'portal-data.json',
    autoSync: g.autoSync !== false
  };
}

function hasGithubConfig() {
  const cfg = githubConfig();
  return !!(cfg.owner && cfg.repo && cfg.path);
}

function setSyncStatus(mode, title, detail = '') {
  syncStatus = { mode, title, detail };
  renderSyncStatus();
}

function renderSyncStatus() {
  const badge = $('githubSyncBadge');
  const box = $('githubSyncStatus');
  if (badge) {
    const map = {
      offline: 'Desconectado',
      syncing: 'Sincronizando',
      ok: 'Sincronizado',
      warn: 'Atención',
      error: 'Error'
    };
    badge.textContent = map[syncStatus.mode] || 'Sincronizado';
    badge.className = `pill sync-pill ${syncStatus.mode}`;
  }
  if (box) {
    box.innerHTML = `
      <strong>${escapeHtml(syncStatus.title || '')}</strong>
      ${syncStatus.detail ? `<span>${escapeHtml(syncStatus.detail)}</span>` : ''}
    `;
  }
}

function normalizeRecordItem(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const secadas = toNumber(rec.secadas);
  const normalized = {
    ...rec,
    id: safe(rec.id) || uid('rec'),
    user: normalizeUser(rec.user || rec.username || 'ADMIN'),
    fullName: safe(rec.fullName || rec.name || rec.user || rec.username || 'ADMIN'),
    date: safe(rec.date || '').slice(0, 10),
    shift: rec.shift || 'Día',
    dryer: String(rec.dryer || '1'),
    secadas,
    durationHours: secadas > 0 ? (rec.durationHours ?? null) : null,
    durationMinutes: secadas > 0 ? (rec.durationMinutes ?? null) : null,
    stopHours: secadas === 0 ? toNumber(rec.stopHours, 0) : 0,
    stopType: secadas === 0 ? safe(rec.stopType) : '',
    mainStop: secadas === 0 ? safe(rec.mainStop) : '',
    notes: safe(rec.notes),
    createdAt: rec.createdAt || nowISO(),
    updatedAt: rec.updatedAt || nowISO()
  };
  if (!normalized.date) normalized.date = isoToDateKey(normalized.createdAt) || todayISO();
  return normalized;
}

function normalizeNotificationItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    ...item,
    id: safe(item.id) || uid('notif'),
    title: safe(item.title) || 'Notificación',
    message: safe(item.message),
    type: safe(item.type) || 'info',
    scope: safe(item.scope) || 'global',
    source: safe(item.source) || '',
    readBy: Array.isArray(item.readBy) ? [...new Set(item.readBy.map(normalizeUser))] : [],
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO()
  };
}

function stampValue(item) {
  if (!item) return '';
  return String(item.updatedAt || item.createdAt || item.date || '');
}

function chooseNewer(a, b) {
  return stampValue(a) >= stampValue(b) ? a : b;
}

function mergeRecords(remote = [], local = []) {
  const map = new Map();
  [...remote, ...local].forEach(rec => {
    const item = normalizeRecordItem(rec);
    if (!item) return;
    const prev = map.get(item.id);
    map.set(item.id, prev ? chooseNewer(prev, item) : item);
  });
  return [...map.values()].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function mergeNotifications(remote = [], local = []) {
  const map = new Map();
  [...remote, ...local].forEach(item => {
    const norm = normalizeNotificationItem(item);
    if (!norm) return;
    const prev = map.get(norm.id);
    if (!prev) {
      map.set(norm.id, norm);
      return;
    }
    map.set(norm.id, {
      ...chooseNewer(prev, norm),
      readBy: [...new Set([...(prev.readBy || []), ...(norm.readBy || [])])],
    });
  });
  return [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function mergeUsers(remote = {}, local = {}) {
  const base = normalizeUsers(remote || {});
  const additions = normalizeUsers(local || {});
  Object.entries(additions).forEach(([key, user]) => {
    base[key] = { ...(base[key] || {}), ...user, username: normalizeUser(user.username || key) };
  });
  return base;
}

function mergeStates(remoteState = {}, localState = {}) {
  const base = clone(defaultState());
  const remote = remoteState && typeof remoteState === 'object' ? remoteState : {};
  const local = localState && typeof localState === 'object' ? localState : {};
  return {
    ...base,
    ...remote,
    ...local,
    settings: {
      ...base.settings,
      ...(remote.settings || {}),
      ...(local.settings || {}),
      github: {
        ...(base.settings.github || {}),
        ...((remote.settings && remote.settings.github) || {}),
        ...((local.settings && local.settings.github) || {})
      }
    },
    users: mergeUsers(remote.users || {}, local.users || {}),
    records: mergeRecords(remote.records || [], local.records || []),
    notifications: mergeNotifications(remote.notifications || [], local.notifications || []),
    meta: {
      ...base.meta,
      ...(remote.meta || {}),
      ...(local.meta || {}),
      notificationState: {
        ...(base.meta.notificationState || {}),
        ...((remote.meta && remote.meta.notificationState) || {}),
        ...((local.meta && local.meta.notificationState) || {})
      }
    }
  };
}

async function githubRequest(url, options = {}) {
  const token = loadStoredGithubToken();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/vnd.github+json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.json) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.json);
    delete options.json;
  }
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!res.ok) {
    const message = payload && typeof payload === 'object' ? (payload.message || payload.error || text) : text;
    throw new Error(message || `GitHub respondió ${res.status}`);
  }
  return payload;
}

async function fetchRemoteSnapshot() {
  const cfg = githubConfig();
  if (!cfg.owner || !cfg.repo || !cfg.path) {
    return { exists: false, sha: null, state: null, config: cfg };
  }
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${githubPathEncode(cfg.path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const payload = await githubRequest(url, { method: 'GET' });
  if (!payload || !payload.content) {
    return { exists: false, sha: null, state: null, config: cfg };
  }
  const json = JSON.parse(decodeBase64Utf8(payload.content));
  return { exists: true, sha: payload.sha || null, state: json, config: cfg };
}

async function pushRemoteSnapshot(snapshot, sha = null, reason = 'Sincronización') {
  const cfg = githubConfig();
  if (!cfg.owner || !cfg.repo || !cfg.path) throw new Error('Falta configurar owner, repo o archivo JSON.');
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${githubPathEncode(cfg.path)}`;
  const body = {
    message: `${reason} · ${new Date().toISOString()}`,
    content: encodeBase64Utf8(JSON.stringify(snapshot, null, 2)),
    branch: cfg.branch
  };
  if (sha) body.sha = sha;
  const token = loadStoredGithubToken();
  if (!token) throw new Error('Falta el token de GitHub para guardar cambios.');
  await githubRequest(url, { method: 'PUT', json: body });
  return true;
}

async function pullFromGithub(silent = false) {
  if (!hasGithubConfig()) {
    if (!silent) setSyncStatus('offline', 'Sincronización no configurada', 'Completa GitHub en Configuración para activar la nube.');
    return false;
  }
  try {
    const remote = await fetchRemoteSnapshot();
    if (remote.state) {
      state = mergeStates(remote.state, state);
      ensureGithubDefaults();
      if (!silent) setSyncStatus('ok', 'Nube actualizada', `Datos cargados desde ${githubConfig().repo}`);
      saveSession();
      renderAll();
    } else if (!silent) {
      setSyncStatus('warn', 'Archivo no encontrado', 'Crea el JSON inicial en GitHub o usa “Guardar y sincronizar”.');
    }
    return true;
  } catch (err) {
    if (!silent) setSyncStatus('error', 'Sin conexión', err.message || 'No se pudo leer GitHub.');
    return false;
  }
}

async function syncNow(reason = 'Sincronizar ahora') {
  if (syncInFlight) return false;
  if (!hasGithubConfig()) {
    setSyncStatus('warn', 'Sincronización no configurada', 'Completa los datos de GitHub en Configuración.');
    return false;
  }
  syncInFlight = true;
  try {
    setSyncStatus('syncing', 'Sincronizando', 'Leyendo nube, unificando cambios y guardando.');
    const remote = await fetchRemoteSnapshot().catch(() => ({ exists: false, sha: null, state: null }));
    const merged = mergeStates(remote.state || {}, state);
    ensureGithubDefaults();
    merged.settings.github = { ...githubConfig() };
    merged.settings.whatsappNumber = safe(state.settings.whatsappNumber || '');
    merged.settings.whatsappMessage = safe(state.settings.whatsappMessage || '');
    await pushRemoteSnapshot(merged, remote.sha, reason);
    state = merged;
    state.meta = state.meta || {};
    state.meta.lastSyncAt = nowISO();
    saveSession();
    renderAll();
    setSyncStatus('ok', 'Sincronizado', `Última actualización ${fmtDate(nowISO())}`);
    return true;
  } catch (err) {
    setSyncStatus('error', 'Error de sincronización', err.message || 'No se pudo guardar en GitHub.');
    showToast('Sincronización fallida', err.message || 'No se pudo guardar en GitHub.');
    return false;
  } finally {
    syncInFlight = false;
  }
}

function requestSync(reason = 'Cambio local') {
  if (syncTimer) clearTimeout(syncTimer);
  if (!hasGithubConfig()) {
    setSyncStatus('warn', 'GitHub pendiente', 'Configura owner, repo y archivo JSON para activar la nube.');
    return;
  }
  syncTimer = setTimeout(() => {
    syncNow(reason);
  }, 900);
}

function schedulePull() {
  if (pullTimer) clearInterval(pullTimer);
  pullTimer = setInterval(() => {
    if (session && hasGithubConfig()) {
      pullFromGithub(true);
    }
  }, 30000);
}

function openWhatsApp() {
  const number = safe(state.settings.whatsappNumber || '');
  const message = safe(state.settings.whatsappMessage || 'Hola, necesito ayuda con el portal de secadas.');
  if (!number) {
    showToast('WhatsApp no configurado', 'Completa el número en Configuración.');
    return;
  }
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function appendSummaryTable(records = getRecordsVisible()) {
  const completed = completedRecords(records);
  const today = todayISO();
  const weekStart = weekStartKey(today);
  const weekEnd = (() => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();
  const month = today.slice(0, 7);
  const sameDay = (d) => (d || '').slice(0, 10) === today;
  const sameWeek = (d) => !!d && inRange(d, weekStart, weekEnd);
  const sameMonth = (d) => (d || '').slice(0, 7) === month;
  const periods = [
    { label: 'Hoy', count: sum(completed.filter(r => sameDay(r.date)).map(r => toNumber(r.secadas))), stops: records.filter(r => sameDay(r.date) && Number(r.secadas) === 0).length, note: fmtDateOnly(today) },
    { label: 'Semana', count: sum(completed.filter(r => sameWeek(r.date)).map(r => toNumber(r.secadas))), stops: records.filter(r => sameWeek(r.date) && Number(r.secadas) === 0).length, note: `${fmtDateOnly(weekStart)} – ${fmtDateOnly(weekEnd)}` },
    { label: 'Mes', count: sum(completed.filter(r => sameMonth(r.date)).map(r => toNumber(r.secadas))), stops: records.filter(r => sameMonth(r.date) && Number(r.secadas) === 0).length, note: today.slice(0, 7) }
  ];
  const target = Number(state.settings.monthlyTarget) || 180;
  const box = $('periodBreakdown');
  if (box) {
    box.innerHTML = `
      <div class="period-grid">
        ${periods.map(p => `
          <div class="period-card">
            <span>${escapeHtml(p.label)}</span>
            <strong>${escapeHtml(String(p.count))}</strong>
            <small>Paros: ${escapeHtml(String(p.stops))} · ${escapeHtml(p.note)}</small>
          </div>`).join('')}
        <div class="period-card highlight">
          <span>Meta mensual</span>
          <strong>${escapeHtml(String(target))}</strong>
          <small>Cumplimiento: ${escapeHtml(recordSummary().compliance.toFixed(0))}%</small>
        </div>
      </div>
      <div class="mini-table-wrap">
        <table class="mini-table">
          <thead><tr><th>Periodo</th><th>Secadas</th><th>Paros</th><th>Detalle</th></tr></thead>
          <tbody>
            ${periods.map(p => `<tr><td>${escapeHtml(p.label)}</td><td>${escapeHtml(String(p.count))}</td><td>${escapeHtml(String(p.stops))}</td><td>${escapeHtml(p.note)}</td></tr>`).join('')}
            <tr><td>Meta mensual</td><td>${escapeHtml(String(target))}</td><td>—</td><td>Objetivo configurado</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }
}

function renderStopLegend() {
  const box = $('stopLegend');
  if (!box) return;
  const items = [
    ['Mecánico', 'Fallas de banda, rodamiento, atoro o mantenimiento correctivo.'],
    ['Eléctrico', 'Corte, protector, sensor o conexión eléctrica.'],
    ['Motor', 'Paro por motor, arrancador o sobrecarga.'],
    ['Bomba', 'Interrupción del bombeo o alimentación.'],
    ['Programado', 'Paro preventivo, limpieza o mantenimiento planificado.']
  ];
  box.innerHTML = items.map(([title, text]) => `
    <div class="legend-item">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `).join('');
}

function renderStopJustifications() {
  const box = $('stopJustifications');
  if (!box) return;
  const stops = state.records
    .filter(r => Number(r.secadas) === 0 || Number(r.stopHours) > 0 || safe(r.mainStop))
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 6);
  if (!stops.length) {
    box.innerHTML = `<div class="empty">Aún no hay justificaciones de paro.</div>`;
    return;
  }
  box.innerHTML = stops.map(r => `
    <div class="stop-item">
      <div class="stop-title">${escapeHtml(fmtDateOnly(r.date))} · Secadora ${escapeHtml(String(r.dryer))} · ${escapeHtml(r.shift)}</div>
      <div class="stop-meta"><strong>Tipo:</strong> ${escapeHtml(summarizeCause(r.mainStop || r.stopType, r.secadas))}</div>
      <div class="stop-meta"><strong>Justificación:</strong> ${escapeHtml(r.mainStop || 'Sin descripción')}</div>
      <div class="stop-meta"><strong>Horas:</strong> ${escapeHtml(recordDurationText(r))} · <strong>Notas:</strong> ${escapeHtml(r.notes || '—')}</div>
    </div>
  `).join('');
}
  function resetPortal() {
    state = defaultState();
    ensureGithubDefaults();
    editingRecordId = null;
    saveState();
    renderAll();
    showToast('Base restaurada', 'Se cargó la configuración inicial del sistema.');
  }

  function login() {
    const username = normalizeUser($('loginUser').value);
    const pass = safe($('loginPass').value);

    if (!username || !pass) {
      showToast('Faltan datos', 'Escribe usuario y contraseña.');
      return;
    }

    let user = state.users[username];
    if (!user) {
      user = Object.values(state.users).find(u => normalizeUser(u.username) === username);
    }

    if (!user || !user.active || !verifyPassword(user.password, pass)) {
      showToast('Acceso denegado', 'Usuario o contraseña incorrectos.');
      return;
    }

    session = { username: normalizeUser(user.username || username) };
    saveSession();
    $('loginPass').value = '';
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    renderAll();
    showToast('Bienvenido', `Sesión iniciada como ${user.fullName || user.username}.`);
    scheduleNotificationChecks();
  }

  function logout() {
    session = null;
    saveSession();
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    stopNotificationChecks();
  }

  function setTheme(theme) {
    const root = document.documentElement.style;
    const map = {
      blue: ['#2563eb', '#3b82f6'],
      green: ['#0f766e', '#14b8a6'],
      amber: ['#b45309', '#f59e0b'],
      violet: ['#7c3aed', '#8b5cf6']
    };
    const [a, b] = map[theme] || map.blue;
    root.setProperty('--blue', a);
    root.setProperty('--blue2', b);
  }

  function updateSidebar() {
    const user = currentUser();
    $('userName').textContent = user ? (user.fullName || user.username) : '—';
    $('userRole').textContent = user ? (user.role === 'admin' ? 'Administrador' : 'Operador') : '—';
    $('roleBadge').textContent = user ? user.role.toUpperCase() : '—';
    $('roleBadge').className = `badge ${user?.role || ''}`;
    $('userMeta').textContent = user ? `Usuario: ${user.username}` : 'Sin sesión';
    $('portalName').textContent = state.settings.portalName || 'Portal Secadas';
    $('portalTagline').textContent = state.settings.portalTagline || 'Operación, turnos y trazabilidad';
    document.body.classList.toggle('role-admin', isAdmin());
    document.body.classList.toggle('role-user', !isAdmin());
  }

  function getRecordsVisible() {
    return state.records.slice();
  }

  function recordSummary() {
    const recs = getRecordsVisible();
    const total = sum(recs.map(r => toNumber(r.secadas)));
    const monthKey = todayISO().slice(0, 7);
    const monthRecords = recs.filter(r => (r.date || '').slice(0, 7) === monthKey);
    const monthTotal = sum(monthRecords.map(r => toNumber(r.secadas)));
    const shiftTotals = {
      'Día': sum(recs.filter(r => r.shift === 'Día').map(r => toNumber(r.secadas))),
      'Noche': sum(recs.filter(r => r.shift === 'Noche').map(r => toNumber(r.secadas)))
    };
    const bestShift = shiftTotals['Día'] >= shiftTotals['Noche'] ? 'Día' : 'Noche';
    const last = recs.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    const compliance = clamp((monthTotal / (Number(state.settings.monthlyTarget) || 1)) * 100, 0, 999);
    return { total, monthTotal, shiftTotals, bestShift, last, compliance };
  }

  function dryerCount() {
    return Math.max(1, parseIntMaybe(state.settings.totalDryers) || 3);
  }

  function completedRecords(records = getRecordsVisible()) {
    return records.filter(r => toNumber(r.secadas) > 0);
  }

  function todayWeekMonthStats(records = getRecordsVisible()) {
    const completed = completedRecords(records);
    const today = todayISO();
    const weekStart = weekStartKey(today);
    const weekEnd = (() => {
      const d = new Date(`${weekStart}T00:00:00`);
      d.setDate(d.getDate() + 6);
      return d.toISOString().slice(0, 10);
    })();
    const month = today.slice(0, 7);
    const isInWeek = (dateKey) => !!dateKey && inRange(dateKey, weekStart, weekEnd);
    return {
      today: sum(completed.filter(r => (r.date || '').slice(0, 10) === today).map(r => toNumber(r.secadas))),
      week: sum(completed.filter(r => isInWeek((r.date || '').slice(0, 10))).map(r => toNumber(r.secadas))),
      month: sum(completed.filter(r => (r.date || '').slice(0, 7) === month).map(r => toNumber(r.secadas)))
    };
  }

  function buildMissingDryerList(records = getRecordsVisible()) {
    const total = dryerCount();
    const map = new Map();
    records.forEach(r => {
      const dateKey = (r.date || '').slice(0, 10);
      if (!dateKey) return;
      if (!map.has(dateKey)) map.set(dateKey, new Set());
      map.get(dateKey).add(String(r.dryer));
    });

    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .flatMap(([dateKey, set]) => {
        const missing = [];
        for (let i = 1; i <= total; i++) {
          if (!set.has(String(i))) missing.push(i);
        }
        return missing.map(dryer => ({
          dateKey,
          dryer,
          present: [...set].map(Number).filter(Number.isFinite).sort((a, b) => a - b),
          total
        }));
      })
      .slice(0, 12);
  }

  function openParoDraft(dateKey, dryer) {
    const viewBtn = document.querySelector('[data-view="recordsView"]');
    if (viewBtn) viewBtn.click();
    $('recordDate').value = dateKey || todayISO();
    $('recordShift').value = 'Día';
    $('recordDryer').value = String(dryer || 1);
    $('recordSecadas').value = '0';
    $('stopHours').value = '0';
    $('stopType').value = 'programado';
    $('mainStop').value = `Secadora ${dryer} sin secadas registradas para ${fmtDateOnly(dateKey)}.`;
    $('recordNotes').value = 'Paro sugerido automáticamente por ausencia de registro.';
    syncRecordFields();
    showToast('Paro preparado', `Ya quedó listo el registro del paro de la secadora ${dryer}.`);
  }

  function renderPeriodStats() {
    const stats = todayWeekMonthStats();
    const missing = buildMissingDryerList();
    const todayStops = missing.filter(x => x.dateKey === todayISO()).length;
    const setText = (id, value) => {
      const el = $(id);
      if (el) el.textContent = String(value);
    };
    setText('statToday', stats.today);
    setText('statWeek', stats.week);
    setText('statMonth', stats.month);
    setText('statStopsToday', todayStops);

    const box = $('quickPeriodStats');
    if (box) {
      const monthTarget = Number(state.settings.monthlyTarget) || 180;
      box.innerHTML = `
        <div class="period-stat"><span>Hoy</span><strong>${stats.today}</strong><span>Secadas reales registradas</span></div>
        <div class="period-stat"><span>Semana</span><strong>${stats.week}</strong><span>Secadas reales registradas</span></div>
        <div class="period-stat"><span>Mes</span><strong>${stats.month}</strong><span>Secadas reales registradas</span></div>
        <div class="period-stat"><span>Meta mensual</span><strong>${monthTarget}</strong><span>Objetivo configurado</span></div>
      `;
    }

    const list = $('missingDryersList');
    if (list) {
      if (!missing.length) {
        list.innerHTML = `<div class="empty">No hay secadoras faltantes en los días con registros.</div>`;
      } else {
        list.innerHTML = missing.map(item => `
          <div class="missing-dryer">
            <div class="user-top">
              <div>
                <div class="stop-title">${escapeHtml(fmtDateOnly(item.dateKey))}</div>
                <div class="stop-meta">Falta secadora ${escapeHtml(String(item.dryer))} · Presentes: ${escapeHtml(item.present.join(', ') || '—')}</div>
              </div>
              <span class="tag">Paro sugerido</span>
            </div>
            <div class="row-actions">
              <button class="small-btn danger" data-paro-date="${escapeHtml(item.dateKey)}" data-paro-dryer="${escapeHtml(String(item.dryer))}">Registrar paro</button>
            </div>
          </div>
        `).join('');
        list.querySelectorAll('[data-paro-date]').forEach(btn => {
          btn.addEventListener('click', () => openParoDraft(btn.dataset.paroDate, btn.dataset.paroDryer));
        });
      }
    }
    appendSummaryTable(state.records);
    renderStopLegend();
    renderStopJustifications();
  }

  function normalizeBulkHeaders(row) {
    return row.map(v => normalizeHeader(v));
  }

  function parseBulkRows(text) {
    const lines = safe(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { rows: [], imported: [], warnings: ['No hay datos para importar.'] };

    const firstCells = splitPasteRow(lines[0]);
    const normalizedFirst = normalizeBulkHeaders(firstCells);
    const hasHeader = normalizedFirst.some(h => h.includes('fecha y hora') || h.includes('secadora') || h.includes('rendimiento') || h.includes('usuario'));

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = [];

    dataLines.forEach((line, index) => {
      const cells = splitPasteRow(line);
      if (!cells.length) return;
      const row = (i) => safe(cells[i]);

      const createdAt = parseDateTimeFromParts(row(0).split(' ')[0], row(0).split(' ').slice(1).join(' ')) || nowISO();
      const loadAt = parseDateTimeFromParts(row(3), row(4)) || createdAt;
      const unloadAt = parseDateTimeFromParts(row(8), row(9));
      const completed = Boolean(safe(row(8)) || safe(row(9)) || safe(row(10)) || safe(row(11)) || safe(row(12)) || safe(row(14)) || safe(row(15)));
      const dateKey = (row(3) || isoToDateKey(loadAt) || createdAt.slice(0, 10)).slice(0, 10);
      const dryer = parseIntMaybe(row(1)) || 1;
      const importedUser = normalizeUser(row(16) || currentUser()?.username || 'ADMIN');
      const user = state.users[importedUser] ? importedUser : (currentUser()?.username || 'ADMIN');
      const fullName = state.users[user]?.fullName || row(16) || user;
      const performanceHead = safe(row(14));
      const performanceRaw = safe(row(15));
      const sourceNotes = [
        `Carga masiva`,
        `Silo remojo: ${row(2) || '—'}`,
        `Humedad entrada: ${row(5) || '—'}`,
        `Temp entrada: ${row(6) || '—'}`,
        `Responsable carga: ${row(7) || '—'}`,
        `Humedad salida: ${row(10) || '—'}`,
        `Temp salida: ${row(11) || '—'}`,
        `Silo descarga: ${row(12) || '—'}`,
        `Responsable descarga: ${row(13) || '—'}`,
        `Entero: ${performanceHead || '—'}`,
        `Materia prima: ${performanceRaw || '—'}`
      ].join(' · ');

      const autoStop = !completed;
      rows.push({
        id: uid('rec'),
        user,
        fullName,
        date: dateKey,
        shift: loadAt ? (new Date(loadAt).getHours() >= 6 && new Date(loadAt).getHours() < 18 ? 'Día' : 'Noche') : 'Día',
        dryer: String(dryer),
        secadas: completed ? 1 : 0,
        durationHours: completed && unloadAt ? Math.max(0, Math.round((new Date(unloadAt).getTime() - new Date(loadAt).getTime()) / 3600000)) : null,
        durationMinutes: completed && unloadAt ? String(Math.max(0, Math.round(((new Date(unloadAt).getTime() - new Date(loadAt).getTime()) % 3600000) / 60000))).padStart(2, '0') : null,
        stopHours: autoStop ? 12 : 0,
        stopType: autoStop ? 'programado' : '',
        mainStop: autoStop ? `Secadora ${dryer} sin producción registrada. Pendiente de justificar.` : '',
        notes: sourceNotes,
        createdAt,
        updatedAt: nowISO(),
        source: 'bulk',
        sourceRow: index + 1,
        loadAt,
        unloadAt,
        siloLoad: row(2),
        humidityIn: row(5),
        tempIn: row(6),
        responsibleLoad: row(7),
        humidityOut: row(10),
        tempOut: row(11),
        siloOut: row(12),
        responsibleOut: row(13),
        yieldHead: performanceHead,
        yieldRaw: performanceRaw,
        sourceLabel: 'Carga masiva'
      });
    });

    return { rows, warnings: hasHeader ? [] : ['No se detectó encabezado; se importó por orden de columnas.'] };
  }

  function bulkPreview() {

    const box = $('bulkImportInfo');
    if (!box) return;
    const text = $('bulkPasteInput').value;
    const { rows, warnings } = parseBulkRows(text);
    const completed = rows.filter(r => Number(r.secadas) > 0).length;
    const pending = rows.length - completed;
    const dates = [...new Set(rows.map(r => r.date).filter(Boolean))].length;
    box.innerHTML = `
      <strong>Vista previa</strong><br>
      Filas detectadas: ${rows.length}<br>
      Secadas reales: ${completed}<br>
      Paros / pendientes: ${pending}<br>
      Días con datos: ${dates}${warnings.length ? `<br>${warnings.map(escapeHtml).join('<br>')}` : ''}
    `;
  }

  function bulkRecordSignature(rec) {
    return [
      safe(rec.date || '').slice(0, 10),
      safe(rec.loadAt || rec.createdAt || ''),
      safe(rec.dryer || ''),
      normalizeUser(rec.user || rec.username || ''),
      String(Number(rec.secadas) || 0),
      safe(rec.siloLoad || ''),
      safe(rec.siloOut || ''),
      safe(rec.sourceLabel || rec.source || '')
    ].join('|');
  }

  async function bulkImport() {
    const text = $('bulkPasteInput').value;
    const { rows, warnings } = parseBulkRows(text);
    if (!rows.length) {
      showToast('Sin datos', 'Pega primero la tabla a importar.');
      return;
    }

    const existing = new Set(state.records.map(bulkRecordSignature));
    const newRows = rows.filter(r => {
      const key = bulkRecordSignature(r);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });

    if (!newRows.length) {
      showToast('Sin cambios', 'Esos registros ya estaban cargados.');
      return;
    }

    const newCount = newRows.length;
    const stopCount = newRows.filter(r => Number(r.secadas) === 0).length;
    state.records = [...newRows, ...state.records];
    state.meta = state.meta || {};
    state.meta.updatedAt = nowISO();
    state.meta.lastBulkImport = nowISO();
    state.meta.lastBulkCount = newCount;
    state.meta.lastBulkStops = stopCount;

    state.notifications.unshift(buildNotification(
      'Carga masiva importada',
      `${newCount} registros nuevos${stopCount ? ` y ${stopCount} paros automáticos` : ''} quedaron guardados desde el pegado tabulado.`,
      stopCount ? 'warning' : 'success',
      'bulk'
    ));

    saveState();
    renderAll();

    try {
      await syncNow('Carga masiva');
    } catch {
      // syncNow already reports the issue
    }

    showToast('Importación lista', `Se agregaron ${newCount} registros${stopCount ? ` y ${stopCount} paros automáticos` : ''}${warnings.length ? ' con aviso de formato.' : ''}`);
  }

  function clearBulkPaste() {

    $('bulkPasteInput').value = '';
    $('bulkImportInfo').textContent = 'Listo para pegar datos.';
  }

  function buildNotification(title, message, type = 'info', scope = 'global') {
    return {
      id: uid('notif'),
      title,
      message,
      type,
      scope,
      createdAt: nowISO(),
      readBy: [],
      source: 'system'
    };
  }

  function pushNotification(title, message, type = 'info', scope = 'global') {
    state.notifications.unshift(buildNotification(title, message, type, scope));
    saveState();
    renderNotifications();
    renderBell();
  }

  function markNotificationRead(id) {
    const user = currentUser();
    if (!user) return;
    const notif = state.notifications.find(n => n.id === id);
    if (!notif) return;
    if (!notif.readBy.includes(user.username)) notif.readBy.push(user.username);
    saveState();
    renderNotifications();
    renderBell();
  }

  function unreadCount() {
    const user = currentUser();
    if (!user) return 0;
    return state.notifications.filter(n => !n.readBy.includes(user.username)).length;
  }

  function renderBell() {
    $('notifCount').textContent = String(unreadCount());
  }

  function notificationIcon(type) {
    if (type === 'danger') return 'danger';
    if (type === 'warning') return 'warn';
    if (type === 'success') return 'success';
    return '';
  }

  function renderNotifications() {
    const wrap = $('notifList');
    const feed = $('notificationFeed');
    const user = currentUser();
    const list = state.notifications.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    if (wrap) {
      wrap.innerHTML = list.length ? list.map(n => {
        const unread = user && !n.readBy.includes(user.username);
        return `
          <div class="notif-item ${unread ? 'unread' : ''}" data-notif-id="${n.id}">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-meta"><span class="dot ${notificationIcon(n.type)}"></span>${escapeHtml(n.message)}</div>
            <div class="notif-meta">${fmtDate(n.createdAt)}</div>
          </div>`;
      }).join('') : `<div class="empty">No hay notificaciones.</div>`;
      wrap.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', () => markNotificationRead(el.dataset.notifId));
      });
    }

    if (feed) {
      feed.innerHTML = list.length ? list.map(n => {
        const unread = user && !n.readBy.includes(user.username);
        return `
          <div class="feed-item ${unread ? 'unread' : ''}" data-notif-id="${n.id}">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div>${escapeHtml(n.message)}</div>
            <div class="meta">${fmtDate(n.createdAt)} · ${escapeHtml(n.type)}${n.source ? ` · ${escapeHtml(n.source)}` : ''}</div>
          </div>`;
      }).join('') : `<div class="empty">Aún no hay mensajes.</div>`;
      feed.querySelectorAll('.feed-item').forEach(el => {
        el.addEventListener('click', () => markNotificationRead(el.dataset.notifId));
      });
    }
  }

  function checkIdleAlerts() {
    const thresholdHours = Number(state.settings.alertHours) || 12;
    const now = Date.now();
    const shifts = ['Día', 'Noche'];

    shifts.forEach(shift => {
      const records = state.records.filter(r => r.shift === shift).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const last = records[0];
      const metaKey = shift === 'Día' ? 'DAY' : 'NIGHT';
      let triggered = false;

      if (!last) {
        triggered = true;
      } else {
        const elapsedHours = (now - new Date(last.createdAt).getTime()) / 36e5;
        if (elapsedHours >= thresholdHours) triggered = true;
      }

      if (triggered) {
        const prev = state.meta.notificationState?.[metaKey];
        const msgKey = last ? `${last.id}_${thresholdHours}` : `empty_${thresholdHours}`;
        if (prev !== msgKey) {
          pushNotification(
            `Sin ingreso en turno ${shift}`,
            last
              ? `Han pasado más de ${thresholdHours} horas desde el último registro del turno ${shift}.`
              : `No existe ningún registro aún para el turno ${shift}.`,
            'warning',
            'shift'
          );
          state.meta.notificationState[metaKey] = msgKey;
          saveState();
        }
      } else {
        state.meta.notificationState[metaKey] = null;
      }
    });
  }

  function scheduleNotificationChecks() {
    stopNotificationChecks();
    notificationTimer = setInterval(() => {
      if (session) {
        checkIdleAlerts();
        renderBell();
      }
    }, 5 * 60 * 1000);
  }

  function stopNotificationChecks() {
    if (notificationTimer) clearInterval(notificationTimer);
    notificationTimer = null;
  }

  function quickNotificationForRecord(record, action = 'registrado') {
    if (!record) return;
    const name = state.users[record.user]?.fullName || record.user;
    if (toNumber(record.secadas) === 0) {
      pushNotification(
        'Paro registrado',
        `${name} ${action} un paro principal en turno ${record.shift} (${record.date}).`,
        'danger',
        'record'
      );
    } else {
      pushNotification(
        'Nuevo registro',
        `${name} ${action} ${record.secadas} secadas en turno ${record.shift} (${record.date}).`,
        'success',
        'record'
      );
    }
  }

  function recordDurationText(r) {
    if (r.secadas === 0) return `${Number(r.stopHours || 0).toFixed(1)} h`;
    const h = String(r.durationHours || '00').padStart(2, '0');
    const m = String(r.durationMinutes || '00').padStart(2, '0');
    return `${h}:${m}`;
  }

  function summarizeCause(text, secadas) {
    if (Number(secadas) > 0) return '—';
    const raw = safe(text).toLowerCase();
    if (!raw) return 'Sin justificación';
    if (raw.includes('mec')) return 'Mecánico';
    if (raw.includes('elect')) return 'Eléctrico';
    if (raw.includes('motor')) return 'Motor';
    if (raw.includes('bomba')) return 'Bomba';
    if (raw.includes('carga')) return 'Falta de carga';
    if (raw.includes('program')) return 'Programado';
    return raw.slice(0, 20);
  }

  function getFilterValues() {
    const search = safe($('searchRecords').value).toLowerCase();
    const date = $('filterDate').value;
    const shift = $('filterShift').value;
    const user = $('filterUser').value;
    const status = $('filterStatus').value;
    return { search, date, shift, user, status };
  }

  function visibleRecords() {
    let records = getRecordsVisible();
    const { search, date, shift, user, status } = getFilterValues();
    return records.filter(r => {
      const hay = [
        r.user, state.users[r.user]?.fullName, r.date, r.shift, r.dryer, r.secadas,
        r.mainStop, r.notes, r.stopType, r.stopHours
      ].join(' ').toLowerCase();
      if (search && !hay.includes(search)) return false;
      if (date && r.date !== date) return false;
      if (shift && r.shift !== shift) return false;
      if (user && r.user !== user) return false;
      if (status === 'ok' && Number(r.secadas) <= 0) return false;
      if (status === 'stop' && Number(r.secadas) > 0) return false;
      return true;
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function monthlySeries() {
    const recs = getRecordsVisible();
    const map = {};
    recs.forEach(r => {
      if (!r.date) return;
      const key = r.date.slice(0, 7);
      if (!map[key]) map[key] = { secadas: 0, count: 0 };
      map[key].secadas += toNumber(r.secadas);
      map[key].count += 1;
    });
    const keys = Object.keys(map).sort();
    const labels = keys.map(k => k.replace('-', '/'));
    const values = keys.map(k => map[k].secadas);
    const counts = keys.map(k => map[k].count);
    return { labels, values, counts };
  }

  function trendSeries(days = 14) {
    const recs = getRecordsVisible();
    const labels = [];
    const values = [];
    const byDay = {};
    recs.forEach(r => {
      if (!r.date) return;
      byDay[r.date] = (byDay[r.date] || 0) + toNumber(r.secadas);
    });
    const end = new Date(todayISO() + 'T00:00:00');
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(key.slice(5));
      values.push(byDay[key] || 0);
    }
    return { labels, values };
  }

  function shiftSeries() {
    const recs = getRecordsVisible();
    const day = sum(recs.filter(r => r.shift === 'Día').map(r => toNumber(r.secadas)));
    const night = sum(recs.filter(r => r.shift === 'Noche').map(r => toNumber(r.secadas)));
    return { labels: ['Día', 'Noche'], values: [day, night] };
  }

  function topStops() {
    const recs = getRecordsVisible()
      .filter(r => Number(r.secadas) === 0 || Number(r.stopHours) > 0 || safe(r.mainStop))
      .map(r => ({
        ...r,
        impact: toNumber(r.stopHours) || (Number(r.secadas) === 0 ? 1 : 0)
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3);

    const box = $('topStops');
    if (!box) return;
    if (!recs.length) {
      box.innerHTML = `<div class="empty">Aún no hay paros registrados.</div>`;
      return;
    }

    box.innerHTML = recs.map((r, i) => `
      <div class="stop-item">
        <div class="stop-title">#${i + 1} · ${escapeHtml(summarizeCause(r.mainStop || r.stopType, r.secadas))}</div>
        <div class="stop-meta">${escapeHtml(fmtDateOnly(r.date))} · Turno ${escapeHtml(r.shift)} · Secadora ${escapeHtml(r.dryer)}</div>
        <div class="stop-meta">Tiempo: ${escapeHtml(recordDurationText(r))} · Secadas: ${escapeHtml(String(r.secadas))}</div>
      </div>
    `).join('');
  }

  function recentActivity() {
    const box = $('recentActivity');
    const items = state.notifications.slice(0, 6);
    box.innerHTML = items.length ? items.map(n => `
      <div class="activity-item">
        <div class="stop-title">${escapeHtml(n.title)}</div>
        <div class="activity-meta">${escapeHtml(n.message)}</div>
        <div class="activity-meta">${fmtDate(n.createdAt)}</div>
      </div>
    `).join('') : `<div class="empty">Sin actividad reciente.</div>`;
  }

  function setCanEditFields() {
    const editing = !!editingRecordId;
    $('editModeBadge').classList.toggle('hidden', !editing);
  }

  function syncRecordFields() {
    const secadas = Number($('recordSecadas').value);
    const stopVisible = secadas === 0;
    const durationVisible = Number.isInteger(secadas) && secadas > 0;
    $('durationBlock').classList.toggle('hidden', !durationVisible);
    $('stopBlock').classList.toggle('hidden', !stopVisible);
  }

  function fillDurationOptions() {
    $('durationHours').innerHTML = ['00','01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24'].map(v => `<option value="${v}">${v}</option>`).join('');
    $('durationMinutes').innerHTML = ['00','15','30','45'].map(v => `<option value="${v}">${v}</option>`).join('');
  }

  function resetRecordForm() {
    editingRecordId = null;
    $('recordDate').value = todayISO();
    $('recordShift').value = 'Día';
    $('recordDryer').value = '1';
    $('recordSecadas').value = '';
    $('durationHours').value = '00';
    $('durationMinutes').value = '00';
    $('stopHours').value = '';
    $('stopType').value = '';
    $('mainStop').value = '';
    $('recordNotes').value = '';
    setCanEditFields();
    syncRecordFields();
  }

  function loadRecordToForm(rec) {
    editingRecordId = rec.id;
    $('recordDate').value = rec.date || todayISO();
    $('recordShift').value = rec.shift || 'Día';
    $('recordDryer').value = String(rec.dryer || '1');
    $('recordSecadas').value = String(rec.secadas ?? '');
    if (Number(rec.secadas) > 0) {
      $('durationBlock').classList.remove('hidden');
      $('stopBlock').classList.add('hidden');
      const hours = safe(rec.durationHours || '00');
      const minutes = safe(rec.durationMinutes || '00');
      $('durationHours').value = hours.padStart(2, '0');
      $('durationMinutes').value = minutes.padStart(2, '0');
    } else {
      $('durationBlock').classList.add('hidden');
      $('stopBlock').classList.remove('hidden');
      $('stopHours').value = rec.stopHours ?? '';
      $('stopType').value = rec.stopType || '';
      $('mainStop').value = rec.mainStop || '';
    }
    $('recordNotes').value = rec.notes || '';
    setCanEditFields();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Registro cargado', 'Puedes editar y guardar los cambios.');
  }

  function validateRecord() {
    const date = $('recordDate').value;
    const shift = $('recordShift').value;
    const dryer = $('recordDryer').value;
    const secadas = Number($('recordSecadas').value);

    if (!date) return 'Selecciona una fecha.';
    if (!shift) return 'Selecciona un turno.';
    if (!dryer) return 'Selecciona una secadora.';
    if (!Number.isInteger(secadas) || secadas < 0) return 'Secadas debe ser un número entero mayor o igual a 0';

    if (secadas > 0) {
      const h = $('durationHours').value;
      const m = $('durationMinutes').value;
      if (h === '' || m === '') return 'Selecciona el tiempo promedio de secado.';
    } else {
      const stopHours = toNumber($('stopHours').value, NaN);
      if (!Number.isFinite(stopHours) || stopHours < 0) return 'Ingresa horas de paro válidas.';
      if (!safe($('mainStop').value)) return 'Escribe la descripción del paro principal.';
    }
    return '';
  }

  function saveRecord() {
    const err = validateRecord();
    if (err) {
      showToast('Falta información', err);
      return;
    }
    const user = currentUser();
    if (!user) return;

    const secadas = Number($('recordSecadas').value);
    const rec = {
      id: editingRecordId || uid('rec'),
      user: user.username,
      fullName: user.fullName || user.username,
      date: $('recordDate').value,
      shift: $('recordShift').value,
      dryer: $('recordDryer').value,
      secadas,
      durationHours: secadas > 0 ? $('durationHours').value : null,
      durationMinutes: secadas > 0 ? $('durationMinutes').value : null,
      stopHours: secadas === 0 ? toNumber($('stopHours').value, 0) : 0,
      stopType: secadas === 0 ? $('stopType').value : '',
      mainStop: secadas === 0 ? safe($('mainStop').value) : '',
      notes: safe($('recordNotes').value),
      createdAt: editingRecordId ? (state.records.find(r => r.id === editingRecordId)?.createdAt || nowISO()) : nowISO(),
      updatedAt: nowISO()
    };

    if (editingRecordId) {
      const idx = state.records.findIndex(r => r.id === editingRecordId);
      if (idx >= 0) state.records[idx] = rec;
      pushNotification('Registro editado', `${user.username} actualizó un registro del turno ${rec.shift}.`, 'warning', 'record');
    } else {
      state.records.unshift(rec);
      quickNotificationForRecord(rec, 'registró');
    }

    editingRecordId = null;
    setCanEditFields();
    saveState();
    resetRecordForm();
    renderAll();
    showToast('Guardado', 'El registro quedó almacenado.');
  }

  function deleteRecord(id) {
    const rec = state.records.find(r => r.id === id);
    if (!rec) return;
    if (!isAdmin() && !canEditRecord(rec)) return;
    if (!confirm('¿Eliminar este registro?')) return;
    state.records = state.records.filter(r => r.id !== id);
    pushNotification('Registro eliminado', `Se eliminó un registro del turno ${rec.shift}.`, 'danger', 'record');
    saveState();
    renderAll();
  }

  function editRecord(id) {
    const rec = state.records.find(r => r.id === id);
    if (!rec) return;
    if (!isAdmin() && !canEditRecord(rec)) return;
    loadRecordToForm(rec);
  }

  function renderRecordsTable() {
    const body = $('recordsBody');
    const rows = visibleRecords();
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty">No hay registros para mostrar.</div></td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r => {
      const actions = [];
      if (canEditRecord(r) || isAdmin()) {
        actions.push(`<button class="small-btn primary" data-edit="${r.id}">Editar</button>`);
        actions.push(`<button class="small-btn danger" data-del="${r.id}">Eliminar</button>`);
      }
      return `
        <tr>
          <td>${escapeHtml(fmtDateOnly(r.date))}</td>
          <td>${escapeHtml(r.shift)}</td>
          <td>${escapeHtml(String(r.dryer))}</td>
          <td>${escapeHtml(String(r.secadas))}</td>
          <td>${escapeHtml(recordDurationText(r))}</td>
          <td>${escapeHtml(summarizeCause(r.mainStop || r.stopType, r.secadas))}</td>
          <td>${escapeHtml(r.fullName || r.user)}</td>
          <td>
            <div class="row-actions">
              ${actions.join('')}
            </div>
          </td>
        </tr>`;
    }).join('');

    body.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => editRecord(btn.dataset.edit)));
    body.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => deleteRecord(btn.dataset.del)));
  }

  function buildSelectUsers() {
    const sel = $('filterUser');
    const users = Object.values(state.users).filter(u => u.active);
    sel.innerHTML = `<option value="">Todos</option>` + users.map(u => `<option value="${escapeHtml(u.username)}">${escapeHtml(u.fullName || u.username)}</option>`).join('');
  }

  function renderUsers() {
    const box = $('usersList');
    const all = Object.values(state.users).sort((a, b) => {
      if (a.username === 'ADMIN') return -1;
      if (b.username === 'ADMIN') return 1;
      return (a.fullName || a.username).localeCompare(b.fullName || b.username, 'es');
    });
    $('userCountPill').textContent = String(all.length);

    box.innerHTML = all.map(u => `
      <div class="user-item">
        <div class="user-top">
          <div>
            <div class="stop-title">@${escapeHtml(u.username)}</div>
            <div class="stop-meta">${escapeHtml(u.fullName || u.username)} · ${escapeHtml(u.role.toUpperCase())}</div>
          </div>
          <span class="badge ${u.active ? 'editor' : 'admin'}">${u.active ? 'ACTIVO' : 'DESHABILITADO'}</span>
        </div>
        <div class="row2" style="margin-top:12px">
          <label class="field">
            <span>Nombre completo</span>
            <input class="big-input" data-fullname="${escapeHtml(u.username)}" value="${escapeHtml(u.fullName || '')}">
          </label>
          <label class="field">
            <span>Rol</span>
            <select class="big-select" data-role="${escapeHtml(u.username)}">
              <option value="operador" ${u.role === 'operador' ? 'selected' : ''}>Operador</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
            </select>
          </label>
        </div>
        <div class="row2" style="margin-top:12px">
          <label class="field">
            <span>Contraseña nueva</span>
            <input class="big-input" type="password" data-pass="${escapeHtml(u.username)}" placeholder="Dejar en blanco para no cambiar">
          </label>
          <label class="field">
            <span>Estado</span>
            <select class="big-select" data-active="${escapeHtml(u.username)}">
              <option value="true" ${u.active ? 'selected' : ''}>Activo</option>
              <option value="false" ${!u.active ? 'selected' : ''}>Deshabilitado</option>
            </select>
          </label>
        </div>
        <div class="row-actions" style="margin-top:12px">
          <button class="small-btn primary" data-save-user="${escapeHtml(u.username)}">Guardar</button>
          ${u.username !== 'ADMIN' ? `<button class="small-btn danger" data-remove-user="${escapeHtml(u.username)}">Eliminar</button>` : ''}
        </div>
      </div>
    `).join('');

    box.querySelectorAll('[data-save-user]').forEach(btn => btn.addEventListener('click', () => saveUserProfile(btn.dataset.saveUser)));
    box.querySelectorAll('[data-remove-user]').forEach(btn => btn.addEventListener('click', () => removeUser(btn.dataset.removeUser)));
  }

  function saveUserProfile(username) {
    if (!isAdmin()) return;
    const u = state.users[normalizeUser(username)];
    if (!u) return;
    const key = u.username;
    const fullName = safe(document.querySelector(`[data-fullname="${CSS.escape(key)}"]`)?.value);
    const role = document.querySelector(`[data-role="${CSS.escape(key)}"]`)?.value || u.role;
    const active = document.querySelector(`[data-active="${CSS.escape(key)}"]`)?.value === 'true';
    const pass = safe(document.querySelector(`[data-pass="${CSS.escape(key)}"]`)?.value);

    state.users[key] = {
      ...u,
      fullName: fullName || u.fullName || u.username,
      role,
      active,
      password: pass ? hashPassword(pass) : u.password
    };
    saveState();
    renderAll();
    showToast('Usuario guardado', `Cambios aplicados a ${u.username}.`);
  }

  function removeUser(username) {
    if (!isAdmin()) return;
    const key = normalizeUser(username);
    if (key === 'ADMIN') {
      showToast('No permitido', 'El administrador principal no puede eliminarse.');
      return;
    }
    if (!confirm(`¿Eliminar usuario ${key}?`)) return;
    delete state.users[key];
    state.records = state.records.filter(r => r.user !== key);
    saveState();
    renderAll();
    showToast('Usuario eliminado', key);
  }

  function createUser() {
    if (!isAdmin()) return;
    const username = normalizeUser($('newUserName').value);
    const password = safe($('newUserPass').value);
    const fullName = safe($('newUserFullName').value);
    const role = $('newUserRole').value;
    const active = $('newUserActive').value === 'true';
    if (!username || !password || !fullName) {
      showToast('Faltan datos', 'Completa usuario, contraseña y nombre completo.');
      return;
    }
    if (state.users[username]) {
      showToast('Existe', 'Ese usuario ya está creado.');
      return;
    }
    state.users[username] = {
      username,
      fullName,
      password: hashPassword(password),
      role,
      active
    };
    $('newUserName').value = '';
    $('newUserPass').value = '';
    $('newUserFullName').value = '';
    $('newUserRole').value = 'operador';
    $('newUserActive').value = 'true';
    saveState();
    renderAll();
    showToast('Usuario creado', `${username} listo para usar.`);
  }

  function saveSettings() {
    if (!isAdmin()) return;
    state.settings.portalName = safe($('settingPortalName').value) || 'Portal Secadas';
    state.settings.portalTagline = safe($('settingPortalTagline').value) || 'Operación, turnos y trazabilidad';
    state.settings.dailyTarget = Math.max(1, toNumber($('settingDailyTarget').value, 6));
    state.settings.monthlyTarget = Math.max(1, toNumber($('settingMonthlyTarget').value, 180));
    state.settings.alertHours = Math.max(1, toNumber($('settingAlertHours').value, 12));
    state.settings.theme = $('settingTheme').value || 'blue';
    state.settings.github = {
      owner: safe($('githubOwner').value),
      repo: safe($('githubRepo').value),
      branch: safe($('githubBranch').value) || 'main',
      path: safe($('githubPath').value) || 'portal-data.json',
      autoSync: $('githubAutoSync').value === 'true'
    };
    state.settings.whatsappNumber = safe($('whatsappNumber').value);
    state.settings.whatsappMessage = safe($('whatsappMessage').value) || 'Hola, necesito ayuda con el portal de secadas.';
    const token = safe($('githubToken').value);
    if (token && token !== '••••••••••') saveStoredGithubToken(token);
    setTheme(state.settings.theme);
    saveState();
    renderAll();
    showToast('Configuración guardada', 'Los cambios quedaron listos para sincronizar.');
    if (hasGithubConfig() && loadStoredGithubToken()) syncNow('Configuración guardada');
  }

  function resetSettings() {
    if (!isAdmin()) return;
    state.settings = clone(defaultState().settings);
    ensureGithubDefaults();
    saveState();
    renderAll();
    showToast('Ajustes restaurados', 'Se aplicó la configuración base.');
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `secadas_portal_backup_${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const rows = visibleRecords();
    const headers = ['Usuario', 'Nombre completo', 'Fecha', 'Turno', 'Secadora', 'Secadas', 'Duración', 'Horas de paro', 'Tipo de paro', 'Paro principal', 'Observaciones', 'Creado'];
    const csvRows = [headers].concat(rows.map(r => ([
      r.user, r.fullName || '', r.date, r.shift, r.dryer, r.secadas,
      recordDurationText(r), r.stopHours || '', summarizeCause(r.mainStop || r.stopType, r.secadas), r.mainStop || '', r.notes || '', r.createdAt || ''
    ]))).map(arr => arr.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');

    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `secadas_registros_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJsonFile(file, merge = false) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported || typeof imported !== 'object') throw new Error('JSON inválido');
        if (!imported.settings || !imported.users || !Array.isArray(imported.records)) throw new Error('Faltan campos base');

        const normalized = {
          ...clone(defaultState()),
          ...imported,
          settings: {
            ...clone(defaultState().settings),
            ...(imported.settings || {}),
            github: {
              ...clone(defaultState().settings.github),
              ...((imported.settings && imported.settings.github) || {})
            }
          },
          users: normalizeUsers(imported.users),
          records: Array.isArray(imported.records) ? imported.records.map(normalizeRecordItem).filter(Boolean) : [],
          notifications: Array.isArray(imported.notifications) ? imported.notifications.map(normalizeNotificationItem).filter(Boolean) : [],
          meta: imported.meta || clone(defaultState().meta)
        };

        state = merge ? mergeStates(state, normalized) : mergeStates(normalized, clone(defaultState()));
        ensureGithubDefaults();
        saveState();
        renderAll();
        showToast('Importación exitosa', merge ? 'El historial fue combinado con la base actual.' : 'El respaldo fue cargado correctamente.');
      } catch (err) {
        showToast('Error de importación', err.message || 'No se pudo leer el archivo.');
      }
    };
    reader.readAsText(file);
  }

  function readFileInput() {
    const input = $('importJsonInput');
    const file = input.files && input.files[0];
    if (file) importJsonFile(file, input.dataset.merge === 'true');
    input.dataset.merge = 'false';
    input.value = '';
  }

  function bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.view;
        document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        $(target).classList.remove('hidden');
        const titles = {
          dashboardView: ['Sistema portátil de secadas', 'Tablero ejecutivo', 'Registros, notificaciones y tendencias.'],
          recordsView: ['Registros operativos', 'Captura y control', 'Registra, edita y administra los movimientos.'],
          notificationsView: ['Centro de notificaciones', 'Mensajes y avisos', 'Actividad tipo feed, con lectura y seguimiento.'],
          usersView: ['Administración de usuarios', 'Control total', 'Crear, editar, activar o eliminar usuarios.'],
          settingsView: ['Configuración del sistema', 'Parámetros generales', 'Ajusta metas, horas de aviso y el tema.'],
          backupView: ['Respaldo portable', 'Importar / exportar', 'Protege los datos y muévelos entre equipos.']
        };
        $('topbarEyebrow').textContent = titles[target][0];
        $('topbarTitle').textContent = titles[target][1];
        $('topbarText').textContent = titles[target][2];
      });
    });
  }

  function renderCharts() {
    drawBarChart($('shiftChart'), shiftSeries().labels, shiftSeries().values, ['#2563eb', '#8b5cf6']);
    drawLineChart($('trendChart'), trendSeries(14).labels, trendSeries(14).values, '#14b8a6');
    drawMonthlyChart($('monthlyChart'));
  }

  function drawBarChart(canvas, labels, values, colors = ['#2563eb']) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || canvas.width || 700);
    const height = Math.max(220, rect.height || canvas.height || 280);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const pad = { l: 44, r: 20, t: 16, b: 52 };
    const chartW = width - pad.l - pad.r;
    const chartH = height - pad.t - pad.b;
    const max = Math.max(1, ...values) * 1.15;
    ctx.strokeStyle = '#e5edf6';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const y = pad.t + chartH - (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#7b8ba2';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(Math.round(max / 4 * i)), 10, y + 4);
    }

    const barW = chartW / labels.length * 0.55;
    labels.forEach((lab, i) => {
      const xCenter = pad.l + (chartW / labels.length) * i + (chartW / labels.length) / 2;
      const barH = (values[i] / max) * chartH;
      const x = xCenter - barW / 2;
      const y = pad.t + chartH - barH;
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, colors[i % colors.length]);
      grad.addColorStop(1, '#2dd4bf');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, barH, 12, true, false);
      ctx.fillStyle = '#17324f';
      ctx.font = '700 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(values[i]), xCenter, y - 6);
      ctx.fillStyle = '#5e6f84';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(lab), xCenter, height - 20);
    });
    ctx.textAlign = 'start';
  }

  function drawLineChart(canvas, labels, values, color = '#14b8a6') {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || canvas.width || 700);
    const height = Math.max(220, rect.height || canvas.height || 280);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const pad = { l: 44, r: 20, t: 18, b: 44 };
    const chartW = width - pad.l - pad.r;
    const chartH = height - pad.t - pad.b;
    const max = Math.max(1, ...values) * 1.15;

    ctx.strokeStyle = '#e5edf6';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + chartH - (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#7b8ba2';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(Math.round(max / 4 * i)), 10, y + 4);
    }

    ctx.beginPath();
    values.forEach((v, i) => {
      const x = pad.l + (chartW / Math.max(1, values.length - 1)) * i;
      const y = pad.t + chartH - (v / max) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    values.forEach((v, i) => {
      const x = pad.l + (chartW / Math.max(1, values.length - 1)) * i;
      const y = pad.t + chartH - (v / max) * chartH;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      if (i % 2 === 0 || i === values.length - 1) {
        ctx.fillStyle = '#5e6f84';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x, height - 20);
      }
    });
    ctx.textAlign = 'start';
  }

  function drawMonthlyChart(canvas) {
    if (!canvas) return;
    const series = monthlySeries();
    if (!series.labels.length) {
      const ctx = canvas.getContext('2d');
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(320, rect.width || canvas.width || 700);
      const height = Math.max(220, rect.height || canvas.height || 280);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#6d7f95';
      ctx.font = '14px sans-serif';
      ctx.fillText('Sin datos todavía', width / 2 - 50, height / 2);
      return;
    }
    drawBarChart(canvas, series.labels.slice(-8), series.values.slice(-8), ['#2563eb', '#14b8a6', '#f59e0b', '#8b5cf6']);
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    else r = { tl: r.tl || 0, tr: r.tr || 0, br: r.br || 0, bl: r.bl || 0 };
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    ctx.lineTo(x + r.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.quadraticCurveTo(x, y, x + r.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function populateSettings() {
    ensureGithubDefaults();
    $('settingPortalName').value = state.settings.portalName || '';
    $('settingPortalTagline').value = state.settings.portalTagline || '';
    $('settingDailyTarget').value = state.settings.dailyTarget || 6;
    $('settingMonthlyTarget').value = state.settings.monthlyTarget || 180;
    $('settingAlertHours').value = state.settings.alertHours || 12;
    $('settingTheme').value = state.settings.theme || 'blue';
    $('githubOwner').value = safe(state.settings.github?.owner || '');
    $('githubRepo').value = safe(state.settings.github?.repo || '');
    $('githubBranch').value = safe(state.settings.github?.branch || 'main');
    $('githubPath').value = safe(state.settings.github?.path || 'portal-data.json');
    $('githubAutoSync').value = String(state.settings.github?.autoSync !== false);
    $('githubToken').value = loadStoredGithubToken() ? '••••••••••' : '';
    $('whatsappNumber').value = safe(state.settings.whatsappNumber || '');
    $('whatsappMessage').value = safe(state.settings.whatsappMessage || 'Hola, necesito ayuda con el portal de secadas.');
    setTheme(state.settings.theme || 'blue');
    renderSyncStatus();
  }

  function updateHeader() {
    const summary = recordSummary();
    $('kpiTotal').textContent = String(summary.total);
    $('kpiMonth').textContent = String(summary.monthTotal);
    $('kpiCompliance').textContent = `${summary.compliance.toFixed(0)}%`;
    $('kpiAlerts').textContent = String(unreadCount());
    $('dashTotal').textContent = String(summary.total);
    $('dashCompliance').textContent = `${summary.compliance.toFixed(0)}%`;
    $('dashBestShift').textContent = summary.bestShift || '—';
    $('dashLastRecord').textContent = summary.last ? `${summary.last.shift} · ${fmtDateOnly(summary.last.date)}` : 'Sin registros';
    $('portalName').textContent = state.settings.portalName || 'Portal Secadas';
    $('portalTagline').textContent = state.settings.portalTagline || 'Operación, turnos y trazabilidad';
    const recents = summary.last;
    if (recents) {
      $('topbarText').textContent = `Último registro: ${recents.shift} · ${fmtDateOnly(recents.date)} · Secadas ${recents.secadas}`;
    }
  }

  function renderMonthlyNotes() {
    const monthTarget = Number(state.settings.monthlyTarget) || 180;
    const summary = recordSummary();
    $('monthlyChart').title = `Meta mensual: ${monthTarget} · Cumplimiento: ${summary.compliance.toFixed(0)}%`;
  }

  function renderAll() {
    if (!session) {
      $('loginView').classList.remove('hidden');
      $('appView').classList.add('hidden');
      return;
    }
    setTheme(state.settings.theme || 'blue');
    updateSidebar();
    updateHeader();
    buildSelectUsers();
    populateSettings();
    renderBell();
    renderNotifications();
    renderRecordsTable();
    renderUsers();
    topStops();
    recentActivity();
    renderPeriodStats();
    renderCharts();
    renderMonthlyNotes();
    renderSyncStatus();
    $('recordDate').value = $('recordDate').value || todayISO();
    $('editModeBadge').classList.toggle('hidden', !editingRecordId);
  }

  function bindControls() {
    $('loginBtn').addEventListener('click', login);
    $('loginResetBtn').addEventListener('click', resetPortal);
    $('logoutBtn').addEventListener('click', logout);
    $('saveRecordBtn').addEventListener('click', saveRecord);
    $('clearRecordBtn').addEventListener('click', resetRecordForm);
    $('todayBtn').addEventListener('click', () => { $('recordDate').value = todayISO(); showToast('Fecha asignada', 'Se cargó la fecha de hoy.'); });
    $('bulkPreviewBtn').addEventListener('click', bulkPreview);
    $('bulkImportBtn').addEventListener('click', bulkImport);
    $('bulkClearBtn').addEventListener('click', clearBulkPaste);
    $('createUserBtn').addEventListener('click', createUser);
    $('saveSettingsBtn').addEventListener('click', saveSettings);
    $('resetSettingsBtn').addEventListener('click', resetSettings);
    $('saveSyncBtn').addEventListener('click', saveSettings);
    $('syncNowBtn').addEventListener('click', () => syncNow('Sincronización manual'));
    $('githubPullBtn').addEventListener('click', () => pullFromGithub(false));
    $('whatsappQuickBtn').addEventListener('click', openWhatsApp);
    $('exportJsonBtn').addEventListener('click', exportJson);
    $('exportCsvBtn').addEventListener('click', exportCsv);
    $('importJsonBtn').addEventListener('click', () => {
      $('importJsonInput').dataset.merge = 'false';
      $('importJsonInput').click();
    });
    $('importJsonMergeBtn').addEventListener('click', () => {
      $('importJsonInput').dataset.merge = 'true';
      $('importJsonInput').click();
    });
    $('importJsonInput').addEventListener('change', readFileInput);
    $('factoryResetBtn').addEventListener('click', () => { if (confirm('¿Restaurar base completa?')) resetPortal(); });
    $('refreshBtn').addEventListener('click', async () => {
      await pullFromGithub(false);
      checkIdleAlerts();
      renderAll();
      showToast('Actualizado', 'Se recargó el tablero.');
    });
    $('notifBell').addEventListener('click', () => $('notifPanel').classList.toggle('hidden'));
    $('closeNotifBtn').addEventListener('click', () => $('notifPanel').classList.add('hidden'));
    $('markAllReadBtn').addEventListener('click', () => {
      const user = currentUser();
      if (!user) return;
      state.notifications.forEach(n => { if (!n.readBy.includes(user.username)) n.readBy.push(user.username); });
      saveState();
      renderBell();
      renderNotifications();
      showToast('Listo', 'Todas las notificaciones quedaron leídas.');
    });
    $('clearNotifsBtn').addEventListener('click', () => {
      const activeUsers = Object.values(state.users).filter(u => u.active).map(u => u.username);
      state.notifications = state.notifications.filter(n => {
        return !activeUsers.length ? true : !activeUsers.every(u => n.readBy.includes(u));
      });
      saveState();
      renderBell();
      renderNotifications();
      showToast('Limpieza', 'Se quitaron las notificaciones ya leídas por todos.');
    });
    $('checkAlertsBtn').addEventListener('click', () => {
      checkIdleAlerts();
      renderAll();
      showToast('Alertas revisadas', 'Se validó el tiempo sin registros.');
    });

    ['recordDate', 'recordShift', 'recordDryer', 'recordSecadas', 'durationHours', 'durationMinutes', 'stopHours', 'stopType', 'mainStop', 'recordNotes'].forEach(id => {
      $(id).addEventListener('input', syncRecordFields);
      $(id).addEventListener('change', syncRecordFields);
    });

    ['searchRecords', 'filterDate', 'filterShift', 'filterUser', 'filterStatus'].forEach(id => {
      $(id).addEventListener('input', renderRecordsTable);
      $(id).addEventListener('change', renderRecordsTable);
    });

    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        const viewId = btn.dataset.view;
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        $(viewId).classList.remove('hidden');
        $('notifPanel').classList.add('hidden');
        renderAll();
      });
    });

    $('recordSecadas').addEventListener('input', syncRecordFields);
    window.addEventListener('resize', () => renderCharts());

    document.addEventListener('click', (e) => {
      const panel = $('notifPanel');
      const wrap = $('notifBell').parentElement;
      if (!wrap.contains(e.target) && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
      }
    });
  }

  function initialFill() {
    $('recordDate').value = todayISO();
    fillDurationOptions();
    syncRecordFields();
  }

  async function boot() {
    loadSession();
    fillDurationOptions();
    bindNav();
    bindControls();
    initialFill();
    ensureGithubDefaults();
    setTheme(state.settings.theme || 'blue');
    renderSyncStatus();
    if (session && currentUser()) {
      $('loginView').classList.add('hidden');
      $('appView').classList.remove('hidden');
      scheduleNotificationChecks();
    }
    if (hasGithubConfig()) {
      await pullFromGithub(true);
      renderAll();
    }
    checkIdleAlerts();
    renderAll();
    schedulePull();
    window.addEventListener('focus', () => {
      if (session && hasGithubConfig() && githubConfig().autoSync !== false) pullFromGithub(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (session && hasGithubConfig() && githubConfig().autoSync !== false && !document.hidden) pullFromGithub(true);
    });
    setInterval(() => {
      if (session) {
        renderBell();
        renderCharts();
      }
    }, 15000);
  }

  window.__portal = {
    login,
    logout,
    saveRecord,
    deleteRecord,
    editRecord,
    resetPortal
  };

  loadSession();
  boot();
})();
