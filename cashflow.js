/* Cash flow: forecast vs actual, VAT cycle, rolling months. Registers the #/cashflow page. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, T, C } = X;
  const $ = (id) => document.getElementById(id);
  const mkey = (d) => String(d).slice(0, 7);                       // '2026-08'
  const midx = (k) => { const [y, m] = k.split('-').map(Number); return y * 12 + (m - 1); };
  const fromIdx = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  const mdate = (k) => k + '-01';
  const mlabel = (k) => new Date(mdate(k)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const mlong = (k) => new Date(mdate(k)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const num = (v) => (v === null || v === undefined || v === '' ? null : +v);
  const n0 = (v) => (v == null ? 0 : +v);
  const f0 = (v) => (v == null ? '' : Number(v).toLocaleString('en-GB', { maximumFractionDigits: 2, minimumFractionDigits: 0 }));
  let M = null; // model cache

  async function load() {
    const [set, lines, months, ent] = await Promise.all([
      api('cf_settings?select=*&limit=1'), api('cf_lines?select=*&order=section.asc,sort.asc'),
      all('cf_months', 'month.asc'), all('cf_entries', 'month.asc,line.asc'), X.orders ? X.orders.load() : null]);
    const E = {};
    ent.forEach((r) => { const k = mkey(r.month); (E[k] = E[k] || {})[r.line] = { f: num(r.forecast), a: num(r.actual) }; });
    return { s: set[0], lines, months: months.map((m) => ({ k: mkey(m.month), closed: m.closed, of: num(m.opening_forecast), oa: num(m.opening_actual) })), E };
  }

  /* ---------- the engine ---------- */
  function compute(m) {
    const { s, lines, months, E } = m;
    const L = {}; lines.forEach((l) => (L[l.code] = l));
    const by = (sec) => lines.filter((l) => l.section === sec);
    const purch = lines.filter((l) => l.vat_type === 'purchase').map((l) => l.code);
    const salesL = lines.filter((l) => l.vat_type === 'sales').map((l) => l.code);
    const get = (k, c, w) => { const e = E[k] && E[k][c]; return e ? e[w] : null; };
    const qEnd = midx(mkey(s.vat_quarter_end)), lag = s.vat_pay_lag;
    const res = [];
    months.forEach((mo, i) => {
      const k = mo.k, r = { k, closed: mo.closed, i };
      // VAT workings
      const sumF = (codes) => codes.reduce((t, c) => t + n0(get(k, c, 'f')), 0);
      const oc = (!mo.closed && X.orders) ? X.orders.cash(k) : { inflow: 0, out: 0 }; r.oc = oc;
      const autoW = { vat_sales: (sumF(salesL) + oc.inflow) / 6, vat_purch: -sumF(purch) / 6, vat_capex: -n0(get(k, 'capex', 'f')) / 6 - (oc.vat || 0) };
      r.w = {}; let posF = 0, posA = 0, anyA = false;
      ['vat_sales', 'vat_purch', 'vat_capex'].forEach((c) => {
        const mf = get(k, c, 'f'), ma = get(k, c, 'a');
        r.w[c] = { f: mf != null ? mf : autoW[c], fAuto: mf == null, a: ma };
        posF += r.w[c].f; if (ma != null) { posA += ma; anyA = true; }
      });
      r.posF = posF; r.posA = anyA ? posA : null; r.pos = (mo.closed || anyA) ? posA : posF; r.posActual = mo.closed || anyA;
      res.push(r);
    });
    // VAT settlement in the payment month (needs the whole quarter on file)
    res.forEach((r) => {
      const q = midx(r.k) - lag;                       // quarter-end month
      r.vatAuto = null;
      if (((q - qEnd) % 3 + 3) % 3 === 0) {
        const qm = [q - 2, q - 1, q].map((x) => res.find((y) => midx(y.k) === x));
        if (qm.every(Boolean)) { const net = qm.reduce((t, y) => t + y.pos, 0); r.vatAuto = { net, qk: [fromIdx(q - 2), fromIdx(q)], partial: qm.some((y) => !y.posActual) }; }
      }
    });
    // cash lines + totals + chain
    let prevEff = null, prevA = null;
    res.forEach((r, i) => {
      const mo = months[i], k = r.k;
      const val = (c, w) => {
        const v = get(k, c, w);
        if (v != null) return v;
        if (w === 'f' && r.vatAuto) { if (c === 'vat') return Math.max(r.vatAuto.net, 0); if (c === 'vat_refund') return Math.max(-r.vatAuto.net, 0); }
        return null;
      };
      r.val = val;
      const tot = (sec, w) => by(sec).reduce((t, l) => t + n0(val(l.code, w)), 0);
      r.inF = tot('in', 'f') + r.oc.inflow; r.inA = tot('in', 'a'); r.outF = tot('out', 'f') + r.oc.out; r.outA = tot('out', 'a');
      r.netF = r.inF - r.outF; r.netA = r.inA - r.outA;
      r.openF = mo.of != null ? mo.of : (i === 0 ? s.opening_forecast : prevEff);
      r.openA = mo.oa != null ? mo.oa : (i === 0 ? s.opening_actual : prevA);
      r.closeF = r.openF + r.netF; r.closeA = r.openA + r.netA;
      r.eff = r.closed ? r.closeA : r.closeF;
      r.buffer = +s.min_buffer; r.headF = r.closeF - r.buffer; r.headA = r.closeA - r.buffer; r.head = r.eff - r.buffer;
      prevEff = r.eff; prevA = r.closeA;
    });
    return res;
  }

  /* ---------- saving ---------- */
  async function saveEntry(k, line, which, value) {
    const body = { month: mdate(k), line, [which === 'f' ? 'forecast' : 'actual']: value, updated_at: new Date().toISOString() };
    await api('cf_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
    const e = (M.E[k] = M.E[k] || {}); (e[line] = e[line] || { f: null, a: null })[which] = value;
  }
  async function ensureMonth(k) {
    if (M.months.find((x) => x.k === k)) return;
    await api('cf_months', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ month: mdate(k), closed: false }) });
    M.months.push({ k, closed: false, of: null, oa: null }); M.months.sort((a, b) => midx(a.k) - midx(b.k));
  }
  // New month = recurring lines copied from the latest month's forecast; HP from the HP schedule when it has data.
  async function addMonth(k, hpByMonth) {
    await ensureMonth(k);
    const prev = M.months.filter((x) => midx(x.k) < midx(k)).pop();
    const rows = [];
    M.lines.filter((l) => l.recurring).forEach((l) => {
      let v = prev && M.E[prev.k] && M.E[prev.k][l.code] ? M.E[prev.k][l.code].f : null;
      if (l.code === 'hp_payments' && hpByMonth && hpByMonth[k]) v = Math.round(hpByMonth[k] * 100) / 100;
      if (v != null) rows.push({ month: mdate(k), line: l.code, forecast: v });
    });
    if (rows.length) await api('cf_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    rows.forEach((r) => { (M.E[k] = M.E[k] || {})[r.line] = { f: r.forecast, a: null }; });
  }
  async function hpSchedule() {
    try {
      const d = await X.loadFinance(); const live = new Set(d.agr.filter((a) => a.active).map((a) => a.id)); const o = {};
      d.sch.filter((r) => live.has(r.agreement_id)).forEach((r) => { const k = mkey(r.month); o[k] = (o[k] || 0) + r.amount; });
      return o;
    } catch (e) { return {}; }
  }
  async function rollForward() {
    const hp = await hpSchedule();
    const lastClosed = M.months.filter((x) => x.closed).pop();
    const base = lastClosed ? midx(lastClosed.k) : midx(M.months[0].k);
    const need = base + M.s.horizon;
    for (let i = midx(M.months[M.months.length - 1].k) + 1; i <= need; i++) await addMonth(fromIdx(i), hp);
  }

  /* ---------- page ---------- */
  async function page(el) {
    el.innerHTML = X.head('Cash flow', 'Loading…');
    M = await load();
    draw(el);
  }

  function draw(el) {
    const R = compute(M), by = (sec) => M.lines.filter((l) => l.section === sec);
    const keep = el.querySelector('.cfwrap') ? el.querySelector('.cfwrap').scrollLeft : null;
    const firstOpen = R.find((r) => !r.closed), lastClosed = [...R].reverse().find((r) => r.closed);
    const openRows = R.filter((r) => !r.closed);
    const low = openRows.reduce((w, r) => (w == null || r.head < w.head ? r : w), null);
    const nextVat = openRows.find((r) => r.vatAuto) || null;
    const cashNow = lastClosed ? lastClosed.closeA : M.s.opening_actual;
    const lastVar = lastClosed ? lastClosed.closeA - lastClosed.closeF : null;
    const fmt = (v) => gbp(v);

    const head = `<div class="top"><h1>Cash flow</h1><div class="sub2">${esc(M.s.client_name || '')} · forecast vs actual, rolling · buffer ${fmt(M.s.min_buffer)}</div></div>`;
    const tiles = X.tiles([
      { l: 'Cash at ' + (lastClosed ? mlong(lastClosed.k) + ' close' : 'start'), v: fmt(cashNow), s: lastClosed ? 'actual, last closed month' : '', c: 'g' },
      { l: 'Lowest headroom ahead', v: low ? fmt(low.head) : '–', s: low ? 'in ' + mlong(low.k) + (low.head < 0 ? ' · below buffer' : ' · above buffer') : '', c: low && low.head < 0 ? 'r' : '' },
      { l: 'Next VAT settlement', v: nextVat ? fmt(Math.abs(nextVat.vatAuto.net)) : '–', s: nextVat ? (nextVat.vatAuto.net < 0 ? 'refund due ' : 'payable ') + mlong(nextVat.k) + ' · quarter ' + mlabel(nextVat.vatAuto.qk[0]) + '–' + mlabel(nextVat.vatAuto.qk[1]) : 'needs a full quarter on file', c: 'o' },
      { l: 'Last month vs forecast', v: lastVar == null ? '–' : (lastVar >= 0 ? '+' : '') + fmt(lastVar), s: lastClosed ? 'closing cash, ' + mlong(lastClosed.k) : '' },
      { l: 'Open months', v: openRows.length, s: firstOpen ? 'next to close: ' + mlong(firstOpen.k) : 'add a month' }]);

    const cols = R.map((r) => `<th colspan="3" class="mh ${r.closed ? 'cl' : ''}">${mlabel(r.k)} ${r.closed ? '<span class="pill g">closed</span>' : '<span class="pill b">open</span>'}</th>`).join('');
    const sub = R.map(() => '<th class="n">Forecast</th><th class="n">Actual</th><th class="n">Var</th>').join('');
    const hpS = window.__hpSched || {};
    const cell = (r, l, w) => {
      const v = (M.E[r.k] && M.E[r.k][l.code]) ? M.E[r.k][l.code][w] : null;
      let ph = '';
      if (v == null && w === 'f') {
        if (l.code === 'vat' && r.vatAuto) ph = Math.max(r.vatAuto.net, 0) || '';
        else if (l.code === 'vat_refund' && r.vatAuto) ph = Math.max(-r.vatAuto.net, 0) || '';
        else if (l.section === 'vat') ph = Math.round(r.w[l.code].f) || '';
        else if (l.code === 'hp_payments' && hpS[r.k]) ph = Math.round(hpS[r.k]);
      }
      return `<td class="in"><input data-k="${r.k}" data-l="${l.code}" data-w="${w}" value="${v == null ? '' : f0(v)}" placeholder="${ph === '' ? '' : f0(ph)}" inputmode="decimal" class="${ph !== '' && v == null ? 'auto' : ''}"></td>`;
    };
    const vcell = (r, l, inflow) => {
      const f = r.val(l.code, 'f'), a = r.val(l.code, 'a');
      if (a == null && !r.closed) return '<td class="n var"></td>';
      const d = n0(a) - n0(f); if (!d) return '<td class="n var"></td>';
      const good = inflow ? d > 0 : d < 0;
      return `<td class="n var ${good ? 'g' : 'b'}">${d > 0 ? '+' : ''}${Math.round(d).toLocaleString('en-GB')}</td>`;
    };
    const lineRow = (l, inflow) => `<tr><td class="lab" title="${esc(l.hint || '')}">${esc(l.label)}</td>${R.map((r) => cell(r, l, 'f') + cell(r, l, 'a') + vcell(r, l, inflow)).join('')}</tr>`;
    const ordRow = (label, key, tip) => (R.some((r) => r.oc[key]) ? `<tr class="note"><td class="lab" title="${tip}">${label}</td>${R.map((r) => `<td class="n">${r.oc[key] ? fmt(r.oc[key]) : ''}</td><td class="n"></td><td class="n"></td>`).join('')}</tr>` : '');
    const tot = (label, kF, kA, cls, inflow) => `<tr class="${cls}"><td class="lab">${label}</td>${R.map((r) => { const d = r[kA] - r[kF]; const show = r.closed || (M.E[r.k] && Object.values(M.E[r.k]).some((e) => e.a != null)); const good = inflow ? d > 0 : d < 0; return `<td class="n">${fmt(r[kF])}</td><td class="n">${show ? fmt(r[kA]) : ''}</td><td class="n var ${show && d ? (good ? 'g' : 'b') : ''}">${show && d ? (d > 0 ? '+' : '') + Math.round(d).toLocaleString('en-GB') : ''}</td>`; }).join('')}</tr>`;
    const bal = (label, kF, kA, cls) => `<tr class="${cls}"><td class="lab">${label}</td>${R.map((r) => `<td class="n">${fmt(r[kF])}</td><td class="n">${r.closed || Object.values(M.E[r.k] || {}).some((e) => e.a != null) ? fmt(r[kA]) : ''}</td><td class="n"></td>`).join('')}</tr>`;
    const section = (t) => `<tr class="sec"><td class="lab">${t.split(' (')[0]}</td><td colspan="${R.length * 3}" style="font-weight:400;text-transform:none;letter-spacing:0;color:#5B6675">${t.includes(' (') ? '(' + t.split(' (').slice(1).join(' (') : ''}</td></tr>`;
    const headroom = `<tr class="tot"><td class="lab">Headroom / (shortfall) vs buffer</td>${R.map((r) => `<td class="n ${r.headF < 0 ? 'b2' : ''}">${fmt(r.headF)}</td><td class="n ${r.closed && r.headA < 0 ? 'b2' : ''}">${r.closed ? fmt(r.headA) : ''}</td><td class="n"></td>`).join('')}</tr>`;
    const posRow = `<tr class="tot"><td class="lab">VAT position (quarter basis)</td>${R.map((r) => `<td class="n">${fmt(r.posF)}</td><td class="n">${r.posA != null ? fmt(r.posA) : ''}</td><td class="n"></td>`).join('')}</tr>`;
    const vatNote = `<tr class="note"><td class="lab">VAT settled this month</td>${R.map((r) => `<td colspan="3" class="n">${r.vatAuto ? (r.vatAuto.net < 0 ? 'refund ' : 'pay ') + fmt(Math.abs(r.vatAuto.net)) + ' (' + mlabel(r.vatAuto.qk[0]) + '–' + mlabel(r.vatAuto.qk[1]) + ')' : ''}</td>`).join('')}</tr>`;
    const actions = `<tr class="act"><td class="lab">Month status</td>${R.map((r) => `<td colspan="3" class="n">${r.closed ? `<button class="mini" data-reopen="${r.k}">Reopen</button>` : `<button class="mini pri2" data-close="${r.k}">Close month</button>`}</td>`).join('')}</tr>`;

    const table = `<div class="cfwrap"><table class="cf"><thead><tr><th class="lab"></th>${cols}</tr><tr><th class="lab">Line item</th>${sub}</tr></thead><tbody>
      ${bal('Opening cash balance', 'openF', 'openA', 'bal')}
      ${section('Cash inflows')}${by('in').map((l) => lineRow(l, true)).join('')}${ordRow('New assets – hire income (incl VAT, est.)', 'inflow', 'From confirmed orders on the New assets on order page')}${tot('Total cash inflows', 'inF', 'inA', 'tot', true)}
      ${section('Cash outflows')}${by('out').map((l) => lineRow(l, false)).join('')}${ordRow('New assets – deposits, HP payments &amp; purchase VAT (est.)', 'out', 'From confirmed orders on the New assets on order page')}${tot('Total cash outflows', 'outF', 'outA', 'tot', false)}
      ${tot('Net cash flow', 'netF', 'netA', 'tot', true)}${bal('Closing cash balance', 'closeF', 'closeA', 'bal big')}${headroom}
      ${section('VAT workings (enter actual VAT on sales / purchases / capex; forecast fills itself)')}${by('vat').map((l) => lineRow(l, true)).join('')}${posRow}${vatNote}${actions}
      </tbody></table></div>`;

    el.innerHTML = head + tiles +
      `<div class="card"><h3>Cash vs minimum buffer</h3><div class="hint">Solid = actual cash at month end, dashed = forecast. Dotted line is your ${fmt(M.s.min_buffer)} buffer.</div><div id="cfch"></div></div>` +
      `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><div><h3>Forecast vs actual</h3><div class="hint">Type in any white cell. Grey figures are automatic (VAT, HP schedule). When a month's actuals are in, press <b>Close month</b>: its closing cash becomes the next opening balance and a new forecast month is added at the end.</div></div><div><button class="mini" id="cfadd">+ Add month</button></div></div>${table}<div class="err" id="cferr"></div></div>`;
    chart(R);
    const w = el.querySelector('.cfwrap');
    if (w) { const th = firstOpen ? [...w.querySelectorAll('th.mh')][firstOpen.i] : null; w.scrollLeft = keep != null ? keep : (th ? Math.max(0, th.offsetLeft - 212 - 249) : 0); }
    wire(el);
  }

  function wire(el) {
    const err = (t) => { const e = $('cferr'); if (e) e.textContent = t || ''; };
    el.querySelectorAll('.cf input').forEach((inp) => {
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      inp.addEventListener('change', async () => {
        const raw = inp.value.replace(/[£,\s]/g, ''); let v = raw === '' ? null : Number(raw);
        if (raw !== '' && !isFinite(v)) { err('That is not a number.'); return; }
        try { err(''); await ensureMonth(inp.dataset.k); await saveEntry(inp.dataset.k, inp.dataset.l, inp.dataset.w, v); draw(el); } catch (e) { err('Could not save: ' + e.message); }
      });
    });
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.close;
      const has = Object.values(M.E[k] || {}).some((e) => e.a != null);
      if (!has && !confirm('No actuals have been entered for ' + mlong(k) + '. Close it anyway (actuals count as zero)?')) return;
      try { b.disabled = true; await api('cf_months?month=eq.' + mdate(k), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ closed: true }) }); M.months.find((x) => x.k === k).closed = true; await rollForward(); draw(el); } catch (e) { err('Could not close: ' + e.message); b.disabled = false; }
    }));
    el.querySelectorAll('[data-reopen]').forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.reopen; if (!confirm('Reopen ' + mlong(k) + '? Later months will use its forecast again.')) return;
      try { await api('cf_months?month=eq.' + mdate(k), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ closed: false }) }); M.months.find((x) => x.k === k).closed = false; draw(el); } catch (e) { err('Could not reopen: ' + e.message); }
    }));
    const add = $('cfadd'); if (add) add.onclick = async () => { try { const hp = await hpSchedule(); await addMonth(fromIdx(midx(M.months[M.months.length - 1].k) + 1), hp); draw(el); } catch (e) { err('Could not add month: ' + e.message); } };
  }

  function chart(R) {
    const el = $('cfch'); if (!el) return;
    const W = el.clientWidth || 900, H = 300, Mg = { t: 12, r: 12, b: 32, l: 62 };
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const ks = R.map((r) => mlabel(r.k)); const x = d3.scalePoint().domain(ks).range([Mg.l + 20, W - Mg.r - 20]);
    const buf = R[0] ? R[0].buffer : 0;
    const vals = R.flatMap((r) => [r.eff, r.closeF, buf]); const y = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), d3.max(vals) * 1.08]).nice().range([H - Mg.b, Mg.t]);
    svg.append('g').attr('transform', `translate(${Mg.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => (v < 0 ? '-' : '') + '£' + d3.format('~s')(Math.abs(v))).tickSize(-(W - Mg.l - Mg.r))).call((g) => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', C.line); g.selectAll('text').attr('fill', C.mut).attr('font-size', 12); });
    svg.append('g').attr('transform', `translate(0,${H - Mg.b})`).call(d3.axisBottom(x).tickSize(0)).call((g) => { g.select('.domain').attr('stroke', C.line); g.selectAll('text').attr('fill', C.mut).attr('font-size', 12).attr('dy', '1.2em'); });
    svg.append('line').attr('x1', Mg.l).attr('x2', W - Mg.r).attr('y1', y(buf)).attr('y2', y(buf)).attr('stroke', C.bad).attr('stroke-dasharray', '2 4').attr('stroke-width', 2);
    const line = d3.line().x((d) => x(mlabel(d.k))).y((d) => y(d.v));
    const closed = R.filter((r) => r.closed).map((r) => ({ k: r.k, v: r.closeA }));
    const fc = R.filter((r, i) => !r.closed || (R[i + 1] && !R[i + 1].closed)).map((r) => ({ k: r.k, v: r.eff }));
    svg.append('path').datum(fc).attr('fill', 'none').attr('stroke', C.orange).attr('stroke-width', 2.5).attr('stroke-dasharray', '7 5').attr('d', line);
    svg.append('path').datum(closed).attr('fill', 'none').attr('stroke', C.blue).attr('stroke-width', 3).attr('d', line);
    svg.selectAll('circle').data(R).join('circle').attr('cx', (d) => x(mlabel(d.k))).attr('cy', (d) => y(d.eff)).attr('r', 5).attr('fill', (d) => (d.closed ? C.blue : '#fff')).attr('stroke', (d) => (d.eff < d.buffer ? C.bad : d.closed ? C.blue : C.orange)).attr('stroke-width', 2.5)
      .on('mousemove', (e, d) => T.show(e, `<b>${mlong(d.k)}</b> ${d.closed ? '(actual)' : '(forecast)'}<br>Cash ${gbp(d.eff)}<br>Headroom ${gbp(d.head)}<br>Net flow ${gbp(d.closed ? d.netA : d.netF)}`)).on('mouseleave', T.hide);
  }

  X.cf = { load, compute };
  X.routes.cashflow = async (el) => { window.__hpSched = await hpSchedule(); return page(el); };
})();
