/* Management accounts (actual vs budget P&L) and Fixed assets & depreciation. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, C, NOW, mon } = X;
  const { cols, hbars, row, pct } = X.charts;
  const $ = (id) => document.getElementById(id);
  const mi = (k) => mon(k + '-01');
  const kOf = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const labL = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const num = (v) => (v === null || v === undefined || v === '' ? null : +v);
  const parse = (t) => { const s = String(t).replace(/[£,\s]/g, '').replace(/^\((.*)\)$/, '-$1'); return s === '' || s === '-' ? null : (isNaN(+s) ? undefined : +s); };
  const norm = (u) => String(u || '').replace(/\s+/g, '').toUpperCase();
  const legend = (a) => '<div class="legend">' + a.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('') + '</div>';
  const css = document.createElement('style');
  css.textContent = `.mi{width:84px;text-align:right;border:1px solid transparent;border-radius:4px;padding:2px 4px;font:inherit;background:transparent}.mi:hover{border-color:var(--line)}.mi:focus{border-color:var(--blue);background:#fff;outline:none}.mi.auto{color:var(--mut);font-style:italic}
  table.ma{border-collapse:separate;border-spacing:0;font-size:13px;width:max-content;min-width:100%}table.ma th,table.ma td{padding:3px 6px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:right;background:#fff}
  table.ma thead th{position:sticky;top:0;background:#fafbfd;z-index:3}table.ma thead tr:nth-child(2) th{top:30px}table.ma td:first-child,table.ma th:first-child{position:sticky;left:0;text-align:left;z-index:2;min-width:210px;border-right:1px solid var(--line)}
  table.ma thead th:first-child{z-index:4}table.ma tr.sec td{background:#eef3fb;font-weight:700;color:var(--blue);text-align:left}table.ma tr.sub td{font-weight:700;background:#f6f8fc}table.ma tr.tot td{font-weight:800;background:#e4ecfa}
  table.ma .ytd{background:#fdf6ee!important;border-left:1px solid var(--line)}.fav{color:var(--good)}.adv{color:var(--bad)}`;
  document.head.appendChild(css);

  const SECT = ['income', 'cos', 'overhead'];
  const SLAB = { income: 'Income', cos: 'Cost of sales', overhead: 'Operating expenses' };
  const FYM = 4;   // financial year starts in May and ends 30 April
  const fyOf = (i) => (i % 12 >= FYM ? Math.floor(i / 12) : Math.floor(i / 12) - 1);
  const fyLabel = (fy) => 'FY' + String(fy + 1).slice(2) + ' (May ' + fy + ' – Apr ' + (fy + 1) + ')';
  const DEP = ['depreciation', 'ord_dep'], HPI = ['hp_interest', 'ord_int'], DISP = ['disposal'];

  /* ===================== fixed asset engine ===================== */
  let FA = null;
  async function faLoad() {
    const [assets, pol] = await Promise.all([all('fa_assets', 'ref.asc'), all('fa_policies', 'sort.asc')]);
    FA = { assets, pol: Object.fromEntries(pol.map((p) => [p.category, p])), polRows: pol };
  }
  function sched(a) {
    const anch = a.cost && a.nbv_open != null && a.nbv_open_date;
    if (!a.cost || (!a.purchase_date && !anch)) return null;
    const p = FA.pol[a.description] || FA.pol[a.category] || { life_years: 5, residual_pct: 0 };
    const method = p.method === 'reducing' ? 'reducing' : 'straight', rate = Math.min(0.99, Math.max(0, (+p.rate_pct || 0) / 100));
    const life = num(a.life_years) != null ? +a.life_years : +p.life_years, res = num(a.residual_pct) != null ? +a.residual_pct : +p.residual_pct;
    const Lf = Math.max(1, Math.round(life * 12)), cost = +a.cost, floor = cost * res / 100, mc = cost * (1 - res / 100) / Lf, disp = a.disposed_date ? mon(a.disposed_date) : null;
    const open = anch ? +a.nbv_open : cost, s = anch ? mon(a.nbv_open_date) + 1 : mon(a.purchase_date);
    /* f(n) = book value after n months of charge */
    const f = method === 'reducing' ? (n) => Math.max(floor, open * Math.pow(1 - rate, n / 12)) : (n) => Math.max(floor, open - n * mc);
    const L = method === 'reducing' ? 1e9 : Math.max(0, Math.ceil((open - floor) / mc - 1e-9));
    return { s, e: Math.min(s + L - 1, disp != null ? disp - 1 : 1e9), mc, L, cost, disp, life, res, open, f, method, rate };
  }
  const nAt = (q, m) => Math.max(0, Math.min(m, q.e) - q.s + 1);
  const chargeAt = (a, m) => { const q = sched(a); if (!q || m < q.s || m > q.e) return 0; const n = nAt(q, m); return q.f(n - 1) - q.f(n); };
  const accAt = (a, m) => { const q = sched(a); return q ? q.cost - nbvAt(a, m) : 0; };
  const nbvAt = (a, m) => { const q = sched(a); if (!q) return 0; if (q.disp != null && m >= q.disp) return 0; return q.f(nAt(q, m)); };
  const depMonth = (m) => FA ? FA.assets.filter((a) => a.active).reduce((t, a) => t + chargeAt(a, m), 0) : 0;

  X.fa = { load: faLoad, sched: (a) => sched(a), nbvAt: (a, m) => nbvAt(a, m), get: () => FA, chargeAt: (a, m) => chargeAt(a, m), accAt: (a, m) => accAt(a, m), depMonth: (m) => depMonth(m) };

  /* ===================== management accounts + budget ===================== */
  let MA = null;
  async function maLoad() {
    const [lines, ent] = await Promise.all([all('ma_lines', 'sort.asc'), all('ma_entries', 'month.asc'), X.orders ? X.orders.load() : null]);
    const E = {}; ent.forEach((r) => { const k = String(r.month).slice(0, 7); (E[k] = E[k] || {})[r.line] = { a: num(r.actual), b: num(r.budget) }; });
    const lastK = Object.keys(E).filter((k) => Object.values(E[k]).some((x) => x.a != null)).sort().pop();
    const fy = MA ? MA.fy : (lastK ? fyOf(mi(lastK)) : fyOf(NOW));
    if (X.orders) {   // estimated finance on assets on order, forecast months only
      lines.push({ code: 'ord_rev', label: 'Hire income – ordered assets (est.)', section: 'income', sort: 905, virtual: true, note: 'Estimate from the Orders page (confirmed orders only)' });
      lines.push({ code: 'ord_int', label: 'HP interest – ordered assets (est.)', section: 'cos', sort: 905, virtual: true, note: 'Estimate from the Orders page (Fleet → New assets on order)' });
      lines.push({ code: 'ord_dep', label: 'Depreciation – ordered assets (est.)', section: 'cos', sort: 906, virtual: true, note: 'Estimate from the Orders page (Fleet → New assets on order)' });
    }
    lines.sort((a, b) => SECT.indexOf(a.section) - SECT.indexOf(b.section) || a.sort - b.sort);
    MA = { lines, E, fy, la: lastK ? mi(lastK) : NOW };
  }
  const cell = (l, m, w) => {   // {v, auto}
    if (l.virtual) { if (w !== 'b' || m <= MA.la || !X.orders) return { v: null, auto: false }; const o = X.orders.impact(m), v = l.code === 'ord_int' ? o.int : l.code === 'ord_rev' ? o.rev : o.dep; return { v: v ? Math.round(v) : null, auto: true, virtual: true }; }
    const k = kOf(m), e = MA.E[k] && MA.E[k][l.code], own = e ? (w === 'a' ? e.a : e.b) : null;
    if (own != null) return { v: own, auto: false };
    if (l.auto === 'fa' && FA && (w === 'b' || m <= NOW)) { const c = depMonth(m); if (c) return { v: Math.round(c * 100) / 100, auto: true }; }
    return { v: null, auto: false };
  };
  const lv = (codes, m, w) => MA.lines.filter((l) => codes.includes(l.code)).reduce((t, l) => t + (cell(l, m, w).v || 0), 0);
  const secSum = (sec, m, w) => MA.lines.filter((l) => l.section === sec).reduce((t, l) => t + (cell(l, m, w).v || 0), 0);
  function pl(m, w) {
    const income = secSum('income', m, w), cos = secSum('cos', m, w), overhead = secSum('overhead', m, w);
    const gp = income - cos, net = gp - overhead, disp = lv(DISP, m, w), dep = lv(DEP, m, w), hpi = lv(HPI, m, w);
    return { income, cos, gp, overhead, net, disp, nodisp: net + disp, pre: net + dep + hpi + disp };
  }
  const hasActual = (m) => { const e = MA.E[kOf(m)]; return !!(e && Object.values(e).some((x) => x.a != null)); };
  const fyMonths = () => Array.from({ length: 12 }, (_, i) => MA.fy * 12 + FYM + i);
  const lastActual = (ms) => [...ms].reverse().find((m) => hasActual(m));

  X.routes.ma = async (el) => { el.innerHTML = X.head('Management accounts', 'Loading…') + '<div class="empty">Loading…</div>'; if (!FA) await faLoad(); await maLoad(); maDraw(el); };
  X.routes.budget = async (el) => { el.innerHTML = X.head('Budget', 'Loading…') + '<div class="empty">Loading…</div>'; if (!FA) await faLoad(); await maLoad(); budDraw(el); };

  const fyPicker = (id) => { const o = []; for (let y = Math.floor(NOW / 12) - 2; y <= Math.floor(NOW / 12) + 1; y++) o.push(`<option value="${y}" ${y === MA.fy ? 'selected' : ''}>${fyLabel(y)}</option>`); return `<select id="${id}">${o.join('')}</select>`; };
  const save = async (k, code, w, v) => {
    await api('ma_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ month: k + '-01', line: code, [w === 'a' ? 'actual' : 'budget']: v, updated_at: new Date().toISOString() }) });
    (MA.E[k] = MA.E[k] || {}); (MA.E[k][code] = MA.E[k][code] || { a: null, b: null })[w] = v;
  };
  const wireInputs = (el, redraw) => el.querySelectorAll('input.mi').forEach((inp) => inp.addEventListener('change', async () => {
    const v = parse(inp.value); if (v === undefined) { inp.value = ''; return; }
    try { await save(inp.dataset.m, inp.dataset.l, inp.dataset.w, v); redraw(); } catch (e) { inp.style.outline = '2px solid ' + C.bad; }
  }));
  const reload = async (el, draw) => { const fy = MA.fy; await maLoad(); MA.fy = fy; draw(el); };

  function maDraw(el) {
    const keep = el.querySelector('.maw') ? [el.querySelector('.maw').scrollLeft, el.querySelector('.maw').scrollTop, window.scrollY] : null;
    const ms = fyMonths(), la = lastActual(ms), ytd = la != null ? ms.filter((m) => m <= la) : [];
    const sum = (f) => ms.reduce((t, m) => t + f(m), 0), ysum = (f) => ytd.reduce((t, m) => t + f(m), 0);
    const A = (m) => pl(m, 'a'), B = (m) => pl(m, 'b');
    const yA = (k) => ysum((m) => A(m)[k]), yB = (k) => ysum((m) => B(m)[k]), fB = (k) => sum((m) => B(m)[k]);
    const outlook = (k) => yA(k) + ms.filter((m) => !ytd.includes(m)).reduce((t, m) => t + B(m)[k], 0);
    const varCls = (v, cost) => ((cost ? -v : v) >= 0 ? 'fav' : 'adv');
    const vs = (a, b) => (b ? gbp(a - b) + ' vs budget (' + pct(a / b) + ')' : 'no budget');
    const tiles = X.tiles([
      { l: 'Income, year to date', v: gbp(yA('income')), s: vs(yA('income'), yB('income')), c: yB('income') && yA('income') < yB('income') ? 'r' : 'g' },
      { l: 'Gross profit, year to date', v: gbp(yA('gp')), s: vs(yA('gp'), yB('gp')) },
      { l: 'Net profit, year to date', v: gbp(yA('net')), s: vs(yA('net'), yB('net')), c: yA('net') < yB('net') ? 'r' : 'g' },
      { l: 'Profit without disposals', v: gbp(yA('nodisp')), s: vs(yA('nodisp'), yB('nodisp')) },
      { l: 'Full-year budget profit', v: gbp(fB('net')), s: 'on income ' + gbp(fB('income')), c: 'o' },
      { l: 'Full-year outlook', v: gbp(outlook('net')), s: 'actual to date + budget for the rest · ' + gbp(outlook('net') - fB('net')) + ' vs budget', c: outlook('net') < fB('net') ? 'r' : 'g' }]);

    const head1 = `<tr><th rowspan="2">${esc(fyLabel(MA.fy))}</th>${ms.map((m) => `<th colspan="2" style="text-align:center">${lab(m)}</th>`).join('')}<th colspan="4" class="ytd" style="text-align:center">Year to date${la != null ? ' to ' + lab(la) : ''}</th><th rowspan="2" class="ytd">FY budget</th></tr>`;
    const head2 = `<tr>${ms.map(() => '<th>Actual</th><th>Budget</th>').join('')}<th class="ytd">Actual</th><th class="ytd">Budget</th><th class="ytd">Var</th><th class="ytd">Var %</th></tr>`;
    const ytdCells = (a, b, cost, fyb) => { const v = a - b; return `<td class="ytd">${a ? gbp(a) : '–'}</td><td class="ytd">${b ? gbp(b) : '–'}</td><td class="ytd ${a || b ? varCls(v, cost) : ''}">${a || b ? gbp(v) : '–'}</td><td class="ytd ${a || b ? varCls(v, cost) : ''}">${b ? pct(v / Math.abs(b)) : '–'}</td><td class="ytd">${fyb ? gbp(fyb) : '–'}</td>`; };
    const lineRow = (l) => {
      const cost = l.section !== 'income';
      const inputs = ms.map((m) => ['a', 'b'].map((w) => { const c = cell(l, m, w); if (l.virtual) return `<td style="color:var(--mut);font-style:italic">${c.v == null ? '' : gbp(c.v)}</td>`; return `<td><input class="mi ${c.auto ? 'auto' : ''}" data-l="${l.code}" data-m="${kOf(m)}" data-w="${w}" value="${c.v == null ? '' : Math.round(c.v * 100) / 100}" title="${c.auto ? 'Automatic from the fixed asset register – type to override' : ''}"></td>`; }).join('')).join('');
      return `<tr><td>${esc(l.label)}${l.auto ? ' <span class="pill b" style="font-size:10px">auto</span>' : ''}</td>${inputs}${ytdCells(ysum((m) => cell(l, m, 'a').v || 0), ysum((m) => cell(l, m, 'b').v || 0), cost, sum((m) => cell(l, m, 'b').v || 0))}</tr>`;
    };
    const totRow = (cls, label, key, cost) => `<tr class="${cls}"><td>${label}</td>${ms.map((m) => `<td>${A(m)[key] ? gbp(A(m)[key]) : '–'}</td><td>${B(m)[key] ? gbp(B(m)[key]) : '–'}</td>`).join('')}${ytdCells(yA(key), yB(key), cost, fB(key))}</tr>`;
    const body = [];
    SECT.forEach((sec) => {
      body.push(`<tr class="sec"><td colspan="${2 + ms.length * 2 + 4}">${SLAB[sec]}</td></tr>`); MA.lines.filter((l) => l.section === sec && l.active !== false).forEach((l) => body.push(lineRow(l)));
      if (sec === 'income') body.push(totRow('sub', 'Total income', 'income', false));
      if (sec === 'cos') { body.push(totRow('sub', 'Total cost of sales', 'cos', true)); body.push(totRow('tot', 'Gross profit', 'gp', false)); }
      if (sec === 'overhead') { body.push(totRow('sub', 'Total operating expenses', 'overhead', true)); body.push(totRow('tot', 'Net profit', 'net', false)); body.push(totRow('sub', 'Profit (without disposal)', 'nodisp', false)); body.push(totRow('sub', 'Profit before depreciation, HP interest &amp; disposals', 'pre', false)); }
    });
    const adverse = MA.lines.map((l) => { const a = ytd.reduce((t, m) => t + (cell(l, m, 'a').v || 0), 0), b = ytd.reduce((t, m) => t + (cell(l, m, 'b').v || 0), 0); const cost = l.section !== 'income'; return { l, a, b, f: cost ? b - a : a - b }; }).filter((x) => x.b || x.a).sort((p, q) => p.f - q.f);
    const flags = adverse.filter((x) => x.f < 0).slice(0, 6), wins = adverse.filter((x) => x.f > 0).reverse().slice(0, 4);
    const li = (x, good) => `<li style="padding:8px 0;border-bottom:1px solid ${C.line}"><b>${esc(x.l.label)}</b>: ${gbp(x.a)} against ${gbp(x.b)} budget – <span class="${good ? 'fav' : 'adv'}">${gbp(Math.abs(x.f))} ${x.l.section === 'income' ? (good ? 'ahead' : 'short') : (good ? 'under' : 'over')}</span></li>`;

    el.innerHTML = X.head('Management accounts', 'Actual against budget · FY ends 30 April · type into the grid or paste from Excel') + tiles +
      `<div class="flt"><b>Financial year</b>${fyPicker('ma_fy')}<span class="cnt">Edit budgets on the <a href="#/budget" style="color:${C.blue}">Budget</a> page.</span></div>
      <div class="row"><div class="card"><h3>Income against budget</h3><div class="hint">Monthly. Line = budget.</div><div id="m1"></div></div>
        <div class="card"><h3>Net profit against budget</h3><div class="hint">Monthly. Line = budget.</div><div id="m2"></div></div></div>
      <div class="row"><div class="card"><h3>Cumulative net profit</h3><div class="hint">Running total through the year. Line = budget.</div><div id="m3"></div></div>
        <div class="card"><h3>Costs: actual vs budget (YTD)</h3><div class="hint">Bar = actual, thin line = budget. Hover for the variance.</div><div id="m4"></div></div></div>
      <div class="row"><div class="card" style="border-top:4px solid ${C.bad}"><h3>Behind budget</h3>${flags.length ? '<ul style="margin:0;padding:0;list-style:none">' + flags.map((x) => li(x, false)).join('') + '</ul>' : '<div class="hint">Nothing behind budget.</div>'}</div>
        <div class="card" style="border-top:4px solid ${C.good}"><h3>Ahead of budget</h3>${wins.length ? '<ul style="margin:0;padding:0;list-style:none">' + wins.map((x) => li(x, true)).join('') + '</ul>' : '<div class="hint">Nothing yet.</div>'}</div></div>
      <div class="card"><h3>Profit and loss</h3><div class="hint">Type into any month. Variance is favourable (green) or adverse (red). Loss on disposal is a cost (profit on disposal shows as a negative).</div>
        <div class="cfwrap maw" style="max-height:none"><table class="ma"><thead>${head1}${head2}</thead><tbody>${body.join('')}</tbody></table></div></div>
      <div class="card"><h3>Paste from Excel</h3><div class="hint">Copy rows from the monthly P&amp;L sheet (line name in the first column, then the figures) and paste. Lines are matched by name; totals are ignored.</div>
        <div class="form"><div><label>These are</label><select id="p_w"><option value="a">Actuals</option><option value="b">Budget</option></select></div><div><label>First number is for</label><select id="p_m">${ms.map((m) => `<option value="${kOf(m)}">${labL(m)}</option>`).join('')}</select></div></div>
        <textarea id="p_t" rows="6" style="width:100%;font:inherit;margin:8px 0" placeholder="Rental - energy&#9;137452&#9;132906&#9;…"></textarea><div class="form"><div><button id="p_go" type="button">Import</button></div></div><div id="p_msg" class="hint" style="margin-top:8px"></div></div>
      <div class="card"><h3>Add a line</h3><div class="form"><div><label>Name</label><input id="n_l"></div><div><label>Section</label><select id="n_s">${SECT.map((s) => `<option value="${s}">${SLAB[s]}</option>`).join('')}</select></div><div><button id="n_go" type="button">Add line</button></div></div></div>`;

    const tip = (m, key, label, cost) => { const a = A(m)[key], b = B(m)[key], v = cost ? b - a : a - b; return `<b>${labL(m)}</b>` + row(label + ' actual', gbp(a)) + row('Budget', gbp(b)) + row('Variance', (v >= 0 ? '+' : '') + gbp(v)); };
    cols($('m1'), ms.map((m) => ({ l: lab(m), parts: [{ v: ytd.includes(m) ? A(m).income : 0, c: C.blue }], line: { v: B(m).income }, tip: tip(m, 'income', 'Income', false) })), { title: 'Income against budget', h: 220 });
    cols($('m2'), ms.map((m) => ({ l: lab(m), parts: [{ v: ytd.includes(m) ? A(m).net : 0, c: C.blue2 }], line: { v: B(m).net }, tip: tip(m, 'net', 'Net profit', false) })), { title: 'Net profit against budget', h: 220 });
    let ca = 0, cb = 0; cols($('m3'), ms.map((m) => { const inY = ytd.includes(m); if (inY) ca += A(m).net; cb += B(m).net; const a = ca, b = cb; return { l: lab(m), parts: [{ v: inY ? a : 0, c: C.blue }], line: { v: b }, tip: `<b>${labL(m)}</b>` + row('Cumulative actual', inY ? gbp(a) : '–') + row('Cumulative budget', gbp(b)) }; }), { title: 'Cumulative net profit', h: 220 });
    const costRows = MA.lines.filter((l) => ['cos', 'overhead'].includes(l.section) && !DISP.includes(l.code)).map((l) => ({ l, a: ytd.reduce((t, m) => t + (cell(l, m, 'a').v || 0), 0), b: ytd.reduce((t, m) => t + (cell(l, m, 'b').v || 0), 0) })).filter((x) => x.a || x.b).sort((p, q) => q.a - p.a).slice(0, 14);
    if (costRows.length) hbars($('m4'), costRows.map((x) => ({ l: x.l.label, v: x.a, v2: x.b || null, c: x.b && x.a > x.b ? C.orange : C.blue2, tip: `<b>${esc(x.l.label)}</b>` + row('Actual YTD', gbp(x.a)) + row('Budget YTD', gbp(x.b)) + row('Variance', x.b ? gbp(x.b - x.a) : '–') })), { title: 'Costs', fmt: gbp, left: 190 });
    else $('m4').innerHTML = '<div class="hint">Enter costs to see the comparison.</div>';

    $('ma_fy').onchange = (e) => { MA.fy = +e.target.value; maDraw(el); };
    wireInputs(el, () => maDraw(el));
    $('p_go').onclick = async () => {
      const w = $('p_w').value, start = mi($('p_m').value), out = [], skipped = [];
      const norml = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = {}; MA.lines.filter((l) => !l.virtual).forEach((l) => { idx[norml(l.label)] = l; idx[norml(l.code)] = l; });
      $('p_t').value.split(/\r?\n/).filter((x) => x.trim()).forEach((ln) => { const c = ln.split('\t'); const name = (c[0] || '').trim(); if (!name) return; if (/^(total|gross profit|net profit|profit|less|income|basic|add back)/i.test(name)) return;
        const l = idx[norml(name)] || Object.entries(idx).find(([k]) => k.length > 4 && (norml(name).startsWith(k) || k.startsWith(norml(name))))?.[1];
        if (!l) { skipped.push(name); return; } c.slice(1).forEach((x, i) => { const v = parse(x); if (v !== undefined && v !== null) out.push({ month: kOf(start + i) + '-01', line: l.code, [w === 'a' ? 'actual' : 'budget']: v }); }); });
      if (!out.length) { $('p_msg').textContent = 'Nothing imported' + (skipped.length ? ' – no line matched: ' + skipped.join(', ') : '.'); return; }
      try { await api('ma_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out) }); await reload(el, maDraw); $('p_msg').textContent = 'Imported ' + out.length + ' figures.' + (skipped.length ? ' Not matched (add them as lines first): ' + skipped.join(', ') : ''); } catch (e) { $('p_msg').textContent = 'Import failed: ' + e.message; }
    };
    $('n_go').onclick = async () => { const name = $('n_l').value.trim(); if (!name) return; const sec = $('n_s').value, code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
      try { await api('ma_lines', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ code, label: name, section: sec, sort: Math.max(0, ...MA.lines.map((l) => l.sort)) + 1 }) }); await reload(el, maDraw); } catch (e) { alert('Could not add: ' + e.message); } };
    if (keep) { const w = el.querySelector('.maw'); w.scrollLeft = keep[0]; w.scrollTop = keep[1]; window.scrollTo(0, keep[2]); }
  }

  /* ---------- budget performance blocks for the Overview and Finance overview ---------- */
  function perf() {
    const ms = fyMonths(), la = lastActual(ms), ytd = la != null ? ms.filter((m) => m <= la) : [], rest = ms.filter((m) => !ytd.includes(m));
    const A = (m) => pl(m, 'a'), B = (m) => pl(m, 'b'), S = (f, set) => set.reduce((t, m) => t + f(m), 0);
    const yA = (k) => S((m) => A(m)[k], ytd), yB = (k) => S((m) => B(m)[k], ytd), fB = (k) => S((m) => B(m)[k], ms), out = (k) => yA(k) + S((m) => B(m)[k], rest);
    const lines = MA.lines.map((l) => { const a = S((m) => cell(l, m, 'a').v || 0, ytd), b = S((m) => cell(l, m, 'b').v || 0, ytd), fy = S((m) => cell(l, m, 'b').v || 0, ms), rem = S((m) => cell(l, m, 'b').v || 0, rest); const cost = l.section !== 'income'; return { l, a, b, fy, outlook: a + rem, f: cost ? b - a : a - b, cost }; }).filter((x) => x.a || x.b || x.fy);
    return { ms, la, ytd, rest, A, B, yA, yB, fB, out, lines };
  }
  const vtxt = (v) => (v >= 0 ? '+' : '–') + gbp(Math.abs(v));
  X.ma = {
    model() { return { MA, cell, pl, SECT, SLAB, fyOf, fyLabel, fyMonths, hasActual, lastActual, DISP, DEP, HPI }; },
    async data() { if (!FA) await faLoad(); await maLoad(); return Object.assign(perf(), { fy: MA.fy, fyLabel: fyLabel(MA.fy) }); },
    async overview(el) {
      if (!el) return; try { if (!FA) await faLoad(); await maLoad(); } catch (e) { return; }
      const P = perf(); if (P.la == null) { el.innerHTML = ''; return; }
      const { ms, la, ytd, A, B, yA, yB, fB, out, lines } = P;
      const behind = lines.filter((x) => x.f < -1).sort((p, q) => p.f - q.f).slice(0, 4), ahead = lines.filter((x) => x.f > 1).sort((p, q) => q.f - p.f).slice(0, 3);
      el.innerHTML = `<div class="card"><h3>Performance against budget</h3><div class="hint">${esc(fyLabel(MA.fy))} · actuals to ${labL(la)} · <a href="#/budget" style="color:${C.blue}">Budget</a> · <a href="#/ma" style="color:${C.blue}">Management accounts</a></div>` +
        X.tiles([
          { l: 'Net profit, year to date', v: gbp(yA('net')), s: vtxt(yA('net') - yB('net')) + ' vs budget', c: yA('net') >= yB('net') ? 'g' : 'r' },
          { l: labL(la), v: gbp(A(la).net), s: vtxt(A(la).net - B(la).net) + ' vs budget (' + gbp(B(la).net) + ')', c: A(la).net >= B(la).net ? 'g' : 'r' },
          { l: 'Income, year to date', v: gbp(yA('income')), s: vtxt(yA('income') - yB('income')) + ' vs budget', c: yA('income') >= yB('income') ? 'g' : 'r' },
          { l: 'Full-year outlook', v: gbp(out('net')), s: vtxt(out('net') - fB('net')) + ' vs budget of ' + gbp(fB('net')), c: out('net') >= fB('net') ? 'g' : 'r' }]) +
        `<div class="row"><div><div id="mo_c"></div></div><div>${behind.length ? '<div class="hint" style="margin:6px 0"><b>Behind budget (year to date)</b></div><ul style="margin:0;padding:0;list-style:none">' + behind.map((x) => `<li style="padding:6px 0;border-bottom:1px solid ${C.line}"><b>${esc(x.l.label)}</b>: ${gbp(x.a)} vs ${gbp(x.b)} – <span class="adv">${gbp(Math.abs(x.f))} ${x.cost ? 'over' : 'short'}</span></li>`).join('') + '</ul>' : '<div class="hint">Nothing behind budget.</div>'}${ahead.length ? '<div class="hint" style="margin:10px 0 4px"><b>Ahead of budget</b></div><ul style="margin:0;padding:0;list-style:none">' + ahead.map((x) => `<li style="padding:5px 0"><b>${esc(x.l.label)}</b> – <span class="fav">${gbp(x.f)} ${x.cost ? 'under' : 'ahead'}</span></li>`).join('') + '</ul>' : ''}</div></div></div>`;
      cols(el.querySelector('#mo_c'), ms.map((m) => ({ l: lab(m), parts: [{ v: ytd.includes(m) ? A(m).net : 0, c: C.blue }], line: { v: B(m).net }, tip: `<b>${labL(m)}</b>` + row('Net profit', ytd.includes(m) ? gbp(A(m).net) : 'forecast') + row('Budget', gbp(B(m).net)) })), { title: 'Net profit vs budget', h: 200 });
    },
    async finance(el) {
      if (!el) return; try { if (!FA) await faLoad(); await maLoad(); } catch (e) { return; }
      const P = perf(); if (P.la == null) { el.innerHTML = ''; return; }
      const { ms, la, ytd, rest, A, B, yA, yB, fB, out, lines } = P;
      const gm = (a) => (a.income ? a.gp / a.income : 0), ya = { income: yA('income'), gp: yA('gp') }, yb = { income: yB('income'), gp: yB('gp') };
      const tile = (l, k, cost) => ({ l, v: gbp(yA(k)), s: vtxt(yA(k) - yB(k)) + ' vs budget ' + gbp(yB(k)), c: (cost ? yA(k) <= yB(k) : yA(k) >= yB(k)) ? 'g' : 'r' });
      el.innerHTML = `<h2 style="margin:22px 0 4px;font-size:24px">Performance against budget</h2><div class="hint" style="margin-bottom:8px">${esc(fyLabel(MA.fy))} · actuals to ${labL(la)} (${ytd.length} month${ytd.length === 1 ? '' : 's'}) · budget edited on the <a href="#/budget" style="color:${C.blue}">Budget</a> page</div>` +
        X.tiles([tile('Income, year to date', 'income', false), tile('Cost of sales', 'cos', true), { l: 'Gross margin', v: pct(gm(ya), 1), s: 'budget ' + pct(yb.income ? yb.gp / yb.income : 0, 1), c: gm(ya) >= (yb.income ? yb.gp / yb.income : 0) ? 'g' : 'r' }, tile('Operating expenses', 'overhead', true), tile('Net profit', 'net', false), { l: 'Full-year outlook', v: gbp(out('net')), s: vtxt(out('net') - fB('net')) + ' vs ' + gbp(fB('net')) + ' budget', c: out('net') >= fB('net') ? 'g' : 'r' }]) +
        `<div class="row"><div class="card"><h3>Income vs budget</h3><div class="hint">Monthly. Line = budget.</div><div id="fo_1"></div></div><div class="card"><h3>Costs vs budget</h3><div class="hint">Cost of sales + operating expenses. Line = budget.</div><div id="fo_2"></div></div></div>
        <div class="row"><div class="card"><h3>Cumulative profit vs budget</h3><div class="hint">Running total through the year. Line = budget.</div><div id="fo_3"></div></div><div class="card"><h3>Biggest variances (year to date)</h3><div class="hint">Green = better than budget, orange = worse.</div><div id="fo_4"></div></div></div>
        <div class="card"><h3>Every line against budget</h3><div class="hint">Year to date, and the full-year outlook (actual to date plus the budget for the remaining months).</div><div class="box2" style="max-height:520px"><table id="fo_tab"><thead><tr><th>Line</th><th>Section</th><th class="n">Actual YTD</th><th class="n">Budget YTD</th><th class="n">Variance</th><th class="n">Var %</th><th class="n">Full-year budget</th><th class="n">Full-year outlook</th></tr></thead><tbody>${lines.map((x) => `<tr><td>${esc(x.l.label)}</td><td data-g="${SLAB[x.l.section]}">${SLAB[x.l.section]}</td><td class="n">${gbp(x.a)}</td><td class="n">${gbp(x.b)}</td><td class="n ${x.f >= 0 ? 'fav' : 'adv'}">${vtxt(x.a - x.b)}</td><td class="n">${x.b ? pct((x.a - x.b) / Math.abs(x.b)) : '–'}</td><td class="n">${gbp(x.fy)}</td><td class="n">${gbp(x.outlook)}</td></tr>`).join('')}</tbody></table></div></div>`;
      const mk = (key, color, cost) => ms.map((m) => ({ l: lab(m), parts: [{ v: ytd.includes(m) ? A(m)[key] : 0, c: color }], line: { v: B(m)[key] }, tip: `<b>${labL(m)}</b>` + row('Actual', ytd.includes(m) ? gbp(A(m)[key]) : 'forecast') + row('Budget', gbp(B(m)[key])) + (ytd.includes(m) ? row('Variance', vtxt(A(m)[key] - B(m)[key])) : '') }));
      cols(el.querySelector('#fo_1'), mk('income', C.blue), { title: 'Income', h: 210 });
      cols(el.querySelector('#fo_2'), ms.map((m) => { const a = A(m).cos + A(m).overhead, b = B(m).cos + B(m).overhead; return { l: lab(m), parts: [{ v: ytd.includes(m) ? a : 0, c: C.orange }], line: { v: b }, tip: `<b>${labL(m)}</b>` + row('Actual', ytd.includes(m) ? gbp(a) : 'forecast') + row('Budget', gbp(b)) + (ytd.includes(m) ? row('Variance', vtxt(b - a) + ' (positive = under budget)') : '') }; }), { title: 'Costs', h: 210 });
      let ca = 0, cb = 0; cols(el.querySelector('#fo_3'), ms.map((m) => { const inY = ytd.includes(m); if (inY) ca += A(m).net; cb += B(m).net; const a = ca, b = cb; return { l: lab(m), parts: [{ v: inY ? a : 0, c: C.blue }], line: { v: b }, tip: `<b>${labL(m)}</b>` + row('Cumulative actual', inY ? gbp(a) : '–') + row('Cumulative budget', gbp(b)) }; }), { title: 'Cumulative', h: 210 });
      const vr = lines.filter((x) => Math.abs(x.f) > 1).sort((p, q) => Math.abs(q.f) - Math.abs(p.f)).slice(0, 12);
      if (vr.length) hbars(el.querySelector('#fo_4'), vr.map((x) => ({ l: x.l.label, v: Math.abs(x.f), c: x.f >= 0 ? C.good : C.orange, tip: `<b>${esc(x.l.label)}</b>` + row('Actual YTD', gbp(x.a)) + row('Budget YTD', gbp(x.b)) + row(x.f >= 0 ? 'Better by' : 'Worse by', gbp(Math.abs(x.f))) })), { title: 'Variances', fmt: gbp, left: 190 });
      X.enhance(el.querySelector('#fo_tab'), { filters: ['Section'], group: 'Section' });
    }
  };

  /* ---------- Budget page ---------- */
  function budDraw(el) {
    const keep = el.querySelector('.maw') ? [el.querySelector('.maw').scrollLeft, el.querySelector('.maw').scrollTop, window.scrollY] : null;
    const ms = fyMonths(), la = lastActual(ms), ytd = la != null ? ms.filter((m) => m <= la) : [], rest = ms.filter((m) => !ytd.includes(m));
    const A = (m) => pl(m, 'a'), B = (m) => pl(m, 'b');
    const sum = (f, set) => set.reduce((t, m) => t + f(m), 0);
    const fyB = (k) => sum((m) => B(m)[k], ms), yA = (k) => sum((m) => A(m)[k], ytd), yB = (k) => sum((m) => B(m)[k], ytd);
    const outlook = (k) => yA(k) + sum((m) => B(m)[k], rest);
    const monthlyRest = rest.length ? sum((m) => B(m).net, rest) / rest.length : 0;
    const tiles = X.tiles([
      { l: 'Budget income, full year', v: gbp(fyB('income')), s: gbp(fyB('income') / 12) + ' a month on average', c: 'o' },
      { l: 'Budget net profit, full year', v: gbp(fyB('net')), s: pct(fyB('income') ? fyB('net') / fyB('income') : null, 1) + ' of income' },
      { l: 'Profit to date vs budget', v: gbp(yA('net') - yB('net')), s: gbp(yA('net')) + ' actual vs ' + gbp(yB('net')) + ' budget · ' + ytd.length + ' months', c: yA('net') >= yB('net') ? 'g' : 'r' },
      { l: 'Full-year outlook', v: gbp(outlook('net')), s: gbp(outlook('net') - fyB('net')) + ' vs budget', c: outlook('net') >= fyB('net') ? 'g' : 'r' },
      { l: 'Profit needed per month', v: gbp(rest.length ? (fyB('net') - yA('net')) / rest.length : 0), s: 'over the remaining ' + rest.length + ' months to hit budget' },
      { l: la != null ? labL(la) + ' vs budget' : 'Latest month', v: la != null ? gbp(A(la).net - B(la).net) : '–', s: la != null ? gbp(A(la).net) + ' actual vs ' + gbp(B(la).net) + ' budget' : 'no actuals yet', c: la != null && A(la).net >= B(la).net ? 'g' : 'r' }]);

    // forecast check: where actual run-rate differs from the forecast month
    const chk = MA.lines.map((l) => { const a = ytd.map((m) => cell(l, m, 'a').v || 0); const avg = a.length ? a.reduce((t, v) => t + v, 0) / a.length : 0; const fc = rest.length ? sum((m) => cell(l, m, 'b').v || 0, rest) / rest.length : 0; const cost = l.section !== 'income'; return { l, avg, fc, d: cost ? avg - fc : fc - avg }; })
      .filter((x) => !DISP.includes(x.l.code) && !x.l.virtual && ytd.length && Math.abs(x.avg - x.fc) > Math.max(400, 0.2 * Math.max(x.fc, 1))).sort((p, q) => Math.abs(q.avg - q.fc) - Math.abs(p.avg - p.fc)).slice(0, 8);
    const isA = (m) => ytd.includes(m);
    const head = `<tr><th rowspan="2">${esc(fyLabel(MA.fy))}</th>${ms.map((m) => `<th colspan="3" style="text-align:center">${lab(m)} <span class="pill ${isA(m) ? 'g' : 'a'}" style="font-size:10px">${isA(m) ? 'actual' : 'forecast'}</span></th>`).join('')}<th rowspan="2" class="ytd">Full-year budget</th><th rowspan="2" class="ytd" style="text-align:left;min-width:340px">Forecast basis</th></tr><tr>${ms.map(() => '<th>Budget</th><th>Actual</th><th>Var</th>').join('')}</tr>`;
    const vcell = (a, b, cost, show) => { if (!show) return '<td></td>'; const v = a - b; return `<td class="${v === 0 ? '' : ((cost ? -v : v) >= 0 ? 'fav' : 'adv')}">${v === 0 ? '–' : (v > 0 ? '+' : '') + gbp(v)}</td>`; };
    const lineRow = (l) => { const cost = l.section !== 'income'; return `<tr><td>${esc(l.label)}${l.auto ? ' <span class="pill b" style="font-size:10px">auto</span>' : ''}${l.virtual ? ' <span class="pill a" style="font-size:10px">from orders</span>' : ''}</td>${ms.map((m) => { const c = cell(l, m, 'b'), a = cell(l, m, 'a'), show = isA(m); const bc = l.virtual ? `<td style="color:var(--mut);font-style:italic">${c.v == null ? '' : gbp(c.v)}</td>` : `<td><input class="mi ${c.auto ? 'auto' : ''}" data-l="${l.code}" data-m="${kOf(m)}" data-w="b" value="${c.v == null ? '' : Math.round(c.v * 100) / 100}"></td>`; return bc + `<td>${show && a.v != null ? gbp(a.v) : ''}</td>` + vcell(a.v || 0, c.v || 0, cost, show && (a.v != null || c.v != null)); }).join('')}<td class="ytd">${gbp(sum((m) => cell(l, m, 'b').v || 0, ms))}</td><td class="ytd" style="text-align:left;white-space:normal;font-size:12px;color:var(--mut)">${esc(l.note || '')}</td></tr>`; };
    const tot = (cls, label, key, cost) => `<tr class="${cls}"><td>${label}</td>${ms.map((m) => `<td>${gbp(B(m)[key])}</td><td>${isA(m) ? gbp(A(m)[key]) : ''}</td>${vcell(A(m)[key], B(m)[key], cost, isA(m))}`).join('')}<td class="ytd">${gbp(fyB(key))}</td><td class="ytd"></td></tr>`;
    const body = [];
    SECT.forEach((sec) => { body.push(`<tr class="sec"><td colspan="${ms.length * 3 + 3}">${SLAB[sec]}</td></tr>`); MA.lines.filter((l) => l.section === sec).forEach((l) => body.push(lineRow(l)));
      if (sec === 'income') body.push(tot('sub', 'Total income', 'income', false)); if (sec === 'cos') { body.push(tot('sub', 'Total cost of sales', 'cos', true)); body.push(tot('tot', 'Gross profit', 'gp', false)); } if (sec === 'overhead') { body.push(tot('sub', 'Total operating expenses', 'overhead', true)); body.push(tot('tot', 'Net profit', 'net', false)); } });

    el.innerHTML = X.head('Budget', 'Full-year budget, draft forecast and performance against it · FY ends 30 April') + tiles +
      `<div class="flt"><b>Financial year</b>${fyPicker('b_fy')}<span class="cnt">${ytd.length ? 'Actuals to ' + labL(la) + '; later months are the draft forecast.' : ''}</span></div>
      <div class="row"><div class="card"><h3>Profit: actual, then forecast, against the original budget</h3><div class="hint">Bars = actual to date, then the forecast budget (lighter). Line = the budget as originally set.</div><div id="b1"></div></div>
        <div class="card"><h3>Full-year outlook</h3><div class="hint">Cumulative net profit: actual to date plus forecast, against the full-year budget.</div><div id="b2"></div></div></div>
      <div class="row"><div class="card"><h3>Where we are against budget</h3><div class="hint">Year-to-date variance by line. Green = better than budget, orange = worse.</div><div id="b3"></div></div>
        <div class="card" style="border-top:4px solid ${C.orange}"><h3>Is the forecast realistic?</h3><div class="hint">Lines where the average month so far differs a lot from the forecast month. Adjust the budget below if you agree.</div>${chk.length ? '<ul style="margin:0;padding:0;list-style:none">' + chk.map((x) => `<li style="padding:8px 0;border-bottom:1px solid ${C.line}"><b>${esc(x.l.label)}</b>: averaging ${gbp(x.avg)} a month, forecast ${gbp(x.fc)} – <span class="${x.d > 0 ? 'adv' : 'fav'}">${x.d > 0 ? 'forecast may be ' + (x.l.section === 'income' ? 'too high' : 'too low') : 'forecast may be ' + (x.l.section === 'income' ? 'cautious' : 'generous')}</span></li>`).join('') + '</ul>' : '<div class="hint">The forecast is in line with the run-rate so far.</div>'}</div></div>
      <div class="card"><h3>Budget grid</h3><div class="hint">Each month shows the <b>budget</b> (editable), the <b>actual</b> and the <b>variance</b> (green = better than budget). Actuals are entered on the Management accounts page. The <b>forecast basis</b> column says how each draft figure for the remaining months was worked out.</div>
        <div class="cfwrap maw" style="max-height:none"><table class="ma"><thead>${head}</thead><tbody>${body.join('')}</tbody></table></div></div>`;

    const labs = ms.map((m) => lab(m)); let cumA = 0, cumB = 0, cumO = 0;
    cols($('b1'), ms.map((m) => { const act = ytd.includes(m); const v = act ? A(m).net : B(m).net; return { l: lab(m), parts: [{ v, c: act ? C.blue : '#9fb6e0' }], line: { v: B(m).net }, tip: `<b>${labL(m)}</b> ${act ? '(actual)' : '(forecast)'}` + row(act ? 'Actual profit' : 'Forecast profit', gbp(v)) + row('Original budget', gbp(B(m).net)) + (act ? row('Variance', gbp(A(m).net - B(m).net)) : '') }; }), { title: 'Profit', h: 230 });
    cols($('b2'), ms.map((m) => { const act = ytd.includes(m); cumO += act ? A(m).net : B(m).net; cumB += B(m).net; const o = cumO, b = cumB; return { l: lab(m), parts: [{ v: o, c: act ? C.blue : '#9fb6e0' }], line: { v: b }, tip: `<b>${labL(m)}</b>` + row('Cumulative outlook', gbp(o)) + row('Cumulative budget', gbp(b)) + row('Difference', gbp(o - b)) }; }), { title: 'Cumulative', h: 230 });
    const vr = MA.lines.map((l) => { const a = sum((m) => cell(l, m, 'a').v || 0, ytd), b = sum((m) => cell(l, m, 'b').v || 0, ytd); const f = l.section === 'income' ? a - b : b - a; return { l, a, b, f }; }).filter((x) => (x.a || x.b) && Math.abs(x.f) > 1).sort((p, q) => Math.abs(q.f) - Math.abs(p.f)).slice(0, 12);
    if (vr.length) hbars($('b3'), vr.map((x) => ({ l: x.l.label, v: Math.abs(x.f), c: x.f >= 0 ? C.good : C.orange, tip: `<b>${esc(x.l.label)}</b>` + row('Actual YTD', gbp(x.a)) + row('Budget YTD', gbp(x.b)) + row(x.f >= 0 ? 'Better than budget by' : 'Worse than budget by', gbp(Math.abs(x.f))) })), { title: 'Variance by line', fmt: gbp, left: 190 });
    else $('b3').innerHTML = '<div class="hint">No actuals yet.</div>';
    $('b_fy').onchange = (e) => { MA.fy = +e.target.value; budDraw(el); };
    wireInputs(el, () => budDraw(el));
    if (keep) { const w = el.querySelector('.maw'); w.scrollLeft = keep[0]; w.scrollTop = keep[1]; window.scrollTo(0, keep[2]); }
  }

  /* ===================== fixed assets & depreciation ===================== */
  let IMPL = {};
  async function implied(d) {   // HP-implied cost per fixed asset (present value of the agreement's payments plus deposit)
    const hpKeys = new Map(); const byAgr = new Map(); d.ass.forEach((x) => { if (!byAgr.has(x.agreement_id)) byAgr.set(x.agreement_id, []); byAgr.get(x.agreement_id).push(x); });
    const res = {};
    d.agr.forEach((a) => {
      const pays = d.sch.filter((r) => r.agreement_id === a.id).sort((p, q) => p.m - q.m); if (!pays.length) return;
      let r = +a.interest_rate || 0.08; if (r > 1) r /= 100; const rm = Math.pow(1 + r, 1 / 12) - 1, m0 = pays[0].m;
      const cost = (+a.deposit || 0) + pays.reduce((t, p) => t + p.amount / Math.pow(1 + rm, p.m - m0), 0);
      const as = byAgr.get(a.id) || []; const tot = as.reduce((t, x) => t + (+x.share || 1), 0) || 1;
      as.forEach((x) => { const k = norm(x.unit); (res[k] = res[k] || { cost: 0, date: a.start_month || pays[0].month }); res[k].cost += cost * ((+x.share || 1) / tot); if (a.start_month && String(a.start_month) < String(res[k].date)) res[k].date = a.start_month; });
    });
    return res;
  }
  const implFor = (ref) => { const k = norm(ref); return IMPL[k] || Object.entries(IMPL).find(([h]) => k.length >= 4 && h.startsWith(k))?.[1] || null; };

  X.routes.fa = async (el) => { el.innerHTML = X.head('Fixed assets & depreciation', 'Loading…') + '<div class="empty">Loading…</div>'; await faLoad(); const d = await X.loadFinance(); IMPL = await implied(d); faDraw(el, d); };

  function faDraw(el, d) {
    const keepY = window.scrollY;
    const A = FA.assets.filter((a) => a.active), cats = Object.keys(FA.pol);
    const live = d.agr.filter((a) => a.active && mon(a.end_month) >= NOW), liveIds = new Set(live.map((a) => a.id));
    const hpFut = d.sch.filter((r) => r.m >= NOW && liveIds.has(r.agreement_id)), hpOwed = {};
    const agrUnits = new Map(); d.ass.forEach((x) => { if (!agrUnits.has(x.agreement_id)) agrUnits.set(x.agreement_id, []); agrUnits.get(x.agreement_id).push(x); });
    hpFut.forEach((r) => { const as = agrUnits.get(r.agreement_id) || []; const tot = as.reduce((t, x) => t + (+x.share || 1), 0) || 1; as.forEach((x) => { const k = norm(x.unit); hpOwed[k] = (hpOwed[k] || 0) + r.amount * ((+x.share || 1) / tot); }); });
    const owed = (ref) => { const k = norm(ref); if (hpOwed[k] != null) return hpOwed[k]; const h = Object.keys(hpOwed).find((x) => k.length >= 4 && x.startsWith(k)); return h ? hpOwed[h] : 0; };
    const priced = A.filter((a) => a.cost && (a.purchase_date || a.nbv_open != null)), missing = A.filter((a) => !a.cost || !(a.purchase_date || a.nbv_open != null));
    const cost = priced.reduce((t, a) => t + +a.cost, 0), acc = priced.reduce((t, a) => t + accAt(a, NOW), 0), nbv = priced.reduce((t, a) => t + nbvAt(a, NOW), 0), charge = depMonth(NOW);
    const hpAll = A.reduce((t, a) => t + owed(a.ref), 0);
    const canFill = missing.filter((a) => implFor(a.ref)).length;
    const status = (a) => { const q = sched(a); if (!q) return 'Needs cost / date'; if (q.disp != null && NOW >= q.disp) return 'Disposed'; if (NOW > q.e) return 'Fully depreciated'; return 'Depreciating'; };
    const tiles = X.tiles([
      { l: 'Cost of assets', v: gbp(cost), s: priced.length + ' of ' + A.length + ' assets priced', c: missing.length ? 'o' : '' },
      { l: 'Accumulated depreciation', v: gbp(acc), s: cost ? pct(acc / cost) + ' of cost' : '' },
      { l: 'Net book value', v: gbp(nbv), s: 'at ' + labL(NOW), c: 'g' },
      { l: 'Depreciation this month', v: gbp(charge), s: gbp(charge * 12) + ' a year at this rate' },
      { l: 'HP still owed on these', v: gbp(hpAll), s: 'gross remaining payments' },
      { l: 'Book value less HP owed', v: gbp(nbv - hpAll), s: 'rough equity in the fleet', c: nbv - hpAll < 0 ? 'r' : 'g' }]);
    const row1 = (a) => { const q = sched(a), im = !a.cost ? implFor(a.ref) : null, p = FA.pol[a.category] || {};
      return `<tr><td><b>${esc(a.ref)}</b></td>
        <td><select data-id="${a.id}" data-f="description">${[...new Set([...cats, a.description].filter(Boolean))].map((c) => `<option ${c === a.description ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
        <td class="n"><input class="mi" data-id="${a.id}" data-f="cost" value="${a.cost == null ? '' : +a.cost}" placeholder="${im ? '~' + Math.round(im.cost) : ''}"></td>
        <td><input type="date" data-id="${a.id}" data-f="purchase_date" value="${a.purchase_date ? String(a.purchase_date).slice(0, 10) : ''}" style="font:inherit;border:1px solid transparent;width:130px" title="${im ? 'HP agreement started ' + String(im.date).slice(0, 10) : ''}"></td>
        <td class="n"><input class="mi" style="width:50px" data-id="${a.id}" data-f="life_years" value="${a.life_years == null ? '' : +a.life_years}" placeholder="${p.life_years || ''}"></td>
        <td class="n">${q ? gbp(chargeAt(a, NOW)) : '–'}</td><td class="n">${q ? gbp(accAt(a, NOW)) : '–'}</td><td class="n">${q ? gbp(nbvAt(a, NOW)) : '–'}</td><td class="n">${gbp(owed(a.ref))}</td>
        <td data-g="${status(a)}"><span class="pill ${status(a) === 'Depreciating' ? 'g' : status(a) === 'Needs cost / date' ? 'a' : 'b'}">${status(a)}</span></td>
        <td><input type="date" data-id="${a.id}" data-f="disposed_date" value="${a.disposed_date ? String(a.disposed_date).slice(0, 10) : ''}" style="font:inherit;border:1px solid transparent;width:130px"></td>
        <td style="white-space:nowrap">${a.disposed_date ? `<button class="mini" data-unsell="${a.id}">Reinstate</button>` : `<button class="mini" data-sold="${a.id}">Sold</button>`}</td></tr>`; };
    el.innerHTML = X.head('Fixed assets & depreciation', 'Cost, depreciation and book value of the fleet · feeds the management accounts') + tiles +
      (missing.length ? `<div class="empty"><b>${missing.length} assets need a cost and purchase date</b> before they depreciate.${canFill ? ` I can estimate ${canFill} of them from their HP agreements (present value of the payments plus any deposit) – a starting point to check against the invoices. <button id="fa_fill" type="button" class="lnk" style="border:0;background:none;color:${C.blue};text-decoration:underline;cursor:pointer;font:inherit">Fill ${canFill} from HP</button>` : ''}</div>` : '') +
      `<div class="row"><div class="card"><h3>Book value by description</h3><div class="hint">Bar = net book value, thin line = original cost.</div><div id="a1"></div></div>
        <div class="card"><h3>Book value against HP owed</h3><div class="hint">Bar = net book value, thin line = HP still to pay. Where HP is higher, the asset is worth less than we owe.</div><div id="a2"></div></div></div>
      <div class="card"><h3>Depreciation charge, next 24 months</h3><div class="hint">By description. This is what goes into the management accounts.</div><div id="a3"></div></div>
      <div class="card"><h3>Depreciation by description</h3><div class="hint">Set how each description depreciates. Straight line: cost less residual over the life. Reducing balance: a fixed % of the remaining book value each year (monthly), never below the residual. Change a row and every asset with that description follows. An asset can still have its own life (override in the register, straight line only).</div>
        <div class="box2"><table><thead><tr><th>Description</th><th>Method</th><th class="n">Life (years)</th><th class="n">Rate % a year</th><th class="n">Residual %</th><th class="n">Assets</th></tr></thead><tbody>${FA.polRows.map((p) => { const red = p.method === 'reducing'; return `<tr><td>${esc(p.category)}</td><td><select data-pm="${esc(p.category)}"><option value="straight" ${red ? '' : 'selected'}>Straight line</option><option value="reducing" ${red ? 'selected' : ''}>Reducing balance</option></select></td><td class="n"><input class="mi" style="width:60px" ${red ? 'disabled' : ''} data-pol="${esc(p.category)}" data-f="life_years" value="${+p.life_years}"></td><td class="n"><input class="mi" style="width:60px" ${red ? '' : 'disabled'} data-pol="${esc(p.category)}" data-f="rate_pct" value="${+p.rate_pct}"></td><td class="n"><input class="mi" style="width:60px" data-pol="${esc(p.category)}" data-f="residual_pct" value="${+p.residual_pct}"></td><td class="n">${A.filter((x) => x.description === p.category).length}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="card"><h3>Asset register</h3><div class="hint">Type a cost and purchase date to start depreciating. Faded numbers in the cost box are the HP-implied estimate.</div>
        <div class="box2" style="max-height:640px"><table id="fa_tab"><thead><tr><th>Asset</th><th>Description</th><th class="n">Cost £</th><th>Purchased</th><th class="n">Life (yrs)</th><th class="n">Per month</th><th class="n">Acc. dep.</th><th class="n">NBV</th><th class="n">HP owed</th><th>Status</th><th>Disposed</th><th></th></tr></thead><tbody>${A.map(row1).join('')}</tbody></table></div></div>
      <div class="card"><h3>Add an asset</h3><div class="form"><div><label>Reference</label><input id="fa_r"></div><div><label>Description</label><select id="fa_c">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div><div><label>Cost £</label><input id="fa_k" type="number" step="0.01"></div><div><label>Purchased</label><input id="fa_p" type="date"></div><div><button id="fa_add" type="button">Add asset</button></div></div></div>`;
    // charts
    const cat = {}; A.forEach((a) => { const c = a.category || 'Other'; (cat[c] = cat[c] || { cost: 0, nbv: 0, owed: 0, n: 0 }); cat[c].n++; cat[c].owed += owed(a.ref); if (a.cost && (a.purchase_date || a.nbv_open != null)) { cat[c].cost += +a.cost; cat[c].nbv += nbvAt(a, NOW); } });
    const cr = Object.entries(cat).filter(([, x]) => x.cost || x.owed);
    if (cr.length) {
      hbars($('a1'), cr.map(([k, x]) => ({ l: k, v: x.nbv, v2: x.cost, tip: `<b>${esc(k)}</b>` + row('Assets', x.n) + row('Cost', gbp(x.cost)) + row('Net book value', gbp(x.nbv)) + row('Depreciated', x.cost ? pct(1 - x.nbv / x.cost) : '–') })), { title: 'NBV by category', fmt: gbp, left: 150 });
      hbars($('a2'), cr.map(([k, x]) => ({ l: k, v: x.nbv, v2: x.owed, c: x.owed > x.nbv ? C.bad : C.blue2, tip: `<b>${esc(k)}</b>` + row('Net book value', gbp(x.nbv)) + row('HP still owed', gbp(x.owed)) + row('Difference', gbp(x.nbv - x.owed)) })), { title: 'NBV vs HP', fmt: gbp, left: 150 });
    } else { $('a1').innerHTML = $('a2').innerHTML = '<div class="hint">Add costs to see this.</div>'; }
    const PALC = [C.blue, C.orange, C.blue2, C.good, '#7d5ba6', '#8a8f98'], mm = Array.from({ length: 24 }, (_, i) => NOW + i);
    cols($('a3'), mm.map((m, ix) => ({ l: ix % 3 === 0 ? lab(m) : '', parts: cats.map((c, i) => ({ v: A.filter((a) => a.category === c).reduce((t, a) => t + chargeAt(a, m), 0), c: PALC[i % PALC.length], n: c })),
      tip: `<b>${labL(m)}</b>` + cats.map((c) => [c, A.filter((a) => a.category === c).reduce((t, a) => t + chargeAt(a, m), 0)]).filter(([, v]) => v).map(([c, v]) => row(c, gbp(v))).join('') + row('Total', gbp(depMonth(m))) })), { title: 'Depreciation charge', h: 220 });
    X.enhance($('fa_tab'), { filters: ['Description', 'Status'], group: 'Description', sum: 'NBV' });
    // wiring
    const redraw = () => faDraw(el, d);
    const refresh = async () => { await faLoad(); faDraw(el, await X.loadFinance()); };
    const pvEst = (a) => { const rt = a.interest_rate != null ? +a.interest_rate / (+a.interest_rate > 1 ? 100 : 1) : 0.08, r = Math.pow(1 + rt, 1 / 12) - 1; return d.sch.filter((x) => x.agreement_id === a.id && x.m >= NOW).reduce((t, x) => t + x.amount / Math.pow(1 + r, Math.max(0, x.m - NOW)), 0); };
    el.querySelectorAll('[data-sold]').forEach((b) => b.onclick = () => {
      const a = FA.assets.find((x) => x.id == b.dataset.sold), k = norm(a.ref);
      const agreements = [...new Set(d.ass.filter((x) => { const u = norm(x.unit); return u === k || (k.length >= 4 && u.startsWith(k)); }).map((x) => x.agreement_id))].map((id) => d.agr.find((g) => g.id === id)).filter((g) => g && g.active).map((g) => { const as = d.ass.filter((x) => x.agreement_id === g.id), tot = as.reduce((t, x) => t + (+x.share || 1), 0) || 1, mine = as.filter((x) => norm(x.unit) === k || (k.length >= 4 && norm(x.unit).startsWith(k))).reduce((t, x) => t + (+x.share || 1), 0); return { a: g, est: pvEst(g) * (as.length > 1 ? mine / tot : 1), shared: as.length > 1 }; });
      X.dispose.sold(a, { nbv: sched(a) ? nbvAt(a, NOW) : 0, agreements }, refresh);
    });
    el.querySelectorAll('[data-unsell]').forEach((b) => b.onclick = () => { if (confirm('Put this asset back as not sold?')) X.dispose.unsell(FA.assets.find((x) => x.id == b.dataset.unsell), refresh); });
    el.querySelectorAll('[data-id]').forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.dataset.f; let v = inp.value;
      if (['cost', 'life_years'].includes(f)) { v = parse(v); if (v === undefined) { inp.value = ''; return; } } else if (v === '') v = null;
      try { await api('fa_assets?id=eq.' + inp.dataset.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(f === 'description' ? { description: v, category: v } : { [f]: v }) }); FA.assets.find((a) => a.id == inp.dataset.id)[f] = v; if (f === 'description') FA.assets.find((a) => a.id == inp.dataset.id).category = v; redraw(); } catch (e) { inp.style.outline = '2px solid ' + C.bad; }
    }));
    el.querySelectorAll('[data-pm]').forEach((sel) => sel.addEventListener('change', async () => { await api('fa_policies?category=eq.' + encodeURIComponent(sel.dataset.pm), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ method: sel.value }) }); FA.pol[sel.dataset.pm].method = sel.value; redraw(); }));
    el.querySelectorAll('[data-pol]').forEach((inp) => inp.addEventListener('change', async () => { const v = parse(inp.value); if (v == null) return;
      await api('fa_policies?category=eq.' + encodeURIComponent(inp.dataset.pol), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [inp.dataset.f]: v }) }); FA.pol[inp.dataset.pol][inp.dataset.f] = v; redraw(); }));
    if ($('fa_fill')) $('fa_fill').onclick = async () => { const todo = missing.map((a) => [a, implFor(a.ref)]).filter(([, im]) => im);
      await Promise.all(todo.map(([a, im]) => { const body = {}; if (!a.cost) body.cost = Math.round(im.cost * 100) / 100; if (!a.purchase_date) body.purchase_date = String(im.date).slice(0, 10); return api('fa_assets?id=eq.' + a.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); }));
      await faLoad(); redraw(); };
    $('fa_add').onclick = async () => { const ref = $('fa_r').value.trim().toUpperCase(); if (!ref) return;
      await api('fa_assets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ref, description: $('fa_c').value, category: $('fa_c').value, cost: parse($('fa_k').value) || null, purchase_date: $('fa_p').value || null }) }); await faLoad(); redraw(); };
    window.scrollTo(0, keepY);
  }
})();
