/* Loads the dashboard data from Supabase behind an office-staff login, then starts the dashboard.
   - No config  -> stand-alone mode: loads the bundled data/data.js (local use only).
   - With config -> staff sign in (Supabase Auth email + password); data is read through
     row-level security, so only users listed in the `staff` table can see anything. */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const SKEY = 'compton-dash-session';
  const TABLES = { months: 'hire_months', types: 'hire_types', customers: 'hire_customers', units: 'hire_units', hp: 'hire_hp' };
  const ORDER = { months: 'month.asc', types: 'month.asc,type.asc', customers: 'month.asc,customer.asc', units: 'month.asc,unit.asc', hp: 'unit.asc' };

  if (!cfg.url || !cfg.anonKey) {
    const s = document.createElement('script');
    s.src = 'data/data.js';
    s.onload = () => dash.start();
    s.onerror = () => showMsg('No data source configured. Add your Supabase URL and key in js/supabase-config.js.');
    document.head.appendChild(s);
    return;
  }

  const base = cfg.url.replace(/\/+$/, '');
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(SKEY, JSON.stringify(v)); } catch (e) {} },
    clear() { try { localStorage.removeItem(SKEY); } catch (e) {} }
  };

  // ---------- small UI ----------
  const root = document.createElement('div');
  root.id = 'ct-gate';
  root.innerHTML = '<style>' +
    '#ct-gate{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;background:#F4F6F9;font-family:Barlow,system-ui,sans-serif;color:#16202D}' +
    '#ct-gate .box{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(22,32,45,.12);padding:28px;width:min(92vw,380px);border-top:5px solid #164698}' +
    '#ct-gate h2{margin:0 0 4px;font-size:22px;color:#164698}#ct-gate p{margin:0 0 16px;color:#5B6675;font-size:14px}' +
    '#ct-gate label{display:block;font-size:13px;margin:10px 0 4px}' +
    '#ct-gate input{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #cdd5e0;border-radius:8px}' +
    '#ct-gate button{margin-top:16px;width:100%;font:inherit;font-weight:600;padding:11px;border:0;border-radius:8px;background:#E3641D;color:#fff;cursor:pointer}' +
    '#ct-gate .err{color:#b3261e;font-size:13px;min-height:18px;margin-top:10px}' +
    '#ct-signout{position:fixed;right:12px;bottom:12px;z-index:40;font:12px Barlow,system-ui,sans-serif;background:#fff;border:1px solid #cdd5e0;border-radius:8px;padding:6px 10px;cursor:pointer;color:#5B6675}' +
    '</style>' +
    '<div class="box"><h2>Compton Tankers</h2><p>Hire fleet dashboard – office staff sign in</p>' +
    '<label for="ct-em">Email</label><input id="ct-em" type="email" autocomplete="username">' +
    '<label for="ct-pw">Password</label><input id="ct-pw" type="password" autocomplete="current-password">' +
    '<button id="ct-go" type="button">Sign in</button><div class="err" id="ct-err" role="alert"></div></div>';
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id);
  function showGate(msg) { root.style.display = 'flex'; $('ct-err').textContent = msg || ''; }
  function hideGate() { root.style.display = 'none'; }
  function showMsg(t) { const d = document.getElementById('dash-root') || document.body; const p = document.createElement('p'); p.style.cssText = 'padding:24px;font-family:sans-serif'; p.textContent = t; d.prepend(p); }

  // ---------- auth (plain REST, no libraries) ----------
  async function authCall(grant, body) {
    const r = await fetch(base + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST', headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || 'Sign in failed');
    const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) - 60 };
    store.set(s); return s;
  }
  async function session() {
    let s = store.get();
    if (!s) return null;
    if (s.expires_at > Date.now() / 1000) return s;
    try { return await authCall('refresh_token', { refresh_token: s.refresh_token }); } catch (e) { store.clear(); return null; }
  }

  // ---------- data ----------
  async function fetchAll(table, order, token) {
    let rows = [], from = 0; const page = 1000;
    for (;;) {
      const r = await fetch(base + '/rest/v1/' + table + '?select=*&order=' + order, {
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token, Range: from + '-' + (from + page - 1) }
      });
      if (r.status === 401 || r.status === 403) { const e = new Error('auth'); e.auth = true; throw e; }
      if (!r.ok) throw new Error('Could not load ' + table);
      const part = await r.json();
      rows = rows.concat(part);
      if (part.length < page) return rows;
      from += page;
    }
  }
  const blank = (rows) => rows.map((r) => { const o = {}; for (const k in r) o[k] = r[k] === null ? '' : r[k]; return o; });

  async function load(token) {
    const out = {};
    for (const k in TABLES) out[k] = await fetchAll(TABLES[k], ORDER[k], token);
    out.units = blank(out.units); out.hp = blank(out.hp);   // dashboard expects '' not null for text/date fields
    return out;
  }

  let started = false;
  async function run(msg) {
    const s = await session();
    if (!s) { showGate(msg); return; }
    try {
      const d = await load(s.access_token);
      if (!d.months.length) { store.clear(); showGate('No data available for this account. Ask the office to add you as staff (or load the data).'); return; }
      window.DASH_DATA = d; hideGate();
      if (!$('ct-signout')) {
        const b = document.createElement('button'); b.id = 'ct-signout'; b.textContent = 'Sign out';
        b.onclick = () => { store.clear(); location.reload(); }; document.body.appendChild(b);
      }
      if (started) dash.refresh(); else { started = true; dash.start(); }
    } catch (e) {
      if (e.auth) { store.clear(); showGate('Session expired – please sign in again.'); }
      else showGate(e.message || 'Something went wrong loading the data.');
    }
  }

  $('ct-go').onclick = async () => {
    $('ct-err').textContent = '';
    try { await authCall('password', { email: $('ct-em').value.trim(), password: $('ct-pw').value }); $('ct-pw').value = ''; run(); }
    catch (e) { $('ct-err').textContent = e.message; }
  };
  $('ct-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ct-go').click(); });
  run();
})();
