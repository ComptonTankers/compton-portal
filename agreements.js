/* HIRE AGREEMENTS – raised from an accepted quote (or from scratch), booked against real units,
   branded agreement PDF, signed, then "Start hire" creates the live contracts and "End hire" closes them.
   Follows the MCS contract sections (equipment, hire period, rentals, charges, options, special terms) but with the
   full product description of every unit, both parties' signatures and a handover record. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);
  const addMonths = (s, m) => { if (!s || !m) return null; const d = new Date(s); d.setMonth(d.getMonth() + +m); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
  const fd = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const YARD = 'Tanker Rent UK Ltd, Compton’s Yard, Grovebury Road, Leighton Buzzard, Bedfordshire LU7 4TS';
  const CHARGES = [['Missed collection / return', '£600'], ['External cleaning', 'Cost + 20%'], ['Internal cleaning', 'Cost + 20%'], ['Per tyre damaged or beyond allowed wear', '£450'],
    ['Call-out / breakdown (hirer fault)', 'Cost + 20%'], ['Late payment interest', '8% above Bank of England base rate'], ['Document / admin fee', '£0']];
  const OPTIONS = [['Maintenance package (details specified separately)', 'Included'], ['Telematics / tracker', 'Included'], ['Purchase option at end of initial term (separate agreement)', 'N/A']];
  const ST = { Draft: '#B45309', Sent: '#164698', Signed: '#7C3AED', 'On hire': '#16A34A', Ended: '#64748B', Cancelled: '#94A3B8' };
  let A = [], BK = [], CUR = null, EL = null, FILTER = 'open';
  const FR = () => X.fleetReg;

  async function load() { if (FR()) await FR().load(); [A, BK] = await Promise.all([all('hire_agreements', 'id.desc'), api('hire_bookings?select=*&status=neq.Cancelled')]); }
  const weekly = (a) => (a.units || []).reduce((t, u) => t + (+u.weekly_rate || 0), 0);

  // the unit snapshot printed on the agreement (taken from the fleet register, editable on the agreement)
  function unitSnap(unit, rate) {
    const u = FR() && FR().units().find((x) => FR().norm(x.unit) === FR().norm(unit)); if (!u) return { unit, description: '', weekly_rate: rate ?? '' };
    const d = FR().fullDesc(u), c = FR().cat(u.category_id);
    return { unit: u.unit, reg: d.reg, category: c.name || '', code: c.code || '', description: d.title, spec: d.lines.join(' · '), year: u.year || '', condition: u.condition || '', chassis_no: u.chassis_no || '', tank_serial: u.tank_serial || '',
      replacement_value: u.replacement_value ?? '', weekly_rate: rate ?? FR().stdRate(u) ?? '', photo_url: u.photo_url || c.photo_url || '', spec_sections: (u.spec_sections && u.spec_sections.length ? u.spec_sections : c.spec_sections) || null };
  }

  // ---- create from an accepted quote: agreement + a booking for each unit ----
  async function fromQuote(q, start) {
    if (FR()) await FR().load();
    const hire = (q.lines || []).filter((l) => l.type === 'hire'), units = [];
    hire.forEach((l) => { const named = l.units || []; for (let i = 0; i < (+l.qty || 1); i++) units.push(named[i] ? unitSnap(named[i], +l.rate || '') : { unit: '', category: l.desc, description: l.desc, spec: l.notes || '', weekly_rate: +l.rate || '' }); });
    const ch = (q.lines || []).filter((l) => l.type === 'charge'), find = (w) => ch.filter((l) => (l.desc || '').toLowerCase().includes(w)).reduce((t, l) => t + (+l.qty || 1) * (+l.rate || 0), 0);
    const term = Math.max(0, ...hire.map((l) => +l.term || 0)) || null;
    const body = { quote_id: q.id, pipeline_id: q.pipeline_id, customer: q.customer, customer_address: q.customer_address || null, contact_name: q.contact_name, contact_email: q.contact_email, contact_phone: q.contact_phone,
      start_date: start || today(), min_term_months: term, initial_term_end: addMonths(start || today(), term), delivery_location: q.site || null, collection_location: YARD, units, hire_type: 'Monthly PCM', payment_terms: 'End of month + 30 days', countries: 'United Kingdom', rolls: true,
      delivery_charge: find('deliver'), collection_charge: find('collect'), additional_charges: CHARGES.map(([item, charge]) => ({ item, charge })), options: OPTIONS.map(([item, charge]) => ({ item, charge })),
      special_terms: [], notes: 'From quote ' + q.ref + ' v' + q.version };
    const [a] = await api('hire_agreements', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
    await syncBookings(a); return a;
  }
  // keep one booking per named unit in step with the agreement
  async function syncBookings(a) {
    const mine = await api('hire_bookings?select=*&status=neq.Cancelled&agreement_id=eq.' + a.id);
    const named = (a.units || []).map((u) => (u.unit || '').trim()).filter(Boolean), st = a.status === 'On hire' ? 'On hire' : 'Booked';
    const dead = ['Ended', 'Cancelled'].includes(a.status);
    for (const b of mine) if (dead || !named.includes(b.unit)) await api('hire_bookings?id=eq.' + b.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(a.status === 'Ended' ? { end_date: b.end_date || today(), updated_at: new Date().toISOString() } : { status: 'Cancelled', updated_at: new Date().toISOString() }) });
    if (dead) return;
    for (const un of named) { const b = mine.find((x) => x.unit === un), body = { unit: un, customer: a.customer, start_date: a.start_date || today(), end_date: a.rolls === false ? a.initial_term_end : null, status: st, agreement_id: a.id, quote_id: a.quote_id, pipeline_id: a.pipeline_id, notes: a.ref, updated_at: new Date().toISOString() };
      await api(b ? 'hire_bookings?id=eq.' + b.id : 'hire_bookings', { method: b ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); }
  }
  X.agreements = { fromQuote };

  X.routes['p-agreements'] = async function (el) {
    EL = el; el.innerHTML = X.head('Hire agreements', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Hire agreements', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    const prm = new URLSearchParams(location.hash.split('?')[1] || '');
    CUR = prm.get('a') ? JSON.parse(JSON.stringify(A.find((x) => x.id === +prm.get('a')) || null)) : null;
    CUR ? editor() : list();
  };

  function list() {
    const n = (s) => A.filter((a) => a.status === s), rows = A.filter((a) => FILTER === 'all' || (FILTER === 'open' ? !['Ended', 'Cancelled'].includes(a.status) : a.status === FILTER));
    EL.innerHTML = X.head('Hire agreements', 'Raised from accepted quotes. Book the units, send for signature, then start the hire – that creates the live contracts.') +
      X.tiles([{ l: 'Draft', v: n('Draft').length, s: 'to finish and send' }, { l: 'Awaiting signature', v: n('Sent').length, s: n('Sent').filter((a) => a.sent_at && (Date.now() - new Date(a.sent_at)) > 5 * 864e5).length + ' sent over 5 days ago' },
        { l: 'Signed – ready to go out', v: n('Signed').length, s: n('Signed').reduce((t, a) => t + (a.units || []).length, 0) + ' units' },
        { l: 'On hire', v: n('On hire').length, s: gbp(n('On hire').reduce((t, a) => t + weekly(a), 0) * 52 / 12) + '/month' }]) +
      `<div class="card"><div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><button class="pri2" id="ha_new">+ New hire agreement</button><span class="small muted">Usually you’ll raise these from an accepted quote.</span>
        <span style="margin-left:auto" class="small">Show <select id="ha_f">${[['open', 'Open'], ['Draft', 'Draft'], ['Sent', 'Awaiting signature'], ['Signed', 'Signed'], ['On hire', 'On hire'], ['Ended', 'Ended'], ['all', 'All']].map(([k, t]) => `<option value="${k}" ${k === FILTER ? 'selected' : ''}>${t}</option>`).join('')}</select></span></div>
      <table><thead><tr><th>Agreement</th><th>Customer</th><th>Units</th><th class="n">£/week</th><th class="n">£/month</th><th>Start</th><th>Initial term to</th><th>Status</th></tr></thead><tbody>
      ${rows.map((a) => `<tr style="cursor:pointer" data-open="${a.id}"><td><b>${esc(a.ref)}</b></td><td>${esc(a.customer)}</td><td class="small">${esc((a.units || []).map((u) => u.unit || 'TBC').join(', '))}</td><td class="n">${gbp(weekly(a))}</td><td class="n">${gbp(weekly(a) * 52 / 12)}</td>
        <td>${a.start_date ? new Date(a.start_date).toLocaleDateString('en-GB') : ''}</td><td>${a.initial_term_end ? new Date(a.initial_term_end).toLocaleDateString('en-GB') : ''}</td><td><b style="color:${ST[a.status]}">${esc(a.status)}</b></td></tr>`).join('') || '<tr><td colspan="8" class="muted">No hire agreements yet.</td></tr>'}</tbody></table></div>`;
    $('ha_f').onchange = (e) => { FILTER = e.target.value; list(); };
    $('ha_new').onclick = () => { CUR = { id: null, status: 'Draft', customer: '', units: [{ unit: '', weekly_rate: '' }], hire_type: 'Monthly PCM', start_date: today(), collection_location: YARD, payment_terms: 'End of month + 30 days', countries: 'United Kingdom',
      additional_charges: CHARGES.map(([item, charge]) => ({ item, charge })), options: OPTIONS.map(([item, charge]) => ({ item, charge })), special_terms: [], deposit: 0, delivery_charge: 0, collection_charge: 0 }; editor(); };
    EL.querySelectorAll('[data-open]').forEach((r) => (r.onclick = () => { CUR = JSON.parse(JSON.stringify(A.find((x) => x.id === +r.dataset.open))); editor(); }));
  }

  function editor() {
    const a = CUR, locked = ['On hire', 'Ended', 'Cancelled'].includes(a.status), dis = locked ? 'disabled' : '';
    const inp = (k, t = 'text', ph = '') => `<input id="ag_${k}" type="${t}" value="${esc(a[k] ?? '')}" placeholder="${ph}" ${dis}>`;
    const units = FR() ? FR().units() : [];
    EL.innerHTML = X.head(a.ref ? 'Hire agreement ' + a.ref : 'New hire agreement', 'Status: <b style="color:' + ST[a.status] + '">' + esc(a.status) + '</b>' + (a.status === 'Sent' && a.sign_token ? (a.viewed_at ? ' · opened by the customer ' + new Date(a.viewed_at).toLocaleString('en-GB') : ' · e-signature link sent, not opened yet') : '') + (a.signed_at ? ' · signed by ' + esc(a.signed_name || '') + ' on ' + new Date(a.signed_at).toLocaleDateString('en-GB') : '') + (a.notes ? ' · ' + esc(a.notes) : '')) +
      `<div style="margin-bottom:10px"><button id="ag_back">← All hire agreements</button></div>
      <div class="grid2"><div class="card"><h3>1. Hirer</h3><div class="form" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>Hirer (company)${inp('customer')}</label><label>Company no.${inp('company_no')}</label>
        <label style="grid-column:span 2">Registered / invoice address<textarea id="ag_customer_address" rows="3" ${dis}>${esc(a.customer_address || '')}</textarea></label>
        <label>Contact${inp('contact_name')}</label><label>Phone${inp('contact_phone')}</label><label>Contact email${inp('contact_email', 'email')}</label><label>Invoices to (email)${inp('invoice_email', 'email')}</label></div></div>
      <div class="card"><h3>2. Hire period</h3><div class="form" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>Hire type<select id="ag_hire_type" ${dis}>${['Monthly PCM', 'Spot Hire', 'Weekly', 'Fixed term'].map((t) => `<option ${t === a.hire_type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Start date${inp('start_date', 'date')}</label><label>Minimum term (months)${inp('min_term_months', 'number')}</label><label>Initial term ends<input id="ag_end" disabled value="${a.initial_term_end ? fd(a.initial_term_end) : '–'}"></label>
        <label>After the initial term<select id="ag_rolls" ${dis}><option value="1" ${a.rolls !== false ? 'selected' : ''}>Rolls on until notice is given</option><option value="0" ${a.rolls === false ? 'selected' : ''}>Ends – unit comes back</option></select></label>
        <label>Return notice (days)${inp('notice_days', 'number', 'e.g. 28')}</label>
        <label style="grid-column:span 2">Delivery to${inp('delivery_location', 'text', 'Customer site, or collect from our yard')}</label><label style="grid-column:span 2">Collection / return location${inp('collection_location')}</label></div></div></div>
      <div class="card"><h3>3. Equipment</h3><div class="small muted" style="margin-bottom:6px">Pick each unit from the fleet register – its full description, serials and replacement value fill in from there (edit the unit in the Fleet register to change them for good). Each named unit is booked on the availability planner.</div>
        <datalist id="ag_ul">${units.map((u) => `<option value="${esc(u.unit)}">${esc(FR().cat(u.category_id).name || '')} – ${esc(FR().status(u))}</option>`).join('')}</datalist><div id="ag_units"></div>
        ${locked ? '' : '<button class="mini" id="ag_addu" style="margin-top:6px">+ Add a unit</button>'}</div>
      <div class="grid2"><div class="card"><h3>4. Rentals</h3><div class="form" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>Deposit / security £${inp('deposit', 'number')}</label><label>Payment terms${inp('payment_terms')}</label><label>Delivery charge £${inp('delivery_charge', 'number')}</label><label>Collection charge £${inp('collection_charge', 'number')}</label></div><div id="ag_tot" style="margin-top:10px"></div></div>
      <div class="card"><h3>7. Special terms</h3><div class="form" style="display:grid;gap:8px"><label>Equipment may only be used in${inp('countries')}</label><div id="ag_special"></div>${locked ? '' : '<button class="mini" id="ag_adds">+ Add a special term</button>'}</div></div></div>
      <div class="grid2"><div class="card"><h3>5. Additional charges</h3><div id="ag_charges"></div>${locked ? '' : '<button class="mini" id="ag_addc">+ Add a charge</button>'}</div><div class="card"><h3>6. Options and add-ons</h3><div id="ag_options"></div>${locked ? '' : '<button class="mini" id="ag_addo">+ Add an option</button>'}</div></div>
      <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${locked ? '' : '<button class="pri2" id="ag_save">Save</button>'}
        <label class="small" style="display:flex;gap:6px;align-items:center">Look <select id="ag_style">${[['pack', 'Compton style'], ['standard', 'Compton plain (Arial)'], ['classic', 'MCS contract layout']].map(([k, t]) => `<option value="${k}" ${(a.doc_style || 'pack') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <button id="ag_pdf">${a.signed_at ? 'Unsigned copy (PDF)' : 'Agreement PDF'}</button>
        ${a.id && ['Draft', 'Sent'].includes(a.status) ? '<button class="pri2" id="ag_esign">Send for e-signature</button><button id="ag_sign" style="border-color:#7C3AED;color:#6D28D9">Signed on paper</button>' : ''}
        ${a.signed_at && a.signature ? '<button class="pri2" id="ag_signed">Signed copy (PDF)</button>' : ''}
        ${a.id && ['Signed', 'Sent', 'Draft'].includes(a.status) ? '<button id="ag_start" style="border-color:#16A34A;color:#15803D">Start hire – units out</button>' : ''}
        ${a.status === 'On hire' ? '<button id="ag_endh" style="border-color:#DC2626;color:#B91C1C">End hire – units back</button>' : ''}
        ${a.id && ['Draft', 'Sent', 'Signed'].includes(a.status) ? '<button id="ag_cancel" style="margin-left:auto">Cancel agreement</button>' : ''}
        ${a.quote_id ? `<a class="small" href="#/p-quotes?q=${a.quote_id}">Open the quote</a>` : ''}<a class="small" href="#/p-availability">Availability planner</a><span id="ag_msg" class="small muted"></span></div>`;
    drawUnits(locked); drawList('ag_charges', 'additional_charges', locked); drawList('ag_options', 'options', locked); drawList('ag_special', 'special_terms', locked); tot(); wire(locked);
  }
  function drawUnits(locked) {
    const a = CUR, dis = locked ? 'disabled' : '';
    $('ag_units').innerHTML = `<table><thead><tr><th style="width:120px">Fleet no.</th><th>Full description and key specification</th><th>Year / condition</th><th>Serials</th><th class="n">Replacement value £</th><th class="n">£/week</th><th></th></tr></thead><tbody>
      ${(a.units || []).map((u, i) => { const clash = u.unit && X.availability && (() => { const fu = FR().units().find((x) => FR().norm(x.unit) === FR().norm(u.unit)); if (!fu) return 'Not on the fleet register';
          const s = X.availability.spans(fu).find((s) => !(s.b && s.b.agreement_id === a.id) && s.from <= (a.rolls === false && a.initial_term_end ? a.initial_term_end : '9999-12-31') && (s.to || '9999-12-31') >= (a.start_date || today()) && s.kind !== 'sale');
          return s ? (s.kind === 'shop' ? fu.status : 'Already ' + (s.kind === 'hire' ? 'on hire' : 'booked') + ' to ' + s.label + ' from ' + new Date(s.from).toLocaleDateString('en-GB')) : ''; })();
        return `<tr><td><input data-u="${i}" data-k="unit" list="ag_ul" value="${esc(u.unit || '')}" style="width:110px" ${dis}>${clash ? `<div class="small" style="color:#B91C1C">${esc(clash)}</div>` : ''}</td>
        <td><input data-u="${i}" data-k="description" value="${esc(u.description || '')}" placeholder="Full description" style="width:100%" ${dis}><input data-u="${i}" data-k="spec" value="${esc(u.spec || '')}" placeholder="Compartments, volume, axles, pump…" class="small" style="width:100%;margin-top:3px" ${dis}></td>
        <td><input data-u="${i}" data-k="year" value="${esc(u.year ?? '')}" placeholder="Year" style="width:60px" ${dis}> <input data-u="${i}" data-k="condition" value="${esc(u.condition || '')}" placeholder="Condition" style="width:100px" ${dis}></td>
        <td><input data-u="${i}" data-k="chassis_no" value="${esc(u.chassis_no || '')}" placeholder="Chassis / VIN" class="small" style="width:150px" ${dis}><br><input data-u="${i}" data-k="tank_serial" value="${esc(u.tank_serial || '')}" placeholder="Tank serial" class="small" style="width:150px;margin-top:3px" ${dis}></td>
        <td class="n"><input data-u="${i}" data-k="replacement_value" type="number" value="${esc(u.replacement_value ?? '')}" style="width:100px" ${dis}></td><td class="n"><input data-u="${i}" data-k="weekly_rate" type="number" step="0.01" value="${esc(u.weekly_rate ?? '')}" style="width:90px" ${dis}></td>
        <td>${locked ? '' : `<a href="#" data-rmu="${i}">✕</a>`}</td></tr>`; }).join('')}</tbody></table>`;
    $('ag_units').querySelectorAll('[data-u]').forEach((x) => (x.onchange = () => { const i = +x.dataset.u, k = x.dataset.k;
      if (k === 'unit') { const old = a.units[i], snap = unitSnap(x.value.trim(), old.weekly_rate || null);
        a.units[i] = snap.description ? Object.assign(snap, { weekly_rate: old.weekly_rate || snap.weekly_rate }) : Object.assign({}, old, { unit: x.value.trim() }); drawUnits(locked); }
      else a.units[i][k] = ['replacement_value', 'weekly_rate'].includes(k) ? (x.value === '' ? '' : +x.value) : x.value; tot(); }));
    $('ag_units').querySelectorAll('[data-rmu]').forEach((x) => (x.onclick = (e) => { e.preventDefault(); a.units.splice(+x.dataset.rmu, 1); drawUnits(locked); tot(); }));
  }
  function drawList(box, key, locked) {
    const L = CUR[key] = CUR[key] || [], dis = locked ? 'disabled' : '';
    $(box).innerHTML = L.length ? `<table><tbody>${L.map((r, i) => `<tr><td><input data-li="${i}" data-k="item" value="${esc(r.item || '')}" style="width:100%" ${dis}></td><td style="width:170px"><input data-li="${i}" data-k="charge" value="${esc(r.charge || '')}" placeholder="${key === 'special_terms' ? 'Detail' : 'Charge (ex VAT)'}" style="width:100%" ${dis}></td><td style="width:20px">${locked ? '' : `<a href="#" data-rml="${i}">✕</a>`}</td></tr>`).join('')}</tbody></table>` : '<div class="small muted">None.</div>';
    $(box).querySelectorAll('[data-li]').forEach((x) => (x.oninput = () => { L[+x.dataset.li][x.dataset.k] = x.value; }));
    $(box).querySelectorAll('[data-rml]').forEach((x) => (x.onclick = (e) => { e.preventDefault(); L.splice(+x.dataset.rml, 1); drawList(box, key, locked); }));
  }
  function tot() { const w = weekly(CUR); if ($('ag_tot')) $('ag_tot').innerHTML = `<div style="display:flex;gap:24px;font-size:14px"><div><span class="small muted">Contract weekly rate</span><br><b>${gbp(w)}</b></div><div><span class="small muted">Contract monthly rate</span><br><b>${gbp(w * 52 / 12)}</b></div><div class="small muted" style="align-self:end">ex VAT · monthly = weekly × 52 ÷ 12</div></div>`; }
  function read() {
    const a = CUR, v = (k) => ($('ag_' + k) ? $('ag_' + k).value.trim() : undefined);
    ['customer', 'company_no', 'customer_address', 'contact_name', 'contact_phone', 'contact_email', 'invoice_email', 'hire_type', 'start_date', 'delivery_location', 'collection_location', 'payment_terms', 'countries'].forEach((k) => { if (v(k) !== undefined) a[k] = v(k) || null; });
    ['min_term_months', 'notice_days', 'deposit', 'delivery_charge', 'collection_charge'].forEach((k) => { if (v(k) !== undefined) a[k] = v(k) === '' ? null : +v(k); });
    if ($('ag_rolls')) a.rolls = $('ag_rolls').value === '1';
    a.initial_term_end = addMonths(a.start_date, a.min_term_months);
  }
  const msg = (t) => { const m = $('ag_msg'); if (m) m.textContent = t; };

  async function save(extra) {
    const a = CUR; if (!a.customer) { msg('Add the hirer first.'); return false; }
    const body = Object.assign({ customer: a.customer, company_no: a.company_no, customer_address: a.customer_address, contact_name: a.contact_name, contact_email: a.contact_email, contact_phone: a.contact_phone, invoice_email: a.invoice_email,
      hire_type: a.hire_type, start_date: a.start_date, min_term_months: a.min_term_months, initial_term_end: a.initial_term_end, delivery_location: a.delivery_location, collection_location: a.collection_location, notice_days: a.notice_days,
      units: a.units, deposit: a.deposit || 0, delivery_charge: a.delivery_charge || 0, collection_charge: a.collection_charge || 0, payment_terms: a.payment_terms, additional_charges: a.additional_charges, options: a.options, special_terms: a.special_terms,
      countries: a.countries, status: a.status, quote_id: a.quote_id || null, pipeline_id: a.pipeline_id || null, rolls: a.rolls !== false, notes: a.notes || null }, extra || {});
    try { let id = a.id;
      if (id) await api('hire_agreements?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      else { const [r] = await api('hire_agreements', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }); id = r.id; }
      await load(); CUR = hydrate(A.find((x) => x.id === id)); await syncBookings(CUR); await load(); CUR = hydrate(A.find((x) => x.id === id)); editor(); return true;
    } catch (e) { msg('Could not save: ' + e.message); return false; }
  }
  const hydrate = (r) => JSON.parse(JSON.stringify(r));

  function wire(locked) {
    const a = CUR;
    $('ag_back').onclick = () => { if (location.hash.includes('?')) location.hash = '#/p-agreements'; else { CUR = null; list(); } };
    ['ag_start_date', 'ag_min_term_months'].forEach((id) => { if ($(id)) $(id).onchange = () => { read(); $('ag_end').value = a.initial_term_end ? fd(a.initial_term_end) : '–'; drawUnits(locked); }; });
    if (!locked) {
      $('ag_addu').onclick = () => { a.units.push({ unit: '', weekly_rate: '' }); drawUnits(locked); };
      $('ag_addc').onclick = () => { a.additional_charges.push({ item: '', charge: '' }); drawList('ag_charges', 'additional_charges', locked); };
      $('ag_addo').onclick = () => { a.options.push({ item: '', charge: '' }); drawList('ag_options', 'options', locked); };
      $('ag_adds').onclick = () => { a.special_terms.push({ item: '', charge: '' }); drawList('ag_special', 'special_terms', locked); };
      $('ag_save').onclick = async () => { read(); if (await save()) msg('Saved – units booked on the availability planner.'); };
    }
    $('ag_style').onchange = async () => { CUR.doc_style = $('ag_style').value; if (CUR.id) await api('hire_agreements?id=eq.' + CUR.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ doc_style: CUR.doc_style }) }); };
    $('ag_pdf').onclick = async () => { if (!locked && !a.signed_at) { read(); if (!(await save())) return; } pdf(CUR); };
    if ($('ag_signed')) $('ag_signed').onclick = () => pdf(CUR, true);
    if ($('ag_esign')) $('ag_esign').onclick = async () => {
      read(); if (!(CUR.units || []).length) { msg('Add the equipment first.'); return; }
      if (!CUR.sign_token) CUR.sign_token = crypto.randomUUID();
      const to = CUR.sent_to || CUR.contact_email || '';
      if (!(await save({ sign_token: CUR.sign_token, status: 'Sent', sent_at: CUR.sent_at || new Date().toISOString(), sent_to: to || null, doc_style: CUR.doc_style || 'pack' }))) return;
      const link = signUrl(CUR), subj = 'Hire agreement ' + CUR.ref + ' – ' + CUR.customer + ' – please sign', body = `Hello${CUR.contact_name ? ' ' + CUR.contact_name.split(' ')[0] : ''},\n\nPlease find your hire agreement ${CUR.ref} for ${(CUR.units || []).map((u) => u.unit || u.description).join(', ')}. You can read it and sign it online here:\n\n${link}\n\nIt takes a couple of minutes on a phone or computer. Any questions, call us on 01525 371 707.\n\nKind regards,\nCompton Tankers`;
      $('ag_msg').innerHTML = `<div class="box2" style="padding:10px;margin-top:6px"><b>E-signature link for ${esc(CUR.customer)}</b> – send it to whoever signs for them. It works until they sign.
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input id="es_link" readonly value="${esc(link)}" style="flex:1;min-width:280px" onclick="this.select()"><button class="mini" id="es_copy">Copy link</button>
        <a class="mini" style="text-decoration:none" href="mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}">Email it (opens Outlook)</a><a class="mini" style="text-decoration:none" target="_blank" href="${esc(link)}">Preview what they see</a></div></div>`;
      $('es_copy').onclick = async () => { try { await navigator.clipboard.writeText(link); $('es_copy').textContent = 'Copied ✓'; } catch (e) { $('es_link').select(); } };
    };
    if ($('ag_sign')) $('ag_sign').onclick = () => {
      $('ag_msg').innerHTML = `<span class="form" style="display:inline-flex;gap:6px;flex-wrap:wrap;align-items:end"><label>Signed by<input id="sg_n" value="${esc(a.contact_name || '')}"></label><label>Position<input id="sg_p"></label><label>PO no.<input id="sg_po"></label><label>Date<input id="sg_d" type="date" value="${today()}"></label><button class="pri2" id="sg_go">Record signature</button></span>`;
      $('sg_go').onclick = async () => { read(); if (await save({ status: 'Signed', signed_name: $('sg_n').value.trim() || null, signed_position: $('sg_p').value.trim() || null, signed_po: $('sg_po').value.trim() || null, signed_at: new Date($('sg_d').value || today()).toISOString() })) msg('Signed – start the hire when the units go out.'); }; };
    if ($('ag_start')) $('ag_start').onclick = async () => {
      read(); const named = a.units.filter((u) => (u.unit || '').trim());
      if (named.length < a.units.length) { msg('Every line needs a fleet number before the hire can start.'); return; }
      if (a.status !== 'Signed' && !confirm('This agreement hasn’t been marked as signed. Start the hire anyway?')) return;
      const start = prompt('On-hire date', a.start_date || today()); if (start === null) return; a.start_date = start || today(); a.initial_term_end = addMonths(a.start_date, a.min_term_months);
      try {
        const ids = [];
        for (const u of named) { const fu = FR().units().find((x) => FR().norm(x.unit) === FR().norm(u.unit));
          const [c] = await api('contracts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ unit: u.unit, asset_type: u.category || (fu ? FR().cat(fu.category_id).name : null), customer: a.customer,
            start_date: a.start_date, end_date: a.rolls === false ? a.initial_term_end : null, rolling: a.rolls !== false, notice_days: a.notice_days || null, monthly_rate: Math.round((+u.weekly_rate || 0) * 52 / 12 * 100) / 100,
            source: 'hire agreement', external_ref: a.ref, notes: (a.min_term_months ? 'Minimum term ' + a.min_term_months + ' months to ' + a.initial_term_end + '. ' : '') + 'Hire agreement ' + a.ref, active: true }) });
          ids.push(c.id); }
        if (a.pipeline_id) await api('pipeline?id=eq.' + a.pipeline_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ stage: 'Won', probability: 100, contract_id: ids[0] || null, start_date: a.start_date, next_action: null, next_action_date: null }) }).catch(() => {});
        await save({ status: 'On hire', started_at: new Date(a.start_date).toISOString(), notes: ((a.notes || '') + ' · contracts ' + ids.join(', ')).replace(/^ · /, '') });
        msg('On hire – ' + ids.length + ' contract' + (ids.length === 1 ? '' : 's') + ' created and the pipeline deal marked Won.');
      } catch (e) { msg('Could not start the hire: ' + e.message); } };
    if ($('ag_endh')) $('ag_endh').onclick = async () => {
      const d = prompt('Off-hire date (units back)', today()); if (d === null) return; const off = d || today();
      try { await api('contracts?external_ref=eq.' + encodeURIComponent(a.ref) + '&active=is.true', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false, end_date: off }) });
        for (const b of BK.filter((b) => b.agreement_id === a.id)) await api('hire_bookings?id=eq.' + b.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ end_date: new Date(new Date(off).getTime() - 864e5).toISOString().slice(0, 10), updated_at: new Date().toISOString() }) });
        await api('hire_agreements?id=eq.' + a.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'Ended', ended_at: new Date(off).toISOString() }) });
        await load(); CUR = hydrate(A.find((x) => x.id === a.id)); editor(); msg('Hire ended – contracts closed and the units show as free from ' + new Date(off).toLocaleDateString('en-GB') + '.');
      } catch (e) { msg('Could not end the hire: ' + e.message); } };
    if ($('ag_cancel')) $('ag_cancel').onclick = async () => { if (!confirm('Cancel this hire agreement and release its bookings?')) return; CUR.status = 'Cancelled'; await save({ status: 'Cancelled' }); };
  }

  // ---- the agreement document (agreement-doc.js) in a print window → save as PDF ----
  function pdf(a, signedCopy) {
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''), w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups for the portal to open the agreement.'); return; }
    const doc = signedCopy && a.signed_snapshot ? Object.assign({}, a.signed_snapshot, { signature: a.signature, signed_at: a.signed_at, signed_name: a.signed_name, signed_position: a.signed_position, signed_po: a.signed_po, ref: a.ref }) : a;
    w.document.write(X.agreementDoc(doc, { base, style: a.doc_style || 'pack' })); w.document.close();
  }
  const signUrl = (a) => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'sign/#' + a.sign_token;
})();
