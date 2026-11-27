/* PROCUREMENT – kit on order arriving. "Arrived" issues the fleet number and serials, puts the unit on the
   fixed asset register (depreciating from the arrival date) or holds it as sales stock, puts it on the fleet register
   and/or dealership stock, creates the arrival inspection, and keeps it under "waiting for payment" until the
   supplier (or finance company) has been paid. Once the inspection is done it is made available. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, gbp, esc } = X;
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);
  const fd = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  const vtype = (t) => { t = String(t || ''); return /bitumen/i.test(t) ? 'artic_bitumen' : /combination|combi|jet.?vac|whale|flexline/i.test(t) ? 'rigid_combi' : /waste.*artic|artic.*waste|rtn|ultra ?last/i.test(t) ? 'artic_waste' : /waste|gully/i.test(t) ? 'rigid_waste' : /tractor/i.test(t) ? 'tractor_unit' : /rigid/i.test(t) ? 'rigid_fuel' : 'artic_petroleum'; };
  const inspLink = (id) => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'inspect/#c=' + id;
  let REC = [], CATS = [];

  async function load() {
    [REC, CATS] = await Promise.all([api('asset_receipts?select=*&order=arrived_at.desc').catch(() => []), api('asset_categories?select=id,name,division&active=is.true&order=name').catch(() => [])]);
    return REC;
  }
  const received = (o) => REC.filter((r) => r.order_id === o.id).length;

  // ---- the arrival dialog ----
  function arrive(o, done) {
    const left = Math.max(0, (+o.qty || 1) - received(o)); if (!left) { alert('Everything on this order has already arrived.'); return; }
    const planned = String(o.planned_units || '').split(/[,;]+/).map((s) => s.trim()).filter(Boolean).filter((u) => !REC.some((r) => norm(r.unit) === norm(u)));
    const catId = (CATS.find((c) => c.name === o.category || c.name === o.fleet_type) || {}).id;
    const unitRows = (n) => Array.from({ length: n }, (_, i) => `<div class="pr-u" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:4px 0">
        <input data-k="unit" placeholder="Fleet no. *" value="${esc(planned[i] || '')}"><input data-k="reg" placeholder="Registration"><input data-k="chassis_no" placeholder="Chassis / VIN"><input data-k="tank_serial" placeholder="Tank serial"></div>`).join('');
    const bg = X.dispose.dialog('Arrived: ' + esc(o.description), `<div class="note">${left} of ${o.qty} still to arrive${o.supplier ? ' from ' + esc(o.supplier) : ''}.</div>
      <label>Arrival date (depreciation starts from this date)</label><input id="pr_dt" type="date" value="${today()}">
      <label>How many have arrived?</label><input id="pr_n" type="number" min="1" max="${left}" value="${left}">
      <label>Fleet number and serials for each unit</label><div id="pr_units">${unitRows(left)}</div>
      <label>Category</label><select id="pr_cat">${CATS.map((c) => `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <label>Cost per unit £ (ex VAT)</label><input id="pr_cost" type="number" step="0.01" value="${+o.unit_price || ''}">
      <label>Where is it going?</label><select id="pr_dest">${['Hire', 'Sale', 'Hire or sale'].map((d) => `<option value="${d}" ${d === (o.destination || 'Hire') ? 'selected' : ''}>${d === 'Hire' ? 'Hire fleet' : d === 'Sale' ? 'Dealership stock (for sale)' : 'Both – hire or sale'}</option>`).join('')}</select>
      <label>How is it held in the accounts?</label><select id="pr_tr"><option value="Capitalise" ${o.treatment !== 'Sales stock' ? 'selected' : ''}>Capitalise – fixed asset register, depreciated</option><option value="Sales stock" ${o.treatment === 'Sales stock' ? 'selected' : ''}>Sales stock – not capitalised, cost comes off when sold</option></select>
      <label>How is it paid for?</label><select id="pr_fund">${['HP / finance', 'Cash', 'Supplier credit'].map((f) => `<option ${f === (o.funding || 'HP / finance') ? 'selected' : ''}>${f}</option>`).join('')}</select>
      <div id="pr_fc_w"><label>Finance company</label><input id="pr_fc" value="${esc(o.finance_company || '')}"></div>
      <label>Payment due</label><input id="pr_due" type="date" value="${addDays(today(), +o.terms_days || 0)}">
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pr_paid" style="width:auto"> Already paid (by us, or by the finance company to the supplier)</label>
      <div class="note" id="pr_note"></div>`, 'Record arrival', async () => {
      const q = (id) => bg.querySelector('#' + id), dt = q('pr_dt').value, cost = parseFloat(q('pr_cost').value) || null, dest = q('pr_dest').value, tr = q('pr_tr').value, fund = q('pr_fund').value, cat = CATS.find((c) => c.id === +q('pr_cat').value) || {};
      const units = [...bg.querySelectorAll('.pr-u')].map((r) => Object.fromEntries([...r.querySelectorAll('input')].map((i) => [i.dataset.k, i.value.trim()])));
      if (!dt) throw new Error('Add the arrival date'); if (units.some((u) => !u.unit)) throw new Error('Every unit needs a fleet number');
      const dup = units.find((u, i) => units.findIndex((x) => norm(x.unit) === norm(u.unit)) !== i); if (dup) throw new Error('Fleet number ' + dup.unit + ' is used twice');
      const links = [];
      for (const u of units) links.push(await receiveOne(o, u, { dt, cost, dest, tr, fund, cat, fc: q('pr_fc').value.trim() || null, due: q('pr_paid').checked ? null : q('pr_due').value || null, paid: q('pr_paid').checked ? dt : null }));
      const got = received(o) + units.length;
      await api('asset_orders?id=eq.' + o.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign(got >= (+o.qty || 1) ? { status: 'Delivered' } : {}, { funding: fund, treatment: tr, destination: dest, finance_company: q('pr_fc').value.trim() || null })) });
      await load(); done && done(links);
    });
    const q = (id) => bg.querySelector('#' + id);
    const note = () => { const tr = q('pr_tr').value, dest = q('pr_dest').value, f = q('pr_fund').value; q('pr_fc_w').style.display = f === 'HP / finance' ? '' : 'none';
      q('pr_note').innerHTML = 'This will: ' + [tr === 'Capitalise' ? 'add each unit to the <b>fixed asset register</b>, depreciating from the arrival date' : 'hold each unit as <b>sales stock</b> at cost (not depreciated)',
        dest !== 'Sale' ? 'put it on the <b>fleet register</b> (in the workshop until the inspection is done)' : '', dest !== 'Hire' ? 'add it to <b>dealership stock</b>' : '',
        'create the <b>arrival inspection</b> link', q('pr_paid').checked ? 'record it as paid' : 'list it under <b>waiting for payment</b> until it is paid'].filter(Boolean).join('; ') + '.'; };
    ['pr_tr', 'pr_dest', 'pr_fund', 'pr_paid'].forEach((id) => q(id).addEventListener('change', note));
    q('pr_dest').addEventListener('change', () => { if (q('pr_dest').value === 'Sale') q('pr_tr').value = 'Sales stock'; note(); });
    q('pr_dt').addEventListener('change', () => { q('pr_due').value = addDays(q('pr_dt').value || today(), +o.terms_days || 0); });
    q('pr_n').addEventListener('input', () => { const n = Math.max(1, Math.min(left, +q('pr_n').value || 1)), have = [...bg.querySelectorAll('.pr-u')].map((r) => [...r.querySelectorAll('input')].map((i) => i.value));
      q('pr_units').innerHTML = unitRows(n); [...bg.querySelectorAll('.pr-u')].forEach((r, i) => { if (have[i]) [...r.querySelectorAll('input')].forEach((inp, j) => { inp.value = have[i][j]; }); }); });
    note();
  }

  async function receiveOne(o, u, v) {
    const desc = o.description + (u.reg && u.reg !== u.unit ? ' (' + u.reg + ')' : '');
    let fa = null, asset = null, stock = null, job = null;
    // 1. fixed asset register – depreciation runs from the arrival date
    if (v.tr === 'Capitalise') {
      const ex = await api('fa_assets?select=id,ref&ref=eq.' + encodeURIComponent(u.unit));
      if (ex.length) { fa = ex[0]; await api('fa_assets?id=eq.' + fa.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ cost: v.cost, purchase_date: v.dt, category: v.cat.name || null, active: true }) }); }
      else [fa] = await api('fa_assets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ref: u.unit, description: desc, category: v.cat.name || null, cost: v.cost, purchase_date: v.dt, active: true, notes: 'Arrived ' + fd(v.dt) + ' from order #' + o.id + (o.supplier ? ' (' + o.supplier + ')' : '') }) });
    }
    // 2. fleet register (hire) – a fleet number issued at order time already has an "On order" record
    if (v.dest !== 'Sale') {
      const ex = (await api('assets?select=id,unit&active=is.true')).find((a) => norm(a.unit) === norm(u.unit));
      const body = { unit: u.unit, reg: u.reg || null, category_id: v.cat.id || null, status: 'Workshop', chassis_no: u.chassis_no || null, tank_serial: u.tank_serial || null, fa_ref: fa ? u.unit : null, description: o.description, notes: 'Arrived ' + fd(v.dt) + ' – arrival inspection due' };
      if (ex) { await api('assets?id=eq.' + ex.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); asset = ex; }
      else [asset] = await api('assets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(Object.assign({ active: true }, body)) });
    }
    // 3. stock record – the inspection hangs off it; it shows in dealership stock unless it is hire only
    const avail = v.dest === 'Hire' ? 'hire' : v.dest === 'Sale' ? 'sale' : 'both';
    const exS = (await api('stock?select=id,reg,status,advert&status=not.in.(sold,written_off,moved_to_hire)')).find((s) => norm(String(s.reg).split(/\s+-\s+/)[0]) === norm(u.unit) || (u.reg && norm(String(s.reg).split(/\s+-\s+/)[0]) === norm(u.reg)));
    const sBody = { source: fa ? 'ex_fleet' : 'purchased', fa_id: fa ? fa.id : null, cost: v.cost };
    if (exS) { stock = exS; await api('stock?id=eq.' + exS.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ advert: Object.assign({}, exS.advert || {}, { avail }) }, sBody)) }); }
    else [stock] = await api('stock', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(Object.assign({ reg: u.unit, vehicle_type: vtype(o.description + ' ' + (v.cat.name || '')), status: 'awaiting_inspection', advert: { avail, cond: 'New' }, notes: 'Arrived ' + fd(v.dt) + ' from order #' + o.id }, sBody)) });
    // 4. arrival inspection (skip if the unit already has one)
    const jobs = await api('jobs?select=id,status&stock_id=eq.' + stock.id).catch(() => []);
    if (jobs.length) job = jobs[0];
    else { const id = crypto.randomUUID(); [job] = await api('jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id, ref: 'J' + Date.now().toString(36).toUpperCase(), vehicle_type: vtype(o.description + ' ' + (v.cat.name || '')), reg: u.reg || u.unit, stock_ref: u.unit, notes: 'Arrival inspection – ' + o.description, stock_id: stock.id, status: 'assigned', data: { preset: { condition: 'New' } } }) }); }
    // 5. the receipt: payment, links
    await api('asset_receipts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ order_id: o.id, unit: u.unit, reg: u.reg || null, chassis_no: u.chassis_no || null, tank_serial: u.tank_serial || null, description: o.description, category_id: v.cat.id || null, arrived_at: v.dt, cost: v.cost,
      treatment: v.tr, destination: v.dest, funding: v.fund, finance_company: v.fc, due_date: v.due, paid_at: v.paid, paid_by: v.paid ? (v.fund === 'HP / finance' ? 'Finance company' : 'Us') : null, fa_id: fa ? fa.id : null, asset_id: asset ? asset.id : null, stock_id: stock.id, job_id: job ? job.id : null }) });
    return { unit: u.unit, link: job && !jobs.length ? inspLink(job.id) : null };
  }

  // ---- the Arrivals tab on the Procurement page ----
  async function tab(p, ORD, redraw) {
    await load();
    const jobs = REC.length ? await api('jobs?select=id,status,stock_id&stock_id=in.(' + REC.map((r) => r.stock_id).filter(Boolean).join(',') + ')').catch(() => []) : [];
    const jst = (r) => { const j = jobs.find((x) => x.id === r.job_id) || jobs.find((x) => x.stock_id === r.stock_id); return j ? j.status : null; };
    const open = ORD.filter((o) => ['Ordered', 'Delivered'].includes(o.status) && received(o) < (+o.qty || 1));
    const waitPay = REC.filter((r) => !r.paid_at), waitInsp = REC.filter((r) => !r.ready_at);
    const owed = waitPay.reduce((t, r) => t + (+r.cost || 0), 0), overdue = waitPay.filter((r) => r.due_date && r.due_date < today());
    p.innerHTML = X.tiles([{ l: 'Still to arrive', v: open.reduce((t, o) => t + (+o.qty || 1) - received(o), 0), s: open.length + ' order line' + (open.length === 1 ? '' : 's') },
      { l: 'Waiting for payment', v: waitPay.length, s: gbp(owed) + ' ex VAT' + (overdue.length ? ' · ' + overdue.length + ' overdue' : ''), c: overdue.length ? 'r' : 'o' },
      { l: 'Arrived, not yet ready', v: waitInsp.length, s: 'arrival inspection to finish' },
      { l: 'Arrived this year', v: REC.filter((r) => r.arrived_at >= (() => { const d = new Date(); return (d.getMonth() >= 4 ? d.getFullYear() : d.getFullYear() - 1) + '-05-01'; })()).length, s: 'since 1 May' }])
      + `<div class="pv-card" style="padding:14px;margin-bottom:12px"><h3 style="margin-top:0">Still to arrive</h3>${open.length ? `<table class="pv-tbl"><thead><tr><th>Order</th><th>Supplier</th><th>Expected</th><th class="n">Arrived</th><th>Fleet numbers issued</th><th></th></tr></thead><tbody>${open.map((o) => `<tr><td><b>${esc(o.description)}</b></td><td>${esc(o.supplier || '')}</td><td>${o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'TBC'}</td><td class="n">${received(o)} of ${o.qty}</td>
          <td><input data-plan="${o.id}" value="${esc(o.planned_units || '')}" placeholder="e.g. KU76 XCE, CTR27 (comma between units)" style="width:160px" title="Fleet numbers given out before it arrives – e.g. for a hire already booked"></td><td><button class="btn" data-arr="${o.id}">Arrived</button></td></tr>`).join('')}</tbody></table>` : '<div class="hint">Nothing on order is waiting to arrive.</div>'}<div id="pr_links"></div></div>
      <div class="pv-card" style="padding:14px;margin-bottom:12px"><h3 style="margin-top:0">Waiting for payment</h3><div class="hint">Arrived but the supplier hasn't been paid yet (by us, or by the finance company). Depreciation has already started from the arrival date.</div>${waitPay.length ? `<table class="pv-tbl"><thead><tr><th>Unit</th><th>What</th><th>Arrived</th><th>Paid by</th><th class="n">Cost ex VAT</th><th class="n">Inc VAT</th><th>Due</th><th></th></tr></thead><tbody>${waitPay.map((r) => `<tr><td><b>${esc(r.unit)}</b></td><td>${esc(r.description || '')}</td><td>${fd(r.arrived_at)}</td><td>${esc(r.funding || '')}${r.finance_company ? ' – ' + esc(r.finance_company) : ''}</td><td class="n">${r.cost ? gbp(+r.cost) : '–'}</td><td class="n">${r.cost ? gbp(+r.cost * 1.2) : '–'}</td>
          <td style="${r.due_date && r.due_date < today() ? 'color:#B91C1C;font-weight:700' : ''}">${fd(r.due_date) || '–'}</td><td><button class="mini" data-paid="${r.id}">Mark paid</button></td></tr>`).join('')}</tbody></table>` : '<div class="hint">Nothing waiting for payment.</div>'}</div>
      <div class="pv-card" style="padding:14px;margin-bottom:12px"><h3 style="margin-top:0">Arrived – inspection and ready</h3>${waitInsp.length ? `<table class="pv-tbl"><thead><tr><th>Unit</th><th>What</th><th>Arrived</th><th>Going to</th><th>Held as</th><th>Inspection</th><th></th></tr></thead><tbody>${waitInsp.map((r) => { const s = jst(r);
          return `<tr><td><b>${esc(r.unit)}</b></td><td>${esc(r.description || '')}</td><td>${fd(r.arrived_at)}</td><td>${r.destination === 'Hire' ? 'Hire fleet' : r.destination === 'Sale' ? 'Dealership stock' : 'Hire or sale'}</td><td>${r.treatment === 'Capitalise' ? 'Fixed asset' : 'Sales stock'}</td>
          <td>${s === 'reviewed' ? '<b style="color:#15803D">Approved</b>' : s === 'submitted' ? '<b style="color:#164698">Done – to review</b>' : s ? '<span style="color:#B45309">Not done yet</span>' : '–'}${r.job_id && s !== 'reviewed' && s !== 'submitted' ? ` <button class="mini" data-link="${r.job_id}" data-u="${esc(r.unit)}">Copy link</button>` : ''} <a class="small" href="#/p-stock">open</a></td>
          <td><button class="btn" data-ready="${r.id}">Ready – make available</button></td></tr>`; }).join('')}</tbody></table>` : '<div class="hint">Nothing waiting – every arrival is inspected and available.</div>'}</div>
      <div class="pv-card" style="padding:14px"><h3 style="margin-top:0">All arrivals</h3><table class="pv-tbl"><thead><tr><th>Unit</th><th>What</th><th>Arrived</th><th>Held as</th><th>Going to</th><th class="n">Cost</th><th>Paid</th><th>Ready</th></tr></thead><tbody>${REC.map((r) => `<tr><td><b>${esc(r.unit)}</b>${r.reg ? '<div class="small muted">' + esc(r.reg) + '</div>' : ''}</td><td>${esc(r.description || '')}</td><td>${fd(r.arrived_at)}</td><td>${r.treatment === 'Capitalise' ? 'Fixed asset' : 'Sales stock'}</td><td>${esc(r.destination)}</td><td class="n">${r.cost ? gbp(+r.cost) : '–'}</td><td>${r.paid_at ? fd(r.paid_at) + (r.paid_by ? ' · ' + esc(r.paid_by) : '') : '<span style="color:#B45309">not yet</span>'}</td><td>${r.ready_at ? fd(r.ready_at) : '–'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nothing has arrived yet.</td></tr>'}</tbody></table></div>`;
    const again = () => tab(p, ORD, redraw);
    p.querySelectorAll('[data-plan]').forEach((i) => (i.onchange = async () => { await api('asset_orders?id=eq.' + i.dataset.plan, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ planned_units: i.value.trim() || null }) }); const o = ORD.find((x) => x.id === +i.dataset.plan); if (o) o.planned_units = i.value.trim();
      // a fleet number issued before arrival gets an "On order" record so it can be booked for hire
      for (const un of i.value.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) { const ex = (await api('assets?select=id,unit')).find((a) => norm(a.unit) === norm(un)); if (!ex) await api('assets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ unit: un, status: 'On order', active: true, description: o ? o.description : null, notes: 'Fleet number issued at order' + (o ? ' – ' + o.description : '') }) }); } }));
    p.querySelectorAll('[data-arr]').forEach((b) => (b.onclick = () => arrive(ORD.find((o) => o.id === +b.dataset.arr), async (links) => { await again(); const L = links.filter((l) => l.link);
      const box = p.querySelector('#pr_links'); if (box && L.length) box.innerHTML = `<div class="note" style="margin-top:10px"><b>Arrival inspection links</b> – send to whoever is in the yard:<br>${L.map((l) => `${esc(l.unit)}: <input readonly value="${esc(l.link)}" onclick="this.select()" style="width:70%">`).join('<br>')}</div>`; if (redraw) redraw(); })));
    p.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = () => { const r = REC.find((x) => x.id === +b.dataset.paid);
      const bg = X.dispose.dialog('Mark ' + esc(r.unit) + ' as paid', `<label>Date paid</label><input id="pp_dt" type="date" value="${today()}"><label>Paid by</label><select id="pp_by"><option>Us</option><option ${r.funding === 'HP / finance' ? 'selected' : ''}>Finance company</option></select>`, 'Mark paid', async () => {
        await api('asset_receipts?id=eq.' + r.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ paid_at: bg.querySelector('#pp_dt').value || today(), paid_by: bg.querySelector('#pp_by').value }) }); await again(); }); }));
    p.querySelectorAll('[data-link]').forEach((b) => (b.onclick = async () => { const l = inspLink(b.dataset.link); try { await navigator.clipboard.writeText(l); b.textContent = 'Copied ✓'; } catch (e) { prompt('Inspection link for ' + b.dataset.u, l); } }));
    p.querySelectorAll('[data-ready]').forEach((b) => (b.onclick = async () => { const r = REC.find((x) => x.id === +b.dataset.ready), s = jst(r);
      if (s !== 'reviewed' && !confirm((s === 'submitted' ? 'The inspection has not been approved yet.' : 'The arrival inspection has not been done yet.') + ' Make ' + r.unit + ' available anyway?')) return;
      if (r.asset_id) await api('assets?id=eq.' + r.asset_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: r.destination === 'Sale' ? 'For sale' : 'Available', notes: 'Arrived ' + fd(r.arrived_at) + ', ready ' + fd(today()) }) });
      if (r.stock_id && r.destination === 'Hire') await api('stock?id=eq.' + r.stock_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'moved_to_hire' }) });
      else if (r.stock_id) await api('stock?id=eq.' + r.stock_id + '&status=eq.awaiting_inspection', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'inspected' }) });
      await api('asset_receipts?id=eq.' + r.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ready_at: today() }) }); await again(); }));
  }
  X.procure = { load, arrive, tab, receipts: () => REC };
})();
