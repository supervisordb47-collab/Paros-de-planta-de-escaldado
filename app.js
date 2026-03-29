(() => {
  const STORAGE_KEY = 'secadas_portal_state_v1';
  const SESSION_KEY = 'secadas_portal_session_v1';
  const GITHUB_TOKEN_KEY = 'secadas_portal_github_token_v1';

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
  function pickImageText(v) {
    return typeof v === 'string' ? v.trim() : '';
  }
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

  function isoWeekNumber(dateStr = todayISO()) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 0;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round((((d - week1) / 86400000) - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }

  function weekLabel(dateStr = todayISO()) {
    return `Semana ${isoWeekNumber(dateStr)}`;
  }

  function isoWeekKey(dateStr = todayISO()) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const weekYear = d.getFullYear();
    const week1 = new Date(weekYear, 0, 4);
    const weekNo = 1 + Math.round((((d - week1) / 86400000) - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${weekYear}-W${String(weekNo).padStart(2, '0')}`;
  }

  function canonicalText(v) {
    return safe(v).replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function canonicalTime(v) {
    const text = safe(v);
    if (!text) return '';
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
      const [h = '00', m = '00', s = '00'] = text.split(':');
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s || '00').padStart(2, '0')}`;
    }
    return canonicalText(text);
  }

  function recordCanonicalKey(rec) {
    const date = recordDateKey(rec);
    const secadas = toNumber(rec?.secadas);
    const core = [
      date,
      canonicalText(rec?.shift),
      canonicalText(rec?.dryer),
      String(secadas),
      canonicalTime(rec?.loadAt),
      canonicalTime(rec?.unloadAt),
      String(toNumber(rec?.durationHours, 0)),
      String(toNumber(rec?.durationMinutes, 0)).padStart(2, '0'),
      String(toNumber(rec?.stopHours, 0)),
      canonicalText(rec?.stopType || ''),
      canonicalText(rec?.mainStop || ''),
      canonicalText(rec?.siloLoad || ''),
      canonicalText(rec?.siloOut || ''),
      canonicalText(rec?.responsibleLoad || ''),
      canonicalText(rec?.responsibleOut || ''),
      canonicalText(rec?.notes || '')
    ].join('|');
    return secadas > 0 ? `COMP|${core}` : `STOP|${core}`;
  }

  function bulkSignature(rec) {
    return [
      recordDateKey(rec),
      canonicalText(rec?.shift),
      canonicalText(rec?.dryer),
      String(toNumber(rec?.secadas)),
      canonicalTime(rec?.loadAt),
      canonicalTime(rec?.unloadAt),
      String(toNumber(rec?.durationHours, 0)),
      String(toNumber(rec?.durationMinutes, 0)).padStart(2, '0'),
      canonicalText(rec?.siloLoad || ''),
      canonicalText(rec?.siloOut || ''),
      canonicalText(rec?.responsibleLoad || ''),
      canonicalText(rec?.responsibleOut || ''),
      canonicalText(rec?.mainStop || ''),
      canonicalText(rec?.stopType || '')
    ].join('|');
  }

  function minutesFromRecord(r) {
    if (!r || Number(r.secadas) <= 0) return 0;
    return (toNumber(r.durationHours, 0) * 60) + toNumber(r.durationMinutes, 0);
  }

  function formatMinutes(totalMinutes = 0) {
    const mins = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function makeRecordFingerprint(rec) {
    return recordCanonicalKey(rec);
  }

  function normalizeStateRecords(records = []) {
    return records.map(rec => ({
      ...rec,
      fingerprint: rec.fingerprint || makeRecordFingerprint(rec)
    }));
  }

  function recordDateKey(rec) {
    return (safe(rec?.date) || safe(rec?.loadAt) || safe(rec?.createdAt)).slice(0, 10);
  }

  function isAutoStopRecord(rec) {
    return String(rec?.source || '').toLowerCase() === 'auto_missing';
  }

  function createAutoStopRecord(dateKey, dryer) {
    const now = nowISO();
    const rec = {
      id: uid('rec'),
      user: currentUser()?.username || 'ADMIN',
      fullName: currentUser()?.fullName || currentUser()?.username || 'ADMIN',
      date: dateKey,
      shift: 'Día',
      dryer: String(dryer),
      secadas: 0,
      durationHours: null,
      durationMinutes: null,
      stopHours: 12,
      stopType: 'programado',
      mainStop: `Falta ingresar la causa del paro de la secadora ${dryer}.`,
      notes: 'Paro automático detectado por ausencia de registro en la carga consolidada.',
      createdAt: now,
      updatedAt: now,
      source: 'auto_missing',
      sourceLabel: 'Paro automático',
      autoGenerated: true
    };
    rec.fingerprint = makeRecordFingerprint(rec);
    return rec;
  }

  function reconcileAutoStops(records = state.records) {
    const total = dryerCount();
    const byKey = new Map();

    records.forEach(rec => {
      const date = recordDateKey(rec);
      const dryer = String(rec.dryer || '').trim();
      if (!date || !dryer) return;
      const key = `${date}|${dryer}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(rec);
    });

    const out = [];
    for (const rec of records) {
      const date = recordDateKey(rec);
      const dryer = String(rec.dryer || '').trim();
      const key = `${date}|${dryer}`;
      if (!date || !dryer) {
        out.push(rec);
        continue;
      }
      const bucket = byKey.get(key) || [];
      const hasNonAuto = bucket.some(item => !isAutoStopRecord(item));
      if (isAutoStopRecord(rec)) {
        if (hasNonAuto) continue;
        const firstAuto = bucket.find(item => isAutoStopRecord(item));
        if (firstAuto && firstAuto !== rec) continue;
      }
      out.push(rec);
    }

    const dates = [...new Set([...byKey.keys()].map(key => key.split('|')[0]).filter(Boolean))];
    const missingAdds = [];
    dates.forEach(date => {
      for (let dryer = 1; dryer <= total; dryer += 1) {
        const key = `${date}|${dryer}`;
        if (!byKey.has(key) || byKey.get(key).length === 0) {
          missingAdds.push(createAutoStopRecord(date, dryer));
        }
      }
    });

    const next = normalizeStateRecords([...missingAdds, ...out]);
    state.records = next;
    return next;
  }

  function weekSummaryForOffset(offsetWeeks = 0, records = getRecordsVisible()) {
    const base = new Date(`${todayISO()}T00:00:00`);
    base.setDate(base.getDate() - (offsetWeeks * 7));
    const start = weekStartKey(base.toISOString().slice(0, 10));
    const endDate = new Date(`${start}T00:00:00`);
    endDate.setDate(endDate.getDate() + 6);
    const end = endDate.toISOString().slice(0, 10);
    const weekRecords = completedRecords(records).filter(r => inRange((r.date || '').slice(0, 10), start, end));
    const total = sum(weekRecords.map(r => toNumber(r.secadas)));
    const avgPerRecord = weekRecords.length ? total / weekRecords.length : 0;
    const avgMinutes = weekRecords.length ? weekRecords.reduce((acc, r) => acc + minutesFromRecord(r), 0) / weekRecords.length : 0;
    const byDryer = {};
    weekRecords.forEach(r => {
      const key = String(r.dryer || '—');
      if (!byDryer[key]) byDryer[key] = { secadas: 0, count: 0, minutes: [] };
      byDryer[key].secadas += toNumber(r.secadas);
      byDryer[key].count += 1;
      byDryer[key].minutes.push(minutesFromRecord(r));
    });
    return { start, end, total, count: weekRecords.length, avgPerRecord, avgMinutes, byDryer, weekRecords };
  }

  function forecastWeeklyValue() {
    const series = [3, 2, 1, 0].map(i => weekSummaryForOffset(i).total).reverse();
    const diffs = [];
    for (let i = 1; i < series.length; i++) diffs.push(series[i] - series[i - 1]);
    const avgDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    const predicted = Math.round(series[series.length - 1] + avgDiff);
    const floor = Math.max(42, Math.max(1, toNumber(state.settings.weeklyTarget, 42)));
    return Math.max(floor, predicted);
  }

  function weeklyComparisonData() {
    const current = weekSummaryForOffset(0);
    const previous = weekSummaryForOffset(1);
    const ante = weekSummaryForOffset(2);
    const forecast = forecastWeeklyValue();
    const target = Math.max(42, Math.max(1, toNumber(state.settings.weeklyTarget, 42)));
    return { current, previous, ante, forecast, target };
  }

  function weeklyForecastSeries() {
    const data = weeklyComparisonData();
    return {
      labels: [weekLabel(data.ante.start), weekLabel(data.previous.start), weekLabel(data.current.start), 'Pronóstico'],
      values: [data.ante.total, data.previous.total, data.current.total, data.forecast]
    };
  }

  function dryerConsolidatedData(records = getRecordsVisible()) {
    const dryers = Math.max(1, parseIntMaybe(state.settings.totalDryers) || 3);
    const currentWeek = weekSummaryForOffset(0, records).weekRecords;
    const monthKey = todayISO().slice(0, 7);
    const monthRecords = completedRecords(records).filter(r => (r.date || '').slice(0, 7) === monthKey);
    const todayKey = todayISO();
    const todayRecords = completedRecords(records).filter(r => (r.date || '').slice(0, 10) === todayKey);
    const out = [];
    for (let i = 1; i <= dryers; i++) {
      const w = currentWeek.filter(r => String(r.dryer) === String(i));
      const m = monthRecords.filter(r => String(r.dryer) === String(i));
      const t = todayRecords.filter(r => String(r.dryer) === String(i));
      const avgMins = w.length ? w.reduce((acc, r) => acc + minutesFromRecord(r), 0) / w.length : 0;
      out.push({
        dryer: i,
        today: sum(t.map(r => toNumber(r.secadas))),
        week: sum(w.map(r => toNumber(r.secadas))),
        month: sum(m.map(r => toNumber(r.secadas))),
        avgMinutes: avgMins,
        stops: records.filter(r => String(r.dryer) === String(i) && Number(r.secadas) === 0).length
      });
    }
    return out;
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultState();
      parsed.settings = { ...defaultState().settings, ...(parsed.settings || {}) };
      parsed.settings.weeklyTarget = Math.max(1, toNumber(parsed.settings.weeklyTarget, defaultState().settings.weeklyTarget || 42));
      parsed.settings.github = { ...defaultState().settings.github, ...(parsed.settings.github || {}) };
      parsed.users = normalizeUsers(parsed.users || defaultState().users);
      parsed.records = normalizeStateRecords(Array.isArray(parsed.records) ? parsed.records : []);
      parsed.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
      parsed.meta = parsed.meta || defaultState().meta;
      parsed.meta.notificationState = parsed.meta.notificationState || { DAY: null, NIGHT: null };
      return parsed;
    } catch {
      return defaultState();
    }
  }

  function saveState(syncCloud = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (syncCloud) queueCloudSync();
  }

  let state = loadState();
  let session = null;
  let editingRecordId = null;
  let notificationTimer = null;
  let cloudSyncTimer = null;
  let cloudBusy = false;

  function currentUser() {
    const username = session?.username ? normalizeUser(session.username) : null;
    return username ? state.users[username] : null;
  }
  function isAdmin() {
    return currentUser()?.role === 'admin';
  }
  function canEditRecord(record) {
    return !!currentUser() && !!record;
  }
  function canDeleteRecord(record) {
    return isAdmin() && !!record;
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
      const raw = localStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
      if (session?.username) session.username = normalizeUser(session.username);
    } catch {
      session = null;
    }
  }

  function saveSession() {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function githubConfig() {
    const cfg = state.settings.github || {};
    const token = sessionStorage.getItem(GITHUB_TOKEN_KEY) || '';
    return {
      owner: safe(cfg.owner),
      repo: safe(cfg.repo),
      branch: safe(cfg.branch) || 'main',
      path: safe(cfg.path) || 'portal-data.json',
      token: safe(token)
    };
  }

  function hasGithubConfig() {
    const cfg = githubConfig();
    return !!(cfg.owner && cfg.repo && cfg.branch && cfg.path && cfg.token);
  }

  function encodeUtf8Base64(text) {
    try {
      return btoa(unescape(encodeURIComponent(String(text))));
    } catch {
      return btoa(String(text || ''));
    }
  }

  function decodeUtf8Base64(text) {
    try {
      return decodeURIComponent(escape(atob(String(text || ''))));
    } catch {
      return atob(String(text || ''));
    }
  }

  function githubApiUrl(cfg) {
    return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${String(cfg.path).split('/').map(encodeURIComponent).join('/')}`;
  }

  function setGithubStatus(message) {
    const el = $('githubStatus');
    if (el) el.textContent = message;
  }

  function queueCloudSync(reason = 'auto') {
    if (!hasGithubConfig()) {
      setGithubStatus('Sincronización GitHub no configurada.');
      return;
    }
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      syncToGithub(reason).catch(() => {});
    }, 700);
  }

  async function loadFromGithub() {
    const cfg = githubConfig();
    if (!hasGithubConfig()) return false;
    setGithubStatus('Cargando datos desde GitHub...');
    try {
      const res = await fetch(`${githubApiUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cfg.token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error('Bad credentials o permiso insuficiente');
        if (res.status === 404) throw new Error('Repositorio, rama o ruta no encontrada');
        throw new Error(`HTTP ${res.status}`);
      }
      const file = await res.json();
      const imported = JSON.parse(decodeUtf8Base64(file.content || ''));
      imported.settings = { ...defaultState().settings, ...(imported.settings || {}) };
      imported.settings.github = { ...defaultState().settings.github, ...(imported.settings.github || {}) };
      imported.users = normalizeUsers(imported.users || defaultState().users);
      imported.records = normalizeStateRecords(Array.isArray(imported.records) ? imported.records : []);
      imported.notifications = Array.isArray(imported.notifications) ? imported.notifications : [];
      imported.meta = imported.meta || clone(defaultState().meta);
      state = imported;
      reconcileAutoStops();
      state.meta.cloud = { sha: file.sha, updatedAt: nowISO() };
      saveState();
      setGithubStatus('Sincronizado con GitHub.');
      return true;
    } catch (err) {
      setGithubStatus(`Sin conexión · revisar GitHub (${err.message || 'error'})`);
      return false;
    }
  }

  async function syncToGithub(reason = 'auto', retry = true) {
    const cfg = githubConfig();
    if (!hasGithubConfig()) return false;
    if (cloudBusy) return false;
    cloudBusy = true;
    setGithubStatus(reason === 'manual' ? 'Sincronizando...' : 'Guardando nube...');
    try {
      const payload = clone(state);
      payload.meta = payload.meta || {};
      delete payload.meta.cloud;
      const body = {
        message: `Portal secadas · ${new Date().toISOString()}`,
        content: encodeUtf8Base64(JSON.stringify(payload, null, 2)),
        branch: cfg.branch
      };
      const existing = state.meta?.cloud?.sha;
      if (existing) body.sha = existing;
      const res = await fetch(githubApiUrl(cfg), {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(body)
      });
      const raw = await res.text();
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
      if (!res.ok) {
        if (retry && res.status === 409) {
          await loadFromGithub();
          cloudBusy = false;
          return syncToGithub('retry', false);
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error('Bad credentials o permiso insuficiente en el token.');
        }
        if (res.status === 404) {
          throw new Error('Repositorio, rama o archivo no encontrado.');
        }
        throw new Error(json?.message || raw || `HTTP ${res.status}`);
      }
      state.meta = state.meta || {};
      state.meta.cloud = { sha: json?.content?.sha || existing || null, updatedAt: nowISO() };
      saveState(false);
      setGithubStatus('Sincronizado con GitHub.');
      return true;
    } catch (err) {
      setGithubStatus(`Sin conexión · revisar GitHub (${err.message || 'error'})`);
      return false;
    } finally {
      cloudBusy = false;
    }
  }

  function resetPortal() {
    state = defaultState();
    editingRecordId = null;
    saveSession();
    saveState(false);
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

  function layoutLabel(mode = state.settings.layoutMode || 'executive') {
    const map = { executive: 'Ejecutivo', compact: 'Compacto', wide: 'Amplio' };
    return map[mode] || 'Ejecutivo';
  }

  function avatarMarkup(name = '', avatar = '') {
    const label = safe(name).slice(0, 1).toUpperCase() || 'A';
    if (avatar) return `<img src="${escapeHtml(avatar)}" alt="Avatar de ${escapeHtml(name || 'usuario')}"/>`;
    return `<span>${escapeHtml(label)}</span>`;
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
    const avatar = $('userAvatar');
    if (avatar) avatar.innerHTML = avatarMarkup(user?.fullName || user?.username || 'A', state.settings.profileAvatar || '');
    const miniLayout = $('userMiniLayout');
    if (miniLayout) miniLayout.textContent = `Layout ${layoutLabel(state.settings.layoutMode)}`;
    const miniSync = $('userMiniSync');
    if (miniSync) miniSync.textContent = hasGithubConfig() ? 'Nube configurada' : 'Nube pendiente';
    document.body.classList.toggle('role-admin', isAdmin());
    document.body.classList.toggle('role-user', !isAdmin());
    document.body.classList.toggle('layout-compact', (state.settings.layoutMode || 'executive') === 'compact');
    document.body.classList.toggle('layout-wide', (state.settings.layoutMode || 'executive') === 'wide');
    document.body.classList.toggle('layout-executive', (state.settings.layoutMode || 'executive') === 'executive');
  }

  function getRecordsVisible() {
    return currentUser() ? state.records.slice() : [];
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


  function buildAutoStopRecordsFromRows(rows) {
    const total = dryerCount();
    const grouped = new Map();
    rows.forEach(r => {
      const dateKey = (r.date || '').slice(0, 10);
      if (!dateKey) return;
      if (!grouped.has(dateKey)) grouped.set(dateKey, new Set());
      grouped.get(dateKey).add(String(r.dryer || ''));
    });
    const user = currentUser() || { username: 'ADMIN', fullName: 'Administrador' };
    const now = nowISO();
    const autos = [];
    [...grouped.entries()].forEach(([dateKey, dryers]) => {
      for (let i = 1; i <= total; i++) {
        if (!dryers.has(String(i))) {
          const rec = {
            id: uid('rec'),
            user: user.username || 'ADMIN',
            fullName: user.fullName || 'Administrador',
            date: dateKey,
            shift: 'Día',
            dryer: String(i),
            secadas: 0,
            durationHours: null,
            durationMinutes: null,
            stopHours: 12,
            stopType: 'auto-paro',
            mainStop: `Secadora ${i} no aparece en la carga. Ingrese la causa del paro.`,
            notes: 'Generado automáticamente por ausencia de secadora en carga masiva.',
            createdAt: now,
            updatedAt: now,
            source: 'auto-stop',
            sourceRow: 0,
            loadAt: '',
            unloadAt: '',
            siloLoad: '',
            humidityIn: '',
            temperatureIn: '',
            loadResponsible: '',
            humidityOut: '',
            temperatureOut: '',
            siloOut: '',
            unloadResponsible: '',
            yieldHead: '',
            yieldRaw: '',
            sourceLabel: 'Paro automático',
            fingerprint: ''
          };
          rec.fingerprint = makeRecordFingerprint(rec);
          autos.push(rec);
        }
      }
    });
    return autos;
  }

  function openParoDraft(dateKey, dryer) {
    const viewBtn = document.querySelector('[data-view="recordsView"]');
    if (viewBtn) viewBtn.click();
    $('recordDate').value = dateKey || todayISO();
    $('recordShift').value = 'Día';
    $('recordDryer').value = String(dryer || 1);
    $('recordSecadas').value = '0';
    $('stopHours').value = '12';
    $('stopType').value = 'programado';
    $('mainStop').value = `Secadora ${dryer} sin secadas registradas para ${fmtDateOnly(dateKey)}. Ingrese la causa del paro.`;
    $('recordNotes').value = 'Paro automático sugerido por ausencia de registro. Ingrese la causa del paro.';
    syncRecordFields();
    showToast('Paro preparado', `Ya quedó listo el registro del paro de la secadora ${dryer}.`);
  }

  function renderPeriodStats() {
    const stats = todayWeekMonthStats();
    const stops = state.records
      .filter(r => Number(r.secadas) === 0)
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 12);
    const todayStops = stops.filter(x => (x.date || '').slice(0, 10) === todayISO()).length;
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
      const weekTarget = Math.max(42, Math.max(1, toNumber(state.settings.weeklyTarget, 42)));
      box.innerHTML = `
        <div class="period-stat"><span>Hoy</span><strong>${stats.today}</strong><span>Secadas reales registradas</span></div>
        <div class="period-stat"><span>Semana</span><strong>${stats.week}</strong><span>Meta mínima ${weekTarget}</span></div>
        <div class="period-stat"><span>Mes</span><strong>${stats.month}</strong><span>Secadas reales registradas</span></div>
        <div class="period-stat"><span>Meta mensual</span><strong>${monthTarget}</strong><span>Objetivo configurado</span></div>
      `;
    }

    const list = $('missingDryersList');
    if (list) {
      if (!stops.length) {
        list.innerHTML = `<div class="empty">No hay paros automáticos o manuales para mostrar.</div>`;
      } else {
        list.innerHTML = stops.map(item => `
          <div class="missing-dryer">
            <div class="user-top">
              <div>
                <div class="stop-title">${escapeHtml(fmtDateOnly(item.date))} · Secadora ${escapeHtml(String(item.dryer))}</div>
                <div class="stop-meta">${escapeHtml(summarizeCause(item.mainStop || item.stopType, item.secadas))} · ${escapeHtml(recordDurationText(item))}</div>
              </div>
              <span class="tag">${isAutoStopRecord(item) ? 'Paro automático' : 'Paro real'}</span>
            </div>
            <div class="row-actions">
              <button class="small-btn primary" data-edit-stop="${escapeHtml(item.id)}">Editar</button>
            </div>
          </div>
        `).join('');
        list.querySelectorAll('[data-edit-stop]').forEach(btn => {
          btn.addEventListener('click', () => editRecord(btn.dataset.editStop));
        });
      }
    }
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

      const rec = {
        id: uid('rec'),
        user,
        fullName,
        date: dateKey,
        shift: loadAt ? (new Date(loadAt).getHours() >= 6 && new Date(loadAt).getHours() < 18 ? 'Día' : 'Noche') : 'Día',
        dryer: String(dryer),
        secadas: completed ? 1 : 0,
        durationHours: completed && unloadAt ? Math.max(0, Math.round((new Date(unloadAt).getTime() - new Date(loadAt).getTime()) / 3600000)) : null,
        durationMinutes: completed && unloadAt ? String(Math.max(0, Math.round(((new Date(unloadAt).getTime() - new Date(loadAt).getTime()) % 3600000) / 60000))).padStart(2, '0') : null,
        stopHours: completed ? 0 : 12,
        stopType: completed ? '' : 'programado',
        mainStop: completed ? '' : 'Registro incompleto o secadora sin cierre de descarga.',
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
        sourceLabel: 'Pega masiva'
      };
      rec.fingerprint = makeRecordFingerprint(rec);
      rows.push(rec);
    });

    return { rows, warnings: hasHeader ? [] : ['No se detectó encabezado; se importó por orden de columnas.'] };
  }

  function bulkPreview() {
    const box = $('bulkImportInfo');
    if (!box) return;
    const text = $('bulkPasteInput').value;
    const { rows, warnings } = parseBulkRows(text);
    const existingKeys = new Set((state.records || []).map(r => bulkSignature(r)));
    let duplicates = 0;
    const byDryer = {};
    const byDate = new Map();
    rows.forEach(r => {
      if (existingKeys.has(bulkSignature(r))) duplicates += 1;
      const d = String(r.dryer || '—');
      if (!byDryer[d]) byDryer[d] = { secadas: 0, paros: 0, minutes: [] };
      if (Number(r.secadas) > 0) {
        byDryer[d].secadas += 1;
        byDryer[d].minutes.push(minutesFromRecord(r));
      } else {
        byDryer[d].paros += 1;
      }
      const dateKey = r.date || '';
      if (dateKey) {
        if (!byDate.has(dateKey)) byDate.set(dateKey, new Set());
        byDate.get(dateKey).add(d);
      }
    });
    const dryers = Math.max(1, parseIntMaybe(state.settings.totalDryers) || 3);
    const missingTotals = [];
    [...byDate.entries()].forEach(([dateKey, set]) => {
      for (let i = 1; i <= dryers; i += 1) {
        if (!set.has(String(i))) missingTotals.push({ dateKey, dryer: i });
      }
    });
    const totalSecadas = rows.reduce((acc, r) => acc + (Number(r.secadas) > 0 ? 1 : 0), 0);
    const totalStops = rows.reduce((acc, r) => acc + (Number(r.secadas) === 0 ? 1 : 0), 0) + missingTotals.length;
    const newRows = Math.max(0, rows.length - duplicates);
    const dryerLines = Array.from({ length: dryers }, (_, i) => i + 1).map(d => {
      const info = byDryer[String(d)] || { secadas: 0, paros: 0, minutes: [] };
      const avgMins = info.minutes.length ? info.minutes.reduce((a, b) => a + b, 0) / info.minutes.length : 0;
      const missingLabel = missingTotals.filter(m => m.dryer === d).length;
      return `Secadora ${d} = ${info.secadas} secadas · ${info.paros} paros · Promedio ${formatMinutes(avgMins)}${missingLabel ? ` · ${missingLabel} faltantes detectados` : ''}`;
    });
    box.innerHTML = `
      <div><strong>Vista previa consolidada</strong></div>
      <div>Filas detectadas: ${rows.length}</div>
      <div>Secadas reales: ${totalSecadas}</div>
      <div>Paros / pendientes: ${totalStops}</div>
      <div>Ya existentes: ${duplicates}</div>
      <div>Nuevos estimados: ${newRows}</div>
      <div>Días con datos: ${byDate.size}</div>
      <div class="divider"></div>
      ${dryerLines.map(line => `<div>${escapeHtml(line)}</div>`).join('')}
      ${warnings.length ? `<div class="divider"></div><div>${warnings.map(escapeHtml).join('<br>')}</div>` : ''}
    `;
  }

  function clearBulkPaste() {
    $('bulkPasteInput').value = '';
    $('bulkImportInfo').textContent = 'Listo para pegar datos.';
  }

  function bulkImport() {
    const text = $('bulkPasteInput').value;
    const { rows, warnings } = parseBulkRows(text);
    if (!rows.length) {
      showToast('Sin datos', 'Pega primero la tabla a importar.');
      return;
    }

    const existing = new Set((state.records || []).map(r => bulkSignature(r)));
    const seen = new Set();
    const newRows = rows.filter(r => {
      const key = bulkSignature(r);
      if (existing.has(key) || seen.has(key)) return false;
      existing.add(key);
      seen.add(key);
      return true;
    });

    if (!newRows.length) {
      showToast('Sin cambios', 'Esos registros ya estaban cargados.');
      return;
    }

    state.records = normalizeStateRecords([...newRows, ...state.records]);
    reconcileAutoStops();
    saveState();
    queueCloudSync('bulk');
    renderAll();
    showToast('Importación lista', `Se agregaron ${newRows.length} registros${warnings.length ? ' con aviso de formato.' : ''}`);
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
    if (!raw) return 'Causa pendiente';
    if (raw.includes('paro automático')) return 'Paro automático';
    if (raw.includes('falta ingresar')) return 'Causa pendiente';
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
    const year = $('filterYear')?.value || '';
    const month = $('filterMonth')?.value || '';
    const week = $('filterWeek')?.value || '';
    return { search, date, shift, user, status, year, month, week };
  }

  function visibleRecords() {
    let records = getRecordsVisible();
    const { search, date, shift, user, status, year, month, week } = getFilterValues();
    return records.filter(r => {
      const hay = [
        r.user, state.users[r.user]?.fullName, r.date, r.shift, r.dryer, r.secadas,
        r.mainStop, r.notes, r.stopType, r.stopHours, r.loadAt, r.unloadAt, r.siloLoad, r.siloOut
      ].join(' ').toLowerCase();
      const dateKey = (r.date || '').slice(0, 10);
      if (search && !hay.includes(search)) return false;
      if (date && dateKey !== date) return false;
      if (year && dateKey.slice(0, 4) !== year) return false;
      if (month && dateKey.slice(0, 7) !== month) return false;
      if (week && isoWeekKey(dateKey) !== week) return false;
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
      stopHours: secadas === 0 ? 12 : 0,
      stopType: secadas === 0 ? $('stopType').value : '',
      mainStop: secadas === 0 ? safe($('mainStop').value) : '',
      notes: safe($('recordNotes').value),
      createdAt: editingRecordId ? (state.records.find(r => r.id === editingRecordId)?.createdAt || nowISO()) : nowISO(),
      updatedAt: nowISO()
    };
    rec.fingerprint = makeRecordFingerprint(rec);

    if (editingRecordId) {
      const idx = state.records.findIndex(r => r.id === editingRecordId);
      if (idx >= 0) state.records[idx] = rec;
      pushNotification('Registro editado', `${user.username} actualizó un registro del turno ${rec.shift}.`, 'warning', 'record');
    } else {
      state.records.unshift(rec);
      quickNotificationForRecord(rec, 'registró');
    }

    state.records = normalizeStateRecords(state.records);
    reconcileAutoStops();
    editingRecordId = null;
    setCanEditFields();
    saveState();
    queueCloudSync('record');
    resetRecordForm();
    renderAll();
    showToast('Guardado', 'El registro quedó almacenado.');
  }

  function deleteRecord(id) {
    const rec = state.records.find(r => r.id === id);
    if (!rec) return;
    if (!isAdmin()) return;
    if (!confirm('¿Eliminar este registro?')) return;
    state.records = state.records.filter(r => r.id !== id);
    pushNotification('Registro eliminado', `Se eliminó un registro del turno ${rec.shift}.`, 'danger', 'record');
    saveState();
    renderAll();
  }

  function editRecord(id) {
    const rec = state.records.find(r => r.id === id);
    if (!rec) return;
    if (!currentUser()) return;
    loadRecordToForm(rec);
  }

  function renderRecordsTable() {
    const body = $('recordsBody');
    const rows = visibleRecords();
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="9"><div class="empty">No hay registros para mostrar.</div></td></tr>`;
      updateSelectionSummary();
      return;
    }
    body.innerHTML = rows.map(r => {
      const actions = [];
      if (currentUser()) {
        actions.push(`<button class="small-btn primary" data-edit="${r.id}">Editar</button>`);
      }
      if (isAdmin()) {
        actions.push(`<button class="small-btn danger" data-del="${r.id}">Eliminar</button>`);
      }
      const selected = selectedRecordIds.has(r.id) ? 'selected' : '';
      return `
        <tr class="${selected}">
          <td><input type="checkbox" class="row-check" data-check="${r.id}" ${selected ? 'checked' : ''} aria-label="Seleccionar registro"></td>
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
    body.querySelectorAll('[data-check]').forEach(btn => btn.addEventListener('change', () => toggleSelectedRecord(btn.dataset.check, btn.checked)));
    updateSelectionSummary();
  }

  function buildSelectUsers() {
    const sel = $('filterUser');
    const users = Object.values(state.users).filter(u => u.active);
    sel.innerHTML = `<option value="">Todos</option>` + users.map(u => `<option value="${escapeHtml(u.username)}">${escapeHtml(u.fullName || u.username)}</option>`).join('');
  }

  function populatePeriodFilters() {
    const recs = state.records || [];
    const years = [...new Set(recs.map(r => (r.date || '').slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const months = [...new Set(recs.map(r => (r.date || '').slice(0, 7)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const weeks = [...new Set(recs.map(r => isoWeekKey((r.date || '').slice(0, 10))).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const yearSel = $('filterYear');
    const monthSel = $('filterMonth');
    const weekSel = $('filterWeek');
    const dashYearSel = $('historyYear');
    const dashMonthSel = $('historyMonth');
    const dashWeekSel = $('historyWeek');
    if (yearSel) {
      const current = yearSel.value;
      yearSel.innerHTML = '<option value="">Todos</option>' + years.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');
      if (current) yearSel.value = current;
    }
    if (monthSel) {
      const current = monthSel.value;
      monthSel.innerHTML = '<option value="">Todos</option>' + months.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
      if (current) monthSel.value = current;
    }
    if (weekSel) {
      const current = weekSel.value;
      weekSel.innerHTML = '<option value="">Todas</option>' + weeks.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
      if (current) weekSel.value = current;
    }
    if (dashYearSel) {
      const current = dashYearSel.value;
      dashYearSel.innerHTML = '<option value="">Todos</option>' + years.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');
      if (current) dashYearSel.value = current;
    }
    if (dashMonthSel) {
      const current = dashMonthSel.value;
      dashMonthSel.innerHTML = '<option value="">Todos</option>' + months.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
      if (current) dashMonthSel.value = current;
    }
    if (dashWeekSel) {
      const current = dashWeekSel.value;
      dashWeekSel.innerHTML = '<option value="">Todas</option>' + weeks.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
      if (current) dashWeekSel.value = current;
    }
  }

  function renderHistorySummary() {
    const box = $('historySummary');
    if (!box) return;
    const recs = visibleRecords();
    const years = {};
    const months = {};
    const weeks = {};
    recs.forEach(r => {
      const dateKey = (r.date || '').slice(0, 10);
      const y = dateKey.slice(0, 4) || '—';
      const m = dateKey.slice(0, 7) || '—';
      const w = isoWeekKey(dateKey) || '—';
      years[y] = (years[y] || 0) + toNumber(r.secadas);
      months[m] = (months[m] || 0) + toNumber(r.secadas);
      weeks[w] = (weeks[w] || 0) + toNumber(r.secadas);
    });
    const topYear = Object.entries(years).sort((a, b) => b[1] - a[1])[0];
    const topMonth = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
    const topWeek = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0];
    const cards = [
      ['Año', topYear ? `${topYear[0]} · ${topYear[1]}` : 'Sin datos', 'Acumulado anual'],
      ['Mes', topMonth ? `${topMonth[0]} · ${topMonth[1]}` : 'Sin datos', 'Acumulado mensual'],
      ['Semana', topWeek ? `${topWeek[0]} · ${topWeek[1]}` : 'Sin datos', 'Acumulado semanal']
    ];
    box.innerHTML = cards.map(([k, v, s]) => `<div class="summary-card"><div class="k">${k}</div><div class="v">${escapeHtml(v)}</div><div class="s">${escapeHtml(s)}</div></div>`).join('');
  }

  const selectedRecordIds = new Set();

  function toggleSelectedRecord(id, on) {
    if (!id) return;
    if (on) selectedRecordIds.add(id);
    else selectedRecordIds.delete(id);
    updateSelectionSummary();
  }

  function clearSelectedRecords() {
    selectedRecordIds.clear();
    updateSelectionSummary();
    renderRecordsTable();
  }

  function updateSelectionSummary() {
    const total = selectedRecordIds.size;
    const btn = $('deleteSelectedBtn');
    if (btn) btn.textContent = total ? `Borrar seleccionados (${total})` : 'Borrar seleccionados';
  }

  function selectVisibleRecords() {
    visibleRecords().forEach(r => selectedRecordIds.add(r.id));
    updateSelectionSummary();
    renderRecordsTable();
    showToast('Selección', 'Los registros visibles quedaron seleccionados.');
  }

  function deleteSelectedRecords() {
    if (!isAdmin()) return;
    const ids = [...selectedRecordIds];
    if (!ids.length) {
      showToast('Sin selección', 'Selecciona uno o más registros.');
      return;
    }
    if (!confirm(`¿Eliminar ${ids.length} registros seleccionados?`)) return;
    state.records = state.records.filter(r => !selectedRecordIds.has(r.id));
    selectedRecordIds.clear();
    reconcileAutoStops();
    saveState();
    queueCloudSync('bulk-delete');
    renderAll();
    showToast('Eliminados', 'Los registros seleccionados fueron borrados.');
  }

  function deleteImportedRecords() {
    if (!isAdmin()) return;
    const imported = state.records.filter(r => String(r.source) === 'bulk' || String(r.sourceLabel) === 'Pega masiva');
    if (!imported.length) {
      showToast('Sin carga masiva', 'No hay registros masivos para borrar.');
      return;
    }
    if (!confirm(`¿Eliminar ${imported.length} registros de carga masiva?`)) return;
    state.records = state.records.filter(r => !(String(r.source) === 'bulk' || String(r.sourceLabel) === 'Pega masiva'));
    reconcileAutoStops();
    saveState();
    queueCloudSync('bulk-delete');
    renderAll();
    showToast('Carga masiva eliminada', 'Se borraron los registros generados por importación.');
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
    state.settings.weeklyTarget = Math.max(1, toNumber($('settingWeeklyTarget').value, 42));
    state.settings.monthlyTarget = Math.max(1, toNumber($('settingMonthlyTarget').value, 180));
    state.settings.alertHours = Math.max(1, toNumber($('settingAlertHours').value, 12));
    state.settings.theme = $('settingTheme').value || 'blue';
    state.settings.whatsappNumber = safe($('settingWhatsappNumber').value);
    state.settings.whatsappMessage = safe($('settingWhatsappMessage').value);
    state.settings.layoutMode = $('settingLayout').value || 'executive';
    state.settings.fontFamily = $('settingFont').value || 'inter';
    state.settings.github = {
      owner: safe($('githubOwner').value),
      repo: safe($('githubRepo').value),
      branch: safe($('githubBranch').value) || 'main',
      path: safe($('githubPath').value) || 'portal-data.json'
    };
    const token = safe($('githubToken').value);
    if (token) sessionStorage.setItem(GITHUB_TOKEN_KEY, token);
    applyLayoutMode(state.settings.layoutMode);
    applyFontFamily(state.settings.fontFamily || 'inter');
    setTheme(state.settings.theme);
    saveState();
    queueCloudSync('manual');
    renderAll();
    showToast('Configuración guardada', 'Los cambios ya quedaron aplicados.');
  }

  function resetSettings() {
    if (!isAdmin()) return;
    state.settings = clone(defaultState().settings);
    saveState();
    renderAll();
    showToast('Ajustes restaurados', 'Se aplicó la configuración base.');
  }

  function renderGithubStatus() {
    const el = $('githubStatus');
    if (!el) return;
    const cfg = githubConfig();
    if (!cfg.owner || !cfg.repo) {
      el.textContent = 'Sincronización GitHub no configurada.';
      return;
    }
    if (!cfg.token) {
      el.textContent = `GitHub listo · ${cfg.owner}/${cfg.repo} · Falta token de sesión.`;
      return;
    }
    el.textContent = `GitHub listo · ${cfg.owner}/${cfg.repo} · ${cfg.branch}/${cfg.path}`;
  }

  function applyLayoutMode(mode = 'executive') {
    document.body.dataset.layout = mode;
  }

  function applyFontFamily(font = 'inter') {
    const normalized = font === 'plex' ? 'plex' : 'inter';
    document.body.dataset.font = normalized;
  }

  function updateWhatsAppButton() {
    const btn = $('whatsappBtn');
    if (!btn) return;
    const number = safe(state.settings.whatsappNumber).replace(/\D/g, '');
    btn.dataset.whatsapp = number;
    btn.title = number ? `WhatsApp ${number}` : 'Configura el número de WhatsApp';
  }

  function openWhatsApp() {
    const number = safe(state.settings.whatsappNumber).replace(/\D/g, '');
    if (!number) {
      showToast('WhatsApp', 'Configura el número en ajustes.');
      return;
    }
    const message = encodeURIComponent(state.settings.whatsappMessage || 'Hola, te comparto el portal de secadas.');
    window.open(`https://wa.me/${number}?text=${message}`, '_blank', 'noopener');
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

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported || typeof imported !== 'object') throw new Error('JSON inválido');
        if (!imported.settings || !imported.users || !Array.isArray(imported.records)) throw new Error('Faltan campos base');

        state = {
          ...clone(defaultState()),
          ...imported,
          settings: { ...defaultState().settings, ...(imported.settings || {}) },
          users: normalizeUsers(imported.users),
          records: normalizeStateRecords(Array.isArray(imported.records) ? imported.records : []),
          notifications: Array.isArray(imported.notifications) ? imported.notifications : [],
          meta: imported.meta || clone(defaultState().meta)
        };
        reconcileAutoStops();
        saveState();
        renderAll();
        showToast('Importación exitosa', 'El respaldo fue cargado correctamente.');
      } catch (err) {
        showToast('Error de importación', err.message || 'No se pudo leer el archivo.');
      }
    };
    reader.readAsText(file);
  }

  function readFileInput() {
    const input = $('importJsonInput');
    const file = input.files && input.files[0];
    if (file) importJsonFile(file);
    input.value = '';
  }

  function handleAvatarFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Foto de perfil', 'Selecciona una imagen válida.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.settings.profileAvatar = String(reader.result || '');
      saveState();
      renderAll();
      showToast('Foto actualizada', 'La imagen de perfil quedó guardada.');
    };
    reader.readAsDataURL(file);
  }

  function clearAvatar() {
    state.settings.profileAvatar = '';
    saveState();
    renderAll();
    showToast('Foto eliminada', 'Se restauró el avatar por defecto.');
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

  function renderWeeklyInsights() {
    const box = $('weeklyComparisonPanel');
    if (box) {
      const data = weeklyComparisonData();
      const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
      box.innerHTML = `
        <div class="period-stat"><span>${weekLabel(data.current.start)}</span><strong>${data.current.total}</strong><span>Semana actual</span></div>
        <div class="period-stat"><span>${weekLabel(data.previous.start)}</span><strong>${data.previous.total}</strong><span>Semana pasada</span></div>
        <div class="period-stat"><span>${weekLabel(data.ante.start)}</span><strong>${data.ante.total}</strong><span>Semana antepasada</span></div>
        <div class="period-stat"><span>Variación vs pasada</span><strong>${(data.current.total - data.previous.total) >= 0 ? '+' : ''}${data.current.total - data.previous.total}</strong><span>${pct(data.current.total, data.previous.total).toFixed(1)}%</span></div>
        <div class="period-stat"><span>Variación vs antepasada</span><strong>${(data.current.total - data.ante.total) >= 0 ? '+' : ''}${data.current.total - data.ante.total}</strong><span>${pct(data.current.total, data.ante.total).toFixed(1)}%</span></div>
        <div class="period-stat"><span>Pronóstico</span><strong>${data.forecast}</strong><span>Mínimo ${data.target} por semana</span></div>
      `;
    }

    const dryerBox = $('dryerSummaryPanel');
    if (dryerBox) {
      dryerBox.innerHTML = dryerConsolidatedData().map(d => `
        <div class="missing-dryer">
          <div class="user-top">
            <div>
              <div class="stop-title">Secadora ${d.dryer}</div>
              <div class="stop-meta">Hoy: ${d.today} · Semana: ${d.week} · Mes: ${d.month}</div>
            </div>
            <span class="tag">Promedio ${formatMinutes(d.avgMinutes)}</span>
          </div>
          <div class="stop-meta">Paros detectados: ${d.stops}</div>
        </div>
      `).join('');
    }
  }


  function renderDashboardHistory() {
    const box = $('historyDetailPanel');
    if (!box) return;
    const year = $('historyYear')?.value || '';
    const month = $('historyMonth')?.value || '';
    const week = $('historyWeek')?.value || '';
    const recs = getRecordsVisible().filter(r => {
      const dateKey = (r.date || '').slice(0, 10);
      if (year && dateKey.slice(0, 4) !== year) return false;
      if (month && dateKey.slice(0, 7) !== month) return false;
      if (week && isoWeekKey(dateKey) !== week) return false;
      return true;
    });
    const total = sum(recs.map(r => toNumber(r.secadas)));
    const paros = recs.filter(r => toNumber(r.secadas) <= 0).length;
    const avgPerRecord = recs.length ? (total / recs.length) : 0;
    const topDryer = Object.entries(recs.reduce((acc, r) => {
      const k = String(r.dryer || '—');
      acc[k] = (acc[k] || 0) + toNumber(r.secadas);
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0];
    const topShift = Object.entries(recs.reduce((acc, r) => {
      const k = r.shift || '—';
      acc[k] = (acc[k] || 0) + toNumber(r.secadas);
      return acc;
    }, {})).sort((a, b) => b[1] - a[1])[0];
    box.innerHTML = [
      ['Registros', String(recs.length), 'Base consolidada filtrada'],
      ['Secadas', String(total), 'Acumulado del periodo'],
      ['Paros', String(paros), 'Pendientes o automáticos'],
      ['Promedio', total ? total.toFixed(1) : '0.0', 'Por registro'],
      ['Secadora líder', topDryer ? `#${topDryer[0]} · ${topDryer[1]}` : 'Sin datos', 'Mayor aporte'],
      ['Turno líder', topShift ? `${topShift[0]} · ${topShift[1]}` : 'Sin datos', 'Mayor aporte']
    ].map(([k,v,s]) => `<div class="summary-card"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div><div class="s">${escapeHtml(s)}</div></div>`).join('');
  }

  function renderWhatsAppCenter() {
    const box = $('whatsappCenterPanel');
    if (!box) return;
    const number = safe(state.settings.whatsappNumber).replace(/\D/g, '');
    const message = encodeURIComponent(state.settings.whatsappMessage || 'Hola, te comparto el portal de secadas.');
    const contacts = Object.values(state.users).filter(u => u.active).slice(0, 4);
    const recents = (state.notifications || []).slice(0, 3);
    box.innerHTML = `
      <div class="wa-head">
        <div>
          <div class="wa-title">${number ? `+${escapeHtml(number)}` : 'Sin número configurado'}</div>
          <div class="wa-sub">Panel interno estilo WhatsApp Web</div>
        </div>
        <div class="wa-badge">${number ? 'Conectado' : 'Configura número'}</div>
      </div>
      <div class="wa-chat-preview">
        ${recents.length ? recents.map(n => `<div class="wa-message ${n.type || 'info'}"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.message)}</span></div>`).join('') : '<div class="empty">Aún no hay mensajes guardados.</div>'}
      </div>
      <div class="wa-contacts">
        ${contacts.map(c => `<button type="button" class="wa-contact" data-wa-user="${escapeHtml(c.username)}"><span>${escapeHtml((c.fullName || c.username).slice(0,1).toUpperCase())}</span><div><strong>${escapeHtml(c.fullName || c.username)}</strong><small>@${escapeHtml(c.username)}</small></div></button>`).join('')}
      </div>
      <div class="row-actions">
        <button type="button" class="btn primary" id="waOpenQuickBtn">Abrir chat</button>
        <button type="button" class="btn soft" id="waQuickCopyBtn">Copiar mensaje</button>
      </div>
    `;
    const openBtn = $('waOpenQuickBtn');
    if (openBtn) openBtn.onclick = () => openWhatsApp();
    const copyBtn = $('waQuickCopyBtn');
    if (copyBtn) copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(state.settings.whatsappMessage || 'Hola, te comparto el portal de secadas.');
        showToast('Copiado', 'Mensaje listo para pegar en WhatsApp.');
      } catch {
        showToast('WhatsApp', 'No se pudo copiar el mensaje.');
      }
    };
    box.querySelectorAll('[data-wa-user]').forEach(btn => btn.addEventListener('click', () => {
      const user = btn.dataset.waUser;
      const text = encodeURIComponent(`Hola ${user}, revisemos los registros de secadas.`);
      if (!number) return showToast('WhatsApp', 'Configura un número primero.');
      window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener');
    }));
  }

  function renderProfileSnapshot() {
    const box = $('profileSnapshotPanel');
    if (!box) return;
    const user = currentUser();
    const avatar = state.settings.profileAvatar || '';
    box.innerHTML = `
      <div class="profile-snapshot">
        <div class="profile-snapshot-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="Avatar"/>` : `<span>${escapeHtml((user?.fullName || user?.username || 'A').slice(0, 1).toUpperCase())}</span>`}</div>
        <div>
          <strong>${escapeHtml(user?.fullName || user?.username || '—')}</strong>
          <p>${escapeHtml(user?.role === 'admin' ? 'Administrador' : 'Operador')} · ${escapeHtml(layoutLabel(state.settings.layoutMode))}</p>
        </div>
      </div>
      <div class="summary-grid profile-mini-grid">
        <div class="summary-card"><div class="k">Tema</div><div class="v">${escapeHtml(state.settings.theme || 'blue')}</div><div class="s">Corporativo</div></div>
        <div class="summary-card"><div class="k">Meta diaria</div><div class="v">${escapeHtml(String(state.settings.dailyTarget || 6))}</div><div class="s">Secadas / turno</div></div>
        <div class="summary-card"><div class="k">Avatar</div><div class="v">${avatar ? 'Activo' : 'Default'}</div><div class="s">Foto de perfil</div></div>
      </div>
    `;
  }

  function renderDataQuality() {
    const el = $('qualityInsightsPanel');
    if (!el) return;
    const recs = getRecordsVisible();
    const bulkCount = recs.filter(r => String(r.source) === 'bulk' || String(r.sourceLabel) === 'Pega masiva').length;
    const autoStops = recs.filter(r => isAutoStopRecord(r)).length;
    const uniq = new Set(recs.map(r => bulkSignature(r))).size;
    const dupes = Math.max(0, recs.length - uniq);
    el.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card"><div class="k">Carga masiva</div><div class="v">${bulkCount}</div><div class="s">Registros importados</div></div>
        <div class="summary-card"><div class="k">Auto-paros</div><div class="v">${autoStops}</div><div class="s">Faltantes detectados</div></div>
        <div class="summary-card"><div class="k">Duplicados</div><div class="v">${dupes}</div><div class="s">Firma repetida</div></div>
      </div>
    `;
  }

  function renderCharts() {
    const dailyTarget = Math.max(1, toNumber(state.settings.dailyTarget, 6));
    const weeklyTarget = Math.max(42, Math.max(1, toNumber(state.settings.weeklyTarget, 42)));
    drawBarChart($('shiftChart'), shiftSeries().labels, shiftSeries().values, ['#2563eb', '#8b5cf6']);
    drawLineChart($('trendChart'), trendSeries(14).labels, trendSeries(14).values, '#14b8a6', { threshold: dailyTarget, thresholdLabel: `Meta diaria ${dailyTarget}` });
    drawLineChart($('forecastChart'), weeklyForecastSeries().labels, weeklyForecastSeries().values, '#8b5cf6', { threshold: weeklyTarget, thresholdLabel: `Meta semanal ${weeklyTarget}` });
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

  function drawLineChart(canvas, labels, values, color = '#14b8a6', options = {}) {
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
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    const pad = { l: 44, r: 20, t: 18, b: 56 };
    const chartW = width - pad.l - pad.r;
    const chartH = height - pad.t - pad.b;
    const threshold = Number(options.threshold);
    const maxVal = Math.max(1, ...values, Number.isFinite(threshold) ? threshold : 0) * 1.15;
    ctx.strokeStyle = '#e5edf6';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const y = pad.t + chartH - (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
      ctx.fillStyle = '#7b8ba2';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(Math.round(maxVal / 4 * i)), 10, y + 4);
    }

    if (Number.isFinite(threshold)) {
      const y = pad.t + chartH - (threshold / maxVal) * chartH;
      const label = options.thresholdLabel || `Meta ${threshold}`;
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(width - pad.r, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      const labelWidth = ctx.measureText(label).width + 14;
      const lx = pad.l + 6;
      const ly = Math.max(10, y - 18);
      ctx.fillRect(lx - 4, ly - 12, labelWidth, 18);
      ctx.strokeStyle = '#ef4444';
      ctx.strokeRect(lx - 4, ly - 12, labelWidth, 18);
      ctx.fillStyle = '#ef4444';
      ctx.font = '700 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx, ly);
      ctx.restore();
    }

    const points = values.map((v, i) => ({
      x: pad.l + (chartW / Math.max(1, values.length - 1)) * i,
      y: pad.t + chartH - (v / maxVal) * chartH,
      v
    }));

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke();

    ctx.fillStyle = color;
    points.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '700 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#17324f';
      ctx.fillText(String(p.v), p.x, p.y - 10);
      ctx.fillStyle = color;
    });

    ctx.fillStyle = '#5e6f84';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((lab, i) => {
      const x = pad.l + (chartW / Math.max(1, labels.length - 1)) * i;
      ctx.fillText(String(lab), x, height - 20);
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
    $('settingPortalName').value = state.settings.portalName || '';
    $('settingPortalTagline').value = state.settings.portalTagline || '';
    $('settingDailyTarget').value = state.settings.dailyTarget || 6;
    $('settingWeeklyTarget').value = state.settings.weeklyTarget || 42;
    $('settingMonthlyTarget').value = state.settings.monthlyTarget || 180;
    $('settingAlertHours').value = state.settings.alertHours || 12;
    $('settingTheme').value = state.settings.theme || 'blue';
    $('settingWhatsappNumber').value = state.settings.whatsappNumber || '';
    $('settingWhatsappMessage').value = state.settings.whatsappMessage || '';
    $('settingLayout').value = state.settings.layoutMode || 'executive';
    $('settingFont').value = state.settings.fontFamily || 'inter';
    $('githubOwner').value = state.settings.github?.owner || '';
    $('githubRepo').value = state.settings.github?.repo || '';
    $('githubBranch').value = state.settings.github?.branch || 'main';
    $('githubPath').value = state.settings.github?.path || 'portal-data.json';
    $('githubToken').value = sessionStorage.getItem(GITHUB_TOKEN_KEY) || '';
    const prev = $('profileAvatarPreview');
    if (prev) {
      if (state.settings.profileAvatar) {
        prev.src = state.settings.profileAvatar;
        prev.classList.add('has-image');
      } else {
        prev.removeAttribute('src');
        prev.classList.remove('has-image');
      }
    }
    setTheme(state.settings.theme || 'blue');
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

  
  function safeRender(label, fn) {
    try { fn(); }
    catch (err) { console.error(label, err); }
  }

function renderAll() {
    if (!session) {
      $('loginView').classList.remove('hidden');
      $('appView').classList.add('hidden');
      return;
    }
    setTheme(state.settings.theme || 'blue');
    safeRender('updateSidebar', updateSidebar);
    safeRender('updateHeader', updateHeader);
    safeRender('buildSelectUsers', buildSelectUsers);
    safeRender('populatePeriodFilters', populatePeriodFilters);
    safeRender('populateSettings', populateSettings);
    safeRender('renderBell', renderBell);
    safeRender('renderNotifications', renderNotifications);
    safeRender('renderRecordsTable', renderRecordsTable);
    safeRender('renderUsers', renderUsers);
    safeRender('topStops', topStops);
    safeRender('recentActivity', recentActivity);
    safeRender('renderPeriodStats', renderPeriodStats);
    safeRender('renderWeeklyInsights', renderWeeklyInsights);
    safeRender('renderHistorySummary', renderHistorySummary);
    safeRender('renderDashboardHistory', renderDashboardHistory);
    safeRender('renderWhatsAppCenter', renderWhatsAppCenter);
    safeRender('renderProfileSnapshot', renderProfileSnapshot);
    safeRender('renderDataQuality', renderDataQuality);
    safeRender('renderCharts', renderCharts);
    safeRender('renderMonthlyNotes', renderMonthlyNotes);
    safeRender('updateWhatsAppButton', updateWhatsAppButton);
    safeRender('renderGithubStatus', renderGithubStatus);
    $('recordDate').value = $('recordDate').value || todayISO();
    $('editModeBadge').classList.toggle('hidden', !editingRecordId);
  }

  function bindControls() {
    $('loginBtn').addEventListener('click', login);
    if ($('loginResetBtn')) $('loginResetBtn').addEventListener('click', resetPortal);
    $('logoutBtn').addEventListener('click', logout);
    $('saveRecordBtn').addEventListener('click', saveRecord);
    $('clearRecordBtn').addEventListener('click', resetRecordForm);
    $('todayBtn').addEventListener('click', () => { $('recordDate').value = todayISO(); showToast('Fecha asignada', 'Se cargó la fecha de hoy.'); });
    $('bulkPreviewBtn').addEventListener('click', bulkPreview);
    $('bulkImportBtn').addEventListener('click', bulkImport);
    $('bulkClearBtn').addEventListener('click', clearBulkPaste);
    if ($('selectVisibleBtn')) $('selectVisibleBtn').addEventListener('click', selectVisibleRecords);
    if ($('clearSelectionBtn')) $('clearSelectionBtn').addEventListener('click', clearSelectedRecords);
    if ($('deleteSelectedBtn')) $('deleteSelectedBtn').addEventListener('click', deleteSelectedRecords);
    if ($('deleteImportedBtn')) $('deleteImportedBtn').addEventListener('click', deleteImportedRecords);
    $('createUserBtn').addEventListener('click', createUser);
    $('saveSettingsBtn').addEventListener('click', saveSettings);
    $('resetSettingsBtn').addEventListener('click', resetSettings);
    $('exportJsonBtn').addEventListener('click', exportJson);
    $('exportCsvBtn').addEventListener('click', exportCsv);
    $('importJsonBtn').addEventListener('click', () => $('importJsonInput').click());
    $('importJsonInput').addEventListener('change', readFileInput);
    if ($('factoryResetBtn')) $('factoryResetBtn').addEventListener('click', () => { if (confirm('¿Restaurar base completa?')) resetPortal(); });
    $('refreshBtn').addEventListener('click', () => { checkIdleAlerts(); renderAll(); queueCloudSync('manual'); showToast('Actualizado', 'Se recargó el tablero.'); });
    if ($('whatsappBtn')) $('whatsappBtn').addEventListener('click', openWhatsApp);
    if ($('saveGithubBtn')) $('saveGithubBtn').addEventListener('click', () => { saveSettings(); showToast('Nube lista', 'La configuración GitHub quedó guardada.'); });
    if ($('syncGithubBtn')) $('syncGithubBtn').addEventListener('click', async () => { saveSettings(); await syncToGithub('manual'); renderAll(); });
    if ($('profileAvatarInput')) $('profileAvatarInput').addEventListener('change', (e) => { const file = e.target.files && e.target.files[0]; if (file) handleAvatarFile(file); e.target.value = ''; });
    if ($('clearAvatarBtn')) $('clearAvatarBtn').addEventListener('click', clearAvatar);
    if ($('settingLayout')) $('settingLayout').addEventListener('change', () => { applyLayoutMode($('settingLayout').value); renderAll(); });
    if ($('settingFont')) $('settingFont').addEventListener('change', () => { applyFontFamily($('settingFont').value); renderAll(); });
    ['historyYear','historyMonth','historyWeek'].forEach(id => { const el = $(id); if (el) el.addEventListener('change', renderDashboardHistory); });
    $('notifBell').addEventListener('click', () => $('notifPanel').classList.toggle('hidden'));
    ['searchRecords', 'filterDate', 'filterShift', 'filterUser', 'filterStatus', 'filterYear', 'filterMonth', 'filterWeek'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => { renderRecordsTable(); renderHistorySummary(); renderCharts(); });
      el.addEventListener('input', () => { renderRecordsTable(); renderHistorySummary(); });
    });
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
    setTheme(state.settings.theme || 'blue');
    applyFontFamily(state.settings.fontFamily || 'inter');
    applyLayoutMode(state.settings.layoutMode || 'executive');
    await loadFromGithub();
    populateSettings();
    if (session && currentUser()) {
      $('loginView').classList.add('hidden');
      $('appView').classList.remove('hidden');
      scheduleNotificationChecks();
    }
    checkIdleAlerts();
    renderAll();
    setInterval(() => {
      if (session) {
        renderBell();
        renderCharts();
      }
    }, 15000);
    window.addEventListener('focus', () => { if (session) loadFromGithub().then(() => renderAll()); });
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
