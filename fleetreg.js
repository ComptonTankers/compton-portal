/* FLEET REGISTER – every unit and every category in one place, with add / edit / remove (archive).
   Quotes pick categories, standard rates and available units from here. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const STATUS = ['Available', 'On hire', 'Workshop', 'Reserved', 'For sale', 'On order'];
  const REMOVE = ['Sold', 'Scrapped / disposed', 'Moved off fleet', 'Entered in error'];
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  let CATS = [], UNITS = [], CON = [], BK = [], TAB = 'units', F = { div: '', cat: '', status: '', q: '', removed: false }, EDIT = null;
  const DIVS = ['Waste & industrial', 'Energy', 'Other assets'], DCOL = { 'Waste & industrial': '#E4611D', Energy: '#164698', 'Other assets': '#64748B' };

  async function load() {
    [CATS, UNITS, CON] = await Promise.all([all('asset_categories', 'sort.asc,name.asc'), all('assets', 'unit.asc'), api('contracts?select=id,unit,customer,monthly_rate,start_date,end_date,rolling,notice_days&active=is.true')]);
    try { BK = await api('hire_bookings?select=*&status=neq.Cancelled&order=start_date.asc'); } catch (e) { BK = []; }
  }
  const cat = (id) => CATS.find((c) => c.id === id) || {};
  const con = (u) => CON.find((c) => norm(c.unit) === norm(u.unit));
  const stdRate = (u) => (u.weekly_rate != null ? +u.weekly_rate : cat(u.category_id).default_weekly_rate != null ? +cat(u.category_id).default_weekly_rate : null);
  const today = () => new Date().toISOString().slice(0, 10);
  const bookings = (u) => BK.filter((b) => norm(b.unit) === norm(u.unit) && (!b.end_date || b.end_date >= today()));
  const onHireBk = (u) => bookings(u).find((b) => b.status === 'On hire');
  const nextBk = (u) => bookings(u).find((b) => b.status === 'Booked');
  const status = (u) => (u.active === false ? 'Removed' : con(u) || onHireBk(u) ? 'On hire' : nextBk(u) && nextBk(u).start_date <= today() ? 'Booked' : u.status === 'On hire' ? 'Available' : u.status);   // live contracts decide "On hire"
  const division = (u) => u.division || cat(u.category_id).division || 'Other assets';
  const forHire = (u) => cat(u.category_id).for_hire !== false;
  const serials = (u) => [['VIN', u.chassis_no], ['Tank', u.tank_serial], ['S/N', u.serial_no]].filter(([, x]) => x);
  // the full product description used on quotes and hire agreements
  const fullDesc = (u) => { const c = cat(u.category_id); return { title: u.description || c.name || u.unit, lines: [[u.make, u.model].filter(Boolean).join(' '), u.capacity, u.spec, c.spec].filter(Boolean),
    long: u.long_description || c.long_description || '', year: u.year, condition: u.condition, chassis: u.chassis_no, tank: u.tank_serial, reg: u.reg && u.reg !== u.unit ? u.reg : '', value: u.replacement_value, catDesc: c.description }; };
  X.fleetReg = { DIVS, division, forHire, serials, load, cats: () => CATS, units: () => UNITS.filter((u) => u.active !== false), status, stdRate, cat, con, bookings, nextBk, onHireBk, allBookings: () => BK, contracts: () => CON, fullDesc, norm };

  X.routes['p-register'] = async function (el) {
    el.innerHTML = X.head('Fleet register', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Fleet register', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    draw(el);
  };

  function draw(el) {
    const live = UNITS.filter((u) => u.active !== false), n = (s) => live.filter((u) => status(u) === s).length;
    const divTile = (d) => { const us = live.filter((u) => division(u) === d), hire = us.filter((u) => forHire(u)), on = hire.filter((u) => status(u) === 'On hire').length;
      return { l: '<span style="color:' + DCOL[d] + '">●</span> ' + d, v: us.length + ' units', s: hire.length ? on + ' on hire · ' + Math.round(on / hire.length * 100) + '% utilised · ' + hire.filter((u) => status(u) === 'Available').length + ' available' : 'not hire fleet' }; };
    el.innerHTML = X.head('Fleet register', 'Every unit and category. “On hire” comes from live contracts; quotes use the standard rates and available units from here.') +
      X.tiles([...DIVS.map(divTile), { l: 'Workshop / reserved', v: n('Workshop') + n('Reserved'), s: n('For sale') + ' for sale · ' + n('On order') + ' on order' }]) +
      `<div class="card"><div style="display:flex;gap:8px;margin-bottom:10px">${[['units', 'Units'], ['cats', 'Categories']].map(([k, t]) => `<button class="${TAB === k ? 'pri2' : ''}" data-tab="${k}">${t}</button>`).join('')}</div><div id="fr_body"></div></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { TAB = b.dataset.tab; EDIT = null; draw(el); }));
    (TAB === 'units' ? units : cats)($('fr_body'), el);
  }

  // ---------------- units ----------------
  function units(box, el) {
    const q = F.q.toLowerCase();
    const rows = UNITS.filter((u) => (F.removed ? u.active === false : u.active !== false) && (!F.div || division(u) === F.div) && (!F.cat || String(u.category_id) === F.cat) && (!F.status || status(u) === F.status)
      && (!q || [u.unit, u.reg, u.make, u.model, u.location, (con(u) || {}).customer, cat(u.category_id).name, u.serial_no, u.chassis_no, u.tank_serial].join(' ').toLowerCase().includes(q) || [u.serial_no, u.chassis_no, u.tank_serial].some((x) => x && norm(x).includes(norm(q)))));
    box.innerHTML = `<div class="form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:10px">
        <label>Division <select id="fr_d"><option value="">All</option>${DIVS.map((d) => `<option ${d === F.div ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Category <select id="fr_c"><option value="">All</option>${CATS.filter((c) => !F.div || (c.division || 'Other assets') === F.div).map((c) => `<option value="${c.id}" ${String(c.id) === F.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Status <select id="fr_s"><option value="">All</option>${['Available', 'Booked', ...STATUS.slice(1)].map((s) => `<option ${s === F.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Search <input id="fr_q" value="${esc(F.q)}" placeholder="Unit, reg, serial no., customer…"></label>
        <label class="small" style="align-self:center"><input type="checkbox" id="fr_r" ${F.removed ? 'checked' : ''}> Show removed units</label>
        <button class="pri2" id="fr_add" style="margin-left:auto">+ Add unit</button></div><div id="fr_form"></div>
      <div class="small muted" style="margin-bottom:6px">${rows.length} units</div>
      <table><thead><tr><th>Unit</th><th>Division / category</th><th>Serial numbers</th><th>Status</th><th>Customer</th><th class="n">On-hire £/wk</th><th class="n">Standard £/wk</th><th></th></tr></thead><tbody>
      ${rows.map((u) => { const c = con(u), st = status(u);
        return `<tr><td><b>${esc(u.unit)}</b>${u.reg && u.reg !== u.unit ? `<div class="small muted">${esc(u.reg)}</div>` : ''}${u.make || u.model ? `<div class="small muted">${esc([u.make, u.model, u.year].filter(Boolean).join(' '))}</div>` : ''}</td>
          <td><span class="small" style="color:${DCOL[division(u)]};font-weight:600">${esc(division(u))}</span><br>${esc(cat(u.category_id).name || '–')}</td>
          <td class="small">${serials(u).map(([k, x]) => `<div><span class="muted">${k}</span> ${esc(x)}</div>`).join('') || '<span class="muted">none recorded</span>'}</td><td><span style="color:${st === 'On hire' ? '#164698' : st === 'Available' ? '#16A34A' : st === 'Removed' ? '#94A3B8' : st === 'Booked' ? '#7C3AED' : '#B45309'};font-weight:600">${esc(st)}</span>${u.removed_reason ? `<div class="small muted">${esc(u.removed_reason)} ${u.removed_at ? new Date(u.removed_at).toLocaleDateString('en-GB') : ''}</div>` : ''}</td>
          <td>${c ? esc(c.customer) : ''}</td><td class="n">${c ? gbp(c.monthly_rate * 12 / 52) : ''}</td><td class="n">${stdRate(u) != null ? gbp(stdRate(u)) : '<span class="muted">–</span>'}${u.location ? `<div class="small muted">${esc(u.location)}</div>` : ''}</td>
          <td><a href="#" data-ed="${u.id}">Edit</a></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">No units match.</td></tr>'}</tbody></table>`;
    $('fr_d').onchange = (e) => { F.div = e.target.value; if (F.cat && cat(+F.cat).division !== F.div && F.div) F.cat = ''; units(box, el); };
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
      <label>Category<select id="fu_cat">${DIVS.map((d) => `<optgroup label="${d}">${CATS.filter((c) => (c.division || 'Other assets') === d).map((c) => `<option value="${c.id}" ${c.id === v.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Status<select id="fu_status">${STATUS.map((s) => `<option ${s === v.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Make<input id="fu_make" value="${f('make')}"></label><label>Model<input id="fu_model" value="${f('model')}"></label>
      <label>Year<input id="fu_year" type="number" value="${f('year')}"></label><label>Capacity<input id="fu_capacity" value="${f('capacity')}" placeholder="e.g. 38,000 L, 5 compartments"></label>
      <label>Location<input id="fu_location" value="${f('location')}"></label><label>Standard £/wk (blank = category rate)<input id="fu_rate" type="number" step="0.01" value="${f('weekly_rate')}"></label>
      <label style="grid-column:span 2">Full description (shown on quotes and hire agreements)<input id="fu_description" value="${f('description')}" placeholder="e.g. 18t Whale gully tanker, 9,000 L sludge / 4,000 L water"></label>
      <label style="grid-column:span 2">Key specification<input id="fu_spec" value="${f('spec')}" placeholder="Compartments, volume, axles, pump, ADR…"></label>
      <label style="grid-column:1/-1">Long description – shown in full on hire agreements and quotes<textarea id="fu_long_description" rows="4" placeholder="e.g. 26T Kilowhale jetvac on a Volvo FE320 6x2 day cab. 4500L waste and 7250L clean water. Samson 1450cfm liquid ring and Orca 500R 220L/m at 138 bar…">${f('long_description')}</textarea><span class="small muted">Leave blank to use the category's long description.</span></label>
      <label>Condition<select id="fu_condition">${['', 'New', 'Excellent used', 'Good used', 'Fair used'].map((c) => `<option ${c === (v.condition || '') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Division<select id="fu_division"><option value="">From category${v.category_id ? ' (' + esc(cat(v.category_id).division || '') + ')' : ''}</option>${DIVS.map((d) => `<option ${d === v.division ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Chassis / VIN<input id="fu_chassis_no" value="${f('chassis_no')}"></label><label>Tank / barrel serial no.<input id="fu_tank_serial" value="${f('tank_serial')}"></label>
      <label>Other serial no. (pump, plant, equipment)<input id="fu_serial_no" value="${f('serial_no')}"></label>
      <label>Full replacement value £<input id="fu_replacement_value" type="number" step="1" value="${f('replacement_value')}"></label>
      <label style="grid-column:span 4">Internal notes<input id="fu_notes" value="${f('notes')}"></label>${sheetFields('fu', v, true)}</div>
      ${u && con(u) ? `<div class="small muted" style="margin-top:6px">On hire to ${esc(con(u).customer)} – status shows “On hire” while the contract is live.</div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="pri2" id="fu_save">Save</button><button id="fu_x">Cancel</button>
      ${u ? (removed ? '<button id="fu_restore">Put back on the fleet</button>' : `<span style="margin-left:auto" class="small">Remove from fleet: <select id="fu_why">${REMOVE.map((r) => `<option>${r}</option>`).join('')}</select> <input id="fu_when" type="date" value="${new Date().toISOString().slice(0, 10)}"> <button id="fu_rm" style="border-color:#DC2626;color:#B91C1C">Remove</button></span>`) : ''}
      <span id="fu_msg" class="small muted"></span></div></div>`;
    $('fu_x').onclick = () => ($('fr_form').innerHTML = '');
    const done = async () => { await load(); draw(el); };
    wirePhoto('fu', 'unit-' + norm((v && v.unit) || 'new'));
    $('fu_save').onclick = async () => {
      const g = (k) => $('fu_' + k).value.trim(), body = { unit: g('unit'), reg: g('reg') || null, category_id: +g('cat'), status: g('status'), make: g('make') || null, model: g('model') || null, year: g('year') ? +g('year') : null,
        capacity: g('capacity') || null, location: g('location') || null, weekly_rate: g('rate') === '' ? null : +g('rate'), notes: g('notes') || null, description: g('description') || null, spec: g('spec') || null, condition: g('condition') || null, chassis_no: g('chassis_no') || null, tank_serial: g('tank_serial') || null, serial_no: g('serial_no') || null, division: g('division') || null, replacement_value: g('replacement_value') === '' ? null : +g('replacement_value'), long_description: $('fu_long_description').value.trim() || null, spec_sections: (() => { const x = parseSpec($('fu_sheet').value); return x.length ? x : null; })(), photo_url: $('fu_photo_url').value || null, updated_at: new Date().toISOString() };
      if (!body.unit) { $('fu_msg').textContent = 'Give the unit a fleet number.'; return; }
      if (!u && UNITS.some((x) => norm(x.unit) === norm(body.unit))) { $('fu_msg').textContent = body.unit + ' is already on the register.'; return; }
      const dup = [['chassis_no', 'chassis / VIN'], ['tank_serial', 'tank serial'], ['serial_no', 'serial no.']].map(([k, t]) => { const x = body[k] && UNITS.find((o) => o.id !== (u && u.id) && [o.chassis_no, o.tank_serial, o.serial_no].some((y) => y && norm(y) === norm(body[k]))); return x ? 'The ' + t + ' ' + body[k] + ' is already recorded on ' + x.unit : ''; }).filter(Boolean);
      if (dup.length && !confirm(dup.join('\n') + '\n\nSave anyway?')) return;
      try { await api(u ? 'assets?id=eq.' + u.id : 'assets', { method: u ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); await done(); }
      catch (e) { $('fu_msg').textContent = 'Could not save: ' + e.message; } };
    if ($('fu_rm')) $('fu_rm').onclick = async () => { if (con(u) && !confirm(u.unit + ' is on hire to ' + con(u).customer + '. Remove it from the fleet anyway?')) return;
      await api('assets?id=eq.' + u.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false, removed_reason: $('fu_why').value, removed_at: $('fu_when').value || null, updated_at: new Date().toISOString() }) });
      // sold or scrapped: record it on the fixed asset register too
      const why = $('fu_why').value, when = $('fu_when').value || new Date().toISOString().slice(0, 10);
      if (X.dispose && X.fa && /Sold|Scrapped/.test(why)) { try { await X.fa.load(); const fa = X.fa.get().assets.find((a) => a.active && !a.disposed_date && norm(a.ref) === norm(u.fa_ref || u.unit));
        if (fa) { await done(); X.dispose.open(fa, done, { date: when, method: why === 'Sold' ? 'Sold' : 'Scrapped' }); return; } } catch (e) {} }
      await done(); };
    if ($('fu_restore')) $('fu_restore').onclick = async () => { await api('assets?id=eq.' + u.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: true, removed_reason: null, removed_at: null, updated_at: new Date().toISOString() }) }); await done(); };
    $('fu_unit').focus();
  }

  // ---------------- categories ----------------
  function cats(box, el) {
    const live = UNITS.filter((u) => u.active !== false);
    box.innerHTML = `<div style="margin-bottom:10px;display:flex;gap:8px"><button class="pri2" id="fc_add">+ Add category</button><span class="small muted" style="align-self:center">Standard rate is what quotes start from – you can change it on each quote.</span></div><div id="fc_form"></div>
      <table><thead><tr><th>Category</th><th>Sector</th><th>Hire fleet</th><th class="n">Units</th><th class="n">On hire</th><th class="n">Available</th><th class="n">Standard £/wk</th><th class="n">Min term (months)</th><th>Spec</th><th></th></tr></thead><tbody>
      ${DIVS.map((d) => `<tr><td colspan="10" style="background:#F1F5F9;font-weight:700;color:${DCOL[d]}">${d} <span class="small muted" style="font-weight:400">· ${live.filter((u) => division(u) === d).length} units</span></td></tr>` + CATS.filter((c) => (c.division || 'Other assets') === d).map((c) => { const us = live.filter((u) => u.category_id === c.id);
        return `<tr${c.active === false ? ' class="muted"' : ''}><td><b>${esc(c.name)}</b></td><td>${esc(c.sector || '')}</td><td>${c.for_hire === false ? '<span class="muted">No</span>' : 'Yes'}</td><td class="n">${us.length}</td><td class="n">${us.filter((u) => status(u) === 'On hire').length}</td><td class="n">${us.filter((u) => status(u) === 'Available').length}</td>
          <td class="n"><input type="number" step="1" data-rate="${c.id}" value="${c.default_weekly_rate ?? ''}" style="width:90px" placeholder="set"></td><td class="n">${c.min_term_months ?? ''}</td><td class="small">${esc(c.spec || '')}</td><td><a href="#" data-ce="${c.id}">Edit</a></td></tr>`; }).join('')).join('')}</tbody></table>`;
    $('fc_add').onclick = () => catForm(null, el);
    box.querySelectorAll('[data-ce]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); catForm(CATS.find((c) => c.id === +a.dataset.ce), el); }));
    box.querySelectorAll('[data-rate]').forEach((i) => (i.onchange = async () => { await api('asset_categories?id=eq.' + i.dataset.rate, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ default_weekly_rate: i.value === '' ? null : +i.value, updated_at: new Date().toISOString() }) }); const c = CATS.find((x) => x.id === +i.dataset.rate); c.default_weekly_rate = i.value === '' ? null : +i.value; }));
  }
  // ---- product sheet: spec boxes written as "Title" lines followed by "- item" lines, plus a photo ----
  const specText = (S) => (S || []).map((x) => x.title + '\n' + (x.items || []).map((i) => '- ' + i).join('\n')).join('\n\n');
  const parseSpec = (t) => { const out = []; String(t || '').split('\n').forEach((l) => { const v = l.trim(); if (!v) return; const m = /^[-•*]\s*(.+)$/.exec(v);
    if (m) { if (!out.length) out.push({ title: 'Key specification', items: [] }); out[out.length - 1].items.push(m[1]); } else out.push({ title: v.replace(/:$/, ''), items: [] }); }); return out.filter((x) => x.items.length); };
  async function uploadPhoto(file, prefix) {
    const ss = await X.session(), cfg = window.SUPABASE_CONFIG, path = prefix + '-' + Date.now() + '.' + ((file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg');
    const r = await fetch(cfg.url + '/storage/v1/object/product/' + path, { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + ss.access_token, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' }, body: file });
    if (!r.ok) throw new Error('Upload failed (' + r.status + ')'); return cfg.url + '/storage/v1/object/public/product/' + path;
  }
  const sheetFields = (pre, v, forUnit) => `<div style="grid-column:1/-1;border-top:1px solid #E3E7EE;margin-top:6px;padding-top:8px"><b>Product sheet</b> <span class="small muted">– shown on quotes, hire agreements and the customer's signing page${forUnit ? '. Leave blank to use the category\'s' : ''}</span></div>
      ${forUnit ? '' : `<label>Code (MCS asset type)<input id="${pre}_code" value="${esc(v.code || '')}" placeholder="e.g. CTR26"></label><label style="grid-column:span 2">Headline<input id="${pre}_headline" value="${esc(v.headline || '')}" placeholder="e.g. 26T jetvac combination unit"></label>`}
      <label style="grid-column:span ${forUnit ? 3 : 2}">Specification boxes<textarea id="${pre}_sheet" rows="7" placeholder="Tank\n- 4,500 L waste\n- 7,250 L clean water\nVacuum and jetting\n- Samson 1450 cfm liquid ring\n- Orca 500R 220 L/min at 138 bar">${esc(specText(v.spec_sections))}</textarea><span class="small muted">A line on its own is a box title; lines starting with - are the points in it.</span></label>
      <label>Photo<input type="file" id="${pre}_photo" accept="image/*"><span id="${pre}_pv" style="display:block;margin-top:4px">${v.photo_url ? `<img src="${esc(v.photo_url)}" style="max-width:160px;border-radius:6px">` : '<span class="small muted">none yet</span>'}</span><input type="hidden" id="${pre}_photo_url" value="${esc(v.photo_url || '')}"></label>`;
  const wirePhoto = (pre, prefix) => { const i = $(pre + '_photo'); if (!i) return; i.onchange = async () => { const f = i.files[0]; if (!f) return; $(pre + '_pv').textContent = 'Uploading…';
    try { const u = await uploadPhoto(f, prefix); $(pre + '_photo_url').value = u; $(pre + '_pv').innerHTML = `<img src="${u}" style="max-width:160px;border-radius:6px">`; } catch (e) { $(pre + '_pv').textContent = e.message; } }; };
  function catForm(c, el) {
    const v = c || {}, f = (k) => esc(v[k] ?? ''), used = c ? UNITS.filter((u) => u.category_id === c.id).length : 0;
    $('fc_form').innerHTML = `<div class="box2" style="padding:12px;margin-bottom:12px"><h3 style="margin-top:0">${c ? 'Edit ' + esc(c.name) : 'Add a category'}</h3><div class="form" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
      <label style="grid-column:span 2">Name<input id="fk_name" value="${f('name')}" placeholder="e.g. Waste – artic (aux engine)"></label><label>Sector<input id="fk_sector" value="${f('sector')}" placeholder="Petroleum, Waste…"></label>
      <label>Division<select id="fk_division">${DIVS.map((d) => `<option ${d === (v.division || 'Other assets') ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Part of the hire fleet?<select id="fk_hire"><option value="1">Yes – counts in utilisation and quotes</option><option value="0" ${v.for_hire === false ? 'selected' : ''}>No – e.g. vans, workshop kit</option></select></label>
      <label>Standard £/wk<input id="fk_rate" type="number" step="0.01" value="${f('default_weekly_rate')}"></label><label>Min term (months)<input id="fk_min" type="number" value="${f('min_term_months')}"></label>
      <label style="grid-column:span 3">Spec (shown on quotes)<input id="fk_spec" value="${f('spec')}" placeholder="e.g. 38,000 L aluminium, 5 compartments, API couplings"></label>
      <label style="grid-column:1/-1">Long description – the standard wording for this type on hire agreements and quotes<textarea id="fk_long_description" rows="4">${f('long_description')}</textarea></label>${sheetFields('fk', v, false)}</div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="pri2" id="fk_save">Save</button><button id="fk_x">Cancel</button>
      ${c ? (used ? `<span class="small muted" style="margin-left:auto">${used} units use this category – move them first to delete it, or hide it:</span><button id="fk_hide">${c.active === false ? 'Show again' : 'Hide'}</button>` : '<button id="fk_del" style="margin-left:auto;border-color:#DC2626;color:#B91C1C">Delete category</button>') : ''}<span id="fk_msg" class="small muted"></span></div></div>`;
    const done = async () => { await load(); draw(el); };
    $('fk_x').onclick = () => ($('fc_form').innerHTML = '');
    wirePhoto('fk', 'cat-' + ((c && c.id) || 'new'));
    $('fk_save').onclick = async () => { const g = (k) => $('fk_' + k).value.trim(), body = { long_description: $('fk_long_description').value.trim() || null, code: g('code') || null, headline: g('headline') || null, spec_sections: parseSpec($('fk_sheet').value), photo_url: $('fk_photo_url').value || null, name: g('name'), sector: g('sector') || null, division: g('division'), for_hire: g('hire') === '1', default_weekly_rate: g('rate') === '' ? null : +g('rate'), min_term_months: g('min') ? +g('min') : null, spec: g('spec') || null, updated_at: new Date().toISOString() };
      if (!body.name) { $('fk_msg').textContent = 'Give it a name.'; return; }
      try { await api(c ? 'asset_categories?id=eq.' + c.id : 'asset_categories', { method: c ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); await done(); } catch (e) { $('fk_msg').textContent = 'Could not save: ' + e.message; } };
    if ($('fk_del')) $('fk_del').onclick = async () => { if (!confirm('Delete the category ' + c.name + '?')) return; await api('asset_categories?id=eq.' + c.id, { method: 'DELETE' }); await done(); };
    if ($('fk_hide')) $('fk_hide').onclick = async () => { await api('asset_categories?id=eq.' + c.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: c.active === false }) }); await done(); };
  }
})();
