// Local development talks to a local backend (add ?api=live to use production); everything else uses production.
const API = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('api') !== 'live'
  ? 'http://localhost:3000/api'
  : 'https://api.tymeboxed.app/api';
const TOKEN_KEY = 'tymeboxedAdminToken';

const $ = (id) => document.getElementById(id);
const state = { period: 'week', userId: null };

function getToken() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(token) {
  try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); } catch {}
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDuration(seconds) {
  seconds = Math.round(seconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${seconds}s`;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDay(date, long) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, long
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : state.period === 'week' ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
}

class AuthError extends Error {}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers
    }
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new AuthError(body.message || 'Not authorized');
  if (!res.ok || body.success === false) throw new Error(body.message || `Request failed (${res.status})`);
  return body;
}

function showLogin(message = '') {
  setToken(null);
  $('dashboard').classList.add('hidden');
  $('logout').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('password').value = '';
  $('login-error').textContent = message;
}

function handleError(error, stateEl) {
  if (error instanceof AuthError) {
    showLogin('Your session ended or this account is not an admin. Please sign in with an admin account.');
    return;
  }
  stateEl.textContent = `Couldn't load data: ${error.message}`;
  stateEl.classList.add('error');
}

// ----- Sign in -----
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('login-error').textContent = '';
  try {
    const res = await fetch(`${API}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) throw new Error(body.message || `Sign in failed (${res.status})`);
    setToken(body.token);
    showDashboard();
  } catch (error) {
    $('login-error').textContent = error.message === 'Failed to fetch'
      ? `Can't reach the server at ${API}.`
      : error.message;
  } finally {
    button.disabled = false;
  }
});

$('logout').addEventListener('click', () => showLogin());

// ----- Dashboard -----
function showDashboard() {
  $('login').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  loadReport();
  loadUsers();
}

document.querySelectorAll('.segmented button').forEach((button) => {
  button.addEventListener('click', () => {
    state.period = button.dataset.period;
    document.querySelectorAll('.segmented button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    loadReport();
    if (!state.userId) loadUsers();
  });
});

$('back').addEventListener('click', () => {
  state.userId = null;
  loadReport();
  loadUsers();
});

function query(extra = '') {
  return `?period=${state.period}&to=${localToday()}${extra}`;
}

// Only the newest request may render, so a slow older response can't overwrite a newer filter.
let reportRequest = 0;
let usersRequest = 0;

async function loadReport() {
  const request = ++reportRequest;
  const stateEl = $('report-state');
  stateEl.classList.remove('error', 'hidden');
  stateEl.textContent = 'Loading…';
  $('report').classList.add('hidden');
  $('back').classList.toggle('hidden', !state.userId);
  $('users-section').classList.toggle('hidden', !!state.userId);

  try {
    const data = state.userId
      ? await api(`/admin/usage/users/${encodeURIComponent(state.userId)}${query()}`)
      : await api(`/admin/usage/overview${query()}`);
    if (request !== reportRequest) return;
    renderReport(data);
    stateEl.classList.add('hidden');
    $('report').classList.remove('hidden');
  } catch (error) {
    if (request === reportRequest) handleError(error, stateEl);
  }
}

function renderReport(data) {
  const t = data.totals;
  const who = data.user ? (data.user.email || data.user.phone || data.user.name || 'User') : null;
  $('title').textContent = who ? who : 'Usage Analytics';
  $('range').textContent = data.from === data.to ? fmtDay(data.to, true) : `${fmtDay(data.from, true)} – ${fmtDay(data.to, true)}`;

  const stats = [
    ['Total app usage', fmtDuration(t.totalActiveSeconds)],
    ['Launches', t.launchCount.toLocaleString()],
    ['Focus sessions', t.focusSessionsStarted.toLocaleString()],
    ['Focus time', fmtDuration(t.totalFocusSeconds)],
    ['Avg daily usage', fmtDuration(data.averages.dailyActiveSeconds)]
  ];
  if (!data.user) stats.push(['Active users', `${data.activeUsers} / ${data.totalUsers}`]);
  $('stats').innerHTML = stats.map(([label, value]) =>
    `<div class="card stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join('');

  const max = Math.max(...data.series.map((d) => d.totalActiveSeconds), 1);
  const chart = $('chart');
  chart.classList.toggle('dense', data.series.length > 14);
  chart.setAttribute('aria-label', `Daily app usage: ${data.series.map((d) => `${fmtDay(d.date, true)} ${fmtDuration(d.totalActiveSeconds)}`).join(', ')}`);
  chart.innerHTML = data.series.map((d) => {
    const pct = (d.totalActiveSeconds / max) * 100;
    return `<div class="bar-col" title="${esc(fmtDay(d.date, true))}: ${esc(fmtDuration(d.totalActiveSeconds))}">
      <div class="bar-track"><div class="bar ${d.totalActiveSeconds ? '' : 'empty'}" style="height:${pct}%"></div></div>
      <div class="bar-label">${esc(fmtDay(d.date))}</div>
    </div>`;
  }).join('');

  const rows = (items) => items.map(([label, value]) =>
    `<div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  $('breakdown').innerHTML = rows([
    ['App foreground time', fmtDuration(t.totalActiveSeconds)],
    ['Focus session time', fmtDuration(t.totalFocusSeconds)],
    ['Break time', fmtDuration(t.totalBreakSeconds)],
    ['Avg time per app visit', fmtDuration(data.averages.sessionSeconds)],
    ['Tyme Box scans', t.deviceScanCount.toLocaleString()]
  ]);
  $('focus').innerHTML = rows([
    ['Started', t.focusSessionsStarted.toLocaleString()],
    ['Completed', t.focusSessionsCompleted.toLocaleString()],
    ['Stopped early', t.focusSessionsInterrupted.toLocaleString()],
    ['Avg focus session', fmtDuration(data.averages.focusSessionSeconds)],
    ['Breaks taken', t.totalBreakCount.toLocaleString()]
  ]);

  $('activity').classList.toggle('hidden', !data.events);
  if (data.events) {
    const names = {
      app_launch: 'App launched', app_foreground: 'App opened', app_background: 'App closed',
      tracking_interrupted: 'App closed unexpectedly', focus_started: 'Focus session started',
      focus_completed: 'Focus session completed', focus_stopped_early: 'Focus session stopped early',
      break_started: 'Break started', break_completed: 'Break finished', device_scanned: 'Tyme Box scanned'
    };
    $('events').innerHTML = data.events.length
      ? data.events.map((e) => `<li><span>${esc(names[e.eventType] || e.eventType)}${e.durationSeconds ? ` · ${esc(fmtDuration(e.durationSeconds))}` : ''}</span>
          <span class="muted">${esc(new Date(e.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</span></li>`).join('')
      : '<li class="muted">No activity in this period.</li>';
  }
}

let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadUsers, 300);
});

async function loadUsers() {
  const request = ++usersRequest;
  const stateEl = $('users-state');
  stateEl.classList.remove('error', 'hidden');
  stateEl.textContent = 'Loading…';
  $('users-wrap').classList.add('hidden');
  const search = $('search').value.trim();

  try {
    const data = await api(`/admin/usage/users${query(search ? `&search=${encodeURIComponent(search)}` : '')}`);
    if (request !== usersRequest) return;
    if (!data.users.length) {
      stateEl.textContent = search ? 'No users match your search.' : 'No app activity in this period yet.';
      return;
    }
    $('users').innerHTML = data.users.map((u) => `
      <tr tabindex="0" data-id="${esc(u.id)}" aria-label="View ${esc(u.email || u.phone || 'user')}">
        <td class="user-cell">${esc(u.email || u.phone || u.name || 'Unknown')}</td>
        <td class="num">${esc(fmtDuration(u.totals.totalActiveSeconds))}</td>
        <td class="num">${u.totals.launchCount}</td>
        <td class="num">${u.totals.focusSessionsStarted}</td>
        <td class="num">${esc(fmtDuration(u.totals.totalFocusSeconds))}</td>
      </tr>`).join('');
    stateEl.classList.add('hidden');
    $('users-wrap').classList.remove('hidden');
  } catch (error) {
    if (request === usersRequest) handleError(error, stateEl);
  }
}

function openUser(row) {
  if (!row) return;
  state.userId = row.dataset.id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadReport();
}
$('users').addEventListener('click', (event) => openUser(event.target.closest('tr')));
$('users').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openUser(event.target.closest('tr')); }
});

getToken() ? showDashboard() : showLogin();
