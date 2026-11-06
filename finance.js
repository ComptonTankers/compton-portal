/* Finance overview (charts) and Spend tracker (cash-flow categories + itemised log). */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, C, T, NOW, mon } = X;
  const { cols, hbars, row, pct } = X.charts;
  const $ = (id) => document.getElementById(id);
  const mi = (k) => mon(k + '-01');
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const labL = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const PAL = ['#164698', '#E3641D', '#2f6ad0', '#1b7f4b', '#7d5ba6', '#f0a06b', '#6b8fd6', '#8a8f98', '#b3261e', '#0f8b8d'];
  const legend = (a) => '<div class="legend">' + a.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('') + '</div>';

  /* ===================== Finance overview ===================== */
  X.routes.fin = async (el) => {
    el.innerHTML = X.head('Finance overview', 'Loading…') + '<div class="empty">Loading…</div>';
    const [d, M] = await Promise.all([X.loadFinance(), X.cf.load()]);
    const R = X.cf.compute(M), closed = R.filter((r) => r.closed), open = R.filter((r) => !r.closed);
    const lastClosed = closed[closed.length - 1], cash = lastClosed ? lastClosed.closeA : M.s.opening_actual;
    const outLines = M.lines.filter((l) => l.section === 'out'), inLines = M.lines.filter((l) => l.section === 'in');
    const val = (r, c) => (r.closed ? (r.val(c, 'a') != null ? r.val(c, 'a') : 0) : (r.val(c, 'f') || 0));
    const avgOut = closed.length ? closed.reduce((t, r) => t + r.outA, 0) / closed.length : 0;
    const recF = closed.reduce((t, r) => t + (r.val('receipts', 'f') || 0), 0), recA = closed.reduce((t, r) => t + (r.val('receipts', 'a') || 0), 0);
    const live = d.agr.filter((a) => a.active && mon(a.end_month) >= NOW), liveIds = new Set(live.map((a) => a.id));
    const hpFut = d.sch.filter((r) => r.m >= NOW && liveIds.has(r.agreement_id)), hpRemain = hpFut.reduce((t, r) => t + r.amount, 0);
    const nextVat = open.find((r) => r.vatAuto);

    // spend mix over the next/last 6 months window
    const win = R.slice(-6), mix = outLines.map((l) => ({ l: l.label, v: win.reduce((t, r) => t + val(r, l.code), 0), code: l.code })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const mixTot = mix.reduce((t, x) => t + x.v, 0);
    // HP by lender and run-off
    const lend = {}; live.forEach((a) => { const k = (a.finance_company || 'Other').replace(/ (PLC|LTD|LIMITED)$/i, ''); lend[k] = (lend[k] || 0) + (hpFut.filter((r) => r.agreement_id === a.id && r.m === NOW).reduce((t, r) => t + r.amount, 0)); });
    const lendRows = Object.entries(lend).sort((a, b) => b[1] - a[1]);
    const byM = {}; hpFut.forEach((r) => { byM[r.m] = (byM[r.m] || 0) + r.amount; });
    const last = Math.max(...Object.keys(byM).map(Number), NOW); let rem = hpRemain; const run = [];
    for (let m = NOW; m <= last; m++) { rem -= (byM[m] || 0); if ((m - NOW) % 3 === 0 || m === last) run.push({ m, v: Math.max(rem, 0) + (byM[m] || 0) }); }

    el.innerHTML = X.head('Finance overview', 'Cash flow, spend and HP in charts · hover any bar for detail') +
      X.tiles([
        { l: 'Cash · ' + (lastClosed ? lab(mi(lastClosed.k)) + ' close' : 'start'), v: gbp(cash), s: 'actual, last closed month', c: 'g' },
        { l: 'Average monthly spend', v: gbp(avgOut), s: closed.length + ' closed months (money out)' },
        { l: 'Receipts vs forecast', v: recF ? pct(recA / recF) : '–', s: closed.length ? gbp(recA - recF) + ' over closed months' : '', c: recF && recA < recF ? 'r' : 'g' },
        { l: 'HP still to pay', v: gbp(hpRemain), s: live.length + ' live agreements', c: 'o' },
        { l: 'Next VAT settlement', v: nextVat ? gbp(Math.abs(nextVat.vatAuto.net)) : '–', s: nextVat ? (nextVat.vatAuto.net < 0 ? 'refund' : 'payable') + ' · ' + labL(mi(nextVat.k)) : '' },
        { l: 'Months of cover', v: avgOut ? (cash / avgOut).toFixed(1) : '–', s: 'cash ÷ average monthly spend' }]) +
      `<div class="row">
        <div class="card"><h3>Money in and out</h3><div class="hint">Actual for closed months, forecast after. Line is the net movement.</div>${legend([[C.blue2, 'Money in'], [C.orange, 'Money out'], [C.bad, 'Net movement']])}<div id="f1"></div></div>
        <div class="card"><h3>Closing cash</h3><div class="hint">Solid = closed months; the line is the original forecast.</div>${legend([[C.blue, 'Actual close'], ['#7fa1e0', 'Forecast close'], [C.orange, 'Forecast']])}<div id="f2"></div></div>
      </div>
      <div class="row">
        <div class="card"><h3>Forecast accuracy</h3><div class="hint">Actual minus forecast for each closed month. Above zero = better than forecast for money in, worse for money out.</div>${closed.length ? legend([[C.blue2, 'Money in vs forecast'], [C.orange, 'Money out vs forecast']]) + '<div id="f3"></div>' : '<div class="hint">Close a month to see how the forecast performed.</div>'}</div>
        <div class="card"><h3>Where the money goes</h3><div class="hint">Share of spend, ${lab(mi(win[0].k))} – ${lab(mi(win[win.length - 1].k))} (actual where closed). <a href="#/spend" style="color:${C.blue}">Spend tracker →</a></div><div id="f4"></div></div>
      </div>
      <div class="row">
        <div class="card"><h3>HP payments by lender</h3><div class="hint">This month's payments, by finance company.</div><div id="f5"></div></div>
        <div class="card"><h3>HP still to pay</h3><div class="hint">Remaining payments at each quarter; the balance shrinks as agreements end.</div><div id="f6"></div></div>
      </div>`;
    cols($('f1'), R.map((r) => ({ l: lab(mi(r.k)), parts: [{ v: r.closed ? r.inA : r.inF, c: C.blue2 }, { v: -(r.closed ? r.outA : r.outF), c: C.orange }], line: { v: r.closed ? r.netA : r.netF },
      tip: `<b>${labL(mi(r.k))}</b> ${r.closed ? '(actual)' : '(forecast)'}` + row('Money in', gbp(r.closed ? r.inA : r.inF)) + row('Money out', gbp(r.closed ? r.outA : r.outF)) + row('Net', gbp(r.closed ? r.netA : r.netF)) })), { title: 'Money in and out' });
    cols($('f2'), R.map((r) => ({ l: lab(mi(r.k)), parts: [{ v: r.eff, c: r.closed ? C.blue : '#7fa1e0' }], line: { v: r.closeF },
      tip: `<b>${labL(mi(r.k))}</b>` + row(r.closed ? 'Actual close' : 'Forecast close', gbp(r.eff)) + row('Original forecast', gbp(r.closeF)) + (r.closed ? row('Difference', gbp(r.closeA - r.closeF)) : '') + row('Buffer headroom', gbp(r.head)) })), { title: 'Closing cash', hline: +M.s.min_buffer, hlabel: 'buffer' });
    if (closed.length) cols($('f3'), closed.map((r) => ({ l: lab(mi(r.k)), parts: [{ v: r.inA - r.inF, c: C.blue2 }, { v: r.outA - r.outF, c: C.orange }],
      tip: `<b>${labL(mi(r.k))}</b>` + row('Money in', gbp(r.inA) + ' vs ' + gbp(r.inF)) + row('Money out', gbp(r.outA) + ' vs ' + gbp(r.outF)) })), { title: 'Forecast accuracy', h: 220 });
    hbars($('f4'), mix.slice(0, 10).map((x, i) => ({ l: x.l, v: x.v, c: PAL[i % PAL.length], tip: `<b>${esc(x.l)}</b>` + row('Spend', gbp(x.v)) + row('Share', pct(x.v / mixTot, 1)) + row('Per month', gbp(x.v / win.length)) })), { title: 'Spend mix', fmt: gbp, left: 170 });
    hbars($('f5'), lendRows.map(([k, v], i) => ({ l: k, v, c: PAL[i % PAL.length], tip: `<b>${esc(k)}</b>` + row('This month', gbp(v)) + row('Share of HP', pct(v / (hpNowTot(lendRows) || 1), 1)) })), { title: 'HP by lender', fmt: gbp, left: 190 });
    cols($('f6'), run.map((x) => ({ l: lab(x.m), parts: [{ v: x.v, c: C.blue2 }], tip: `<b>${labL(x.m)}</b>` + row('Still to pay from here', gbp(x.v)) })), { title: 'HP still to pay', h: 220 });
    function hpNowTot(a) { return a.reduce((t, [, v]) => t + v, 0); }
  };

  /* ===================== Spend tracker ===================== */
  let SP = null;
  async function spLoad() {
    const [M, log] = await Promise.all([X.cf.load(), all('spend_log', 'spend_date.desc')]);
    SP = { M, log, sel: null, range: 'all', by: 'category' };
  }
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);

  X.routes.spend = async (el) => { el.innerHTML = X.head('Spend tracker', 'Loading…') + '<div class="empty">Loading…</div>'; await spLoad(); spDraw(el); };

  function spDraw(el) {
    const M = SP.M, R = X.cf.compute(M), outLines = M.lines.filter((l) => l.section === 'out');
    const closedRows = R.filter((r) => r.closed);
    const val = (r, c) => (r.closed ? (r.val(c, 'a') != null ? r.val(c, 'a') : 0) : (r.val(c, 'f') || 0));
    const rows = SP.range === 'closed' ? closedRows : SP.range === '6' ? R.slice(-6) : R;
    const sel = SP.sel || outLines.filter((l) => rows.some((r) => val(r, l.code) > 0)).map((l) => l.code);
    const tot = (c) => rows.reduce((t, r) => t + val(r, c), 0);
    const chosen = outLines.filter((l) => sel.includes(l.code)).sort((a, b) => tot(b.code) - tot(a.code));
    const grand = chosen.reduce((t, l) => t + tot(l.code), 0);
    const cats = [...new Set([...outLines.map((l) => l.label), ...SP.log.map((x) => x.category).filter(Boolean)])];
    const lg = SP.log;
    const tiles = X.tiles([
      { l: 'Spend in view', v: gbp(grand), s: rows.length + ' months · ' + chosen.length + ' categories', c: 'o' },
      { l: 'Biggest category', v: chosen[0] ? esc(chosen[0].label) : '–', s: chosen[0] ? gbp(tot(chosen[0].code)) + ' · ' + pct(tot(chosen[0].code) / (grand || 1)) : '' },
      { l: 'Itemised spend logged', v: gbp(lg.reduce((t, x) => t + +x.amount, 0)), s: lg.length + ' entries' },
      { l: 'Average per month', v: gbp(grand / (rows.length || 1)), s: 'selected categories' }]);
    const chips = outLines.map((l) => `<label style="display:inline-flex;gap:5px;align-items:center;margin:0 10px 6px 0;font-size:13.5px"><input type="checkbox" data-c="${l.code}" ${sel.includes(l.code) ? 'checked' : ''}>${esc(l.label)}</label>`).join('');
    const grid = `<div class="box2"><table><thead><tr><th>Category</th>${rows.map((r) => `<th class="n">${lab(mi(r.k))}</th>`).join('')}<th class="n">Total</th><th class="n">Average</th><th class="n">Share</th><th class="n">Forecast var</th></tr></thead><tbody>` +
      chosen.map((l) => { const fv = closedRows.reduce((t, r) => t + ((r.val(l.code, 'a') || 0) - (r.val(l.code, 'f') || 0)), 0); return `<tr><td><b>${esc(l.label)}</b></td>${rows.map((r) => `<td class="n" style="${r.closed ? '' : 'color:' + C.mut}">${val(r, l.code) ? gbp(val(r, l.code)) : '–'}</td>`).join('')}<td class="n"><b>${gbp(tot(l.code))}</b></td><td class="n">${gbp(tot(l.code) / (rows.length || 1))}</td><td class="n">${pct(tot(l.code) / (grand || 1), 1)}</td><td class="n" style="color:${fv > 0 ? C.bad : C.good}">${closedRows.length ? (fv > 0 ? '+' : '') + gbp(fv) : '–'}</td></tr>`; }).join('') + '</tbody></table></div>';
    const bySel = SP.by;
    el.innerHTML = X.head('Spend tracker', 'What the business spends money on, by category and by item') + tiles +
      `<div class="card"><h3>Spend by category</h3><div class="hint">From the cash flow (actual where a month is closed, forecast in grey). Tick the categories you want to follow.</div>
        <div class="flt"><select id="sp_range"><option value="all">All months</option><option value="6">Last 6 months</option><option value="closed">Closed months only</option></select></div>
        <div style="margin:6px 0">${chips}</div>${legend(chosen.slice(0, 8).map((l, i) => [PAL[i], l.label]))}<div id="sp1"></div><div style="margin-top:12px">${grid}</div></div>
       <div class="card"><h3>Add a spend category</h3><div class="hint">A new category appears here and as a row in the cash flow, so you can forecast and close it like any other line (e.g. Fuel, Tyres, Yard costs).</div>
        <div class="form"><div><label>Category name</label><input id="sp_cat"></div><div><button id="sp_catadd" type="button">Add category</button></div></div><div class="err" id="sp_caterr" style="color:${C.bad}"></div></div>
       <div class="card"><h3>Itemised spend</h3><div class="hint">Log specific purchases – a tyre set, a repair, a supplier invoice – and tag them to a category and a vehicle so you can see what each costs.</div>
        <div class="form"><div><label>Date</label><input id="l_d" type="date" value="${new Date().toISOString().slice(0, 10)}"></div><div><label>Category</label><input id="l_c" list="l_cl"><datalist id="l_cl">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div><div><label>Supplier</label><input id="l_s"></div><div><label>What for</label><input id="l_w"></div><div><label>Vehicle / unit</label><input id="l_u" placeholder="e.g. TR512"></div><div><label>Amount £</label><input id="l_a" type="number" step="0.01"></div><div><button id="l_add" type="button">Log spend</button></div></div>
        <div class="err" id="l_err" style="color:${C.bad}"></div>
        <details style="margin:10px 0"><summary style="cursor:pointer;color:${C.blue}">Paste several from Excel</summary><div class="hint" style="margin-top:6px">One per line, tab-separated columns: date (dd/mm/yyyy), category, supplier, what for, vehicle, amount.</div><textarea id="l_paste" rows="5" style="width:100%;font:inherit"></textarea><div class="form" style="margin-top:6px"><div><button id="l_imp" type="button">Import pasted lines</button></div></div></details>
        <div class="flt"><b>View by</b><select id="l_by"><option value="category">Category</option><option value="supplier">Supplier</option><option value="unit">Vehicle</option><option value="month">Month</option></select></div><div id="sp2"></div>
        ${lg.length ? `<div class="box2" style="margin-top:12px"><table id="l_tab"><thead><tr><th>Date</th><th>Category</th><th>Supplier</th><th>What for</th><th>Vehicle</th><th class="n">Amount</th><th></th></tr></thead><tbody>${lg.map((x) => `<tr><td>${new Date(x.spend_date).toLocaleDateString('en-GB')}</td><td>${esc(x.category || '')}</td><td>${esc(x.supplier || '')}</td><td>${esc(x.description || '')}</td><td>${esc(x.unit || '')}</td><td class="n">${gbp(+x.amount)}</td><td><button class="lnk" data-del="${x.id}" style="border:0;background:none;color:${C.bad};cursor:pointer">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty" style="margin-top:10px">Nothing logged yet.</div>'}</div>`;
    $('sp_range').value = SP.range; $('l_by').value = bySel;
    // charts
    const top = chosen.slice(0, 8), rest = chosen.slice(8);
    cols($('sp1'), rows.map((r) => ({ l: lab(mi(r.k)), parts: top.map((l, i) => ({ v: val(r, l.code), c: PAL[i], n: l.label })).concat(rest.length ? [{ v: rest.reduce((t, l) => t + val(r, l.code), 0), c: '#c9ced6', n: 'Other' }] : []),
      tip: `<b>${labL(mi(r.k))}</b> ${r.closed ? '(actual)' : '(forecast)'}` + chosen.filter((l) => val(r, l.code)).sort((a, b) => val(r, b.code) - val(r, a.code)).slice(0, 10).map((l) => row(l.label, gbp(val(r, l.code)))).join('') + row('Total', gbp(chosen.reduce((t, l) => t + val(r, l.code), 0))) })), { title: 'Spend by category' });
    const g = {}; lg.forEach((x) => { const k = bySel === 'month' ? new Date(x.spend_date).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : (x[bySel === 'unit' ? 'unit' : bySel] || '(none)'); g[k] = (g[k] || 0) + +x.amount; });
    const gr = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 12), gt = Object.values(g).reduce((t, v) => t + v, 0);
    if (gr.length) hbars($('sp2'), gr.map(([k, v], i) => ({ l: k, v, c: PAL[i % PAL.length], tip: `<b>${esc(k)}</b>` + row('Logged', gbp(v)) + row('Share', pct(v / gt, 1)) })), { title: 'Itemised spend', fmt: gbp, left: 190 });
    else $('sp2').innerHTML = '';
    if ($('l_tab')) X.enhance($('l_tab'), { filters: ['Category', 'Supplier', 'Vehicle'], group: 'Category', sum: 'Amount' });
    // wiring
    el.querySelectorAll('input[data-c]').forEach((cb) => cb.onchange = () => { SP.sel = [...el.querySelectorAll('input[data-c]')].filter((x) => x.checked).map((x) => x.dataset.c); spDraw(el); });
    $('sp_range').onchange = (e) => { SP.range = e.target.value; spDraw(el); };
    $('l_by').onchange = (e) => { SP.by = e.target.value; spDraw(el); };
    $('sp_catadd').onclick = async () => {
      const name = $('sp_cat').value.trim(); if (!name) return;
      const code = slug(name); if (!code || M.lines.find((l) => l.code === code)) { $('sp_caterr').textContent = 'That category already exists.'; return; }
      try { const sort = Math.max(0, ...outLines.map((l) => l.sort)) + 1; await api('cf_lines', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ code, label: name, section: 'out', sort, recurring: true, vat_type: 'purchase', auto: false, hint: '' }) }); await spLoad(); SP.sel = null; spDraw(el); } catch (e) { $('sp_caterr').textContent = 'Could not add: ' + e.message; }
    };
    const addLog = async (rowsIn) => { await api('spend_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rowsIn) }); const keep = { range: SP.range, by: SP.by, M: SP.M }; await spLoad(); SP.range = keep.range; SP.by = keep.by; spDraw(el); };
    $('l_add').onclick = async () => { const a = +$('l_a').value; if (!a || !$('l_d').value) { $('l_err').textContent = 'Date and amount are required.'; return; }
      try { await addLog([{ spend_date: $('l_d').value, category: $('l_c').value.trim() || null, supplier: $('l_s').value.trim() || null, description: $('l_w').value.trim() || null, unit: $('l_u').value.trim().toUpperCase() || null, amount: a }]); } catch (e) { $('l_err').textContent = 'Could not save: ' + e.message; } };
    $('l_imp').onclick = async () => {
      const out = []; let bad = 0;
      $('l_paste').value.split(/\r?\n/).filter((x) => x.trim()).forEach((ln) => { const c = ln.split('\t'); const m = (c[0] || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); const amt = parseFloat(String(c[5] || '').replace(/[£,\s]/g, ''));
        if (!m || isNaN(amt)) { bad++; return; } const y = m[3].length === 2 ? '20' + m[3] : m[3]; out.push({ spend_date: `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, category: (c[1] || '').trim() || null, supplier: (c[2] || '').trim() || null, description: (c[3] || '').trim() || null, unit: (c[4] || '').trim().toUpperCase() || null, amount: amt }); });
      if (!out.length) { $('l_err').textContent = 'No valid lines found' + (bad ? ' (' + bad + ' skipped)' : '') + '.'; return; }
      try { await addLog(out); } catch (e) { $('l_err').textContent = 'Could not import: ' + e.message; } };
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('Delete this entry?')) return; await api('spend_log?id=eq.' + b.dataset.del, { method: 'DELETE' }); const keep = { range: SP.range, by: SP.by }; await spLoad(); SP.range = keep.range; SP.by = keep.by; spDraw(el); });
  }
})();
