/* New asset orders: what is on order, estimated HP finance, and the effect on the forecast. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, C, NOW, mon, T } = X;
  const { cols, row } = X.charts;
  const $ = (id) => document.getElementById(id);
  const kOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const STAT = ['Potential', 'Ordered', 'Delivered', 'In HP schedule already', 'Cancelled'];
  let WHATIF = false;   // page only: also show potential orders
  let ORD = [], POL = [];
  const live = (o, w) => o.status === 'Ordered' || o.status === 'Delivered' || (w && o.status === 'Potential');
  const pol = (c) => POL.find((p) => String(p.category).toLowerCase() === String(c || '').toLowerCase()) || { life_years: 8, residual_pct: 10 };

  // Finance for one order line: amount financed, monthly payment, and month-by-month figures.
  function calc(o) {
    const gross = (+o.qty || 1) * (+o.unit_price || 0), dep = gross * ((+o.deposit_pct || 0) / 100), fin = gross - dep;
    const n = Math.max(1, +o.term_months || 60), r = (+o.rate_pct || 0) / 1200;
    const pmt = r ? fin * r / (1 - Math.pow(1 + r, -n)) : fin / n;
    const p = pol(o.category), life = Math.max(1, +p.life_years) * 12, depMonth = gross * (1 - (+p.residual_pct || 0) / 100) / life;
    const d = o.delivery_date ? mon(String(o.delivery_date).slice(0, 7) + '-01') : null;
    const vat = o.vat_upfront === false ? 0 : gross * 0.2;
    const adv = !!o.advance_rental, last = adv ? n - 1 : n;   // 59+1: first payment at commencement, then n-1 monthly
    return { gross, dep, fin, n, r, pmt, depMonth, d, vat, adv, last };
  }
  function at(o, m, w) {   // figures for month index m
    const c = calc(o); if (c.d == null || !live(o, w)) return { int: 0, dep: 0, pay: 0, deposit: 0, buy: 0, rev: 0, vat: 0 };
    const k = m - c.d;   // 0 = delivery month
    let bal = c.adv ? c.fin - c.pmt : c.fin, int = 0;
    const inPay = k >= 1 && k <= c.last;
    if (inPay) { for (let i = 1; i <= k; i++) { int = bal * c.r; bal -= c.pmt - int; } }
    const lag = Math.max(0, +o.start_lag || 0), rev = k >= lag ? (+o.qty || 1) * (+o.weekly_rate || 0) * 52 / 12 * ((+o.utilisation_pct || 0) / 100) : 0;
    return { vat: k === 0 ? c.vat : 0, rev, int: inPay ? int : 0, dep: k >= 0 ? c.depMonth : 0, pay: (inPay || (c.adv && k === 0)) ? c.pmt : 0, deposit: k === 0 ? c.dep : 0, buy: k === 0 ? c.gross : 0 };
  }
  const sumAt = (m, f, w) => ORD.reduce((t, o) => t + at(o, m, w)[f], 0);
  const wi = () => WHATIF;

  X.orders = {
    load: async () => { [ORD, POL] = await Promise.all([all('asset_orders', 'delivery_date.asc.nullslast'), all('fa_policies', 'category.asc')]); return ORD; },
    impact: (m) => ({ int: sumAt(m, 'int'), dep: sumAt(m, 'dep'), rev: sumAt(m, 'rev') }),
    off: false, pot: false,
    cash: (k) => { if (X.orders.off) return { inflow: 0, out: 0, vat: 0, rev: 0 }; const m = +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1), p = X.orders.pot, rev = sumAt(m, 'rev', p), vat = sumAt(m, 'vat', p); return { taxable: rev * 1.2, inflow: sumAt(m - 1, 'rev', p) * 1.2, out: sumAt(m, 'pay', p) + sumAt(m, 'deposit', p) + vat, vat, rev }; },
    count: () => ORD.filter(live).length,
    _lr: (w, v) => longRun(w, v), _set: (o, p) => { ORD = o; POL = p; }
  };

  // Five-year cash view of the orders on their own, after VAT: purchase VAT is paid on delivery and comes back (net of VAT due on the hire) in the VAT return month.
  function longRun(w, VSx) {
    const N = 60, qe = VSx && VSx.vat_quarter_end ? +String(VSx.vat_quarter_end).slice(0, 4) * 12 + (+String(VSx.vat_quarter_end).slice(5, 7) - 1) : 2026 * 12 + 3, lag = VSx ? (+VSx.vat_pay_lag || 0) : 1;
    const A = (m, f) => sumAt(m, f, w), rows = [];
    for (let i = 0; i < N; i++) {
      const m = NOW + i, hire = A(m - 1, 'rev'), out = hire * 0.2, inp = A(m, 'vat'), q = m - lag;
      let settle = 0, note = '', vIn = 0, vOut = 0;
      if (((q - qe) % 3 + 3) % 3 === 0) { let o2 = 0, i2 = 0; for (let j = q - 2; j <= q; j++) { o2 += A(j, 'rev') * 0.2; i2 += A(j, 'vat'); } settle = i2 - o2; vIn = i2; vOut = o2; note = lab(q - 2) + ' – ' + lab(q); }
      rows.push({ m, dep: A(m, 'deposit'), hp: A(m, 'pay'), vatPaid: inp, hireIn: hire + out, hireIn0: 0, settle, note, vatIn: note ? vIn : 0, vatOut: note ? vOut : 0 });
    }
    let cum = 0; rows.forEach((r) => { r.net = r.hireIn - r.dep - r.hp - r.vatPaid + r.settle; cum += r.net; r.cum = cum; });
    const low = rows.reduce((a, r) => (r.cum < a.cum ? r : a), rows[0]);
    const pay = low.cum < 0 ? rows.find((r) => r.m > low.m && r.cum >= 0) : null;
    return { rows, low, pay };
  }

  let FT = [], VS = null;
  const refundMonth = (o) => { const c = calc(o); if (c.d == null || o.vat_upfront === false || !VS) return '–'; const qe = +String(VS.vat_quarter_end).slice(0, 4) * 12 + (+String(VS.vat_quarter_end).slice(5, 7) - 1); let q = c.d; while (((q - qe) % 3 + 3) % 3 !== 0) q++; return lab(q + (+VS.vat_pay_lag || 0)); };
  const policyFor = (t) => { t = String(t || '').toLowerCase(); return /tractor/.test(t) ? 'Tractor units' : /rigid|megalift|gully|combination/.test(t) ? 'Rigid vehicles' : /excavator|jcb|telehandler|plant|loader/.test(t) ? 'Plant & equipment' : /artic|trailer|tanker/.test(t) ? 'Tanker trailers' : 'Other trailers'; };
  X.routes.orders = async (el) => { el.innerHTML = X.head('New assets on order', 'Loading…') + '<div class="empty">Loading…</div>'; await X.orders.load(); try { VS = (await api('cf_settings?select=*&limit=1'))[0]; } catch (e) { VS = null; } try { const d = await X.loadFinance(); FT = [...new Set(d.fleet.map((u) => u.type).filter(Boolean))].sort(); } catch (e) { FT = []; } draw(el); };

  function draw(el) {
    const W = WHATIF, S = (m, f) => sumAt(m, f, W);
    const open = ORD.filter((o) => live(o, W)), ms = Array.from({ length: 24 }, (_, i) => NOW + i);
    const pot = ORD.filter((o) => o.status === 'Potential').length;
    const tot = open.reduce((t, o) => t + calc(o).gross, 0), fin = open.reduce((t, o) => t + calc(o).fin, 0), dep = open.reduce((t, o) => t + calc(o).dep, 0), pmt = open.reduce((t, o) => t + calc(o).pmt, 0);
    const monthRev = open.reduce((t, o) => t + (+o.qty || 1) * (+o.weekly_rate || 0) * 52 / 12 * ((+o.utilisation_pct || 0) / 100), 0);
    const LR = longRun(W, VS);
    const tiles = X.tiles([
      { l: 'Units on order', v: open.reduce((t, o) => t + (+o.qty || 0), 0), s: open.length + ' order line' + (open.length === 1 ? '' : 's') + (W ? ' incl. potential' : ''), c: 'o' },
      { l: 'Total committed (ex VAT)', v: gbp(tot), s: 'deposits ' + gbp(dep) },
      { l: 'To be financed', v: gbp(fin), s: 'estimated HP' },
      { l: 'New HP payments', v: gbp(pmt) + '/mo', s: 'once everything is delivered' },
      { l: 'Hire income when all on hire', v: gbp(monthRev) + '/mo', s: 'ex VAT, at the utilisation entered', c: 'g' },
      { l: 'Most cash tied up (orders alone)', v: LR.low.cum < 0 ? gbp(-LR.low.cum) : '–', s: LR.low.cum < 0 ? 'in ' + lab(LR.low.m) + ', after VAT and hire income' : 'orders pay for themselves', c: 'o' },
      { l: 'Orders paid back in cash by', v: LR.pay ? lab(LR.pay.m) : (LR.low.cum < 0 ? 'beyond 5 years' : '–'), s: 'running total of hire in less HP, deposits and VAT', c: 'g' }]);
    const polSel = (id, v) => `<select data-id="${id}" data-f="category" style="padding:4px 6px">${(POL.length ? POL.map((p) => p.category) : ['Tanker trailers']).map((c) => `<option ${c === v ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    const sel = (id, v) => `<select data-id="${id}" data-f="status" style="padding:4px 6px">${STAT.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    const inp = (id, f, v, w, t) => `<input data-id="${id}" data-f="${f}" type="${t || 'number'}" value="${v == null ? '' : v}" style="width:${w}px;padding:4px 6px" step="any">`;
    const rows = ORD.map((o) => { const c = calc(o), dm = o.delivery_date ? String(o.delivery_date).slice(0, 7) : ''; return `<tr><td>${esc(o.description)}</td><td data-g="${esc(o.status)}">${sel(o.id, o.status)}</td><td>${inp(o.id, 'fleet_type', o.fleet_type || '', 190, 'text').replace('<input', '<input list="o_ftl"')}</td><td>${polSel(o.id, o.category)}</td><td class="n">${o.qty}</td><td class="n">${gbp(c.gross)}</td><td>${inp(o.id, 'delivery_date', dm, 130, 'month')}</td><td class="n">${inp(o.id, 'deposit_pct', o.deposit_pct, 60)}</td><td class="n">${inp(o.id, 'deposit_amt', Math.round(c.dep * 100) / 100, 90)}</td><td class="n">${o.term_months}m @ ${o.rate_pct}%</td><td><label style="display:flex;gap:4px;align-items:center;margin:0;white-space:nowrap"><input type="checkbox" data-id="${o.id}" data-f="advance_rental" ${o.advance_rental ? 'checked' : ''} style="width:auto"> ${(+o.term_months || 60) - 1}+1</label></td><td class="n">${gbp(c.pmt)}</td><td><input type="checkbox" data-id="${o.id}" data-f="vat_upfront" ${o.vat_upfront === false ? '' : 'checked'} style="width:auto"> ${o.vat_upfront === false ? '' : gbp(c.vat)}</td><td>${refundMonth(o)}</td><td class="n">${inp(o.id, 'weekly_rate', o.weekly_rate, 80)}</td><td class="n">${inp(o.id, 'utilisation_pct', o.utilisation_pct, 60)}</td><td style="white-space:nowrap">${(+o.qty || 1) > 1 ? `<button class="mini" data-split="${o.id}">Split delivery</button> ` : ''}<button data-del="${o.id}" style="border:0;background:none;color:${C.bad};cursor:pointer">Delete</button></td></tr>`; }).join('');
    const catOpts = (POL.length ? POL.map((p) => p.category) : ['Tanker trailers']).map((c) => `<option>${esc(c)}</option>`).join('');
    const impRows = ms.map((m) => ({ m, int: S(m, 'int'), dep: S(m, 'dep'), pay: S(m, 'pay'), dp: S(m, 'deposit'), rev: S(m, 'rev'), vat: S(m, 'vat') })).filter((x) => x.int || x.dep || x.pay || x.dp || x.rev || x.vat);
    el.innerHTML = X.head('New assets on order', 'What we have ordered, the estimated finance and hire income · confirmed orders feed the Cash flow and Budget forecasts') + tiles +
      `<div class="flt"><label style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="o_wi" ${W ? 'checked' : ''} style="width:auto"> Show potential orders in these figures (${pot} potential) – they never feed the forecasts until marked <b>Ordered</b></label></div>
      <div class="card"><h3>Purchase VAT – paid out, then returned</h3><div class="hint">Cash movements of these orders only, month by month. The purchase VAT leaves on delivery and comes back in the VAT return month (the quarter's return, ${VS ? (+VS.vat_pay_lag || 0) + ' month(s) after the quarter ends' : 'after the quarter ends'}).</div><div id="o_vs"></div><div id="o_vc"></div><div class="legend" style="margin-top:6px"><span><i style="background:#7d5ba6"></i>Purchase VAT paid</span><span><i style="background:#2f8f5b"></i>Purchase VAT returned</span><span><i style="background:${C.orange}"></i>Deposit</span><span><i style="background:${C.blue}"></i>HP payments</span><span><i style="background:#9fd1b3"></i>Hire received (incl. VAT)</span><span><i style="background:#e8a0a0"></i>VAT due on the hire</span></div></div>
      <div class="card"><h3>Cash vs minimum buffer – with and without these orders</h3><div class="hint">The whole business, from the Cash flow forecast, for the next six months (long enough for the VAT to come back). The orange line adds these orders – deposit and VAT paid on delivery, HP payments, and hire income received on 30 days end-of-month terms. VAT paid on the purchase comes back in the VAT return month${VS ? ' (' + (+VS.vat_pay_lag || 0) + ' month(s) after the quarter ends)' : ''}, net of the VAT due on the hire. Solid = actual, dashed = forecast, dotted line = your buffer.${W ? ' Potential orders included.' : ''}</div><div id="o_eff"><div class="hint">Calculating…</div></div><div class="box2" id="o_efft"></div></div>
      <div class="card"><h3>On order</h3><div class="hint">Change the <b>delivery month</b> when a supplier slips – everything recalculates. Hire income starts the month after delivery by default. Enter the weekly rate and utilisation you expect.</div>${ORD.length ? `<div class="box2"><table id="o_tab"><thead><tr><th>Asset</th><th>Status</th><th>Fleet type</th><th>Depreciation</th><th class="n">Qty</th><th class="n">Total</th><th>Delivery</th><th class="n">Deposit %</th><th class="n">Deposit £</th><th class="n">HP</th><th>Advance first payment</th><th class="n">Est. monthly</th><th>VAT up front</th><th>VAT back</th><th class="n">£/wk each</th><th class="n">Util %</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nothing on order yet – add the first below.</div>'}</div>
      <datalist id="o_ftl">${FT.map((t) => `<option value="${esc(t)}">`).join('')}</datalist><div class="card"><h3>Add an order</h3><div class="hint">Fleet types are the same as the fleet list (or type a new one). Ordering several? Use <b>Split delivery</b> on the order line to give each batch its own delivery month. Prices ex VAT. Start as <b>Potential</b> to test it; set <b>Ordered</b> once it is confirmed and it flows into the Cash flow and Budget. The finance is an estimate (standard HP repayment) – replace it with the lender's quote. <b>59+1</b> = first payment at commencement then the rest monthly, as in the deal analyser. Mark an order <b>In HP schedule already</b> once it appears there so it isn't counted twice.</div>
        <div class="form"><div><label>Asset</label><input id="o_d" placeholder="e.g. JCB 541-70 telehandler"></div><div><label>Fleet type</label><input id="o_ft" list="o_ftl" placeholder="pick or type a new type"></div><div><label>Supplier</label><input id="o_s"></div><div><label>Qty</label><input id="o_q" type="number" value="1" min="1"></div><div><label>Unit price £</label><input id="o_p" type="number" step="0.01"></div><div><label>Delivery month</label><input id="o_dt" type="month"></div><div><label>Deposit %</label><input id="o_dp" type="number" step="0.1" value="10"></div><div><label>Deposit £ (total)</label><input id="o_da" type="number" step="1"></div><div><label>Term (months)</label><input id="o_t" type="number" value="60"></div><div><label>Rate % APR</label><input id="o_r" type="number" step="0.1" value="8"></div><div style="align-self:end"><label style="display:flex;gap:6px;align-items:center"><input id="o_adv" type="checkbox" style="width:auto"> 59+1 (first payment at commencement)</label></div><div><label>Hire £/week each</label><input id="o_w" type="number" step="1" value="0"></div><div><label>Utilisation %</label><input id="o_u" type="number" value="80"></div><div><label>Months to first hire</label><input id="o_l" type="number" value="1" min="0"></div><div><label>Status</label><select id="o_st">${STAT.map((x) => `<option>${x}</option>`).join('')}</select></div><div><button id="o_add" type="button">Add order</button></div></div><div style="margin:10px 0"><button id="o_split" type="button" class="ghost">+ Split delivery</button> <span class="hint">Qty above is the first batch; each extra batch becomes its own line with its own delivery month.</span><div id="o_sp"></div></div><div id="o_err" style="color:${C.bad};min-height:18px"></div></div>
      <div class="card"><h3>Effect on the forecasts</h3><div class="hint">Confirmed orders are added to the Cash flow forecast (hire income incl. VAT, deposits and HP payments) and to the Budget / Management accounts forecast (hire income, HP interest, depreciation). Future months only.</div>${impRows.length ? `<div class="box2"><table><thead><tr><th>Month</th><th class="n">Hire income</th><th class="n">VAT paid</th><th class="n">Deposit</th><th class="n">HP payment</th><th class="n">HP interest (P&amp;L)</th><th class="n">Depreciation (P&amp;L)</th></tr></thead><tbody>${impRows.map((x) => `<tr><td>${lab(x.m)}</td><td class="n">${x.rev ? gbp(x.rev) : '–'}</td><td class="n">${x.vat ? gbp(x.vat) : '–'}</td><td class="n">${x.dp ? gbp(x.dp) : '–'}</td><td class="n">${x.pay ? gbp(x.pay) : '–'}</td><td class="n">${x.int ? gbp(x.int) : '–'}</td><td class="n">${x.dep ? gbp(x.dep) : '–'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No impact yet.</div>'}</div>`;
    (function () {
      const rs = LR.rows.slice(0, 9), paid = rs.filter((r) => r.vatPaid > 1), back = rs.filter((r) => r.vatIn > 1);
      if (!paid.length && !back.length) { $('o_vs').innerHTML = '<div class="hint">No purchase VAT in these months yet.</div>'; return; }
      const pt = paid.reduce((t, r) => t + r.vatPaid, 0), bt = back.reduce((t, r) => t + r.vatIn, 0);
      $('o_vs').innerHTML = `<div style="display:flex;gap:28px;flex-wrap:wrap;margin:6px 0 10px"><div><div class="hint">Purchase VAT paid</div><b style="font-size:20px;color:#7d5ba6">${gbp(pt)}</b><div class="hint">${paid.map((r) => lab(r.m)).join(', ')}</div></div><div style="font-size:26px;align-self:center">→</div><div><div class="hint">Purchase VAT returned</div><b style="font-size:20px;color:#2f8f5b">${back.length ? gbp(bt) : 'not yet'}</b><div class="hint">${back.length ? back.map((r) => lab(r.m)).join(', ') : 'return falls after these months'}</div></div>${back.length ? `<div><div class="hint">Less VAT due on the hire in that return</div><b style="font-size:20px">${gbp(back.reduce((t, r) => t + r.vatOut, 0))}</b><div class="hint">net refund ${gbp(back.reduce((t, r) => t + r.settle, 0))}</div></div>` : ''}</div>`;
      cols($('o_vc'), rs.map((r) => ({ l: lab(r.m), parts: [{ v: r.hireIn, c: '#9fd1b3', n: 'Hire received' }, { v: r.vatIn, c: '#2f8f5b', n: 'Purchase VAT returned' }, { v: -r.dep, c: C.orange, n: 'Deposit' }, { v: -r.hp, c: C.blue, n: 'HP' }, { v: -r.vatPaid, c: '#7d5ba6', n: 'Purchase VAT paid' }, { v: -r.vatOut, c: '#e8a0a0', n: 'VAT due on hire' }],
        tip: `<b>${lab(r.m)}</b>` + row('Purchase VAT paid', gbp(-r.vatPaid)) + row('Purchase VAT returned', gbp(r.vatIn)) + row('VAT due on the hire (same return)', gbp(-r.vatOut)) + row('Deposit', gbp(-r.dep)) + row('HP payments', gbp(-r.hp)) + row('Hire received incl. VAT', gbp(r.hireIn)) + row('Net cash this month', gbp(r.net)) })), { title: 'Purchase VAT paid and returned', h: 240 });
    })();
    const gross = () => (parseFloat($('o_q').value) || 1) * (parseFloat($('o_p').value) || 0);
    const fromPct = () => { const g = gross(); $('o_da').value = g ? Math.round(g * (parseFloat($('o_dp').value) || 0)) / 100 : ''; };
    $('o_dp').addEventListener('input', fromPct); $('o_p').addEventListener('input', fromPct); $('o_q').addEventListener('input', fromPct);
    $('o_da').addEventListener('input', () => { const g = gross(); if (g) $('o_dp').value = Math.round((parseFloat($('o_da').value) || 0) / g * 10000) / 100; });
    fromPct();
    el.querySelectorAll('[data-split]').forEach((b) => b.onclick = () => { const o = ORD.find((x) => x.id == b.dataset.split); if (!o) return; const bg = X.dispose.dialog('Split delivery', `<div class="note"><b>${esc(o.description)}</b> – ${o.qty} units, delivery ${o.delivery_date ? String(o.delivery_date).slice(0, 7) : 'TBC'}. Move some units to a separate line with their own delivery month.</div><label>Units in the new delivery</label><input id="sp_n" type="number" min="1" max="${o.qty - 1}" value="1"><label>Delivery month for those units</label><input id="sp_m" type="month" value="${o.delivery_date ? String(o.delivery_date).slice(0, 7) : ''}">`, 'Split', async () => { const n = parseInt(bg.querySelector('#sp_n').value) || 0, mth = bg.querySelector('#sp_m').value; if (n < 1 || n >= o.qty) throw new Error('Choose between 1 and ' + (o.qty - 1) + ' units'); const copy = Object.assign({}, o); delete copy.id; delete copy.created_at; copy.qty = n; copy.delivery_date = mth ? mth + '-01' : null; await api('asset_orders', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(copy) }); await api('asset_orders?id=eq.' + o.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ qty: o.qty - n }) }); await X.orders.load(); draw(el); }); });
    (async () => {
      try {
        const M = await X.cf.load(); X.cf.extend(M, 12, await X.cf.hpSchedule());
        X.orders.pot = W; const R1 = X.cf.compute(M); X.orders.off = true; const R0 = X.cf.compute(M); X.orders.off = false; X.orders.pot = false;
        const box = $('o_eff'); if (!box) return;
        const ks = (k) => +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1), lastC = R1.reduce((a, r, i) => (r.closed ? i : a), -1), R = R1.map((r, i) => { const vn = (z) => (z.val('vat_refund', 'f') || 0) - (z.val('vat', 'f') || 0); return { r, b: R0[i], i, vb: vn(r) - vn(R0[i]) }; }).filter((x) => x.i >= Math.max(0, lastC)).filter((x, j, a) => x.r.closed || a.slice(0, j + 1).filter((y) => !y.r.closed).length <= 6), open = R.filter((x) => !x.r.closed);
        if (!open.length) { box.innerHTML = '<div class="hint">No forecast months yet.</div>'; return; }
        const vbm = open.filter((q) => q.vb > 1)[0], lowN = open.reduce((a, x) => (x.r.head < a.r.head ? x : a)), lowB = open.reduce((a, x) => (x.b.head < a.b.head ? x : a)), buf = R[0].r.buffer;
        box.innerHTML = '<div id="o_eff1"></div><div class="hint" style="margin-top:8px">Lowest cash headroom over the buffer: <b>' + gbp(lowN.r.head) + '</b> in ' + lab(ks(lowN.r.k)) + ' with the orders, against <b>' + gbp(lowB.b.head) + '</b> in ' + lab(ks(lowB.b.k)) + ' without.' + (lowN.r.head < 0 ? ' <span style="color:' + C.bad + '">Cash would fall below the buffer – look at the delivery date, deposit or finance.</span>' : '') + (vbm ? ' <b style="color:#7d5ba6">VAT back from these orders: ' + gbp(vbm.vb) + ' in ' + lab(ks(vbm.r.k)) + '</b> (the quarter\'s VAT return, net of the VAT due on the hire) – it is already in the orange line.' : ' No VAT return from these orders falls inside these months.') + '</div>';
        // chart, same style as the Cash flow page
        const el1 = $('o_eff1'), Wd = el1.clientWidth || 900, H = 320, Mg = { t: 12, r: 12, b: 32, l: 62 }, f0 = d3.format('~s');
        const svg = d3.select(el1).append('svg').attr('width', Wd).attr('height', H), names = R.map((x) => lab(ks(x.r.k)));
        const x = d3.scalePoint().domain(names).range([Mg.l + 20, Wd - Mg.r - 20]);
        const vals = R.flatMap((q) => [q.r.eff, q.b.eff, buf]), y = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), d3.max(vals) * 1.08]).nice().range([H - Mg.b, Mg.t]);
        svg.append('g').attr('transform', `translate(${Mg.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => (v < 0 ? '-' : '') + '£' + f0(Math.abs(v))).tickSize(-(Wd - Mg.l - Mg.r))).call((g) => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', C.line); g.selectAll('text').attr('fill', C.mut).attr('font-size', 12); });
        const step = Math.ceil(names.length / 12);
        svg.append('g').attr('transform', `translate(0,${H - Mg.b})`).call(d3.axisBottom(x).tickValues(names.filter((n, i) => i % step === 0)).tickSize(0)).call((g) => { g.select('.domain').attr('stroke', C.line); g.selectAll('text').attr('fill', C.mut).attr('font-size', 12).attr('dy', '1.2em'); });
        svg.append('line').attr('x1', Mg.l).attr('x2', Wd - Mg.r).attr('y1', y(buf)).attr('y2', y(buf)).attr('stroke', C.bad).attr('stroke-dasharray', '2 4').attr('stroke-width', 2);
        const ln = (key) => d3.line().x((q) => x(lab(ks(q.r.k)))).y((q) => y(q[key].eff));
        const fcs = R.filter((q, i) => !q.r.closed || (R[i + 1] && !R[i + 1].r.closed)), cl = R.filter((q) => q.r.closed);
        svg.append('path').datum(fcs).attr('fill', 'none').attr('stroke', '#8a94a6').attr('stroke-width', 2).attr('stroke-dasharray', '3 4').attr('d', ln('b'));
        svg.append('path').datum(fcs).attr('fill', 'none').attr('stroke', C.orange).attr('stroke-width', 2.5).attr('stroke-dasharray', '7 5').attr('d', ln('r'));
        if (cl.length > 1) svg.append('path').datum(cl).attr('fill', 'none').attr('stroke', C.blue).attr('stroke-width', 3).attr('d', d3.line().x((q) => x(lab(ks(q.r.k)))).y((q) => y(q.r.closeA)));
        svg.selectAll('circle').data(R).join('circle').attr('cx', (q) => x(lab(ks(q.r.k)))).attr('cy', (q) => y(q.r.eff)).attr('r', 4.5).attr('fill', (q) => (q.r.closed ? C.blue : '#fff')).attr('stroke', (q) => (q.r.eff < q.r.buffer ? C.bad : q.r.closed ? C.blue : C.orange)).attr('stroke-width', 2.5)
          .on('mousemove', (e, q) => { const o = q.r.oc || {}; T.show(e, `<b>${lab(ks(q.r.k))}</b> ${q.r.closed ? '(actual)' : '(forecast)'}<br>Cash with orders ${gbp(q.r.eff)}<br>Without ${gbp(q.b.eff)}<br>Difference ${gbp(q.r.eff - q.b.eff)}<br>Headroom ${gbp(q.r.head)}` + (!q.r.closed && (o.out || o.inflow) ? `<br>This month from orders: hire in ${gbp(o.inflow || 0)}, out ${gbp(o.out || 0)} (incl. VAT ${gbp(o.vat || 0)})` : '')); }).on('mouseleave', T.hide);
        R.filter((q) => !q.r.closed && Math.abs(q.vb) > 1).forEach((q) => { const cx = x(lab(ks(q.r.k))), cy = y(q.r.eff);
          svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', cy).attr('y2', cy - 34).attr('stroke', '#7d5ba6').attr('stroke-width', 1.5);
          svg.append('text').attr('x', cx).attr('y', cy - 40).attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 600).attr('fill', '#7d5ba6').text((q.vb > 0 ? 'Purchase VAT back +' + gbp((LR.rows.find((z) => z.m === ks(q.r.k)) || {}).vatIn || q.vb) : 'VAT due ' + gbp(Math.abs(q.vb)))); });
        const lq = R[R.length - 1], hi = lq.r.eff >= lq.b.eff;
        svg.append('text').attr('x', Wd - Mg.r - 4).attr('y', y(lq.r.eff) + (hi ? -12 : 20)).attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', 600).attr('fill', C.orange).text('With these orders');
        svg.append('text').attr('x', Wd - Mg.r - 4).attr('y', y(lq.b.eff) + (hi ? 20 : -12)).attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', 600).attr('fill', '#6b7587').text('Without orders');
        svg.append('text').attr('x', Wd - Mg.r - 4).attr('y', y(buf) - 6).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', C.bad).text('Buffer ' + gbp(buf));
        // monthly detail
        const rowsT = open.filter((q) => (q.r.oc && (q.r.oc.out || q.r.oc.inflow)) || Math.abs(q.r.eff - q.b.eff) > 1).slice(0, 6);
        $('o_efft').innerHTML = '<table><thead><tr><th>Month</th><th class="n">Cash without</th><th class="n">Cash with orders</th><th class="n">Difference</th><th class="n">Headroom over buffer</th><th class="n">Paid out for the orders</th><th class="n">of which purchase VAT</th><th class="n" style="color:#7d5ba6">VAT back / (due)</th><th class="n">Hire received</th></tr></thead><tbody>' + rowsT.map((q) => { const o = q.r.oc || {}, d = q.r.eff - q.b.eff; return `<tr><td>${lab(ks(q.r.k))}</td><td class="n">${gbp(q.b.eff)}</td><td class="n">${gbp(q.r.eff)}</td><td class="n" style="color:${d < 0 ? C.bad : C.good}">${gbp(d)}</td><td class="n" style="color:${q.r.head < 0 ? C.bad : 'inherit'}">${gbp(q.r.head)}</td><td class="n">${o.out ? gbp(o.out) : '–'}</td><td class="n">${o.vat ? gbp(o.vat) : '–'}</td><td class="n" style="color:#7d5ba6;font-weight:600">${Math.abs(q.vb) > 1 ? gbp(q.vb) : '–'}</td><td class="n">${o.inflow ? gbp(o.inflow) : '–'}</td></tr>`; }).join('') + '</tbody></table><div class="hint" style="margin-top:6px">The Difference already includes the VAT back – it lifts cash in the return month (shown in purple).</div>';
      } catch (e) { X.orders.off = false; X.orders.pot = false; const b = $('o_eff'); if (b) b.innerHTML = '<div class="hint">Could not work out the effect: ' + esc(e.message) + '</div>'; }
    })();
    $('o_wi').onchange = (e) => { WHATIF = e.target.checked; draw(el); };
    el.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('change', async () => {
      let f2; const f = i.dataset.f; let v = i.type === 'checkbox' ? i.checked : i.value;
      if (f === 'delivery_date') v = v ? v + '-01' : null; else if (!['status', 'fleet_type', 'category', 'vat_upfront', 'advance_rental'].includes(f)) v = v === '' ? 0 : +v;
      if (f === 'deposit_amt') { const o = ORD.find((x) => x.id == i.dataset.id), g = o ? calc(o).gross : 0; f2 = 'deposit_pct'; v = g ? Math.round(v / g * 10000) / 100 : 0; } else f2 = f;
      const extra = f === 'fleet_type' && v ? { category: v } : {};
      try { await api('asset_orders?id=eq.' + i.dataset.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ [f2]: v }, extra)) }); await X.orders.load(); draw(el); } catch (e) { $('o_err').textContent = 'Could not save: ' + e.message; }
    }));
    if ($('o_tab')) X.enhance($('o_tab'), { filters: ['Status', 'Category'], group: 'Status', sum: 'Total' });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('Delete this order?')) return; await api('asset_orders?id=eq.' + b.dataset.del, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await X.orders.load(); draw(el); });
    $('o_split').onclick = () => { const d = document.createElement('div'); d.className = 'sprow'; d.style.cssText = 'display:flex;gap:10px;align-items:end;margin-top:8px'; d.innerHTML = '<div><label>Units</label><input class="spq" type="number" min="1" value="1" style="width:90px"></div><div><label>Delivery month</label><input class="spm" type="month"></div><button type="button" class="ghost">Remove</button>'; d.querySelector('button').onclick = () => d.remove(); $('o_sp').appendChild(d); };
    $('o_add').onclick = async () => {
      const d = $('o_d').value.trim(), p = parseFloat($('o_p').value); if (!d || isNaN(p)) { $('o_err').textContent = 'Add a description and a unit price.'; return; }
      try { const bs = [{ q: parseInt($('o_q').value) || 1, m: $('o_dt').value }]; el.querySelectorAll('#o_sp .sprow').forEach((r) => { const q = parseInt(r.querySelector('.spq').value) || 0; if (q > 0) bs.push({ q, m: r.querySelector('.spm').value }); }); for (const b of bs) await api('asset_orders', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ description: d, fleet_type: $('o_ft').value.trim() || null, category: $('o_ft').value.trim() || 'Other', supplier: $('o_s').value.trim() || null, qty: b.q, unit_price: p, delivery_date: b.m ? b.m + '-01' : null, deposit_pct: parseFloat($('o_dp').value) || 0, advance_rental: $('o_adv').checked, term_months: parseInt($('o_t').value) || 60, rate_pct: parseFloat($('o_r').value) || 0, weekly_rate: parseFloat($('o_w').value) || 0, utilisation_pct: parseFloat($('o_u').value) || 0, start_lag: parseInt($('o_l').value) || 0, status: $('o_st').value }) }); await X.orders.load(); draw(el); } catch (e) { $('o_err').textContent = 'Could not save: ' + e.message; }
    };
  }
})();
