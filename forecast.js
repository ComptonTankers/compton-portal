/* REVENUE FORECAST – 12 months ahead, built from what's in the portal:
   contracted hire (contracts, pro rata to their end dates) + other hire at the recent run rate
   + weighted pipeline + parking agreements + planned stock sales.
   Shown against the uploaded forecast, the budget and the actuals. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const ymAdd = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  const dim = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  const sg = (x) => (x >= 0 ? '+' : '−') + X.gbp(Math.abs(x));
  const mlab = (m) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  let CON = [], HM = [], MA = [], UP = [], ST = [], PIPE = [], PREV = null;

  async function load() {
    [CON, HM, MA, UP, ST] = await Promise.all([all('contracts', 'id.asc'), all('hire_months', 'month.asc'),
      api("ma_entries?select=month,line,actual,budget&line=in.(rental_energy,rental_waste,sales)"), all('rev_forecast', 'month.asc').catch(() => []),
      api('stock?select=reg,status,asking_price,expected_sale&expected_sale=not.is.null').catch(() => [])]);
    if (X.pipeline) { await X.pipeline.load().catch(() => null); PIPE = (X.pipeline.data() || []).filter((d) => X.pipeline.OPEN.includes(d.stage)); }
    if (X.parking) await X.parking.load().catch(() => null);
  }
  // contracted hire in a month, pro rata where a contract starts or ends part way through
  function contracted(ym, activeOnly) {
    const f = ym + '-01', n = dim(ym), l = ym + '-' + String(n).padStart(2, '0');
    return CON.filter((c) => (!activeOnly || c.active) && c.monthly_rate).reduce((t, c) => {
      const s = c.start_date && c.start_date > f ? c.start_date : f, e = !c.rolling && c.end_date && c.end_date < l ? c.end_date : l;
      if (c.start_date && c.start_date > l) return t; if (e < s) return t;
      return t + (+c.monthly_rate) * ((new Date(e) - new Date(s)) / 864e5 + 1) / n;
    }, 0);
  }
  function pipeIn(ym) {
    const next = ymAdd(new Date().toISOString().slice(0, 7), 2);
    return PIPE.reduce((t, d) => { const s = d.start_date ? d.start_date.slice(0, 7) : next, term = +d.term_months || 36;
      return ym >= s && ym < ymAdd(s, term) ? t + X.pipeline.wpm(d) : t; }, 0);
  }
  const salesIn = (ym) => ST.filter((s) => !['sold', 'moved_to_hire'].includes(s.status) && String(s.expected_sale).slice(0, 7) === ym).reduce((t, s) => t + (+s.asking_price || 0), 0);
  const maSum = (ym, lines, k) => { const r = MA.filter((x) => x.month.slice(0, 7) === ym && lines.includes(x.line) && x[k] != null); return r.length ? r.reduce((t, x) => t + +x[k], 0) : null; };
  const upIn = (ym) => { const r = UP.filter((u) => u.month.slice(0, 7) === ym && u.source === 'upload'); return r.length ? r.reduce((t, u) => t + +u.amount, 0) : null; };

  function build() {
    const cur = new Date().toISOString().slice(0, 7), past = HM.slice(-3).map((h) => h.month);
    // other hire = actual hire revenue less contracted, averaged over the last 3 months (short hires, extras, mileage)
    const other = past.length ? Math.max(0, past.reduce((t, m) => t + (+(HM.find((h) => h.month === m) || {}).hire_revenue || 0) - contracted(m, false), 0) / past.length) : 0;
    const months = Array.from({ length: 15 }, (_, i) => ymAdd(cur, i - 3));
    const rows = months.map((m) => {
      const fut = m >= cur, h = HM.find((x) => x.month === m), con = contracted(m, fut), pipe = fut ? pipeIn(m) : 0,
        park = X.parking ? X.parking.monthRevenue(m) : 0, sales = fut ? salesIn(m) : (h ? +h.sales_turnover || 0 : 0);
      const auto = con + (fut ? other : 0) + pipe + park + (fut ? sales : 0);
      return { m, fut, con, other: fut ? other : null, pipe, park, sales, auto, up: upIn(m), budget: maSum(m, ['rental_energy', 'rental_waste', 'sales'], 'budget'),
        actual: h ? +h.turnover || +h.hire_revenue || 0 : null };
    });
    return { rows, other, past, cur };
  }
  X.forecast = { load, build, contracted };   // used by the board pack

  X.routes['p-forecast'] = async function (el) {
    el.innerHTML = X.head('Revenue forecast', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Revenue forecast', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    draw(el);
  };

  function draw(el) {
    const { rows, other, past, cur } = build(), fut = rows.filter((r) => r.fut), nx = fut[0] || {}, y12 = fut.slice(0, 12);
    const sum = (k, rs = y12) => rs.reduce((t, r) => t + (r[k] || 0), 0), noStart = PIPE.filter((d) => !d.start_date);
    const v = (x) => (x == null ? '<span class="muted">–</span>' : gbp(x));
    el.innerHTML = X.head('Revenue forecast', 'Built each time from contracts, the pipeline, parking and planned sales. Upload the accountant’s forecast to compare.') +
      X.tiles([
        { l: mlab(nx.m || cur) + ' forecast', v: gbp(nx.auto), s: nx.budget != null ? 'budget ' + gbp(nx.budget) + ' (' + sg(nx.auto - nx.budget) + ')' : 'no budget loaded', c: nx.budget != null && nx.auto < nx.budget ? 'o' : '' },
        { l: 'Next 12 months', v: gbp(sum('auto')), s: (() => { const b = y12.filter((r) => r.budget != null); return b.length ? 'budget ' + gbp(sum('budget', b)) + ' for ' + b.length + ' months; portal ' + gbp(sum('auto', b)) + ' for the same' : 'no budget loaded'; })() },
        { l: 'Contracted share', v: sum('auto') ? Math.round((sum('con')) / sum('auto') * 100) + '%' : '–', s: gbp(sum('con')) + ' under contract' },
        { l: 'Weighted pipeline', v: gbp(sum('pipe')), s: PIPE.length + ' open deals' + (noStart.length ? ' · ' + noStart.length + ' without a start date' : '') },
        { l: 'Uploaded forecast', v: nx.up != null ? gbp(nx.up) : 'none', s: nx.up != null ? 'for ' + mlab(nx.m) + ' · portal ' + sg(nx.auto - nx.up) : 'paste it in below', c: nx.up == null ? 'o' : '' }]) +
      `<div class="card"><h3>Month by month</h3><div class="hint">Contracted hire is pro rata to each contract’s end date (rolling contracts carry on). Other hire is ${gbp(other)} a month – actual hire revenue less contracted, averaged over ${past.map(mlab).join(', ')}. Pipeline is each open deal’s monthly value × its probability, from its start date for its term${noStart.length ? '; deals with no start date are assumed to start in ' + mlab(ymAdd(cur, 2)) : ''}. Sales are asking prices in the expected sale month (Sales stock page). Actual is MCS turnover.</div>
       <table><thead><tr><th>Month</th><th class="n">Contracted hire</th><th class="n">Other hire</th><th class="n">Pipeline (weighted)</th><th class="n">Parking</th><th class="n">Sales</th><th class="n">Portal forecast</th><th class="n">Uploaded</th><th class="n">Budget</th><th class="n">Actual</th><th class="n">v budget</th></tr></thead><tbody>
       ${rows.map((r) => { const base = r.actual != null ? r.actual : r.auto, vb = r.budget != null ? base - r.budget : null;
         return `<tr${r.m === cur ? ' style="font-weight:600"' : ''}${!r.fut ? ' class="muted"' : ''}><td>${mlab(r.m)}${!r.fut ? ' <span class="small">(actual)</span>' : ''}</td><td class="n">${gbp(r.con)}</td><td class="n">${v(r.other)}</td><td class="n">${r.pipe ? gbp(r.pipe) : '–'}</td><td class="n">${r.park ? gbp(r.park) : '–'}</td><td class="n">${r.sales ? gbp(r.sales) : '–'}</td><td class="n"><b>${r.fut ? gbp(r.auto) : '–'}</b></td><td class="n">${v(r.up)}</td><td class="n">${v(r.budget)}</td><td class="n">${v(r.actual)}</td><td class="n" style="color:${vb == null ? '' : vb >= 0 ? '#16A34A' : '#DC2626'}">${vb == null ? '–' : sg(vb)}</td></tr>`; }).join('')}
       </tbody><tfoot><tr><th>Next 12 months</th><th class="n">${gbp(sum('con'))}</th><th class="n">${gbp(sum('other'))}</th><th class="n">${gbp(sum('pipe'))}</th><th class="n">${gbp(sum('park'))}</th><th class="n">${gbp(sum('sales'))}</th><th class="n">${gbp(sum('auto'))}</th><th class="n">${gbp(sum('up'))}</th><th class="n">${gbp(sum('budget'))}</th><th></th><th></th></tr></tfoot></table>
       <div style="margin-top:8px"><button class="mini" id="fc_snap">Save this month’s portal forecast</button> <span class="small muted">Keeps a copy so next month you can see how the forecast moved.</span> <span id="fc_snapmsg" class="small"></span></div></div>` +

      `<div class="card"><h3>Upload a forecast</h3><div class="hint">Copy the revenue rows from the forecast spreadsheet – including the row of month headings – and paste them here, or choose a CSV. Each row is a revenue line (e.g. Hire, Sales, Parking); each column a month. It replaces any earlier upload for the same months.</div>
       <textarea id="fc_paste" rows="6" style="width:100%" placeholder="Line	Nov-26	Dec-26	Jan-27&#10;Hire revenue	150000	152000	155000&#10;Sales	20000	0	45000"></textarea>
       <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="file" id="fc_file" accept=".csv,.txt"><button id="fc_check">Check</button><button class="pri2" id="fc_save" disabled>Save upload</button><span id="fc_msg" class="small muted"></span></div>
       <div id="fc_prev"></div>
       ${UP.filter((u) => u.source === 'upload').length ? `<div class="small muted" style="margin-top:8px">Loaded: ${[...new Set(UP.filter((u) => u.source === 'upload').map((u) => u.line))].map(esc).join(', ')} for ${mlab(UP.filter((u) => u.source === 'upload')[0].month.slice(0, 7))} – ${mlab(UP.filter((u) => u.source === 'upload').slice(-1)[0].month.slice(0, 7))}, uploaded ${new Date(UP.filter((u) => u.source === 'upload').slice(-1)[0].uploaded_at).toLocaleDateString('en-GB')}</div>` : ''}</div>`;

    $('fc_file').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('fc_paste').value = await f.text(); check(); } };
    $('fc_check').onclick = check;
    $('fc_save').onclick = async () => {
      if (!PREV || !PREV.length) return;
      const months = [...new Set(PREV.map((p) => p.month))];
      try {
        await api('rev_forecast?source=eq.upload&month=in.(' + months.join(',') + ')', { method: 'DELETE' });
        await api('rev_forecast', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(PREV.map((p) => Object.assign({ source: 'upload', uploaded_at: new Date().toISOString() }, p))) });
        await load(); draw(el);
      } catch (e) { $('fc_msg').textContent = 'Could not save: ' + e.message; }
    };
    $('fc_snap').onclick = async () => {
      const snap = y12.map((r) => ({ month: r.m + '-01', line: 'snapshot ' + cur, source: 'portal', amount: Math.round(r.auto * 100) / 100 }));
      try { await api('rev_forecast?on_conflict=month,line,source', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(snap) }); $('fc_snapmsg').textContent = 'Saved.'; }
      catch (e) { $('fc_snapmsg').textContent = 'Could not save: ' + e.message; }
    };
  }

  // turn a pasted grid into {month, line, amount} rows
  function parseMonth(s) {
    s = String(s || '').trim().replace(/^"|"$/g, ''); let m;
    if ((m = s.match(/^(\d{4})[-\/](\d{1,2})/))) return m[1] + '-' + m[2].padStart(2, '0');
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0'); }
    if ((m = s.match(/^([A-Za-z]{3,9})[\s\-\/'.]*(\d{2,4})$/)) && MON[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith('sept') ? 4 : 3)]) { const y = m[2].length === 2 ? '20' + m[2] : m[2]; return y + '-' + String(MON[m[1].toLowerCase().slice(0, 3)]).padStart(2, '0'); }
    return null;
  }
  const num = (s) => { const t = String(s || '').replace(/[£,"\s]/g, ''); if (t === '' || t === '-') return null; const neg = /^\(.*\)$/.test(t); const n = parseFloat(t.replace(/[()]/g, '')); return isNaN(n) ? null : neg ? -n : n; };
  function check() {
    const txt = $('fc_paste').value, sep = txt.includes('\t') ? '\t' : ',', grid = txt.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep));
    PREV = null; $('fc_save').disabled = true;
    const hi = grid.findIndex((r) => r.filter((c) => parseMonth(c)).length >= 2);
    if (hi < 0) { $('fc_msg').textContent = 'Couldn’t find a row of month headings (e.g. Nov-26, Dec-26).'; $('fc_prev').innerHTML = ''; return; }
    const cols = grid[hi].map(parseMonth), out = [];
    grid.slice(hi + 1).forEach((r) => { const label = String(r[0] || '').trim().replace(/^"|"$/g, ''); if (!label || /^total/i.test(label)) return;
      cols.forEach((m, i) => { if (!m || i === 0) return; const n = num(r[i]); if (n != null) out.push({ month: m + '-01', line: label, amount: n }); }); });
    if (!out.length) { $('fc_msg').textContent = 'Found the months but no figures under them.'; return; }
    PREV = out; $('fc_save').disabled = false;
    const lines = [...new Set(out.map((o) => o.line))], ms = [...new Set(out.map((o) => o.month))].sort();
    $('fc_msg').textContent = lines.length + ' lines × ' + ms.length + ' months. Check below, then save. (Total rows are skipped.)';
    $('fc_prev').innerHTML = `<table style="margin-top:8px"><thead><tr><th>Line</th>${ms.map((m) => `<th class="n">${mlab(m.slice(0, 7))}</th>`).join('')}</tr></thead><tbody>${lines.map((l) => `<tr><td>${esc(l)}</td>${ms.map((m) => { const o = out.find((x) => x.line === l && x.month === m); return `<td class="n">${o ? gbp(o.amount) : ''}</td>`; }).join('')}</tr>`).join('')}
      <tr><th>Total</th>${ms.map((m) => `<th class="n">${gbp(out.filter((x) => x.month === m).reduce((t, x) => t + x.amount, 0))}</th>`).join('')}</tr></tbody></table>`;
  }
})();
