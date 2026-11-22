/* FLEET REGISTER – every unit and every category in one place, with add / edit / remove (archive).
   Quotes pick categories, standard rates and available units from here. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const STATUS = ['Available', 'On hire', 'Workshop', 'Reserved', 'For sale', 'On order'];
  const REMOVE = ['Sold', 'Scrapped / disposed', 'Moved off fleet', 'Entered in error'];
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  let CATS = [], UNITS = [], CON = [], TAB = 'units', F = { cat: '', status: '', q: '', removed: false }, EDIT = null;

  async function load() {
    [CATS, UNITS, CON] = await Promise.all([all('asset_categories', 'sort.asc,name.asc'), all('assets', 'unit.asc'), api('contracts?select=unit,customer,monthly_rate,start_date,end_date,rolling&active=is.true')]);
  }
  const cat = (id) => CATS.find((c) => c.id === id) || {};
  const con = (u) => CON.find((c) => norm(c.unit) === norm(u.unit));
  const stdRate = (u) => (u.weekly_rate != null ? +u.weekly_rate : cat(u.category_id).default_weekly_rate != null ? +cat(u.category_id).default_weekly_rate : null);
  const status = (u) => (u.active === false ? 'Removed' : con(u) ? 'On hire' : u.status === 'On hire' ? 'Available' : u.status);   // live contracts decide "On hire"
  X.fleetReg = { load, cats: () => CATS, units: () => UNITS.filter((u) => u.active !== false), status, stdRate, cat, con };

  X.routes['p-register'] = async function (el) {
    el.innerHTML = X.head('Fleet register', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Fleet register', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    draw(el);
  };

  function draw(el) {
    const live = UNITS.filter((u) => u.active !== false), n = (s) => live.filter((u) => status(u) === s).length;
    el.innerHTML = X.head('Fleet register', 'Every unit and category. “On hire” comes from live contracts; quotes use the standard rates and available units from here.') +
      X.tiles([{ l: 'Units', v: live.length, s: CATS.filter((c) => c.active !== false).length + ' categories' },
        { l: 'On hire', v: n('On hire'), s: live.length ? Math.round(n('On hire') / live.length * 100) + '% of the fleet' : '' },
        { l: 'Available', v: n('Available'), s: 'ready to quote', c: '' },
        { l: 'Workshop / reserved', v: n('Workshop') + n('Reserved'), s: n('For sale') + ' for sale · ' + n('On order') + ' on order' }]) +
      `<div class="card"><div style="display:flex;gap:8px;margin-bottom:10px">${[['units', 'Units'], ['cats', 'Categories']].map(([k, t]) => `<button class="${TAB === k ? 'pri2' : ''}" data-tab="${k}">${t}</button>`).join('')}</div><div id="fr_body"></div></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { TAB = b.dataset.tab; EDIT = null; draw(el); }));
    (TAB === 'units' ? units : cats)($('fr_body'), el);
  }

  // ---------------- units ----------------
  function units(box, el) {
    const q = F.q.toLowerCase();
    const rows = UNITS.filter((u) => (F.removed ? u.active === false : u.active !== false) && (!F.cat || String(u.category_id) === F.cat) && (!F.status || status(u) === F.status)
      && (!q || [u.unit, u.reg, u.make, u.model, u.location, (con(u) || {}).customer, cat(u.category_id).name].join(' ').toLowerCase().includes(q)));
    box.innerHTML = `<div class="form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:10px">
        <label>Category <select id="fr_c"><option value="">All</option>${CATS.map((c) => `<option value="${c.id}" ${String(c.id) === F.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Status <select id="fr_s"><option value="">All</option>${STATUS.map((s) => `<option ${s === F.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Search <input id="fr_q" value="${esc(F.q)}" placeholder="Unit, reg, customer…"></label>
        <label class="small" style="align-self:center"><input type="checkbox" id="fr_r" ${F.removed ? 'checked' : ''}> Show removed units</label>
        <button class="pri2" id="fr_add" style="margin-left:auto">+ Add unit</button></div><div id="fr_form"></div>
      <div class="small muted" style="margin-bottom:6px">${rows.length} units</div>
      <table><thead><tr><th>Unit</th><th>Category</th><th>Status</th><th>Customer</th><th class="n">On-hire £/wk</th><th class="n">Standard £/wk</th><th>Location</th><th></th></tr></thead><tbody>
      ${rows.map((u) => { const c = con(u), st = status(u);
        return `<tr><td><b>${esc(u.unit)}</b>${u.reg && u.reg !== u.unit ? `<div class="small muted">${esc(u.reg)}</div>` : ''}${u.make || u.model ? `<div class="small muted">${esc([u.make, u.model, u.year].filter(Boolean).join(' '))}</div>` : ''}</td>
          <td>${esc(cat(u.category_id).name || '–')}</td><td><span style="color:${st === 'On hire' ? '#164698' : st === 'Available' ? '#16A34A' : st === 'Removed' ? '#94A3B8' : '#B45309'};font-weight:600">${esc(st)}</span>${u.removed_reason ? `<div class="small muted">${esc(u.removed_reason)} ${u.removed_at ? new Date(u.removed_at).toLocaleDateString('en-GB') : ''}</div>` : ''}</td>
          <td>${c ? esc(c.customer) : ''}</td><td class="n">${c ? gbp(c.monthly_rate * 12 / 52) : ''}</td><td class="n">${stdRate(u) != null ? gbp(stdRate(u)) : '<span class="muted">–</span>'}</td><td>${esc(u.location || '')}</td>
          <td><a href="#" data-ed="${u.id}">Edit</a></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">No units match.</td></tr>'}</tbody></table>`;
    $('fr_c').onchange = (e) => { F.cat = e.target.value; units(box, el); };
    $('fr_s').onchange = (e) => { F.status = e.target.value; units(box, el); };
    $('fr_q').oninput = (e) => { F.q = e.target.value; const pos = e.target.selectionStart; units(box, el); const i = $('fr_q'); i.focus(); i.setSelectionRange(pos, pos); };
    $('fr_r').onchange = (e) => { F.removed = e.target.checked; units(box, el); };
    $('fr_add').onclick = () => unitForm(null, box, el);
    box.querySelectorAll('[data-ed]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); unitForm(UNITS.find((u) => u.id === +a.dataset.ed), box, el); }));
  }

  function unitForm(u, box, el) {
    const v = u || { status: 'Available', category_id: F.cat ? +F.cat : (CATS[0] || {}).id }, f = (k) => esc(v[k] ?? ''), removed = u && u.active === false;
    $('fr_form').innerHTML = `<div class="box2" style="padding:12px;margin-bottom:12px"><h3 style="margin-top:0">${u ? 'Edit ' + esc(u.unit) : 'Add a unit'}</h3>
      <div class="form" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
      <label>Unit / fleet no.<input id="fu_unit" value="${f('unit')}"></label><label>Registration<input id="fu_reg" value="${f('reg')}"></label>
      <label>Category<select id="fu_cat">${CATS.map((c) => `<option value="${c.id}" ${c.id === v.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Status<select id="fu_status">${STATUS.map((s) => `<option ${s === v.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Make<input id="fu_make" value="${f('make')}"></label><label>Model<input id="fu_model" value="${f('model')}"></label>
      <label>Year<input id="fu_year" type="number" value="${f('year')}"></label><label>Capacity<input id="fu_capacity" value="${f('capacity')}" placeholder="e.g. 38,000 L, 5 compartments"></label>
      <label>Location<input id="fu_location" value="${f('location')}"></label><label>Standard £/wk (blank = category rate)<input id="fu_rate" type="number" step="0.01" value="${f('weekly_rate')}"></label>
      <label style="grid-column:span 2">Spec / notes<input id="fu_notes" value="${f('notes')}"></label></div>
      ${u && con(u) ? `<div class="small muted" style="margin-top:6px">On hire to ${esc(con(u).customer)} – status shows “On hire” while the contract is live.</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="pri2" id="fu_save">Save</button><button id="fu_x">Cancel</button>
      ${u ? (removed ? '<button id="fu_restore">Put back on the fleet</button>' : `<span style="margin-left:auto" class="small">Remove from fleet: <select id="fu_why">${REMOVE.map((r) => `<option>${r}</option>`).join('')}</select> <input id="fu_when" type="date" value="${new Date().toISOString().slice(0, 10)}"> <button id="fu_rm" style="border-color:#DC2626;color:#B91C1C">Remove</button></span>`) : ''}
      <span id="fu_msg" class="small muted"></span></div></div>`;
    $('fu_x').onclick = () => ($('fr_form').innerHTML = '');
    const done = async () => { await load(); draw(el); };
    $('fu_save').onclick = async () => {
      const g = (k) => $('fu_' + k).value.trim(), body = { unit: g('unit'), reg: g('reg') || null, category_id: +g('cat'), status: g('status'), make: g('make') || null, model: g('model') || null, year: g('year') ? +g('year') : null,
        capacity: g('capacity') || null, location: g('location') || null, weekly_rate: g('rate') === '' ? null : +g('rate'), notes: g('notes') || null, updated_at: new Date().toISOString() };
      if (!body.unit) { $('fu_msg').textContent = 'Give the unit a fleet number.'; return; }
      if (!u && UNITS.some((x) => norm(x.unit) === norm(body.unit))) { $('fu_msg').textContent = body.unit + ' is already on the register.'; return; }
      try { await api(u ? 'assets?id=eq.' + u.id : 'assets', { method: u ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); await done(); }
      catch (e) { $('fu_msg').textContent = 'Could not save: ' + e.message; } };
    if ($('fu_rm')) $('fu_rm').onclick = async () => { if (con(u) && !confirm(u.unit + ' is on hire to ' + con(u).customer + '. Remove it from the fleet anyway?')) return;
      await api('assets?id=eq.' + u.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false, removed_reason: $('fu_why').value, removed_at: $('fu_when').value || null, updated_at: new Date().toISOString() }) }); await done(); };
    if ($('fu_restore')) $('fu_restore').onclick = async () => { await api('assets?id=eq.' + u.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: true, removed_reason: null, removed_at: null, updated_at: new Date().toISOString() }) }); await done(); };
    $('fu_unit').focus();
  }

  // ---------------- categories ----------------
  function cats(box, el) {
    const live = UNITS.filter((u) => u.active !== false);
    box.innerHTML = `<div style="margin-bottom:10px;display:flex;gap:8px"><button class="pri2" id="fc_add">+ Add category</button><span class="small muted" style="align-self:center">Standard rate is what quotes start from – you can change it on each quote.</span></div><div id="fc_form"></div>
      <table><thead><tr><th>Category</th><th>Sector</th><th class="n">Units</th><th class="n">On hire</th><th class="n">Available</th><th class="n">Standard £/wk</th><th class="n">Min term (months)</th><th>Spec</th><th></th></tr></thead><tbody>
      ${CATS.map((c) => { const us = live.filter((u) => u.category_id === c.id);
        return `<tr${c.active === false ? ' class="muted"' : ''}><td><b>${esc(c.name)}</b></td><td>${esc(c.sector || '')}</td><td class="n">${us.length}</td><td class="n">${us.filter((u) => status(u) === 'On hire').length}</td><td class="n">${us.filter((u) => status(u) === 'Available').length}</td>
          <td class="n"><input type="number" step="1" data-rate="${c.id}" value="${c.default_weekly_rate ?? ''}" style="width:90px" placeholder="set"></td><td class="n">${c.min_term_months ?? ''}</td><td class="small">${esc(c.spec || '')}</td><td><a href="#" data-ce="${c.id}">Edit</a></td></tr>`; }).join('')}</tbody></table>`;
    $('fc_add').onclick = () => catForm(null, el);
    box.querySelectorAll('[data-ce]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); catForm(CATS.find((c) => c.id === +a.dataset.ce), el); }));
    box.querySelectorAll('[data-rate]').forEach((i) => (i.onchange = async () => { await api('asset_categories?id=eq.' + i.dataset.rate, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ default_weekly_rate: i.value === '' ? null : +i.value, updated_at: new Date().toISOString() }) }); const c = CATS.find((x) => x.id === +i.dataset.rate); c.default_weekly_rate = i.value === '' ? null : +i.value; }));
  }
  function catForm(c, el) {
    const v = c || {}, f = (k) => esc(v[k] ?? ''), used = c ? UNITS.filter((u) => u.category_id === c.id).length : 0;
    $('fc_form').innerHTML = `<div class="box2" style="padding:12px;margin-bottom:12px"><h3 style="margin-top:0">${c ? 'Edit ' + esc(c.name) : 'Add a category'}</h3><div class="form" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
      <label style="grid-column:span 2">Name<input id="fk_name" value="${f('name')}" placeholder="e.g. Waste – artic (aux engine)"></label><label>Sector<input id="fk_sector" value="${f('sector')}" placeholder="Petroleum, Waste…"></label>
      <label>Standard £/wk<input id="fk_rate" type="number" step="0.01" value="${f('default_weekly_rate')}"></label><label>Min term (months)<input id="fk_min" type="number" value="${f('min_term_months')}"></label>
      <label style="grid-column:span 3">Spec (shown on quotes)<input id="fk_spec" value="${f('spec')}" placeholder="e.g. 38,000 L aluminium, 5 compartments, API couplings"></label></div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="pri2" id="fk_save">Save</button><button id="fk_x">Cancel</button>
      ${c ? (used ? `<span class="small muted" style="margin-left:auto">${used} units use this category – move them first to delete it, or hide it:</span><button id="fk_hide">${c.active === false ? 'Show again' : 'Hide'}</button>` : '<button id="fk_del" style="margin-left:auto;border-color:#DC2626;color:#B91C1C">Delete category</button>') : ''}<span id="fk_msg" class="small muted"></span></div></div>`;
    const done = async () => { await load(); draw(el); };
    $('fk_x').onclick = () => ($('fc_form').innerHTML = '');
    $('fk_save').onclick = async () => { const g = (k) => $('fk_' + k).value.trim(), body = { name: g('name'), sector: g('sector') || null, default_weekly_rate: g('rate') === '' ? null : +g('rate'), min_term_months: g('min') ? +g('min') : null, spec: g('spec') || null, updated_at: new Date().toISOString() };
      if (!body.name) { $('fk_msg').textContent = 'Give it a name.'; return; }
      try { await api(c ? 'asset_categories?id=eq.' + c.id : 'asset_categories', { method: c ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); await done(); } catch (e) { $('fk_msg').textContent = 'Could not save: ' + e.message; } };
    if ($('fk_del')) $('fk_del').onclick = async () => { if (!confirm('Delete the category ' + c.name + '?')) return; await api('asset_categories?id=eq.' + c.id, { method: 'DELETE' }); await done(); };
    if ($('fk_hide')) $('fk_hide').onclick = async () => { await api('asset_categories?id=eq.' + c.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: c.active === false }) }); await done(); };
  }
})();
