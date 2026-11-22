/* PIPELINE & QUOTES – every hire opportunity from first enquiry to won or lost.
   Feeds the board pack (pipeline vs budget, win rate, lost reasons, cash the pipeline needs),
   links to deals priced in the deal analyser, prints a branded quote, and turns a win into an order or contract. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const STAGES = ['Enquiry', 'Quoted', 'Negotiating', 'Agreed', 'Won', 'Lost', 'On hold'];
  const OPEN = ['Enquiry', 'Quoted', 'Negotiating', 'Agreed'];
  const PROB = { Enquiry: 20, Quoted: 40, Negotiating: 60, Agreed: 90, Won: 100, Lost: 0, 'On hold': 10 };
  const SECTORS = ['Energy', 'Waste & industrial', 'Other'];
  const LOST = ['Price', 'Timing', 'Kit not available', 'Credit / finance', 'Went elsewhere', 'Customer stopped', 'Other'];
  const LOGO = 'assets/compton-logo.png';
  const TERMS = 'Rates are per unit, per week, excluding VAT, for the minimum hire term shown.\nInvoices are raised monthly; payment is due 30 days from the end of the month of invoice.\nDelivery, collection, damage and insurance are as set out in our standard terms and conditions of hire.\nThis quote is subject to vehicle availability and credit approval.';
  const $ = (id) => document.getElementById(id);
  const pm = (d) => (+d.qty || 1) * (+d.weekly_rate || 0) * 52 / 12;               // £ a month at full hire
  const prob = (d) => (d.probability == null ? PROB[d.stage] : +d.probability);
  const wpm = (d) => pm(d) * prob(d) / 100;
  const fd = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const num = (s) => { const n = parseFloat(String(s || '').replace(/[£,]/g, '')); return isNaN(n) ? null : n; };
  let P = [], DEALS = [], TYPES = [], FILTER = 'open';

  async function load() {
    const [p, d, t] = await Promise.all([all('pipeline', 'updated_at.desc'), api('fleet_deals?select=local_id,name,customer,summary,payload&order=updated_at.desc').catch(() => []), api('hire_types?select=type&order=type').catch(() => [])]);
    P = p; DEALS = d; TYPES = [...new Set(t.map((x) => x.type))];
  }

  X.pipeline = { load, data: () => P, pm, wpm, prob, OPEN };   // used by the board pack

  X.routes['p-pipeline'] = async function (el) {
    el.innerHTML = X.head('Pipeline', 'Every hire opportunity from enquiry to won or lost') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Pipeline', '') + `<div class="card"><div class="hint">Could not load the pipeline: ${esc(e.message)}</div></div>`; return; }
    draw(el);
  };

  function draw(el) {
    const open = P.filter((d) => OPEN.includes(d.stage)), agreed = P.filter((d) => d.stage === 'Agreed');
    const yr = addDays(today(), -365), closed = P.filter((d) => (d.stage === 'Won' && (d.won_at || '') >= yr) || (d.stage === 'Lost' && (d.lost_at || '') >= yr));
    const won = closed.filter((d) => d.stage === 'Won');
    const overdue = open.filter((d) => d.next_action_date && d.next_action_date < today());
    const cashNeed = open.filter((d) => d.new_kit !== false).reduce((t, d) => t + (+d.upfront_cash || 0) * prob(d) / 100, 0);
    const shown = FILTER === 'open' ? open : FILTER === 'all' ? P : P.filter((d) => d.stage === FILTER);
    // weighted monthly revenue by start month, next 12 months
    const now = new Date(), months = Array.from({ length: 12 }, (_, i) => { const t = now.getFullYear() * 12 + now.getMonth() + i; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); });
    const byM = months.map((m) => ({ m, v: open.filter((d) => d.start_date && d.start_date.slice(0, 7) <= m).reduce((t, d) => t + wpm(d), 0) }));
    const noStart = open.filter((d) => !d.start_date).length;
    const lostWhy = {}; P.filter((d) => d.stage === 'Lost').forEach((d) => { const k = d.lost_reason || 'No reason given'; lostWhy[k] = (lostWhy[k] || 0) + 1; });

    el.innerHTML = X.head('Pipeline', 'Every hire opportunity from enquiry to won or lost. Monthly values are at full hire: quantity × weekly rate × 52 ÷ 12.') +
      X.tiles([
        { l: 'Open pipeline', v: gbp(open.reduce((t, d) => t + pm(d), 0)) + '/mo', s: open.length + ' open deal' + (open.length === 1 ? '' : 's') },
        { l: 'Weighted by probability', v: gbp(open.reduce((t, d) => t + wpm(d), 0)) + '/mo', s: 'what we expect to land', c: 'g' },
        { l: 'Agreed, not yet on hire', v: gbp(agreed.reduce((t, d) => t + pm(d), 0)) + '/mo', s: agreed.length + ' deal' + (agreed.length === 1 ? '' : 's') },
        { l: 'Cash needed up front', v: gbp(cashNeed), s: 'new kit, weighted by probability', c: 'o' },
        { l: 'Win rate (12 months)', v: closed.length ? Math.round(won.length / closed.length * 100) + '%' : '–', s: won.length + ' won · ' + (closed.length - won.length) + ' lost' },
        { l: 'Actions overdue', v: overdue.length, s: 'next action date passed', c: overdue.length ? 'r' : '' }]) +
      `<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="mini pri2" id="pl_new">+ New opportunity</button>
        <label class="small">Show <select id="pl_f">${[['open', 'Open deals'], ['all', 'Everything'], ...STAGES.map((s) => [s, s])].map(([k, v]) => `<option value="${k}" ${k === FILTER ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <span id="pl_msg" class="small"></span></div><div id="pl_form"></div>
        <div class="box2" style="margin-top:10px"><table><thead><tr><th>Ref</th><th>Customer</th><th>Kit</th><th class="n">Qty</th><th class="n">£/wk</th><th class="n">£/month</th><th>Stage</th><th class="n">Prob.</th><th>Start</th><th>Next action</th><th class="n">Up-front cash</th><th></th></tr></thead><tbody>
        ${shown.length ? shown.map((d) => `<tr><td>${esc(d.ref || '')}</td><td><b>${esc(d.customer)}</b>${d.sector ? `<div class="small muted">${esc(d.sector)}</div>` : ''}</td><td>${esc(d.kit || '')}${d.fleet_type ? `<div class="small muted">${esc(d.fleet_type)}</div>` : ''}</td>
          <td class="n">${d.qty || 1}</td><td class="n">${d.weekly_rate != null ? gbp(d.weekly_rate) : '–'}</td><td class="n">${gbp(pm(d))}</td>
          <td><select data-stage="${d.id}" class="mini">${STAGES.map((s) => `<option ${s === d.stage ? 'selected' : ''}>${s}</option>`).join('')}</select>${d.stage === 'Lost' && d.lost_reason ? `<div class="small muted">${esc(d.lost_reason)}</div>` : ''}</td>
          <td class="n">${prob(d)}%</td><td>${fd(d.start_date) || '<span class="muted">–</span>'}</td>
          <td>${d.next_action ? esc(d.next_action) : '<span class="muted">–</span>'}${d.next_action_date ? `<div class="small" style="color:${d.next_action_date < today() && OPEN.includes(d.stage) ? '#b3261e' : '#6B7280'}">${fd(d.next_action_date)}</div>` : ''}</td>
          <td class="n">${d.upfront_cash != null ? gbp(d.upfront_cash) : '–'}</td>
          <td style="white-space:nowrap"><button class="mini" data-edit="${d.id}">Edit</button> <button class="mini" data-quote="${d.id}">Quote</button>${d.stage === 'Won' ? ` <button class="mini" data-won="${d.id}">${d.order_id || d.contract_id ? 'Order / contract ✓' : 'Create order / contract'}</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="12" class="empty">Nothing here yet.</td></tr>'}
        </tbody></table></div></div>
      <div class="grid2"><div class="card"><h3>Expected revenue from the pipeline</h3><div class="hint">Weighted £ a month once deals have started, by month. ${noStart ? `<b>${noStart}</b> open deal${noStart > 1 ? 's have' : ' has'} no start date and ${noStart > 1 ? 'are' : 'is'} left out.` : ''}</div>
        <div class="box2"><table><thead><tr><th>Month</th><th class="n">Weighted £/month</th></tr></thead><tbody>${byM.map((r) => `<tr><td>${new Date(r.m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td><td class="n">${gbp(r.v)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>Why we lose deals</h3>${Object.keys(lostWhy).length ? `<div class="box2"><table><thead><tr><th>Reason</th><th class="n">Deals</th></tr></thead><tbody>${Object.entries(lostWhy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('')}</tbody></table></div>` : '<div class="hint">No lost deals recorded yet. When you mark a deal Lost you\'ll be asked why.</div>'}</div></div>`;
    wire(el);
  }

  function wire(el) {
    $('pl_f').onchange = (e) => { FILTER = e.target.value; draw(el); };
    $('pl_new').onclick = () => form(el, null);
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => form(el, P.find((d) => d.id == b.dataset.edit)));
    el.querySelectorAll('[data-quote]').forEach((b) => b.onclick = () => { location.hash = '#/p-quotes?deal=' + b.dataset.quote; });   // build / open the quote for this deal
    el.querySelectorAll('[data-won]').forEach((b) => b.onclick = () => wonPanel(el, P.find((d) => d.id == b.dataset.won)));
    el.querySelectorAll('[data-stage]').forEach((s) => s.onchange = async () => {
      const d = P.find((x) => x.id == s.dataset.stage), patch = { stage: s.value, probability: PROB[s.value] };
      if (s.value === 'Lost') { const r = prompt('Why was it lost? (' + LOST.join(', ') + ')', d.lost_reason || 'Price'); if (r === null) { s.value = d.stage; return; } patch.lost_reason = r.trim() || 'Other'; }
      try { await save(d.id, patch); await load(); draw(el); if (s.value === 'Won') wonPanel(el, P.find((x) => x.id == d.id)); } catch (e) { $('pl_msg').textContent = 'Could not save: ' + e.message; } });
  }

  const save = (id, body) => api('pipeline?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });

  function form(el, d) {
    d = d || { qty: 1, stage: 'Enquiry', new_kit: true, quote_date: today(), quote_valid_until: addDays(today(), 30) };
    const f = $('pl_form'), v = (k) => (d[k] == null ? '' : esc(d[k]));
    const opt = (arr, cur) => '<option value=""></option>' + arr.map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
    f.innerHTML = `<div class="card" style="margin-top:12px;border:2px solid #164698"><h3>${d.id ? 'Edit ' + esc(d.ref || '') : 'New opportunity'}</h3>
      <div class="form">
        <div><label>Customer</label><input id="pf_customer" value="${v('customer')}"></div>
        <div><label>Contact name</label><input id="pf_contact_name" value="${v('contact_name')}"></div>
        <div><label>Contact email</label><input id="pf_contact_email" value="${v('contact_email')}"></div>
        <div><label>Contact phone</label><input id="pf_contact_phone" value="${v('contact_phone')}"></div>
        <div><label>Sector</label><select id="pf_sector">${opt(SECTORS, d.sector)}</select></div>
        <div><label>Fleet type</label><select id="pf_fleet_type">${opt(TYPES, d.fleet_type)}</select></div>
        <div><label>Priced in the deal analyser</label><select id="pf_fleet_deal_id"><option value=""></option>${DEALS.map((x) => `<option value="${esc(x.local_id)}" ${x.local_id === d.fleet_deal_id ? 'selected' : ''}>${esc((x.customer || '').trim() + ' – ' + (x.name || '').trim())}</option>`).join('')}</select></div>
        <div><label>Kit</label><input id="pf_kit" value="${v('kit')}" placeholder="e.g. Flexline CM120"></div>
        <div><label>Quantity</label><input id="pf_qty" type="number" min="1" value="${v('qty')}"></div>
        <div><label>Rate £ per unit per week</label><input id="pf_weekly_rate" type="number" step="0.01" value="${v('weekly_rate')}"></div>
        <div><label>Minimum term (months)</label><input id="pf_term_months" type="number" value="${v('term_months')}"></div>
        <div><label>Expected start</label><input id="pf_start_date" type="date" value="${v('start_date')}"></div>
        <div><label>Stage</label><select id="pf_stage">${STAGES.map((s) => `<option ${s === d.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div><label>Probability %</label><input id="pf_probability" type="number" min="0" max="100" value="${d.probability == null ? PROB[d.stage] : d.probability}"></div>
        <div><label>Owner</label><input id="pf_owner" value="${v('owner')}"></div>
        <div><label>Next action</label><input id="pf_next_action" value="${v('next_action')}" placeholder="e.g. Chase signed order"></div>
        <div><label>Next action date</label><input id="pf_next_action_date" type="date" value="${v('next_action_date')}"></div>
        <div><label>Up-front cash £</label><input id="pf_upfront_cash" type="number" value="${v('upfront_cash')}" title="Deposit, VAT and early payments before hire income – from the deal analyser"></div>
        <div><label>Needs new kit buying?</label><select id="pf_new_kit"><option value="true" ${d.new_kit !== false ? 'selected' : ''}>Yes – new kit</option><option value="false" ${d.new_kit === false ? 'selected' : ''}>No – from our fleet</option></select></div>
        <div><label>Lost reason</label><select id="pf_lost_reason">${opt(LOST, d.lost_reason)}</select></div>
        <div><label>Quote date</label><input id="pf_quote_date" type="date" value="${v('quote_date')}"></div>
        <div><label>Quote valid until</label><input id="pf_quote_valid_until" type="date" value="${v('quote_valid_until')}"></div>
      </div>
      <div style="margin-top:8px"><label class="small">Notes</label><textarea id="pf_notes" rows="2" style="width:100%">${v('notes')}</textarea></div>
      <div style="margin-top:8px"><label class="small">Quote terms (printed on the quote – leave blank for the standard wording)</label><textarea id="pf_quote_terms" rows="3" style="width:100%" placeholder="${esc(TERMS)}">${v('quote_terms')}</textarea></div>
      <div style="margin-top:10px;display:flex;gap:8px"><button class="mini pri2" id="pf_save">Save</button><button class="mini" id="pf_cancel">Cancel</button>${d.id ? '<button class="mini" id="pf_del" style="margin-left:auto;color:#b3261e">Delete</button>' : ''}<span id="pf_msg" class="small"></span></div></div>`;
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('pf_stage').onchange = () => { $('pf_probability').value = PROB[$('pf_stage').value]; };
    $('pf_fleet_deal_id').onchange = () => {   // fill from the deal analyser
      const x = DEALS.find((k) => k.local_id === $('pf_fleet_deal_id').value); if (!x) return;
      const s = x.summary || {}, vals = (x.payload && x.payload.values) || {};
      if (!$('pf_customer').value && x.customer) $('pf_customer').value = x.customer.trim();
      if (!$('pf_kit').value && x.name) $('pf_kit').value = x.name.trim();
      const r = num(s.rate); if (r != null) $('pf_weekly_rate').value = r;
      const u = num(s.upfront); if (u != null) $('pf_upfront_cash').value = u;
      if (!$('pf_term_months').value && vals.term) $('pf_term_months').value = Math.round(+vals.term * 12);
    };
    $('pf_cancel').onclick = () => { f.innerHTML = ''; };
    if ($('pf_del')) $('pf_del').onclick = async () => { if (!confirm('Delete ' + (d.ref || 'this opportunity') + '? This cannot be undone.')) return; await api('pipeline?id=eq.' + d.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await load(); draw(el); };
    $('pf_save').onclick = async () => {
      const g = (k) => $('pf_' + k).value.trim();
      const body = { customer: g('customer'), contact_name: g('contact_name') || null, contact_email: g('contact_email') || null, contact_phone: g('contact_phone') || null,
        sector: g('sector') || null, fleet_type: g('fleet_type') || null, fleet_deal_id: g('fleet_deal_id') || null, kit: g('kit') || null, qty: +g('qty') || 1,
        weekly_rate: num(g('weekly_rate')), term_months: +g('term_months') || null, start_date: g('start_date') || null, stage: g('stage'), probability: g('probability') === '' ? null : Math.max(0, Math.min(100, +g('probability'))),
        owner: g('owner') || null, next_action: g('next_action') || null, next_action_date: g('next_action_date') || null, upfront_cash: num(g('upfront_cash')), new_kit: g('new_kit') === 'true',
        lost_reason: g('lost_reason') || null, quote_date: g('quote_date') || null, quote_valid_until: g('quote_valid_until') || null, notes: g('notes') || null, quote_terms: g('quote_terms') || null };
      if (!body.customer) { $('pf_msg').innerHTML = '<span style="color:#b3261e">Enter the customer.</span>'; return; }
      if (body.stage === 'Lost' && !body.lost_reason) { $('pf_msg').innerHTML = '<span style="color:#b3261e">Choose why it was lost.</span>'; return; }
      try { $('pf_msg').textContent = 'Saving…';
        if (d.id) await save(d.id, body); else await api('pipeline', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
        await load(); draw(el); $('pl_msg').innerHTML = '<span style="color:#1b7f4b">Saved ✓</span>';
      } catch (e) { $('pf_msg').innerHTML = '<span style="color:#b3261e">Could not save: ' + esc(e.message) + '</span>'; } };
  }

  // A won deal becomes a purchase order (new kit) and/or a contract, so it flows into the forecasts.
  function wonPanel(el, d) {
    const f = $('pl_form'), deal = DEALS.find((k) => k.local_id === d.fleet_deal_id), vals = (deal && deal.payload && deal.payload.values) || {};
    f.innerHTML = `<div class="card" style="margin-top:12px;border:2px solid #1b7f4b"><h3>${esc(d.ref)} won – ${esc(d.customer)}</h3>
      <div class="hint">Put it into the forecasts. The order feeds New purchases (finance, cash and depreciation); the contract feeds HP vs Contracts and guaranteed revenue.</div>
      <div class="grid2"><div><h4>Purchase order ${d.order_id ? '✓ created' : ''}</h4>
        <div class="form"><div><label>Price per unit £</label><input id="wo_price" type="number" value="${esc(vals.price || '')}"></div><div><label>Deposit %</label><input id="wo_dep" type="number" value="${esc(vals.dep || 25)}"></div>
        <div><label>HP rate %</label><input id="wo_rate" type="number" step="0.1" value="${esc(vals.rate || 6.8)}"></div><div><label>Term (months)</label><input id="wo_term" type="number" value="${vals.term ? Math.round(vals.term * 12) : 60}"></div>
        <div><label>Delivery</label><input id="wo_del" type="date" value="${esc(d.start_date || '')}"></div></div>
        <button class="mini pri2" id="wo_go" style="margin-top:8px" ${d.order_id || d.new_kit === false ? 'disabled' : ''}>Create order</button>${d.new_kit === false ? ' <span class="small muted">From our fleet – no order needed</span>' : ''}</div>
      <div><h4>Contract ${d.contract_id ? '✓ created' : ''}</h4>
        <div class="form"><div><label>Unit(s)</label><input id="wc_unit" placeholder="e.g. TR540 – or TBC"></div><div><label>Start</label><input id="wc_start" type="date" value="${esc(d.start_date || '')}"></div>
        <div><label>Months</label><input id="wc_months" type="number" value="${d.term_months || ''}"></div><div><label>£ a month</label><input id="wc_rate" type="number" value="${Math.round(pm(d) * 100) / 100}"></div></div>
        <button class="mini pri2" id="wc_go" style="margin-top:8px" ${d.contract_id ? 'disabled' : ''}>Create contract</button></div></div>
      <div style="margin-top:8px"><button class="mini" id="w_close">Close</button> <span id="w_msg" class="small"></span></div></div>`;
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('w_close').onclick = () => { f.innerHTML = ''; };
    $('wo_go').onclick = async () => {
      try { const [o] = await api('asset_orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          description: (d.kit || 'New kit') + ' – ' + d.customer + ' (' + d.ref + ')', category: d.fleet_type || null, fleet_type: d.fleet_type || null, qty: d.qty || 1,
          unit_price: num($('wo_price').value) || 0, deposit_pct: num($('wo_dep').value) || 0, rate_pct: num($('wo_rate').value) || 0, term_months: +$('wo_term').value || 60,
          delivery_date: $('wo_del').value || null, status: 'Ordered', weekly_rate: +d.weekly_rate || 0, utilisation_pct: 100, notes: 'From pipeline ' + d.ref }) });
        await save(d.id, { order_id: o.id }); await load(); wonPanel(el, P.find((x) => x.id == d.id)); $('w_msg').innerHTML = '<span style="color:#1b7f4b">Order created in New purchases ✓</span>';
      } catch (e) { $('w_msg').innerHTML = '<span style="color:#b3261e">' + esc(e.message) + '</span>'; } };
    $('wc_go').onclick = async () => {
      const start = $('wc_start').value || null, months = +$('wc_months').value || null;
      let end = null; if (start && months) { const e = new Date(start); e.setMonth(e.getMonth() + months); e.setDate(e.getDate() - 1); end = e.toISOString().slice(0, 10); }
      try { const [c] = await api('contracts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          unit: $('wc_unit').value.trim() || 'TBC ' + d.ref, asset_type: d.fleet_type || null, customer: d.customer, start_date: start, end_date: end, rolling: !end,
          monthly_rate: num($('wc_rate').value) || 0, source: 'pipeline', external_ref: d.ref, notes: (d.kit || '') + ' – from pipeline ' + d.ref, active: true }) });
        await save(d.id, { contract_id: c.id }); await load(); wonPanel(el, P.find((x) => x.id == d.id)); $('w_msg').innerHTML = '<span style="color:#1b7f4b">Contract created ✓</span>';
      } catch (e) { $('w_msg').innerHTML = '<span style="color:#b3261e">' + esc(e.message) + '</span>'; } };
  }

  // Branded quote on Compton Tankers headed paper – opens ready to print or save as PDF.
  async function quote(d) {
    const s = await X.session().catch(() => null), who = (s && s.user && (s.user.user_metadata?.name || s.user.email)) || 'Compton Tankers';
    const qd = d.quote_date || today(), valid = d.quote_valid_until || addDays(qd, 30), terms = (d.quote_terms || TERMS).split('\n').filter(Boolean);
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups for the portal to open the quote.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Quote ${esc(d.ref)} – ${esc(d.customer)}</title><style>
      @page{size:A4;margin:16mm 18mm}body{font-family:Arial,sans-serif;color:#0B2A66;font-size:10.5pt;margin:0}
      .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E4611D;padding-bottom:10px}.hd img{height:62px}
      .hd .r{text-align:right;font-size:9pt;line-height:1.5}.hd .r b{color:#164698}.tag{color:#E4611D;font-weight:bold;font-size:9pt}
      h1{font-size:20pt;margin:22px 0 4px;color:#164698}.meta{display:flex;gap:40px;margin:10px 0 18px;font-size:10pt}.meta div span{display:block;color:#6B7280;font-size:8.5pt}
      table{width:100%;border-collapse:collapse;margin:8px 0 18px}th{background:#164698;color:#fff;text-align:left;padding:7px 8px;font-size:9.5pt}td{padding:8px;border-bottom:1px solid #E3E7EE;vertical-align:top}td.n,th.n{text-align:right}
      .tot td{font-weight:bold;border-bottom:2px solid #164698}h3{font-size:11pt;color:#164698;margin:16px 0 6px}ul{margin:0;padding-left:18px;color:#222}li{margin:3px 0}
      .ft{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #164698;padding-top:6px;font-size:7.5pt;color:#6B7280}.ft b{color:#164698}
      .pb{margin-top:26px}.no{color:#222}@media screen{body{max-width:800px;margin:20px auto;padding:20px}.ft{position:static;margin-top:40px}}
      </style></head><body>
      <div class="hd"><img src="${base + LOGO}" alt="Compton Tankers"><div class="r"><div class="tag">Tanker hire · Sales · Specialist workshops</div><b>T</b> 01525 371 707<br><b>E</b> info@comptontankers.com<br><b>W</b> www.comptontankers.com</div></div>
      <h1>Hire quotation</h1>
      <div class="meta"><div><span>Quote</span>${esc(d.ref)}</div><div><span>Date</span>${fd(qd)}</div><div><span>Valid until</span>${fd(valid)}</div><div><span>For</span>${esc(d.customer)}${d.contact_name ? '<br>FAO ' + esc(d.contact_name) : ''}</div></div>
      <p class="no">Thank you for your enquiry. We are pleased to quote as follows.</p>
      <table><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate per unit / week</th><th class="n">Minimum term</th><th class="n">Monthly total</th></tr>
      <tr><td><b>${esc(d.kit || '')}</b>${d.fleet_type ? '<br>' + esc(d.fleet_type) : ''}</td><td class="n">${d.qty || 1}</td><td class="n">${d.weekly_rate != null ? gbp(d.weekly_rate) : '–'}</td><td class="n">${d.term_months ? d.term_months + ' months' : '–'}</td><td class="n">${gbp(pm(d))}</td></tr>
      <tr class="tot"><td colspan="4">Total per month, excluding VAT (weekly rate × 52 ÷ 12)</td><td class="n">${gbp(pm(d))}</td></tr></table>
      ${d.start_date ? `<p class="no">Proposed start: <b>${fd(d.start_date)}</b>.</p>` : ''}
      <h3>Terms</h3><ul>${terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="pb no">To accept, reply to this quote or call us on 01525 371 707.<br><br>Kind regards,<br><br><b>${esc(who)}</b><br>Compton Tankers</div>
      <div class="ft"><b>Leighton Buzzard · Ellesmere Port · Mpumalanga, South Africa</b><br>Compton Tankers is a trading name of Tanker Rent UK Limited. Registered in England and Wales, company number 04432719. Registered office: Comptons Yard, Grovebury Road, Leighton Buzzard, Bedfordshire LU7 4TS.</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
    if (d.stage === 'Enquiry') { try { await save(d.id, { stage: 'Quoted', probability: PROB.Quoted, quote_date: qd, quote_valid_until: valid }); } catch (e) { } }
  }
})();
