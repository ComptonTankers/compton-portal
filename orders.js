/* New asset orders: what is on order, estimated HP finance, and the effect on the forecast. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, C, NOW, mon } = X;
  const { cols, row } = X.charts;
  const $ = (id) => document.getElementById(id);
  const kOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const STAT = ['Ordered', 'Delivered', 'In HP schedule already', 'Cancelled'];
  let ORD = [], POL = [];
  const live = (o) => o.status === 'Ordered' || o.status === 'Delivered';
  const pol = (c) => POL.find((p) => p.category === c) || { life_years: 8, residual_pct: 10 };

  // Finance for one order line: amount financed, monthly payment, and month-by-month figures.
  function calc(o) {
    const gross = (+o.qty || 1) * (+o.unit_price || 0), dep = gross * ((+o.deposit_pct || 0) / 100), fin = gross - dep;
    const n = Math.max(1, +o.term_months || 60), r = (+o.rate_pct || 0) / 1200;
    const pmt = r ? fin * r / (1 - Math.pow(1 + r, -n)) : fin / n;
    const p = pol(o.category), life = Math.max(1, +p.life_years) * 12, depMonth = gross * (1 - (+p.residual_pct || 0) / 100) / life;
    const d = o.delivery_date ? mon(String(o.delivery_date).slice(0, 7) + '-01') : null;
    return { gross, dep, fin, n, r, pmt, depMonth, d };
  }
  function at(o, m) {   // figures for month index m
    const c = calc(o); if (c.d == null || !live(o)) return { int: 0, dep: 0, pay: 0, deposit: 0, buy: 0 };
    const k = m - c.d;   // 0 = delivery month
    let bal = c.fin, int = 0;
    if (k >= 1 && k <= c.n) { for (let i = 1; i <= k; i++) { int = bal * c.r; bal -= c.pmt - int; } }
    return { int: k >= 1 && k <= c.n ? int : 0, dep: k >= 0 ? c.depMonth : 0, pay: k >= 1 && k <= c.n ? c.pmt : 0, deposit: k === 0 ? c.dep : 0, buy: k === 0 ? c.gross : 0 };
  }
  const sumAt = (m, f) => ORD.reduce((t, o) => t + at(o, m)[f], 0);

  X.orders = {
    load: async () => { [ORD, POL] = await Promise.all([all('asset_orders', 'delivery_date.asc.nullslast'), all('fa_policies', 'category.asc')]); return ORD; },
    impact: (m) => ({ int: sumAt(m, 'int'), dep: sumAt(m, 'dep') }),
    count: () => ORD.filter(live).length
  };

  X.routes.orders = async (el) => { el.innerHTML = X.head('New assets on order', 'Loading…') + '<div class="empty">Loading…</div>'; await X.orders.load(); draw(el); };

  function draw(el) {
    const open = ORD.filter(live), start = NOW, ms = Array.from({ length: 24 }, (_, i) => start + i);
    const tot = open.reduce((t, o) => t + calc(o).gross, 0), fin = open.reduce((t, o) => t + calc(o).fin, 0), dep = open.reduce((t, o) => t + calc(o).dep, 0), pmt = open.reduce((t, o) => t + calc(o).pmt, 0);
    const next12 = ms.slice(0, 12), cash12 = next12.reduce((t, m) => t + sumAt(m, 'pay') + sumAt(m, 'deposit'), 0);
    const tiles = X.tiles([
      { l: 'Units on order', v: open.reduce((t, o) => t + (+o.qty || 0), 0), s: open.length + ' order line' + (open.length === 1 ? '' : 's'), c: 'o' },
      { l: 'Total committed (ex VAT)', v: gbp(tot), s: 'deposits ' + gbp(dep) },
      { l: 'To be financed', v: gbp(fin), s: 'estimated HP' },
      { l: 'New HP payments', v: gbp(pmt) + '/mo', s: 'once everything is delivered' },
      { l: 'Cash out, next 12 months', v: gbp(cash12), s: 'deposits + HP payments' }]);
    const rows = ORD.map((o) => { const c = calc(o); return `<tr><td>${esc(o.description)}</td><td data-g="${esc(o.status)}">${esc(o.status)}</td><td>${esc(o.category || '')}</td><td>${esc(o.supplier || '')}</td><td class="n">${o.qty}</td><td class="n">${gbp(+o.unit_price)}</td><td class="n">${gbp(c.gross)}</td><td>${o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'TBC'}</td><td class="n">${o.deposit_pct}% · ${gbp(c.dep)}</td><td class="n">${o.term_months}m @ ${o.rate_pct}%</td><td class="n">${gbp(c.pmt)}</td><td><button data-del="${o.id}" style="border:0;background:none;color:${C.bad};cursor:pointer">Delete</button></td></tr>`; }).join('');
    const catOpts = (POL.length ? POL.map((p) => p.category) : ['Tanker trailers']).map((c) => `<option>${esc(c)}</option>`).join('');
    const impRows = ms.filter((m, i) => i % 1 === 0).map((m) => ({ m, int: sumAt(m, 'int'), dep: sumAt(m, 'dep'), pay: sumAt(m, 'pay'), dp: sumAt(m, 'deposit') })).filter((x) => x.int || x.dep || x.pay || x.dp);
    el.innerHTML = X.head('New assets on order', 'What we have ordered, what it costs and the estimated finance · feeds the Budget forecast') + tiles +
      `<div class="card"><h3>Cash out for new assets</h3><div class="hint">Deposit in the delivery month, then estimated HP payments. Hover for the detail.</div><div id="o1"></div></div>
      <div class="card"><h3>On order</h3>${ORD.length ? `<div class="box2"><table id="o_tab"><thead><tr><th>Asset</th><th>Status</th><th>Category</th><th>Supplier</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Total</th><th>Delivery</th><th class="n">Deposit</th><th class="n">HP</th><th class="n">Est. monthly</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nothing on order yet – add the first below.</div>'}</div>
      <div class="card"><h3>Add an order</h3><div class="hint">Prices ex VAT. The finance is an estimate (standard HP repayment) – replace it with the lender's quote when you have it. Depreciation uses the policy for the category. Mark an order <b>In HP schedule already</b> once it appears there, so it isn't counted twice.</div>
        <div class="form"><div><label>Asset</label><input id="o_d" placeholder="e.g. Feldbinder tanker x2"></div><div><label>Category</label><select id="o_c">${catOpts}</select></div><div><label>Supplier</label><input id="o_s"></div><div><label>Qty</label><input id="o_q" type="number" value="1" min="1"></div><div><label>Unit price £</label><input id="o_p" type="number" step="0.01"></div><div><label>Delivery month</label><input id="o_dt" type="month"></div><div><label>Deposit %</label><input id="o_dp" type="number" value="10"></div><div><label>Term (months)</label><input id="o_t" type="number" value="60"></div><div><label>Rate % APR</label><input id="o_r" type="number" step="0.1" value="8"></div><div><label>Status</label><select id="o_st">${STAT.map((s) => `<option>${s}</option>`).join('')}</select></div><div><button id="o_add" type="button">Add order</button></div></div><div id="o_err" style="color:${C.bad};min-height:18px"></div></div>
      <div class="card"><h3>Effect on the forecast</h3><div class="hint">Added to the Budget and Management accounts forecast as “HP interest – ordered assets” and “Depreciation – ordered assets” (future months only).</div>${impRows.length ? `<div class="box2"><table><thead><tr><th>Month</th><th class="n">Deposit</th><th class="n">HP payment</th><th class="n">HP interest (P&amp;L)</th><th class="n">Depreciation (P&amp;L)</th></tr></thead><tbody>${impRows.map((x) => `<tr><td>${lab(x.m)}</td><td class="n">${x.dp ? gbp(x.dp) : '–'}</td><td class="n">${x.pay ? gbp(x.pay) : '–'}</td><td class="n">${x.int ? gbp(x.int) : '–'}</td><td class="n">${x.dep ? gbp(x.dep) : '–'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No impact yet.</div>'}</div>`;
    cols($('o1'), ms.map((m) => ({ l: lab(m), parts: [{ v: sumAt(m, 'deposit'), c: C.orange, n: 'Deposit' }, { v: sumAt(m, 'pay'), c: C.blue, n: 'HP payments' }], tip: `<b>${lab(m)}</b>` + row('Deposits', gbp(sumAt(m, 'deposit'))) + row('HP payments', gbp(sumAt(m, 'pay'))) + row('Interest in P&L', gbp(sumAt(m, 'int'))) + row('Depreciation in P&L', gbp(sumAt(m, 'dep'))) })), { title: 'Cash out', h: 220 });
    if ($('o_tab')) X.enhance($('o_tab'), { filters: ['Status', 'Category', 'Supplier'], group: 'Status', sum: 'Total' });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('Delete this order?')) return; await api('asset_orders?id=eq.' + b.dataset.del, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await X.orders.load(); draw(el); });
    $('o_add').onclick = async () => {
      const d = $('o_d').value.trim(), p = parseFloat($('o_p').value); if (!d || isNaN(p)) { $('o_err').textContent = 'Add a description and a unit price.'; return; }
      try { await api('asset_orders', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ description: d, category: $('o_c').value, supplier: $('o_s').value.trim() || null, qty: parseInt($('o_q').value) || 1, unit_price: p, delivery_date: $('o_dt').value ? $('o_dt').value + '-01' : null, deposit_pct: parseFloat($('o_dp').value) || 0, term_months: parseInt($('o_t').value) || 60, rate_pct: parseFloat($('o_r').value) || 0, status: $('o_st').value }) }); await X.orders.load(); draw(el); } catch (e) { $('o_err').textContent = 'Could not save: ' + e.message; }
    };
  }
})();
