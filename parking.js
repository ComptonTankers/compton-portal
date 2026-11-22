/* PARKING – sites, spaces and parking agreements (charged per space per week).
   Feeds the board pack: occupancy, weekly/monthly revenue, waiting list and agreements ending. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const KINDS = ['HGV', 'Small bay', 'Artic / trailer', 'Rigid', 'Van', 'Car', 'Container / storage', 'Other'];
  const STATUS = ['Active', 'On notice', 'Waiting list', 'Ended'];
  const INV = ['MCS', 'Xero', 'Not invoiced yet'];
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fd = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
  const ymAdd = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  let SITES = [], CAP = [], AG = [], SITE = 'all', EDIT = null;

  async function load() {
    [SITES, CAP, AG] = await Promise.all([all('park_sites', 'id.asc'), all('park_capacity', 'id.asc'), all('park_agreements', 'start_date.desc.nullslast')]);
  }
  const live = (a, d) => (a.status === 'Active' || a.status === 'On notice') && (!a.start_date || a.start_date <= d) && (!a.end_date || a.end_date >= d);
  const weekly = (a) => (+a.spaces || 0) * (+a.weekly_rate || 0);
  // revenue earned in a month, pro rata by day (rate is per space per week)
  function monthRevenue(ym, siteId) {
    const first = ym + '-01', days = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), last = ym + '-' + String(days).padStart(2, '0');
    return AG.filter((a) => (a.status === 'Active' || a.status === 'On notice' || a.status === 'Ended') && (!siteId || a.site_id === siteId)).reduce((t, a) => {
      const s = a.start_date && a.start_date > first ? a.start_date : first, e = a.end_date && a.end_date < last ? a.end_date : last;
      if (a.start_date && a.start_date > last) return t; if (e < s) return t;
      if (a.status === 'Ended' && !a.end_date) return t;
      const n = (new Date(e) - new Date(s)) / 864e5 + 1; return t + weekly(a) / 7 * n;
    }, 0);
  }
  function occupancy(siteId, d) {
    d = d || today();
    const cap = CAP.filter((c) => !siteId || c.site_id === siteId), sites = SITES.filter((s) => s.status === 'Open').map((s) => s.id);
    const capN = cap.filter((c) => sites.includes(c.site_id)).reduce((t, c) => t + (+c.spaces || 0), 0);
    const used = AG.filter((a) => live(a, d) && (!siteId || a.site_id === siteId) && sites.includes(a.site_id)).reduce((t, a) => t + (+a.spaces || 0), 0);
    return { cap: capN, used, pct: capN ? Math.min(100, used / capN * 100) : null };
  }
  X.parking = { load, monthRevenue, occupancy, weekly, live, data: () => ({ SITES, CAP, AG }) };   // used by the forecast and board pack

  X.routes['p-parking'] = async function (el) {
    el.innerHTML = X.head('Parking', 'Sites, spaces and parking agreements') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Parking', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    draw(el);
  };

  function draw(el) {
    const t = today(), sid = SITE === 'all' ? null : +SITE, o = occupancy(sid), in60 = addDays(t, 60);
    const ags = AG.filter((a) => !sid || a.site_id === sid), act = ags.filter((a) => live(a, t));
    const wk = act.reduce((x, a) => x + weekly(a), 0), wait = ags.filter((a) => a.status === 'Waiting list');
    const ending = act.filter((a) => a.end_date && a.end_date <= in60 || a.status === 'On notice');
    const ym = t.slice(0, 7), months = Array.from({ length: 12 }, (_, i) => ymAdd(ym, i - 2));
    const siteName = (id) => (SITES.find((s) => s.id === id) || {}).name || '';

    el.innerHTML = X.head('Parking', 'Charged per space per week. Monthly figures are weekly × 52 ÷ 12, or pro rata by day for part months. <a href="#/p-parkmap">Open the parking map →</a>') +
      `<div class="form" style="margin-bottom:12px"><label>Site <select id="pk_site"><option value="all">All sites</option>${SITES.map((s) => `<option value="${s.id}" ${String(s.id) === SITE ? 'selected' : ''}>${esc(s.name)}${s.status !== 'Open' ? ' (' + esc(s.status.toLowerCase()) + ')' : ''}</option>`).join('')}</select></label></div>` +
      X.tiles([
        { l: 'Occupancy', v: o.pct == null ? '–' : o.pct.toFixed(0) + '%', s: o.used + ' of ' + o.cap + ' spaces let (open sites)', c: o.pct != null && o.pct < 70 ? 'o' : '' },
        { l: 'Weekly parking revenue', v: gbp(wk), s: act.length + ' active agreements' },
        { l: 'Monthly run rate', v: gbp(wk * 52 / 12), s: 'a year ' + gbp(wk * 52) },
        { l: 'This month (pro rata)', v: gbp(monthRevenue(ym, sid)), s: new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long' }) },
        { l: 'Waiting list', v: wait.length, s: wait.reduce((x, a) => x + (+a.spaces || 0), 0) + ' spaces wanted' },
        { l: 'Ending or on notice', v: ending.length, s: 'in the next 60 days', c: ending.length ? 'o' : '' }]) +

      `<div class="card"><h3>Agreements</h3><div class="hint">One line per customer agreement. Rate is per space per week. Waiting-list entries don't count towards revenue.</div>
       <div style="margin:8px 0"><button class="pri2" id="pk_new">+ New agreement</button></div><div id="pk_form"></div>
       <table><thead><tr><th>Customer</th><th>Site</th><th>Type</th><th class="n">Spaces</th><th class="n">£/space/wk</th><th class="n">£/week</th><th>Start</th><th>End</th><th>Notice</th><th>Status</th><th>Invoiced in</th><th></th></tr></thead><tbody>
       ${ags.length ? ags.sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || String(a.customer).localeCompare(b.customer)).map((a) => `<tr${a.status === 'Ended' ? ' class="muted"' : ''}><td>${esc(a.customer)}${a.contact_name ? `<div class="small muted">${esc(a.contact_name)}${a.contact_phone ? ' · ' + esc(a.contact_phone) : ''}</div>` : ''}</td><td>${esc(siteName(a.site_id))}</td><td>${esc(a.kind)}</td><td class="n">${a.spaces}</td><td class="n">${gbp(a.weekly_rate)}</td><td class="n">${gbp(weekly(a))}</td><td>${fd(a.start_date)}</td><td>${fd(a.end_date)}</td><td>${a.notice_weeks != null ? a.notice_weeks + ' wk' : ''}</td><td>${esc(a.status)}</td><td>${esc(a.invoiced_in || '')}</td><td><a href="#" data-ed="${a.id}">Edit</a></td></tr>`).join('') : '<tr><td colspan="12" class="muted">No agreements yet – add the first one above.</td></tr>'}
       </tbody></table></div>` +

      `<div class="grid2"><div class="card"><h3>Sites and spaces</h3><div class="hint">Set how many spaces of each type each site has and the list rate. Planned sites don't count towards occupancy until set to Open.</div>
       ${SITES.map((s) => { const caps = CAP.filter((c) => c.site_id === s.id); return `<div class="box2" style="margin:10px 0;padding:10px">
         <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(s.name)}</b><span class="small muted">${esc(s.location || '')}</span>
         <select data-sst="${s.id}">${['Open', 'Planned', 'Closed'].map((v) => `<option ${v === s.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
         <table><thead><tr><th>Type</th><th class="n">Spaces</th><th class="n">List £/wk</th><th class="n">Let</th><th class="n">Occupancy</th><th></th></tr></thead><tbody>
         ${caps.map((c) => { const used = AG.filter((a) => a.site_id === s.id && a.kind === c.kind && live(a, t)).reduce((x, a) => x + (+a.spaces || 0), 0);
           return `<tr><td>${esc(c.kind)}</td><td class="n"><input type="number" min="0" style="width:70px" value="${c.spaces}" data-cs="${c.id}"></td><td class="n"><input type="number" min="0" step="0.01" style="width:80px" value="${c.list_rate ?? ''}" data-cr="${c.id}"></td><td class="n">${used}</td><td class="n">${c.spaces ? Math.round(used / c.spaces * 100) + '%' : '–'}</td><td><a href="#" data-cdel="${c.id}">Remove</a></td></tr>`; }).join('')}
         </tbody></table>
         <div class="form" style="margin-top:6px"><select id="ck_${s.id}">${KINDS.filter((k) => !caps.some((c) => c.kind === k)).map((k) => `<option>${k}</option>`).join('')}</select> <button data-cadd="${s.id}">+ Add space type</button></div></div>`; }).join('')}
       <div class="form"><input id="ns_name" placeholder="New site name"> <input id="ns_loc" placeholder="Location"> <button id="ns_add">+ Add site</button></div></div>

       <div class="card"><h3>Revenue by month</h3><div class="hint">From the agreements, pro rata by day. Future months assume agreements run to their end date.</div>
       <table><thead><tr><th>Month</th>${SITES.map((s) => `<th class="n">${esc(s.name)}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>
       ${months.map((m) => { const per = SITES.map((s) => monthRevenue(m, s.id)); return `<tr${m === ym ? ' style="font-weight:600"' : ''}><td>${new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>${per.map((v) => `<td class="n">${v ? gbp(v) : '–'}</td>`).join('')}<td class="n">${gbp(per.reduce((a, b) => a + b, 0))}</td></tr>`; }).join('')}
       </tbody></table></div></div>`;

    $('pk_site').onchange = (e) => { SITE = e.target.value; draw(el); };
    $('pk_new').onclick = () => form(el, null);
    el.querySelectorAll('[data-ed]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); form(el, AG.find((x) => x.id === +a.dataset.ed)); }));
    const save = async (path, body) => { try { await api(path, { method: 'PATCH', body: JSON.stringify(body) }); await load(); draw(el); } catch (e) { alertBox(e); } };
    el.querySelectorAll('[data-sst]').forEach((s) => (s.onchange = () => save('park_sites?id=eq.' + s.dataset.sst, { status: s.value })));
    el.querySelectorAll('[data-cs]').forEach((i) => (i.onchange = () => save('park_capacity?id=eq.' + i.dataset.cs, { spaces: +i.value || 0 })));
    el.querySelectorAll('[data-cr]').forEach((i) => (i.onchange = () => save('park_capacity?id=eq.' + i.dataset.cr, { list_rate: i.value === '' ? null : +i.value })));
    el.querySelectorAll('[data-cdel]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); await api('park_capacity?id=eq.' + a.dataset.cdel, { method: 'DELETE' }); await load(); draw(el); }));
    el.querySelectorAll('[data-cadd]').forEach((b) => (b.onclick = async () => { const k = $('ck_' + b.dataset.cadd).value; if (!k) return; await api('park_capacity', { method: 'POST', body: JSON.stringify({ site_id: +b.dataset.cadd, kind: k, spaces: 0 }) }); await load(); draw(el); }));
    $('ns_add').onclick = async () => { const n = $('ns_name').value.trim(); if (!n) return; try { await api('park_sites', { method: 'POST', body: JSON.stringify({ name: n, location: $('ns_loc').value.trim() || null, status: 'Planned' }) }); await load(); draw(el); } catch (e) { alertBox(e); } };
  }
  function alertBox(e) { const h = document.querySelector('.hint'); if (h) h.textContent = 'Could not save: ' + e.message; }

  function form(el, a) {
    const v = a || { site_id: SITE === 'all' ? (SITES[0] || {}).id : +SITE, kind: 'HGV', spaces: 1, status: 'Active', notice_weeks: 4, invoiced_in: 'MCS', start_date: today() };
    const f = (k) => esc(v[k] ?? '');
    $('pk_form').innerHTML = `<div class="box2" style="padding:12px;margin-bottom:12px"><div class="form" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
      <label>Customer<input id="pf_customer" value="${f('customer')}"></label>
      <label>Site<select id="pf_site_id">${SITES.map((s) => `<option value="${s.id}" ${s.id === v.site_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Space type<select id="pf_kind">${KINDS.map((k) => `<option ${k === v.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Status<select id="pf_status">${STATUS.map((k) => `<option ${k === v.status ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Spaces<input id="pf_spaces" type="number" min="1" value="${f('spaces')}"></label>
      <label>£ per space per week<input id="pf_weekly_rate" type="number" step="0.01" min="0" value="${f('weekly_rate')}"></label>
      <label>Start<input id="pf_start_date" type="date" value="${f('start_date')}"></label>
      <label>End (blank = rolling)<input id="pf_end_date" type="date" value="${f('end_date')}"></label>
      <label>Notice (weeks)<input id="pf_notice_weeks" type="number" min="0" value="${f('notice_weeks')}"></label>
      <label>Invoiced in<select id="pf_invoiced_in">${INV.map((k) => `<option ${k === v.invoiced_in ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Contact<input id="pf_contact_name" value="${f('contact_name')}"></label>
      <label>Phone<input id="pf_contact_phone" value="${f('contact_phone')}"></label>
      <label>Email<input id="pf_contact_email" value="${f('contact_email')}"></label>
      <label style="grid-column:span 3">Notes<input id="pf_notes" value="${f('notes')}"></label></div>
      <div style="margin-top:8px;display:flex;gap:8px"><button class="pri2" id="pf_save">Save</button><button id="pf_cancel">Cancel</button>${a ? '<button id="pf_del" style="margin-left:auto">Delete</button>' : ''}<span id="pf_msg" class="small muted"></span></div></div>`;
    $('pf_cancel').onclick = () => ($('pk_form').innerHTML = '');
    $('pf_save').onclick = async () => {
      const g = (k) => $('pf_' + k).value.trim(), body = { customer: g('customer'), site_id: +g('site_id'), kind: g('kind'), status: g('status'), spaces: +g('spaces') || 1, weekly_rate: +g('weekly_rate') || 0,
        start_date: g('start_date') || null, end_date: g('end_date') || null, notice_weeks: g('notice_weeks') === '' ? null : +g('notice_weeks'), invoiced_in: g('invoiced_in'),
        contact_name: g('contact_name') || null, contact_phone: g('contact_phone') || null, contact_email: g('contact_email') || null, notes: g('notes') || null, updated_at: new Date().toISOString() };
      if (!body.customer) { $('pf_msg').textContent = 'Add a customer name.'; return; }
      try { await api(a ? 'park_agreements?id=eq.' + a.id : 'park_agreements', { method: a ? 'PATCH' : 'POST', body: JSON.stringify(body) }); await load(); draw(el); }
      catch (e) { $('pf_msg').textContent = 'Could not save: ' + e.message; }
    };
    if (a) $('pf_del').onclick = async () => { if ($('pf_del').dataset.sure) { await api('park_agreements?id=eq.' + a.id, { method: 'DELETE' }); await load(); draw(el); } else { $('pf_del').dataset.sure = 1; $('pf_del').textContent = 'Click again to delete'; } };
    $('pf_customer').focus();
  }
})();
