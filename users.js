/* USERS – admin screen to add people, set their role, reset passwords and remove access. Talks to the admin-users Edge Function; the secret key never reaches the browser. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { esc } = X;
  const ROLES = { admin: 'Admin (full access, can manage users)', staff: 'Staff (all pages)', accountant: 'Accountant (all pages for now)' };
  async function call(body) {
    const s = await X.session(); if (!s) throw new Error('Please sign in again');
    const r = await fetch(X.base + '/functions/v1/admin-users', { method: 'POST', headers: { apikey: X.cfg.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
    return j;
  }
  const d = (x) => (x ? new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');
  const opts = (sel) => Object.keys(ROLES).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(ROLES[k])}</option>`).join('');
  X.routes['p-users'] = async function (el) {
    el.innerHTML = X.head('Users', 'Who can sign in to this portal') + '<div class="empty">Loading…</div>';
    let data;
    try { data = await call({ action: 'list' }); }
    catch (e) { el.innerHTML = X.head('Users', 'Who can sign in to this portal') + `<div class="card"><div class="hint">${esc(e.message)}${/Admins only/.test(e.message) ? ' – ask Paul to add or change users.' : ''}</div></div>`; return; }
    const msg = el._msg || ''; el._msg = '';
    const rows = data.users.map((u) => `<tr data-id="${u.id}"><td>${esc(u.name || '–')}</td><td>${esc(u.email)}</td>
      <td>${u.has_access ? `<select class="u-role" ${u.id === data.me ? 'disabled' : ''}>${opts(u.role)}</select>` : '<span style="color:#b3261e">No access</span> <button class="u-grant">Give access</button>'}</td>
      <td>${d(u.last_sign_in_at)}</td>
      <td style="white-space:nowrap">${u.id === data.me ? '(you)' : '<button class="u-reset">New password</button> <button class="u-rm">Remove</button>'}</td></tr>`).join('');
    el.innerHTML = X.head('Users', 'Who can sign in to this portal') + (msg ? `<div class="card" style="border-left:4px solid #1b7f4b">${msg}</div>` : '') +
      `<div class="card"><h3 style="margin-top:0">Add a user</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <label>Name<br><input id="u-name" style="padding:6px;min-width:160px"></label>
        <label>Email<br><input id="u-email" type="email" style="padding:6px;min-width:240px"></label>
        <label>Access<br><select id="u-newrole" style="padding:6px">${opts('staff')}</select></label>
        <label>How<br><select id="u-mode" style="padding:6px"><option value="password">Create now with a temporary password</option><option value="invite">Email them an invite link</option></select></label>
        <button id="u-add" class="btn">Add user</button></div>
      <div class="hint" style="margin-top:6px">A temporary password is shown once on screen for you to pass on; they should change it after signing in. Invite emails need Supabase email set up and can be rate-limited.</div></div>
      <div class="card"><table class="pv-tbl"><thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Last sign-in</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="hint" style="margin-top:6px">Roles are recorded now. Restricting the accountant to selected pages is not switched on yet – everyone with access sees every page.</div></div>`;
    const refresh = (m) => { el._msg = m || ''; X.routes['p-users'](el); };
    const guard = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { alert(e.message); btn.disabled = false; } };
    el.querySelector('#u-add').onclick = (ev) => guard(ev.target, async () => {
      const r = await call({ action: 'create', name: el.querySelector('#u-name').value, email: el.querySelector('#u-email').value, role: el.querySelector('#u-newrole').value, mode: el.querySelector('#u-mode').value, redirectTo: location.origin + location.pathname });
      refresh(r.password ? `<b>${esc(r.email)}</b> created. Temporary password (shown once): <code style="font-size:15px;user-select:all">${esc(r.password)}</code>` : `Invite sent to <b>${esc(r.email)}</b>.`);
    });
    el.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id, q = (s) => tr.querySelector(s);
      if (q('.u-role')) q('.u-role').onchange = (ev) => guard(ev.target, async () => { await call({ action: 'setRole', id, role: ev.target.value }); refresh('Access updated.'); });
      if (q('.u-grant')) q('.u-grant').onclick = (ev) => guard(ev.target, async () => { await call({ action: 'grant', id, role: 'staff' }); refresh('Access granted.'); });
      if (q('.u-reset')) q('.u-reset').onclick = (ev) => { if (!confirm('Set a new temporary password for this user?')) return; guard(ev.target, async () => { const r = await call({ action: 'resetPassword', id }); refresh(`New temporary password (shown once): <code style="font-size:15px;user-select:all">${esc(r.password)}</code>`); }); };
      if (q('.u-rm')) q('.u-rm').onclick = (ev) => { if (!confirm('Remove this user\'s access to the portal?')) return; const del = confirm('Also delete their login completely? OK = delete login, Cancel = just remove portal access.'); guard(ev.target, async () => { await call({ action: 'remove', id, deleteLogin: del }); refresh(del ? 'User deleted.' : 'Access removed.'); }); };
    });
  };
})();
