/* QUOTES – build a quote from the fleet register, the deal analyser or dealership stock; branded PDF;
   versions (Q-0012 v1, v2…); every quote is a pipeline deal (same Q- number) kept in step automatically. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fd = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const PROB = { Enquiry: 20, Quoted: 40, Negotiating: 60, Agreed: 90, Won: 100, Lost: 0, 'On hold': 10 };
  const LOGO = 'assets/compton-logo.png';
  const INTRO = 'Thank you for your enquiry. We are pleased to quote as follows.';
  const TERMS = 'All prices exclude VAT.\nHire rates are per unit, per week, for the minimum hire term shown, invoiced monthly in arrears; payment is due 30 days from the end of the month of invoice.\nDelivery, collection, damage and insurance are as set out in our standard terms and conditions of hire.\nThis quote is subject to availability and credit approval, and is valid until the date shown.';
  const CHARGES = ['Delivery', 'Collection', 'Clean / de-gas on return', 'Inspection / certification'];
  let Q = [], P = [], DEALS = [], STOCK = [], CUST = [], HA = [], ORD = [], CUR = null, EL = null, FILTER = 'open';

  async function load() {
    if (X.fleetReg) await X.fleetReg.load();
    let crm = [], con = [];
    [Q, P, DEALS, STOCK, crm, con] = await Promise.all([all('quotes', 'id.desc'), all('pipeline', 'id.desc'), all('fleet_deals', 'updated_at.desc').catch(() => []),
      api("stock?select=id,reg,vehicle_type,status,asking_price,stock_ref&status=not.in.(sold,moved_to_hire)").catch(() => []), all('crm_customers', 'name.asc').catch(() => []), api('contracts?select=customer&active=is.true').catch(() => [])]);
    HA = await api('hire_agreements?select=id,ref,quote_id,status').catch(() => []);
    ORD = await api('asset_orders?select=id,description,category,fleet_type,qty,unit_price,delivery_date,status,weekly_rate,term_months&order=delivery_date.asc').catch(() => []);
    ORD = ORD.filter((o) => !/deliver|cancel|received|complete/i.test(o.status || ''));
    CUST = [...new Set([...crm.map((c) => c.name), ...con.map((c) => c.customer), ...P.map((p) => p.customer)].filter(Boolean).map((s) => s.trim()))].sort();
  }
  const latest = () => { const m = {}; Q.forEach((q) => { if (!m[q.ref] || q.version > m[q.ref].version) m[q.ref] = q; }); return Object.values(m).sort((a, b) => b.id - a.id); };
  // ---- money ----
  function totals(q) {
    let weekly = 0, contract = 0, oneoff = 0, sale = 0, units = 0, maxTerm = 0;
    (q.lines || []).forEach((l) => { const qty = +l.qty || 0, r = +l.rate || 0;
      if (l.type === 'hire') { weekly += qty * r; units += qty; contract += qty * r * 52 / 12 * (+l.term || 0); maxTerm = Math.max(maxTerm, +l.term || 0); }
      else if (l.type === 'sale') sale += qty * r;
      else if (l.per === 'week') weekly += qty * r; else oneoff += qty * r; });
    return { weekly, monthly: weekly * 52 / 12, contract, oneoff, sale, units, maxTerm };
  }
  const summaryText = (q) => (q.lines || []).filter((l) => l.type !== 'charge').map((l) => (l.qty > 1 ? l.qty + ' × ' : '') + (l.desc || '')).join(' + ') || 'Quote';

  // ---------------- pages ----------------
  X.routes['p-quotes'] = async function (el) {
    EL = el; el.innerHTML = X.head('Quotes', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Quotes', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    const prm = new URLSearchParams(location.hash.split('?')[1] || '');
    if (prm.get('q')) { CUR = JSON.parse(JSON.stringify(Q.find((x) => x.id === +prm.get('q')) || null)); }
    else if (prm.get('deal')) { const d = P.find((x) => x.id === +prm.get('deal')), ex = latest().find((x) => x.pipeline_id === +prm.get('deal'));
      CUR = ex ? JSON.parse(JSON.stringify(ex)) : d ? fresh({ pipeline_id: d.id, ref: d.ref, customer: d.customer, contact_name: d.contact_name, contact_email: d.contact_email, contact_phone: d.contact_phone,
        lines: d.kit ? [{ type: 'hire', desc: d.kit, qty: d.qty || 1, rate: d.weekly_rate, per: 'week', term: d.term_months || '' }] : [], fleet_deal_id: d.fleet_deal_id ? +d.fleet_deal_id : null, source: 'pipeline' }) : null; }
    else CUR = null;
    CUR ? editor() : list();
  };
  const fresh = (o) => Object.assign({ id: null, ref: null, version: 1, status: 'Draft', quote_date: today(), valid_until: addDays(today(), 30), intro: INTRO, terms: TERMS, lines: [], source: 'blank' }, o || {});

  function list() {
    const L = latest(), open = L.filter((q) => ['Draft', 'Sent'].includes(q.status)), m = today().slice(0, 7);
    const acc = L.filter((q) => q.status === 'Accepted'), dec = L.filter((q) => q.status === 'Declined'), rows = L.filter((q) => FILTER === 'all' || (FILTER === 'open' ? ['Draft', 'Sent'].includes(q.status) : q.status === FILTER));
    const stage = (q) => (P.find((p) => p.id === q.pipeline_id) || {}).stage || '';
    EL.innerHTML = X.head('Quotes', 'Build quotes from the fleet register, the deal analyser or dealership stock. Every quote is also a pipeline deal with the same Q- number.') +
      X.tiles([{ l: 'Open quotes', v: open.length, s: L.filter((q) => q.status === 'Sent').length + ' sent · ' + L.filter((q) => q.status === 'Draft').length + ' draft' },
        { l: 'Open quotes – hire / month', v: gbp(open.reduce((t, q) => t + totals(q).monthly, 0)), s: 'at full value, ex VAT' },
        { l: 'Accepted this month', v: acc.filter((q) => String(q.accepted_at || '').slice(0, 7) === m).length, s: gbp(acc.filter((q) => String(q.accepted_at || '').slice(0, 7) === m).reduce((t, q) => t + totals(q).monthly, 0)) + '/month' },
        { l: 'Win rate', v: acc.length + dec.length ? Math.round(acc.length / (acc.length + dec.length) * 100) + '%' : '–', s: acc.length + ' accepted · ' + dec.length + ' declined' }]) +
      `<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><button class="pri2" id="qn_new">+ New quote</button><button id="qn_an">From the deal analyser</button><button id="qn_st">Sale from dealership stock</button>
        <span style="margin-left:auto" class="small">Show <select id="qn_f">${[['open', 'Open (draft and sent)'], ['Accepted', 'Accepted'], ['Declined', 'Declined'], ['all', 'All']].map(([k, t]) => `<option value="${k}" ${k === FILTER ? 'selected' : ''}>${t}</option>`).join('')}</select></span></div><div id="qn_pick"></div>
      <table><thead><tr><th>Quote</th><th>Customer</th><th>What</th><th class="n">£/week</th><th class="n">£/month</th><th class="n">One-off / sale</th><th>Status</th><th>Valid until</th><th>Pipeline</th></tr></thead><tbody>
      ${rows.map((q) => { const t = totals(q), exp = q.status === 'Sent' && q.valid_until && q.valid_until < today();
        return `<tr style="cursor:pointer" data-open="${q.id}"><td><b>${esc(q.ref)}</b> <span class="muted small">v${q.version}</span></td><td>${esc(q.customer || '')}</td><td class="small">${esc(summaryText(q)).slice(0, 70)}</td>
          <td class="n">${t.weekly ? gbp(t.weekly) : ''}</td><td class="n">${t.monthly ? gbp(t.monthly) : ''}</td><td class="n">${t.oneoff + t.sale ? gbp(t.oneoff + t.sale) : ''}</td>
          <td><span style="font-weight:600;color:${q.status === 'Accepted' ? '#16A34A' : q.status === 'Declined' ? '#DC2626' : q.status === 'Sent' ? '#164698' : '#B45309'}">${esc(q.status)}</span>${exp ? ' <span class="small" style="color:#DC2626">expired</span>' : ''}</td>
          <td>${q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-GB') : ''}</td><td class="small">${esc(stage(q))}</td></tr>`; }).join('') || '<tr><td colspan="9" class="muted">No quotes yet – start one above.</td></tr>'}</tbody></table></div>`;
    $('qn_f').onchange = (e) => { FILTER = e.target.value; list(); };
    $('qn_new').onclick = () => { CUR = fresh(); editor(); };
    $('qn_an').onclick = () => pickDeal($('qn_pick'), (line, deal) => { CUR = fresh({ customer: (deal.customer || '').trim(), lines: line, source: 'analyser', fleet_deal_id: deal.id }); editor(); });
    $('qn_st').onclick = () => pickStock($('qn_pick'), (line) => { CUR = fresh({ lines: [line], source: 'dealership' }); editor(); });
    EL.querySelectorAll('[data-open]').forEach((r) => (r.onclick = () => { CUR = JSON.parse(JSON.stringify(Q.find((x) => x.id === +r.dataset.open))); editor(); }));
  }

  // ---- pickers ----
  function analyserLines(d) {
    const v = (d.payload || {}).values || {}, s = d.summary || {}, rate = +String(s.rate || '').replace(/[^\d.]/g, '') || +v.baseRate || 0, term = (+v.term || +v.baseYears || 0) * 12;
    const out = [{ type: 'hire', desc: (v.vehicleName || d.name || '').trim(), qty: 1, rate, per: 'week', term: term || '', notes: 'New build to your specification' }];
    if (v.oneMonthUpfront) out.push({ type: 'charge', desc: 'First month’s hire in advance (credited against the first invoice)', qty: 1, rate: Math.round(rate * 52 / 12 * 100) / 100, per: 'each' });
    return out;
  }
  function pickDeal(box, cb) {
    box.innerHTML = `<div class="box2" style="padding:10px;margin-bottom:10px"><b>Pick a saved deal from the deal analyser</b><table style="margin-top:6px"><tbody>${DEALS.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.customer || '')}</td><td>${esc((d.summary || {}).rate || '')}</td><td>${esc((d.summary || {}).health || '')}</td><td><button class="mini" data-dl="${d.id}">Use</button></td></tr>`).join('') || '<tr><td class="muted">No saved deals.</td></tr>'}</tbody></table></div>`;
    box.querySelectorAll('[data-dl]').forEach((b) => (b.onclick = () => { const d = DEALS.find((x) => x.id === +b.dataset.dl); cb(analyserLines(d), d); }));
  }
  function stockLine(s) { return { type: 'sale', desc: [s.vehicle_type, s.reg].filter(Boolean).join(' – '), stock_id: s.id, qty: 1, rate: +s.asking_price || 0, per: 'each', notes: 'Sold as seen, subject to inspection' }; }
  // kit on order (Kit on order page) – quote it before it arrives
  const mon = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');
  function orderLine(o) { const FR = X.fleetReg, c = FR ? FR.cats().find((x) => x.name === o.category || x.name === o.fleet_type) : null;
    return { type: 'hire', desc: (o.description || '').trim(), order_id: o.id, cat_id: c ? c.id : null, qty: 1, rate: +o.weekly_rate || '', per: 'week', term: o.term_months || '', notes: 'New – on order' + (o.delivery_date ? ', expected ' + mon(o.delivery_date) : '') }; }
  function pickOrder(box, cb) {
    box.innerHTML = `<div class="box2" style="padding:10px;margin-bottom:10px"><b>Pick kit that’s on order</b><table style="margin-top:6px"><tbody>${ORD.map((o) => `<tr><td><b>${esc(o.description || '')}</b><div class="small muted">${esc(o.category || o.fleet_type || '')}</div></td><td>${o.qty || 1} on order</td><td>expected ${esc(mon(o.delivery_date) || 'TBC')}</td><td class="n">${o.weekly_rate ? gbp(o.weekly_rate) + '/wk planned' : ''}</td><td><button class="mini" data-od="${o.id}">Use</button></td></tr>`).join('') || '<tr><td class="muted">Nothing on order – use “Hire – other / not in the fleet”.</td></tr>'}</tbody></table></div>`;
    box.querySelectorAll('[data-od]').forEach((b) => (b.onclick = () => cb(orderLine(ORD.find((x) => x.id === +b.dataset.od))))); }
  function pickStock(box, cb) {
    box.innerHTML = `<div class="box2" style="padding:10px;margin-bottom:10px"><b>Pick a unit from dealership stock</b><table style="margin-top:6px"><tbody>${STOCK.map((s) => `<tr><td>${esc(s.reg || s.stock_ref || '')}</td><td>${esc(s.vehicle_type || '')}</td><td class="n">${s.asking_price ? gbp(s.asking_price) : '<span class="muted">no price</span>'}</td><td><button class="mini" data-sk="${s.id}">Use</button></td></tr>`).join('') || '<tr><td class="muted">No stock for sale.</td></tr>'}</tbody></table></div>`;
    box.querySelectorAll('[data-sk]').forEach((b) => (b.onclick = () => cb(stockLine(STOCK.find((x) => x.id === +b.dataset.sk)))));
  }

  // ---------------- editor ----------------
  function editor() {
    const q = CUR, locked = ['Accepted', 'Declined', 'Superseded'].includes(q.status), FR = X.fleetReg, cats = FR ? FR.cats().filter((c) => c.active !== false) : [];
    const deal = P.find((p) => p.id === q.pipeline_id), versions = Q.filter((x) => q.ref && x.ref === q.ref).sort((a, b) => a.version - b.version);
    const inp = (k, ph, t = 'text') => `<input id="qe_${k}" type="${t}" value="${esc(q[k] ?? '')}" placeholder="${ph || ''}" ${locked ? 'disabled' : ''}>`;
    EL.innerHTML = X.head(q.ref ? 'Quote ' + q.ref + ' v' + q.version : 'New quote', (deal ? 'Pipeline: ' + esc(deal.stage) + ' · ' : '') + 'Status: ' + esc(q.status) + (locked ? ' – this version is closed; make a new version to change it.' : '')) +
      `<div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap"><button id="qe_back">← All quotes</button>${versions.length > 1 ? 'Versions: ' + versions.map((v) => `<a href="#" data-ver="${v.id}" style="${v.id === q.id ? 'font-weight:700' : ''}">v${v.version} (${esc(v.status)})</a>`).join(' · ') : ''}</div>
      <div class="grid2"><div class="card"><h3>Customer</h3><div class="form" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="grid-column:span 2">Customer<input id="qe_customer" list="qe_cl" value="${esc(q.customer || '')}" ${locked ? 'disabled' : ''}><datalist id="qe_cl">${CUST.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label style="grid-column:span 2">Address<textarea id="qe_customer_address" rows="2" ${locked ? 'disabled' : ''}>${esc(q.customer_address || '')}</textarea></label>
        <label>Contact${inp('contact_name')}</label><label>Phone${inp('contact_phone')}</label><label>Email${inp('contact_email', '', 'email')}</label><label>Site / delivery to${inp('site')}</label></div></div>
        <div class="card"><h3>Quote</h3><div class="form" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label>Date${inp('quote_date', '', 'date')}</label><label>Valid until${inp('valid_until', '', 'date')}</label>
        <label style="grid-column:span 2">Opening line${inp('intro')}</label></div></div></div>
      <div class="card"><h3>What we’re quoting</h3>
        ${locked ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button class="mini pri2" id="qa_fleet">+ Hire from the fleet</button><button class="mini" id="qa_an">+ New kit from the deal analyser</button><button class="mini" id="qa_st">+ Sale from dealership stock</button>${CHARGES.map((c) => `<button class="mini" data-chg="${esc(c)}">+ ${esc(c)}</button>`).join('')}<button class="mini" id="qa_ord">+ Hire – kit on order</button><button class="mini" id="qa_fh">+ Hire – other / not in the fleet</button><button class="mini" id="qa_free">+ Other line</button></div><div id="qa_pick"></div>`}
        <table><thead><tr><th>Type</th><th>Description</th><th class="n">Qty</th><th class="n">Rate £</th><th>Per</th><th class="n">Min term (months)</th><th class="n">Total</th><th></th></tr></thead><tbody id="qe_lines"></tbody></table>
        <div id="qe_tot" style="margin-top:10px"></div></div>
      <div class="card"><h3>Terms</h3><textarea id="qe_terms" rows="5" style="width:100%" ${locked ? 'disabled' : ''}>${esc(q.terms || '')}</textarea></div>
      <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${locked ? '' : '<button class="pri2" id="qe_save">Save</button>'}<button id="qe_pdf">Quote PDF${q.status === 'Draft' && !locked ? ' and mark as sent' : ''}</button>
        ${q.id && !locked ? '<button id="qe_acc" style="border-color:#16A34A;color:#15803D">Customer accepted</button><button id="qe_dec" style="border-color:#DC2626;color:#B91C1C">Declined</button>' : ''}
        ${q.id ? '<button id="qe_ver">New version</button>' : ''}${q.status === 'Accepted' && (q.lines || []).some((l) => l.type === 'hire') ? (HA.find((h) => h.quote_id === q.id) ? `<a class="small" href="#/p-agreements?a=${HA.find((h) => h.quote_id === q.id).id}">Hire agreement ${esc(HA.find((h) => h.quote_id === q.id).ref)} (${esc(HA.find((h) => h.quote_id === q.id).status)})</a>` : '<button class="pri2" id="qe_ha">Raise hire agreement</button>') : ''}${q.id && q.status === 'Draft' ? '<button id="qe_del" style="margin-left:auto">Delete draft</button>' : ''}
        ${deal ? `<a href="#/p-pipeline" class="small" style="margin-left:auto">Open in pipeline (${esc(deal.ref)})</a>` : ''}<span id="qe_msg" class="small muted"></span></div>`;
    lines(); wire(locked);
  }
  function lines() {
    const q = CUR, locked = ['Accepted', 'Declined', 'Superseded'].includes(q.status), tb = $('qe_lines'); if (!tb) return;
    const dis = locked ? 'disabled' : '';
    tb.innerHTML = q.lines.map((l, i) => { const tot = l.type === 'hire' || l.per === 'week' ? (+l.qty || 0) * (+l.rate || 0) * 52 / 12 : (+l.qty || 0) * (+l.rate || 0);
      return `<tr><td class="small">${l.type === 'hire' ? 'Hire' : l.type === 'sale' ? 'Sale' : 'Charge'}</td>
        <td><input data-l="${i}" data-k="desc" value="${esc(l.desc || '')}" style="width:100%" ${dis}>${l.units && l.units.length ? `<div class="small muted">Units: ${esc(l.units.join(', '))}</div>` : ''}<input data-l="${i}" data-k="notes" value="${esc(l.notes || '')}" placeholder="Note on the quote (optional)" class="small" style="width:100%;margin-top:3px" ${dis}></td>
        <td class="n"><input data-l="${i}" data-k="qty" type="number" min="1" value="${l.qty ?? 1}" style="width:60px" ${dis}></td><td class="n"><input data-l="${i}" data-k="rate" type="number" step="0.01" value="${l.rate ?? ''}" style="width:100px" ${dis}></td>
        <td>${l.type === 'hire' ? 'week' : l.type === 'sale' ? 'each' : `<select data-l="${i}" data-k="per" ${dis}><option value="each" ${l.per !== 'week' ? 'selected' : ''}>each</option><option value="week" ${l.per === 'week' ? 'selected' : ''}>week</option></select>`}</td>
        <td class="n">${l.type === 'hire' ? `<input data-l="${i}" data-k="term" type="number" min="0" value="${l.term ?? ''}" style="width:60px" ${dis}>` : ''}</td>
        <td class="n">${gbp(tot)}<div class="small muted">${l.type === 'hire' || l.per === 'week' ? 'a month' : ''}</div></td><td>${locked ? '' : `<a href="#" data-rm="${i}">✕</a>`}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Add a line with the buttons above.</td></tr>';
    tb.querySelectorAll('[data-l]').forEach((x) => (x.oninput = x.onchange = () => { const l = q.lines[+x.dataset.l], k = x.dataset.k; l[k] = ['qty', 'rate', 'term'].includes(k) ? (x.value === '' ? '' : +x.value) : x.value; tot(); }));
    tb.querySelectorAll('[data-rm]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); q.lines.splice(+a.dataset.rm, 1); lines(); }));
    tot();
  }
  function tot() {
    const t = totals(CUR), b = $('qe_tot'); if (!b) return;
    b.innerHTML = `<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:14px">${t.weekly ? `<div><span class="small muted">Hire per week</span><br><b>${gbp(t.weekly)}</b></div><div><span class="small muted">Hire per month</span><br><b>${gbp(t.monthly)}</b></div>` : ''}
      ${t.contract ? `<div><span class="small muted">Value over the minimum term</span><br><b>${gbp(t.contract)}</b></div>` : ''}${t.oneoff ? `<div><span class="small muted">One-off charges</span><br><b>${gbp(t.oneoff)}</b></div>` : ''}${t.sale ? `<div><span class="small muted">Sale</span><br><b>${gbp(t.sale)}</b></div>` : ''}<div class="small muted" style="align-self:end">All ex VAT</div></div>`;
  }
  function fleetPicker(box) {
    const FR = X.fleetReg, cats = FR.cats().filter((c) => c.active !== false);
    let cid = cats[0] && cats[0].id;
    const draw = () => { const c = FR.cat(cid), av = FR.units().filter((u) => u.category_id === cid && FR.status(u) === 'Available');
      box.innerHTML = `<div class="box2" style="padding:10px;margin-bottom:10px"><div class="form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <label>Category <select id="fp_c">${cats.map((x) => { const n = FR.units().filter((u) => u.category_id === x.id && FR.status(u) === 'Available').length; return `<option value="${x.id}" ${x.id === cid ? 'selected' : ''}>${esc(x.name)} (${n} available)</option>`; }).join('')}</select></label>
        <label>Qty <input id="fp_q" type="number" min="1" value="1" style="width:70px"></label><label>£/week <input id="fp_r" type="number" step="0.01" value="${c.default_weekly_rate ?? ''}" style="width:100px"></label>
        <label>Min term (months) <input id="fp_t" type="number" value="${c.min_term_months ?? ''}" style="width:80px"></label><button class="pri2" id="fp_add">Add to quote</button><button id="fp_x">Close</button></div>
        <div class="small" style="margin-top:8px">${av.length ? 'Optional – pick the actual units (ticking sets the qty): ' + av.map((u) => `<label style="display:inline-block;margin:2px 8px 2px 0"><input type="checkbox" data-u="${esc(u.unit)}"> ${esc(u.unit)}</label>`).join('') : '<span class="muted">No units of this type are free right now – you can still quote it (e.g. coming off hire or new build).</span>'}${(() => { const AV = X.availability; if (!AV) return ''; const soon = FR.units().filter((u) => u.category_id === cid && FR.status(u) !== 'Available' && u.status !== 'For sale').map((u) => [u, AV.freeFrom(u)]).filter(([, f]) => f).sort((a, b) => (a[1] < b[1] ? -1 : 1)).slice(0, 8);
          return soon.length ? '<div class="muted" style="margin-top:4px">Coming free: ' + soon.map(([u, f]) => esc(u.unit) + ' from ' + new Date(f).toLocaleDateString('en-GB')).join(' · ') + ' – <a href="#/p-availability?cat=' + cid + '">see the planner</a></div>' : ''; })()}</div></div>`;
      $('fp_c').onchange = (e) => { cid = +e.target.value; draw(); };
      box.querySelectorAll('[data-u]').forEach((x) => (x.onchange = () => { const n = box.querySelectorAll('[data-u]:checked').length; if (n) $('fp_q').value = n; }));
      $('fp_x').onclick = () => (box.innerHTML = '');
      $('fp_add').onclick = () => { const units = [...box.querySelectorAll('[data-u]:checked')].map((x) => x.dataset.u);
        CUR.lines.push({ type: 'hire', cat_id: cid, desc: c.name, units, qty: +$('fp_q').value || 1, rate: $('fp_r').value === '' ? '' : +$('fp_r').value, per: 'week', term: $('fp_t').value === '' ? '' : +$('fp_t').value, notes: c.spec || '' });
        box.innerHTML = ''; lines(); }; };
    draw();
  }
  function read() { const q = CUR; ['customer', 'customer_address', 'contact_name', 'contact_phone', 'contact_email', 'site', 'quote_date', 'valid_until', 'intro'].forEach((k) => { const e = $('qe_' + k); if (e) q[k] = e.value.trim() || null; }); if ($('qe_terms')) q.terms = $('qe_terms').value; }
  function wire(locked) {
    $('qe_back').onclick = () => { if (location.hash.includes('?')) location.hash = '#/p-quotes'; else { CUR = null; list(); } };
    EL.querySelectorAll('[data-ver]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); CUR = JSON.parse(JSON.stringify(Q.find((x) => x.id === +a.dataset.ver))); editor(); }));
    if (!locked) {
      $('qa_fleet').onclick = () => fleetPicker($('qa_pick'));
      $('qa_an').onclick = () => pickDeal($('qa_pick'), (ls, d) => { CUR.lines.push(...ls); CUR.source = CUR.source === 'blank' ? 'analyser' : CUR.source; CUR.fleet_deal_id = d.id; if (!CUR.customer && d.customer) { CUR.customer = d.customer.trim(); $('qe_customer').value = CUR.customer; } $('qa_pick').innerHTML = ''; lines(); });
      $('qa_st').onclick = () => pickStock($('qa_pick'), (l) => { CUR.lines.push(l); $('qa_pick').innerHTML = ''; lines(); });
      EL.querySelectorAll('[data-chg]').forEach((b) => (b.onclick = () => { CUR.lines.push({ type: 'charge', desc: b.dataset.chg, qty: 1, rate: '', per: 'each' }); lines(); }));
      $('qa_ord').onclick = () => pickOrder($('qa_pick'), (l) => { CUR.lines.push(l); $('qa_pick').innerHTML = ''; lines(); });
      $('qa_fh').onclick = () => { CUR.lines.push({ type: 'hire', desc: '', qty: 1, rate: '', per: 'week', term: '', notes: '' }); lines(); };
      $('qa_free').onclick = () => { CUR.lines.push({ type: 'charge', desc: '', qty: 1, rate: '', per: 'each' }); lines(); };
      $('qe_save').onclick = async () => { read(); if (await save()) msg('Saved – pipeline deal ' + CUR.ref + ' updated.'); };
    }
    $('qe_pdf').onclick = async () => { if (!locked) { read(); if (!(await save())) return; } pdf(CUR);
      if (CUR.status === 'Draft') { await setStatus('Sent', { sent_at: new Date().toISOString() }, { stage: 'Quoted', next_action: 'Follow up quote ' + CUR.ref + ' v' + CUR.version, next_action_date: addDays(today(), 5) }); msg('Marked as sent – follow-up set in the pipeline for ' + new Date(addDays(today(), 5)).toLocaleDateString('en-GB') + '.'); } };
    if ($('qe_acc')) $('qe_acc').onclick = async () => { const who = prompt('Who accepted it? (name, and PO number if they gave one)', CUR.contact_name || ''); if (who === null) return; read(); if (!(await save())) return;
      await setStatus('Accepted', { accepted_at: new Date().toISOString(), accepted_by: who || null }, { stage: 'Agreed', next_action: 'Raise hire agreement / order for ' + CUR.ref, next_action_date: today() }); if ((CUR.lines || []).some((l) => l.type === 'hire')) raisePanel(); else msg('Accepted – pipeline moved to Agreed.'); };
    if ($('qe_ha')) $('qe_ha').onclick = raisePanel;
    if ($('qe_dec')) $('qe_dec').onclick = async () => { const why = prompt('Why did they decline? (e.g. price, timing, went elsewhere)'); if (why === null) return; read(); if (!(await save())) return;
      await setStatus('Declined', {}, { stage: 'Lost', lost_reason: why || 'Not given' }); msg('Declined – pipeline deal marked Lost.'); };
    if ($('qe_ver')) $('qe_ver').onclick = async () => { read(); const maxV = Math.max(...Q.filter((x) => x.ref === CUR.ref).map((x) => x.version)), base = CUR;
      if (base.status === 'Draft' && !locked) await save();
      const nv = Object.assign(JSON.parse(JSON.stringify(base)), { id: null, version: maxV + 1, status: 'Draft', quote_date: today(), valid_until: addDays(today(), 30), sent_at: null, accepted_at: null, accepted_by: null });
      for (const old of Q.filter((x) => x.ref === base.ref && ['Draft', 'Sent'].includes(x.status))) await api('quotes?id=eq.' + old.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'Superseded' }) });
      CUR = nv; await save(); msg('Version ' + nv.version + ' started – earlier open versions are marked superseded.'); };
    if ($('qe_del')) $('qe_del').onclick = async () => { if (!confirm('Delete this draft?')) return; await api('quotes?id=eq.' + CUR.id, { method: 'DELETE' }); await load(); CUR = null; list(); };
  }
  const msg = (t) => { const m = $('qe_msg'); if (m) m.textContent = t; };
  // accepted → raise the hire agreement and book the named units from the start date
  function raisePanel() {
    const named = (CUR.lines || []).filter((l) => l.type === 'hire').flatMap((l) => l.units || []), m = $('qe_msg'); if (!m) return;
    m.innerHTML = `<span class="form" style="display:inline-flex;gap:6px;flex-wrap:wrap;align-items:end"><b style="color:#15803D">Accepted ✓</b> Raise the hire agreement${named.length ? ' and book ' + esc(named.join(', ')) : ''} from <input id="ra_d" type="date" value="${today()}"> <button class="pri2" id="ra_go">Raise hire agreement</button></span>`;
    $('ra_go').onclick = async () => { try { const a = await X.agreements.fromQuote(CUR, $('ra_d').value || today()); location.hash = '#/p-agreements?a=' + a.id; } catch (e) { msg('Could not raise the agreement: ' + e.message); } };
  }

  // ---- save: the quote, and keep its pipeline deal in step ----
  async function save() {
    const q = CUR, t = totals(q);
    if (!q.customer) { msg('Add the customer first.'); return false; }
    if (!q.lines.length) { msg('Add at least one line.'); return false; }
    try {
      const firstCat = q.lines.find((l) => l.type === 'hire' && l.cat_id), cat = firstCat && X.fleetReg ? X.fleetReg.cat(firstCat.cat_id) : null;
      const deal = { customer: q.customer, contact_name: q.contact_name, contact_email: q.contact_email, contact_phone: q.contact_phone, kit: summaryText(q).slice(0, 200), qty: t.units || 1,
        weekly_rate: t.units ? Math.round(t.weekly / t.units * 100) / 100 : t.weekly || null, term_months: t.maxTerm || null, quote_date: q.quote_date, quote_valid_until: q.valid_until, quote_terms: q.terms,
        fleet_type: cat ? cat.name : null, fleet_deal_id: q.fleet_deal_id ? String(q.fleet_deal_id) : null, new_kit: q.source === 'analyser' };
      if (!q.pipeline_id) { const r = await api('pipeline', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(Object.assign(deal, { stage: 'Enquiry', probability: PROB.Enquiry, next_action: 'Finish and send quote', next_action_date: today() })) });
        q.pipeline_id = r[0].id; q.ref = r[0].ref; }
      else await api('pipeline?id=eq.' + q.pipeline_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(deal) });
      if (!q.ref) q.ref = (P.find((p) => p.id === q.pipeline_id) || {}).ref;
      const body = { ref: q.ref, version: q.version, pipeline_id: q.pipeline_id, status: q.status, customer: q.customer, customer_address: q.customer_address || null, contact_name: q.contact_name, contact_email: q.contact_email, contact_phone: q.contact_phone, site: q.site,
        quote_date: q.quote_date, valid_until: q.valid_until, intro: q.intro, terms: q.terms, lines: q.lines, totals: t, source: q.source, fleet_deal_id: q.fleet_deal_id || null, updated_at: new Date().toISOString() };
      if (q.id) await api('quotes?id=eq.' + q.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      else { const r = await api('quotes', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }); q.id = r[0].id; }
      await load(); CUR = JSON.parse(JSON.stringify(Q.find((x) => x.id === q.id))); editor(); return true;
    } catch (e) { msg('Could not save: ' + e.message); return false; }
  }
  async function setStatus(status, extra, dealPatch) {
    const q = CUR; await api('quotes?id=eq.' + q.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ status, updated_at: new Date().toISOString() }, extra)) });
    if (q.pipeline_id && dealPatch) { const d = P.find((p) => p.id === q.pipeline_id) || {};
      if (dealPatch.stage === 'Quoted' && !['Enquiry', 'Quoted'].includes(d.stage)) delete dealPatch.stage;   // don't move a deal backwards
      if (dealPatch.stage) dealPatch.probability = PROB[dealPatch.stage];
      await api('pipeline?id=eq.' + q.pipeline_id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(dealPatch) }); }
    await load(); CUR = JSON.parse(JSON.stringify(Q.find((x) => x.id === q.id))); editor();
  }

  // ---- branded PDF (print window) ----
  async function pdf(q) {
    const s = await X.session().catch(() => null), who = (s && s.user && (s.user.user_metadata?.name || s.user.email)) || 'Compton Tankers', t = totals(q);
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''), terms = (q.terms || '').split('\n').filter((x) => x.trim());
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups for the portal to open the quote.'); return; }
    const row = (l) => { const hire = l.type === 'hire', wk = hire || l.per === 'week', total = (+l.qty || 0) * (+l.rate || 0) * (wk ? 52 / 12 : 1);
      const FR = X.fleetReg, cat = hire && FR && l.cat_id ? FR.cat(l.cat_id) : {};
      const unitTxt = (un) => { const u = FR && FR.units().find((x) => FR.norm(x.unit) === FR.norm(un)); if (!u) return '<div class="ud"><b>' + esc(un) + '</b></div>'; const d = FR.fullDesc(u);
        return '<div class="ud"><b>' + esc(u.unit) + '</b>' + (d.reg ? ' (' + esc(d.reg) + ')' : '') + ' – ' + esc(d.title) + (d.year || d.condition ? ' · ' + esc([d.year, d.condition].filter(Boolean).join(', ')) : '') + (d.lines.length ? '<br><span class="sm">' + esc(d.lines.join(' · ')) + '</span>' : '') + '</div>'; };
      return `<tr><td><b>${esc(l.desc || '')}</b>${cat.description ? `<br><span class="sm">${esc(cat.description)}</span>` : ''}${l.notes ? `<br><span class="sm">${esc(l.notes)}</span>` : ''}${l.units && l.units.length ? l.units.map(unitTxt).join('') : ''}</td>
        <td class="n">${l.qty || 1}</td><td class="n">${l.rate !== '' && l.rate != null ? gbp(l.rate) : '–'}<br><span class="sm">${hire ? 'per unit / week' : l.per === 'week' ? 'per week' : 'each'}</span></td>
        <td class="n">${hire && l.term ? l.term + ' months' : ''}</td><td class="n">${gbp(total)}<br><span class="sm">${wk ? 'per month' : 'one-off'}</span></td></tr>`; };
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Quote ${esc(q.ref)} v${q.version} – ${esc(q.customer || '')}</title><style>
      @page{size:A4;margin:16mm 18mm 22mm}body{font-family:Arial,sans-serif;color:#0B2A66;font-size:10.5pt;margin:0}
      .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E4611D;padding-bottom:10px}.hd img{height:62px}.hd .r{text-align:right;font-size:9pt;line-height:1.5}.hd .r b{color:#164698}.tag{color:#E4611D;font-weight:bold;font-size:9pt}
      h1{font-size:20pt;margin:22px 0 4px;color:#164698}.meta{display:flex;gap:34px;flex-wrap:wrap;margin:10px 0 16px;font-size:10pt}.meta div span{display:block;color:#6B7280;font-size:8.5pt}
      table{width:100%;border-collapse:collapse;margin:8px 0 12px}th{background:#164698;color:#fff;text-align:left;padding:7px 8px;font-size:9.5pt}td{padding:8px;border-bottom:1px solid #E3E7EE;vertical-align:top}td.n,th.n{text-align:right}.sm{color:#6B7280;font-size:8.5pt}
      .tots{display:flex;gap:0;justify-content:flex-end;margin:4px 0 16px}.tots div{border:1px solid #164698;padding:8px 14px;text-align:right;margin-left:-1px}.tots span{display:block;font-size:8.5pt;color:#6B7280}.tots b{font-size:12pt}
      h3{font-size:11pt;color:#164698;margin:16px 0 6px}.ud{margin-top:5px;padding-left:8px;border-left:2px solid #E4611D;font-size:9.5pt}ul{margin:0;padding-left:18px;color:#222}li{margin:3px 0}.no{color:#222}
      .acc{margin-top:18px;border:1.5px solid #164698;border-radius:6px;padding:12px 14px;page-break-inside:avoid}.acc .g{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin-top:10px}.acc .f{border-bottom:1px solid #94A3B8;height:26px;font-size:8.5pt;color:#6B7280}
      .ft{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #164698;padding-top:6px;font-size:7.5pt;color:#6B7280}.ft b{color:#164698}@media screen{body{max-width:820px;margin:20px auto;padding:20px}.ft{position:static;margin-top:40px}}
      </style></head><body>
      <div class="hd"><img src="${base + LOGO}" alt="Compton Tankers"><div class="r"><div class="tag">Tanker hire · Sales · Specialist workshops</div><b>T</b> 01525 371 707<br><b>E</b> info@comptontankers.com<br><b>W</b> www.comptontankers.com</div></div>
      <h1>${t.sale && !t.weekly ? 'Sales quotation' : 'Quotation'}</h1>
      <div class="meta"><div><span>Quote</span>${esc(q.ref)}${q.version > 1 ? ' v' + q.version : ''}</div><div><span>Date</span>${fd(q.quote_date)}</div><div><span>Valid until</span>${fd(q.valid_until)}</div>
        <div><span>For</span><b>${esc(q.customer || '')}</b>${q.customer_address ? '<br>' + esc(q.customer_address).replace(/\n/g, '<br>') : ''}${q.contact_name ? '<br>FAO ' + esc(q.contact_name) : ''}</div>${q.site ? `<div><span>Site / delivery</span>${esc(q.site)}</div>` : ''}</div>
      <p class="no">${esc(q.intro || INTRO)}</p>
      <table><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Minimum term</th><th class="n">Total</th></tr>${q.lines.map(row).join('')}</table>
      <div class="tots">${t.weekly ? `<div><span>Hire per month</span><b>${gbp(t.monthly)}</b></div>` : ''}${t.oneoff ? `<div><span>One-off charges</span><b>${gbp(t.oneoff)}</b></div>` : ''}${t.sale ? `<div><span>Sale price</span><b>${gbp(t.sale)}</b></div>` : ''}<div><span>VAT</span><b>excluded</b></div></div>
      ${terms.length ? `<h3>Terms</h3><ul>${terms.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="acc"><b>Acceptance</b> – to go ahead, sign and return this page, or reply to this quote by email.<div class="g"><div class="f">Name</div><div class="f">Position</div><div class="f">Signature</div><div class="f">Date</div><div class="f">Purchase order no.</div><div class="f">Required start date</div></div></div>
      <div class="no" style="margin-top:18px">Kind regards,<br><br><b>${esc(who)}</b><br>Compton Tankers</div>
      <div class="ft"><b>Leighton Buzzard · Ellesmere Port · Mpumalanga, South Africa</b><br>Compton Tankers is a trading name of Tanker Rent UK Limited. Registered in England and Wales, company number 04432719. Registered office: Comptons Yard, Grovebury Road, Leighton Buzzard, Bedfordshire LU7 4TS.</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }
  X.quotes = { totals };
})();
