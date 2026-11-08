/* NEW LAYOUT PREVIEW – period tables (monthly / quarterly / annual + comparisons), embeds of the existing edit screens. */
(function () {
  const X = window.CT; if (!X || !X.pv) return;
  const { gbp, esc, NOW, mon } = X; const PV = X.pv, { K0, lab, labL, mi, pc, kf, card, tbl, barChart } = PV;
  const $ = (r, s) => r.querySelector(s);
  const fyOf = (i) => (i % 12 >= 4 ? Math.floor(i / 12) : Math.floor(i / 12) - 1), fyL = (fy) => 'FY' + String(fy + 1).slice(2);
  const qOf = (i) => Math.floor((((i % 12) - 4 + 12) % 12) / 3) + 1, QN = ['May–Jul', 'Aug–Oct', 'Nov–Jan', 'Feb–Apr'];
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const money = (v) => (v == null ? '–' : gbp(v));

  /* ---- embed an existing screen (keeps all its editing), optionally showing only some of its cards ---- */
  function embed(pane, fn, keep) {
    const host = document.createElement('div'); pane.appendChild(host);
    const title = (c) => ((c.querySelector('h3') || {}).textContent || '').trim();
    const apply = () => [...host.children].forEach((c) => {
      if (!keep) { if (c.classList.contains('top')) c.style.display = 'none'; return; }
      if (c.classList.contains('flt')) return;
      const cards = c.classList.contains('card') ? [c] : [...c.querySelectorAll('.card')]; let any = false;
      cards.forEach((cd) => { const ok = keep.some((k) => title(cd).startsWith(k)); cd.style.display = ok ? '' : 'none'; any = any || ok; });
      c.style.display = cards.length ? (any ? '' : 'none') : 'none';
    });
    const mo = new MutationObserver(() => { mo.disconnect(); apply(); mo.observe(host, { childList: true }); });
    Promise.resolve().then(() => fn(host)).then(() => { apply(); mo.observe(host, { childList: true }); }).catch((e) => { host.innerHTML = '<div class="hint">Could not load: ' + esc(e.message) + '</div>'; });
  }

  /* ---- period engine ---- */
  function groups(per, months) {   // months = sorted month indexes
    const g = new Map();
    months.forEach((m) => { const k = per === 'month' ? m : per === 'qtr' ? fyOf(m) * 10 + qOf(m) : fyOf(m); if (!g.has(k)) g.set(k, { key: k, months: [], label: per === 'month' ? lab(m) : per === 'qtr' ? 'Q' + qOf(m) + ' ' + fyL(fyOf(m)) + ' · ' + QN[qOf(m) - 1] : fyL(fyOf(m)) + ' (May ' + fyOf(m) + ' – Apr ' + (fyOf(m) + 1) + ')' }); g.get(k).months.push(m); });
    return [...g.values()];
  }
  const cls = (v) => (v == null ? '' : v >= 0 ? `color:${K0.good}` : `color:${K0.bad}`);

  /* =================== ACCOUNTS: periods =================== */
  X.pv.accountsPeriods = async function (pane) {
    const D = await X.ma.data(), m = X.ma.model(), { MA, cell, SECT, SLAB, hasActual } = m;
    let S = { per: 'month', mode: 'both', metric: 'net', fy: MA.fy };
    const v = (l, ms, w) => ms.reduce((t, mm) => t + (cell(l, mm, w).v || 0), 0);
    const secV = (sec, ms, w) => MA.lines.filter((l) => l.section === sec).reduce((t, l) => t + v(l, ms, w), 0);
    const tot = (ms, w) => { const income = secV('income', ms, w), cos = secV('cos', ms, w), overhead = secV('overhead', ms, w); return { income, cos, gp: income - cos, overhead, costs: cos + overhead, net: income - cos - overhead }; };
    function allMonths() { const e = Object.keys(MA.E).map((k) => mon(k + '-01')); const lo = Math.min(...e, S.fy * 12 + 4), hi = Math.max(...e, S.fy * 12 + 15); const out = []; for (let i = lo - (lo % 12 >= 4 ? (lo % 12) - 4 : (lo % 12) + 8); i <= hi; i++) out.push(i); return out; }
    function draw() {
      const fm = Array.from({ length: 12 }, (_, i) => S.fy * 12 + 4 + i);
      const ms = S.per === 'year' ? allMonths().filter((i) => { const y = fyOf(i); return Object.keys(MA.E).some((k) => fyOf(mon(k + '-01')) === y) || y === S.fy; }) : fm;
      const gs = groups(S.per, ms), withA = (g) => g.months.filter(hasActual), ly = (g) => g.months.map((x) => x - 12);
      const val = (l, g, w) => v(l, g.months, w), fav = (a, b, cost) => (cost ? b - a : a - b);
      const cellTxt = (a, b, lyv, cost, g) => { const hasA = withA(g).length > 0, aa = hasA ? a : null;
        const fmtv = (x) => (x ? gbp(x) : '–'), vr = hasA ? fav(a, b, cost) : null;
        if (S.mode === 'act') return hasA ? fmtv(a) : `<span style="color:#9aa6bd;font-style:italic">${fmtv(b)}</span>`;
        if (S.mode === 'bud') return fmtv(b);
        if (S.mode === 'var') return hasA ? `<span style="${cls(vr)}">${(vr >= 0 ? '+' : '') + gbp(vr)}</span>` : '–';
        if (S.mode === 'varp') return hasA && b ? `<span style="${cls(vr)}">${(vr >= 0 ? '+' : '') + (vr / Math.abs(b) * 100).toFixed(0)}%</span>` : '–';
        if (S.mode === 'ly') { const d = lyv ? (a - lyv) / Math.abs(lyv) : null; return `${fmtv(lyv)}${hasA && d != null ? ` <span style="font-size:11px;${cls(cost ? -d : d)}">${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%</span>` : ''}`; }
        if (!hasA) return `<span style="color:#9aa6bd;font-style:italic">${fmtv(b)}</span>`;
        return `<div><b>${hasA ? fmtv(a) : '–'}</b></div><div style="font-size:11px;color:#6b7587">${fmtv(b)} budget</div>${hasA ? `<div style="font-size:11px;${cls(vr)}">${(vr >= 0 ? '+' : '') + gbp(vr)}</div>` : ''}`; };
      const rows = []; const cols = gs.map((g) => ({ g, aMs: withA(g), allM: g.months }));
      const pairs = (fnA) => cols.map((c) => { const aMsrc = { months: c.aMs }; return fnA(c, aMsrc); });
      SECT.forEach((sec) => {
        rows.push(`<tr class="sec"><td colspan="${gs.length + 2}">${SLAB[sec]}</td></tr>`);
        MA.lines.filter((l) => l.section === sec && l.active !== false).forEach((l) => { const cost = sec !== 'income'; const cs = cols.map((c) => { const a = v(l, c.aMs, 'a'), b = S.mode === 'bud' || S.mode === 'act' || !c.aMs.length ? v(l, c.allM, 'b') : v(l, c.aMs, 'b'), lyv = v(l, c.allM.map((x) => x - 12), 'a'); return { a, b, lyv, cost, g: c.g }; });
          if (!cs.some((x) => x.a || x.b || x.lyv)) return; const allA = ms.filter(hasActual), a = v(l, allA, 'a'), b = v(l, S.mode === 'bud' || S.mode === 'act' ? ms : allA, 'b'), lyv = v(l, allA.map((x) => x - 12), 'a');
          rows.push(`<tr><td>${esc(l.label)}</td>${cs.map((x) => `<td class="n">${cellTxt(x.a, x.b, x.lyv, cost, x.g)}</td>`).join('')}<td class="n tt">${cellTxt(a, b, lyv, cost, { months: ms })}</td></tr>`); });
        const key = sec === 'income' ? 'income' : sec === 'cos' ? 'cos' : 'overhead', cost = sec !== 'income', lbl = 'Total ' + SLAB[sec].toLowerCase();
        const mk = (label, k, cst, css) => { const cs = cols.map((c) => ({ a: tot(c.aMs, 'a')[k], b: S.mode === 'bud' || S.mode === 'act' || !c.aMs.length ? tot(c.allM, 'b')[k] : tot(c.aMs, 'b')[k], lyv: tot(c.allM.map((x) => x - 12), 'a')[k], g: c.g })); const allA = ms.filter(hasActual);
          rows.push(`<tr class="${css}"><td>${label}</td>${cs.map((x) => `<td class="n">${cellTxt(x.a, x.b, x.lyv, cst, x.g)}</td>`).join('')}<td class="n tt">${cellTxt(tot(allA, 'a')[k], tot(S.mode === 'bud' || S.mode === 'act' ? ms : allA, 'b')[k], tot(allA.map((x) => x - 12), 'a')[k], cst, { months: ms })}</td></tr>`); };
        mk(lbl, key, cost, 'sub'); if (sec === 'cos') mk('Gross profit', 'gp', false, 'tot'); if (sec === 'overhead') mk('Net profit', 'net', false, 'tot');
      });
      /* chart */
      const mkey = S.metric, cmap = { income: 'Income', costs: 'Costs', gp: 'Gross profit', net: 'Net profit' }, costM = mkey === 'costs';
      const chartA = cols.map((c) => (c.aMs.length ? tot(c.aMs, 'a')[mkey] : null)), chartB = cols.map((c) => tot(c.allM, 'b')[mkey]), chartLY = cols.map((c) => tot(c.allM.map((x) => x - 12), 'a')[mkey]);
      pane.innerHTML = `<div class="pv-card" style="margin-bottom:14px"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:end"><div><div class="hint">Period</div>${sel('ap_per', [['month', 'Monthly'], ['qtr', 'Quarterly'], ['year', 'Annual']], S.per)}</div><div><div class="hint">Show</div>${sel('ap_mode', [['both', 'Actual · budget · variance'], ['act', 'Actual'], ['bud', 'Budget'], ['var', 'Variance £'], ['varp', 'Variance %'], ['ly', 'Same period last year']], S.mode)}</div><div><div class="hint">Chart</div>${sel('ap_metric', [['net', 'Net profit'], ['income', 'Income'], ['costs', 'Costs'], ['gp', 'Gross profit']], S.metric)}</div><div style="${S.per === 'year' ? 'display:none' : ''}"><div class="hint">Financial year</div>${sel('ap_fy', Array.from({ length: 4 }, (_, i) => Math.floor(NOW / 12) - 2 + i).map((y) => [String(y), 'FY' + String(y + 1).slice(2) + ' (May ' + y + ')']), String(S.fy))}</div><div class="hint" style="flex:1;min-width:220px">Variance is favourable (green) or adverse (red). Months with no actuals yet show budget in grey italics. Last year = the same months a year earlier.</div></div></div>
        <div class="pv-card" style="margin-bottom:14px"><h3>${cmap[mkey]} by ${S.per === 'month' ? 'month' : S.per === 'qtr' ? 'quarter' : 'year'}</h3>${PV.legend([[K0.blue, 'Actual'], [K0.mut, 'Budget', 1], [K0.orange, 'Last year', 1]])}<div id="apc"></div></div>
        <div class="pv-card"><div style="overflow:auto;max-height:640px"><table class="pv-tbl ap"><thead><tr><th style="min-width:200px">${esc(D.fyLabel)}</th>${gs.map((g) => `<th class="n">${esc(g.label)}</th>`).join('')}<th class="n">Total to date</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>
        <style>.pv-tbl.ap td.n,.pv-tbl.ap th.n{text-align:right;white-space:nowrap}.pv-tbl.ap tr.sec td{background:#eef3fb;font-weight:700;color:${K0.blue}}.pv-tbl.ap tr.sub td{font-weight:700;background:#f6f8fc}.pv-tbl.ap tr.tot td{font-weight:800;background:#e4ecfa}.pv-tbl.ap td:first-child{position:sticky;left:0;background:inherit;background-color:#fff}.pv-tbl.ap tr.sec td:first-child,.pv-tbl.ap tr.sub td:first-child,.pv-tbl.ap tr.tot td:first-child{background-color:inherit}.pv-tbl.ap td.tt{background:#fdf6ee}</style>`;
      barChart($(pane, '#apc'), { labels: gs.map((g) => (S.per === 'qtr' ? g.label.split(' · ')[0] : g.label.split(' (')[0])), h: 260, series: [{ color: K0.blue, vals: chartA.map((x) => x || 0), cf: () => (costM ? K0.orange : K0.blue) }], line: { color: K0.mut, dash: 1, vals: chartB }, tip: (i) => `<b>${esc(gs[i].label)}</b><br>Actual ${chartA[i] == null ? '–' : gbp(chartA[i])}<br>Budget ${gbp(chartB[i])}<br>Last year ${gbp(chartLY[i])}` });
      const bind = (id, k, num) => { $(pane, '#' + id).onchange = (e) => { S[k] = num ? +e.target.value : e.target.value; draw(); }; };
      bind('ap_per', 'per'); bind('ap_mode', 'mode'); bind('ap_metric', 'metric'); const f = $(pane, '#ap_fy'); if (f) f.onchange = (e) => { S.fy = +e.target.value; MA.fy = S.fy; draw(); };
    }
    draw();
  };

  /* =================== CASH: periods =================== */
  X.pv.cashPeriods = async function (pane, D) {
    const { R, M } = D; let S = { per: 'month', mode: 'val' };
    const inL = M.lines.filter((l) => l.section === 'in'), outL = M.lines.filter((l) => l.section === 'out'), mk = (r) => mi(r.k);
    const valR = (r, c, w) => (w ? (r.val(c, w) || 0) : (r.closed ? (r.val(c, 'a') != null ? r.val(c, 'a') : 0) : (r.val(c, 'f') || 0)));
    function draw() {
      const gs = groups(S.per, R.map(mk)).map((g) => Object.assign(g, { rs: g.months.map((m) => R.find((r) => mk(r) === m)) }));
      const closedOnly = (g) => g.rs.filter((r) => r.closed);
      const cellOf = (g, f) => { if (S.mode === 'val') return f(g.rs, null); const cr = closedOnly(g); if (!cr.length) return null; const a = f(cr, 'a'), b = f(cr, 'f'); return S.mode === 'var' ? a - b : (b ? (a - b) / Math.abs(b) : null); };
      const fmtc = (x, pct) => (x == null ? '–' : S.mode === 'var' ? `<span style="${cls(x)}">${(x >= 0 ? '+' : '') + gbp(x)}</span>` : S.mode === 'varp' ? `<span style="${cls(x)}">${(x >= 0 ? '+' : '') + (x * 100).toFixed(0)}%</span>` : gbp(x));
      const lineSum = (code) => (rs, w) => rs.reduce((t, r) => t + valR(r, code, w), 0);
      const inSum = (rs, w) => rs.reduce((t, r) => t + (w === 'a' ? r.inA : w === 'f' ? r.inF : (r.closed ? r.inA : r.inF)), 0), outSum = (rs, w) => rs.reduce((t, r) => t + (w === 'a' ? r.outA : w === 'f' ? r.outF : (r.closed ? r.outA : r.outF)), 0);
      const row = (label, f, css) => `<tr class="${css || ''}"><td>${label}</td>${gs.map((g) => `<td class="n">${fmtc(cellOf(g, f))}</td>`).join('')}</tr>`;
      const body = [`<tr class="sec"><td colspan="${gs.length + 1}">Money in</td></tr>`].concat(inL.filter((l) => R.some((r) => valR(r, l.code))).map((l) => row(esc(l.label), lineSum(l.code))), [row('Total money in', inSum, 'sub'), `<tr class="sec"><td colspan="${gs.length + 1}">Money out</td></tr>`], outL.filter((l) => R.some((r) => valR(r, l.code))).map((l) => row(esc(l.label), lineSum(l.code))), [row('Total money out', outSum, 'sub'), row('Net movement', (rs, w) => inSum(rs, w) - outSum(rs, w), 'tot')]);
      if (S.mode === 'val') body.push(`<tr class="tot"><td>Closing cash</td>${gs.map((g) => `<td class="n">${gbp(g.rs[g.rs.length - 1].eff)}</td>`).join('')}</tr>`, `<tr class="sub"><td>Lowest headroom over buffer</td>${gs.map((g) => { const v = Math.min(...g.rs.map((r) => r.head)); return `<td class="n" style="${cls(v)}">${gbp(v)}</td>`; }).join('')}</tr>`);
      pane.innerHTML = `<div class="pv-card" style="margin-bottom:14px"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:end"><div><div class="hint">Period</div>${sel('cp_per', [['month', 'Monthly'], ['qtr', 'Quarterly'], ['year', 'Annual']], S.per)}</div><div><div class="hint">Show</div>${sel('cp_mode', [['val', 'Actual (forecast after)'], ['var', 'Actual vs forecast £ (closed months)'], ['varp', 'Actual vs forecast %']], S.mode)}</div><div class="hint" style="flex:1;min-width:220px">Closed months use actuals, open months use the forecast. Annual groups by financial year (May to April); only months in the cash flow are included.</div></div></div><div class="pv-card"><div style="overflow:auto;max-height:640px"><table class="pv-tbl ap"><thead><tr><th style="min-width:190px"></th>${gs.map((g) => `<th class="n">${esc(g.label)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div></div>
        <style>.pv-tbl.ap td.n,.pv-tbl.ap th.n{text-align:right;white-space:nowrap}.pv-tbl.ap tr.sec td{background:#eef3fb;font-weight:700;color:${K0.blue}}.pv-tbl.ap tr.sub td{font-weight:700;background:#f6f8fc}.pv-tbl.ap tr.tot td{font-weight:800;background:#e4ecfa}</style>`;
      $(pane, '#cp_per').onchange = (e) => { S.per = e.target.value; draw(); }; $(pane, '#cp_mode').onchange = (e) => { S.mode = e.target.value; draw(); };
    }
    draw();
  };

  /* =================== FLEET: periods =================== */
  X.pv.fleetPeriods = function (pane, D) {
    const { months, types } = D; let S = { per: 'month', by: 'all' };
    const util = (o) => (o.ch ? o.on / o.ch : null);
    function draw() {
      const fm = months.map((m) => mi(m.month.slice(0, 7))), gs = groups(S.per, fm);
      const data = gs.map((g) => { const ms = months.filter((m) => g.months.includes(mi(m.month.slice(0, 7)))), last = ms[ms.length - 1]; const ty = types.filter((t) => ms.some((m) => m.month === t.month) && (S.by === 'all' || t.type === S.by)); const one = S.by === 'all';
        const rev = one ? ms.reduce((t, m) => t + (+m.hire_revenue || 0), 0) : ty.reduce((t, x) => t + (+x.revenue || 0), 0), on = one ? ms.reduce((t, m) => t + (+m.on_hire_days || 0), 0) : ty.reduce((t, x) => t + (+x.on_hire_days || 0), 0), ch = one ? ms.reduce((t, m) => t + (+m.chargeable_days || 0), 0) : ty.reduce((t, x) => t + (+x.chargeable_days || 0), 0);
        const lt = one ? last : types.filter((t) => t.month === last.month && t.type === S.by)[0] || {}; return { g, rev, util: ch ? on / ch : null, units: +lt.units || 0, onHire: one ? +last.units_on_hire || 0 : (+lt.units || 0) - (+lt.units_idle || 0), idle: +lt.units_idle || 0, n: ms.length }; });
      const dl = (cur, prev, pctv) => (prev == null || cur == null ? '' : `<div style="font-size:11px;${cls(cur - prev)}">${cur - prev >= 0 ? '+' : ''}${pctv ? ((cur - prev) * 100).toFixed(1) + ' pts' : prev ? ((cur - prev) / Math.abs(prev) * 100).toFixed(1) + '%' : ''}</div>`);
      const rowF = (label, f, fmt, pctv) => `<tr><td>${label}</td>${data.map((d, i) => `<td class="n">${fmt(f(d))}${dl(f(d), i ? f(data[i - 1]) : null, pctv)}</td>`).join('')}</tr>`;
      const tyList = [...new Set(types.map((t) => t.type))].sort();
      pane.innerHTML = `<div class="pv-card" style="margin-bottom:14px"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:end"><div><div class="hint">Period</div>${sel('fp_per', [['month', 'Monthly'], ['qtr', 'Quarterly'], ['year', 'Annual']], S.per)}</div><div><div class="hint">Equipment type</div>${sel('fp_by', [['all', 'Whole fleet']].concat(tyList.map((t) => [t, t])), S.by)}</div><div class="hint" style="flex:1;min-width:220px">Each figure shows the change on the previous period beneath it. Only months loaded from MCS are included (${months.length} so far), so quarters and years fill in as months are added.</div></div></div>
        <div class="pv-card"><div style="overflow:auto"><table class="pv-tbl ap"><thead><tr><th style="min-width:190px"></th>${data.map((d) => `<th class="n">${esc(d.g.label)}<div class="hint">${d.n} month${d.n > 1 ? 's' : ''}</div></th>`).join('')}</tr></thead><tbody>${rowF('Hire turnover', (d) => d.rev, gbp)}${rowF('Time utilisation', (d) => d.util, (v) => pc(v, 1), true)}${rowF('Units in fleet', (d) => d.units, (v) => v)}${rowF('Units on hire', (d) => d.onHire, (v) => v)}${rowF('Units off hire all month', (d) => d.idle, (v) => v)}${rowF('Turnover per unit on hire', (d) => (d.onHire ? d.rev / d.n / d.onHire : null), (v) => (v == null ? '–' : gbp(v)))}</tbody></table></div></div><style>.pv-tbl.ap td.n,.pv-tbl.ap th.n{text-align:right;white-space:nowrap}</style>`;
      $(pane, '#fp_per').onchange = (e) => { S.per = e.target.value; draw(); }; $(pane, '#fp_by').onchange = (e) => { S.by = e.target.value; draw(); };
    }
    draw();
  };
  X.pv.embed = embed;
  /* ---- page-level period control (shared by Overview, Fleet, Cash) ---- */
  const PS = (X.pv.S = X.pv.S || { per: 'month', pick: null, cmp: 'prev' });
  X.pv.groups = groups;
  X.pv.periodBar = function (el, gs, rerun, opts) {
    const pickI = PS.pick != null && PS.pick < gs.length ? PS.pick : gs.length - 1; PS.pick = pickI === gs.length - 1 && PS.pick == null ? null : pickI;
    const nm = (g) => (PS.per === 'qtr' ? g.label.split(' · ')[0] : PS.per === 'year' ? g.label.split(' (')[0] : g.label);
    const bar = document.createElement('div'); bar.className = 'pv-card'; bar.style.cssText = 'margin-bottom:14px;padding:10px 14px';
    bar.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:end"><div><div class="hint">View by</div><div class="pv-seg">${[['month', 'Month'], ['qtr', 'Quarter'], ['year', 'Year']].map(([v, t]) => `<button data-per="${v}" class="${PS.per === v ? 'on' : ''}">${t}</button>`).join('')}</div></div><div><div class="hint">Period shown</div><select id="pb_pick">${gs.map((g, i) => `<option value="${i}" ${i === pickI ? 'selected' : ''}>${esc(nm(g))}${i === gs.length - 1 ? ' (latest)' : ''}</option>`).join('')}</select></div><div><div class="hint">Compare with</div><select id="pb_cmp"><option value="prev" ${PS.cmp === 'prev' ? 'selected' : ''}>Previous ${PS.per === 'month' ? 'month' : PS.per === 'qtr' ? 'quarter' : 'year'}</option><option value="ly" ${PS.cmp === 'ly' ? 'selected' : ''}>Same period last year</option></select></div><div class="hint" style="flex:1;min-width:200px">${opts && opts.note ? esc(opts.note) : 'Every number and chart on this page follows this choice.'}</div></div>
      <style>.pv-seg{display:inline-flex;border:1px solid #c9d2e3;border-radius:8px;overflow:hidden}.pv-seg button{border:0;background:#fff;padding:7px 16px;font:inherit;font-weight:600;color:#44526e;cursor:pointer}.pv-seg button.on{background:#164698;color:#fff}</style>`;
    el.appendChild(bar);
    bar.querySelectorAll('[data-per]').forEach((b) => (b.onclick = () => { PS.per = b.dataset.per; PS.pick = null; rerun(); }));
    bar.querySelector('#pb_pick').onchange = (e) => { PS.pick = +e.target.value === gs.length - 1 ? null : +e.target.value; rerun(); };
    bar.querySelector('#pb_cmp').onchange = (e) => { PS.cmp = e.target.value; rerun(); };
    return { i: pickI, g: gs[pickI], prev: gs[pickI - 1] || null, name: nm, per: PS.per, cmp: PS.cmp, word: PS.per === 'month' ? 'month' : PS.per === 'qtr' ? 'quarter' : 'year' };
  };
  X.pv.vs = function (cur, base, o) { o = o || {}; if (base == null || cur == null || (!base && !cur)) return ''; const d = cur - base, pct = base ? d / Math.abs(base) : null, good = o.cost ? d <= 0 : d >= 0; const txt = o.pts ? (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + ' pts' : (d >= 0 ? '+' : '') + (o.fmt ? o.fmt(d) : gbp(d)) + (pct != null ? ' (' + (pct >= 0 ? '+' : '') + (pct * 100).toFixed(0) + '%)' : ''); return `<span style="color:${good ? K0.good : K0.bad}">${txt}</span>`; };
  /* New purchases: orders (cash, VAT, edit) + deal analyser */
  X.routes['p-orders'] = async (el) => {
    el.innerHTML = X.head('New purchases', 'Preview · assets on order, what they do to cash and VAT, and the deal analyser') + '<div class="pv-banner"><b>Preview of the new layout</b> – these tabs carry your current pages across so nothing is missing; I will rebuild them in the new style next.</div>';
    const root = document.createElement('div'); el.appendChild(root);
    PV.tabs(root, [
      { id: 'o', label: 'On order, cash and VAT', render: (p) => embed(p, X.routes.orders, null) },
      { id: 'a', label: 'Deal analyser', render: (p) => embed(p, X.routes.analyser, null) }]);
  };
})();
