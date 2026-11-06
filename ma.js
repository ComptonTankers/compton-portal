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

  const SECT = ['income', 'cos', 'overhead', 'depreciation', 'finance', 'tax'];
  const SLAB = { income: 'Income', cos: 'Direct costs', overhead: 'Overheads', depreciation: 'Depreciation', finance: 'Finance costs', tax: 'Tax' };

  /* ===================== fixed asset engine ===================== */
  let FA = null;
  async function faLoad() {
    const [assets, pol] = await Promise.all([all('fa_assets', 'ref.asc'), all('fa_policies', 'sort.asc')]);
    FA = { assets, pol: Object.fromEntries(pol.map((p) => [p.category, p])), polRows: pol };
  }
  function sched(a) {
    if (!a.cost || !a.purchase_date) return null;
    const p = FA.pol[a.category] || { life_years: 5, residual_pct: 0 };
    const life = num(a.life_years) != null ? +a.life_years : +p.life_years, res = num(a.residual_pct) != null ? +a.residual_pct : +p.residual_pct;
    const L = Math.max(1, Math.round(life * 12)), s = mon(a.purchase_date), cost = +a.cost, mc = cost * (1 - res / 100) / L;
    const disp = a.disposed_date ? mon(a.disposed_date) : null, e = Math.min(s + L - 1, disp != null ? disp - 1 : 1e9);
    return { s, e, mc, L, cost, disp, life, res };
  }
  const chargeAt = (a, m) => { const q = sched(a); return q && m >= q.s && m <= q.e ? q.mc : 0; };
  const accAt = (a, m) => { const q = sched(a); if (!q) return 0; const n = Math.max(0, Math.min(m, q.e) - q.s + 1); return Math.min(n, q.L) * q.mc; };
  const nbvAt = (a, m) => { const q = sched(a); if (!q || m < q.s) return q ? 0 : 0; if (q.disp != null && m >= q.disp) return 0; return q.cost - accAt(a, m); };
  const depMonth = (m) => FA ? FA.assets.filter((a) => a.active).reduce((t, a) => t + chargeAt(a, m), 0) : 0;

  /* ===================== management accounts ===================== */
  let MA = null;
  async function maLoad() {
    const [lines, ent, mcs] = await Promise.all([all('ma_lines', 'sort.asc'), all('ma_entries', 'month.asc'), all('hire_months', 'month.asc')]);
    const E = {}; ent.forEach((r) => { const k = String(r.month).slice(0, 7); (E[k] = E[k] || {})[r.line] = { a: num(r.actual), b: num(r.budget) }; });
    const MCS = {}; mcs.forEach((m) => { MCS[String(m.month).slice(0, 7)] = +m.hire_revenue; });
    const fyOf = (i) => (i % 12 >= 9 ? Math.floor(i / 12) : Math.floor(i / 12) - 1), lastK = Object.keys(MCS).concat(Object.keys(E).filter((k) => Object.values(E[k]).some((x) => x.a != null))).sort().pop();
    const fy = MA ? MA.fy : (lastK ? fyOf(mi(lastK)) : fyOf(NOW));
    lines.sort((a, b) => SECT.indexOf(a.section) - SECT.indexOf(b.section) || a.sort - b.sort);
    MA = { lines, E, MCS, fy };
  }
  const cell = (l, m, w) => {   // {v, auto}
    const k = kOf(m), e = MA.E[k] && MA.E[k][l.code], own = e ? (w === 'a' ? e.a : e.b) : null;
    if (own != null) return { v: own, auto: false };
    if (l.auto === 'mcs' && w === 'a' && MA.MCS[k] != null) return { v: MA.MCS[k], auto: true };
    if (l.auto === 'fa' && FA && (w === 'b' || m <= NOW)) { const c = depMonth(m); if (c) return { v: Math.round(c * 100) / 100, auto: true }; }
    return { v: null, auto: false };
  };
  const secSum = (sec, m, w) => MA.lines.filter((l) => l.section === sec).reduce((t, l) => t + (cell(l, m, w).v || 0), 0);
  function pl(m, w) {
    const income = secSum('income', m, w), cos = secSum('cos', m, w), overhead = secSum('overhead', m, w), dep = secSum('depreciation', m, w), fin = secSum('finance', m, w), tax = secSum('tax', m, w);
    const gp = income - cos, ebitda = gp - overhead, op = ebitda - dep, pbt = op - fin, net = pbt - tax;
    return { income, cos, gp, overhead, ebitda, dep, op, fin, pbt, net, tax };
  }
  const hasActual = (m) => { const k = kOf(m), e = MA.E[k]; return (e && Object.values(e).some((x) => x.a != null)) || MA.MCS[k] != null; };

  X.routes.ma = async (el) => { el.innerHTML = X.head('Management accounts', 'Loading…') + '<div class="empty">Loading…</div>'; if (!FA) await faLoad(); await maLoad(); maDraw(el); };

  function maDraw(el) {
    const keep = el.querySelector('.maw') ? [el.querySelector('.maw').scrollLeft, el.querySelector('.maw').scrollTop, window.scrollY] : null;
    const s0 = MA.fy * 12 + 9, ms = Array.from({ length: 12 }, (_, i) => s0 + i);
    const lastAct = [...ms].reverse().find((m) => hasActual(m)); const ytd = lastAct != null ? ms.filter((m) => m <= lastAct) : [];
    const sum = (f) => ms.reduce((t, m) => t + f(m), 0), ysum = (f) => ytd.reduce((t, m) => t + f(m), 0);
    const A = (m) => pl(m, 'a'), B = (m) => pl(m, 'b');
    const yA = (k) => ysum((m) => A(m)[k]), yB = (k) => ysum((m) => B(m)[k]), fB = (k) => sum((m) => B(m)[k]);
    const missing = FA ? FA.assets.filter((a) => a.active && !a.cost).length : 0;
    const fyLab = 'FY' + String(MA.fy + 1).slice(2) + ' (Oct ' + MA.fy + ' – Sep ' + (MA.fy + 1) + ')';
    const varCls = (v, cost) => ((cost ? -v : v) >= 0 ? 'fav' : 'adv');
    const tiles = X.tiles([
      { l: 'Income, year to date', v: gbp(yA('income')), s: yB('income') ? gbp(yA('income') - yB('income')) + ' vs budget (' + pct(yA('income') / yB('income')) + ')' : 'no budget entered', c: yB('income') && yA('income') < yB('income') ? 'r' : 'g' },
      { l: 'Gross margin', v: yA('income') ? pct(yA('gp') / yA('income'), 1) : '–', s: yB('income') ? 'budget ' + pct(yB('gp') / yB('income'), 1) : '' },
      { l: 'EBITDA, year to date', v: gbp(yA('ebitda')), s: yB('ebitda') ? gbp(yA('ebitda') - yB('ebitda')) + ' vs budget' : '' },
      { l: 'Net profit, year to date', v: gbp(yA('net')), s: yB('net') ? gbp(yA('net') - yB('net')) + ' vs budget' : '', c: yB('net') && yA('net') < yB('net') ? 'r' : '' },
      { l: 'Full-year budget profit', v: gbp(fB('net')), s: fB('income') ? 'on income ' + gbp(fB('income')) : 'budget not entered yet', c: 'o' },
      { l: 'Depreciation this FY', v: gbp(sum((m) => A(m).dep)), s: missing ? missing + ' assets still need a cost' : 'from the fixed asset register' }]);

    // grid
    const head1 = `<tr><th rowspan="2">${esc(fyLab)}</th>${ms.map((m) => `<th colspan="2" style="text-align:center">${lab(m)}</th>`).join('')}<th colspan="4" class="ytd" style="text-align:center">Year to date${lastAct != null ? ' to ' + lab(lastAct) : ''}</th><th rowspan="2" class="ytd">FY budget</th></tr>`;
    const head2 = `<tr>${ms.map(() => '<th>Actual</th><th>Budget</th>').join('')}<th class="ytd">Actual</th><th class="ytd">Budget</th><th class="ytd">Var</th><th class="ytd">Var %</th></tr>`;
    const ytdCells = (a, b, cost, fyb) => { const v = a - b; return `<td class="ytd">${a ? gbp(a) : '–'}</td><td class="ytd">${b ? gbp(b) : '–'}</td><td class="ytd ${a || b ? varCls(v, cost) : ''}">${a || b ? gbp(v) : '–'}</td><td class="ytd ${a || b ? varCls(v, cost) : ''}">${b ? pct(v / Math.abs(b)) : '–'}</td><td class="ytd">${fyb ? gbp(fyb) : '–'}</td>`; };
    const lineRow = (l) => {
      const cost = l.section !== 'income';
      const inputs = ms.map((m) => ['a', 'b'].map((w) => { const c = cell(l, m, w); return `<td><input class="mi ${c.auto ? 'auto' : ''}" data-l="${l.code}" data-m="${kOf(m)}" data-w="${w}" value="${c.v == null ? '' : Math.round(c.v * 100) / 100}" title="${c.auto ? 'Automatic (' + (l.auto === 'mcs' ? 'MCS hire income' : 'fixed asset register') + ') – type to override' : ''}"></td>`; }).join('')).join('');
      const a = ysum((m) => cell(l, m, 'a').v || 0), b = ysum((m) => cell(l, m, 'b').v || 0), fb = sum((m) => cell(l, m, 'b').v || 0);
      return `<tr><td>${esc(l.label)}${l.auto ? ' <span class="pill b" style="font-size:10px">auto</span>' : ''}</td>${inputs}${ytdCells(a, b, cost, fb)}</tr>`;
    };
    const totRow = (cls, label, key, cost) => `<tr class="${cls}"><td>${label}</td>${ms.map((m) => `<td>${A(m)[key] ? gbp(A(m)[key]) : '–'}</td><td>${B(m)[key] ? gbp(B(m)[key]) : '–'}</td>`).join('')}${ytdCells(yA(key), yB(key), cost, fB(key))}</tr>`;
    const body = [];
    SECT.forEach((sec) => {
      const ls = MA.lines.filter((l) => l.section === sec && l.active !== false); if (!ls.length) return;
      body.push(`<tr class="sec"><td colspan="${2 + ms.length * 2 + 4}">${SLAB[sec]}</td></tr>`); ls.forEach((l) => body.push(lineRow(l)));
      if (sec === 'income') body.push(totRow('sub', 'Total income', 'income', false));
      if (sec === 'cos') { body.push(totRow('sub', 'Total direct costs', 'cos', true)); body.push(totRow('tot', 'Gross profit', 'gp', false)); }
      if (sec === 'overhead') { body.push(totRow('sub', 'Total overheads', 'overhead', true)); body.push(totRow('tot', 'EBITDA', 'ebitda', false)); }
      if (sec === 'depreciation') body.push(totRow('tot', 'Operating profit', 'op', false));
      if (sec === 'finance') body.push(totRow('tot', 'Profit before tax', 'pbt', false));
      if (sec === 'tax') body.push(totRow('tot', 'Net profit', 'net', false));
    });

    const fyOpts = []; for (let y = Math.floor(NOW / 12) - 3; y <= Math.floor(NOW / 12) + 1; y++) fyOpts.push(`<option value="${y}" ${y === MA.fy ? 'selected' : ''}>FY${String(y + 1).slice(2)} (Oct ${y} – Sep ${y + 1})</option>`);
    const adverse = MA.lines.filter((l) => l.section !== 'depreciation').map((l) => { const a = ytd.reduce((t, m) => t + (cell(l, m, 'a').v || 0), 0), b = ytd.reduce((t, m) => t + (cell(l, m, 'b').v || 0), 0); const cost = l.section !== 'income'; return { l, a, b, f: cost ? b - a : a - b }; }).filter((x) => x.b || x.a).sort((p, q) => p.f - q.f);
    const flags = adverse.filter((x) => x.f < 0 && x.b).slice(0, 5), wins = adverse.filter((x) => x.f > 0 && x.b).reverse().slice(0, 3);

    el.innerHTML = X.head('Management accounts', 'Actual against budget · enter figures straight into the grid, or paste from Excel') + tiles +
      `<div class="flt"><b>Financial year</b><select id="ma_fy">${fyOpts.join('')}</select><span class="cnt">Auto lines (MCS hire income, depreciation) fill themselves – type over them to override.</span></div>
      <div class="row"><div class="card"><h3>Income against budget</h3><div class="hint">Monthly. Line = budget.</div><div id="m1"></div></div>
        <div class="card"><h3>EBITDA against budget</h3><div class="hint">Monthly. Line = budget.</div><div id="m2"></div></div></div>
      <div class="row"><div class="card"><h3>Cumulative net profit</h3><div class="hint">Running total through the year. Line = budget.</div><div id="m3"></div></div>
        <div class="card"><h3>Costs: actual vs budget (YTD)</h3><div class="hint">Bar = actual, thin line = budget. Hover for the variance.</div><div id="m4"></div></div></div>
      <div class="row"><div class="card" style="border-top:4px solid ${C.bad}"><h3>Behind budget</h3>${flags.length ? '<ul style="margin:0;padding:0;list-style:none">' + flags.map((x) => `<li style="padding:8px 0;border-bottom:1px solid ${C.line}"><b>${esc(x.l.label)}</b>: ${gbp(x.a)} against ${gbp(x.b)} budget – <span class="adv">${gbp(Math.abs(x.f))} ${x.l.section === 'income' ? 'short' : 'over'}</span></li>`).join('') + '</ul>' : '<div class="hint">Nothing over budget (or no budget entered yet).</div>'}</div>
        <div class="card" style="border-top:4px solid ${C.good}"><h3>Ahead of budget</h3>${wins.length ? '<ul style="margin:0;padding:0;list-style:none">' + wins.map((x) => `<li style="padding:8px 0;border-bottom:1px solid ${C.line}"><b>${esc(x.l.label)}</b>: ${gbp(x.a)} against ${gbp(x.b)} budget – <span class="fav">${gbp(x.f)} ${x.l.section === 'income' ? 'ahead' : 'under'}</span></li>`).join('') + '</ul>' : '<div class="hint">Nothing yet.</div>'}</div></div>
      <div class="card"><h3>Profit and loss</h3><div class="hint">Type into any month. Blank budget = no budget set. Variance is favourable (green) or adverse (red).</div>
        <div class="cfwrap maw" style="max-height:70vh"><table class="ma"><thead>${head1}${head2}</thead><tbody>${body.join('')}</tbody></table></div></div>
      <div class="card"><h3>Paste from Excel</h3><div class="hint">Copy rows from the accountant's management accounts (line name in the first column, then the monthly numbers) and paste. Lines are matched by name; totals are ignored.</div>
        <div class="form"><div><label>These are</label><select id="p_w"><option value="a">Actuals</option><option value="b">Budget</option></select></div><div><label>First number is for</label><select id="p_m">${ms.map((m) => `<option value="${kOf(m)}">${labL(m)}</option>`).join('')}</select></div></div>
        <textarea id="p_t" rows="6" style="width:100%;font:inherit;margin:8px 0" placeholder="Hire income&#9;120000&#9;125000&#9;…"></textarea><div class="form"><div><button id="p_go" type="button">Import</button></div></div><div id="p_msg" class="hint" style="margin-top:8px"></div></div>
      <div class="card"><h3>Add a line</h3><div class="form"><div><label>Name</label><input id="n_l"></div><div><label>Section</label><select id="n_s">${SECT.map((s) => `<option value="${s}">${SLAB[s]}</option>`).join('')}</select></div><div><button id="n_go" type="button">Add line</button></div></div></div>`;

    const R12 = (f) => ms.map((m) => f(m));
    const tip = (m, key, label, cost) => { const a = A(m)[key], b = B(m)[key], v = cost ? b - a : a - b; return `<b>${labL(m)}</b>` + row(label + ' actual', gbp(a)) + row('Budget', gbp(b)) + row('Variance', (v >= 0 ? '+' : '') + gbp(v)); };
    cols($('m1'), ms.map((m) => ({ l: lab(m), parts: [{ v: A(m).income, c: C.blue }], line: B(m).income ? { v: B(m).income } : null, tip: tip(m, 'income', 'Income', false) })), { title: 'Income against budget', h: 220 });
    cols($('m2'), ms.map((m) => ({ l: lab(m), parts: [{ v: A(m).ebitda, c: C.blue2 }], line: B(m).income ? { v: B(m).ebitda } : null, tip: tip(m, 'ebitda', 'EBITDA', false) })), { title: 'EBITDA against budget', h: 220 });
    let ca = 0, cb = 0; cols($('m3'), ms.map((m) => { const inY = ytd.includes(m); if (inY) ca += A(m).net; cb += B(m).net; const a = ca, b = cb; return { l: lab(m), parts: [{ v: inY ? a : 0, c: C.blue }], line: { v: b }, tip: `<b>${labL(m)}</b>` + row('Cumulative actual', inY ? gbp(a) : '–') + row('Cumulative budget', gbp(b)) }; }), { title: 'Cumulative net profit', h: 220 });
    const costRows = MA.lines.filter((l) => ['cos', 'overhead'].includes(l.section)).map((l) => ({ l, a: ytd.reduce((t, m) => t + (cell(l, m, 'a').v || 0), 0), b: ytd.reduce((t, m) => t + (cell(l, m, 'b').v || 0), 0) })).filter((x) => x.a || x.b).sort((p, q) => q.a - p.a).slice(0, 12);
    if (costRows.length) hbars($('m4'), costRows.map((x) => ({ l: x.l.label, v: x.a, v2: x.b || null, c: x.b && x.a > x.b ? C.orange : C.blue2, tip: `<b>${esc(x.l.label)}</b>` + row('Actual YTD', gbp(x.a)) + row('Budget YTD', gbp(x.b)) + row('Variance', x.b ? gbp(x.b - x.a) : '–') })), { title: 'Costs', fmt: gbp, left: 190 });
    else $('m4').innerHTML = '<div class="hint">Enter costs to see the comparison.</div>';

    // wiring
    $('ma_fy').onchange = (e) => { MA.fy = +e.target.value; maDraw(el); };
    el.querySelectorAll('input.mi').forEach((inp) => inp.addEventListener('change', async () => {
      const v = parse(inp.value); if (v === undefined) { inp.value = ''; return; }
      const k = inp.dataset.m, code = inp.dataset.l, w = inp.dataset.w;
      try { await api('ma_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ month: k + '-01', line: code, [w === 'a' ? 'actual' : 'budget']: v, updated_at: new Date().toISOString() }) }); (MA.E[k] = MA.E[k] || {}); (MA.E[k][code] = MA.E[k][code] || { a: null, b: null })[w] = v; maDraw(el); } catch (e) { inp.style.outline = '2px solid ' + C.bad; }
    }));
    $('p_go').onclick = async () => {
      const w = $('p_w').value, start = mi($('p_m').value), out = [], skipped = [];
      const norml = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = {}; MA.lines.forEach((l) => { idx[norml(l.label)] = l; idx[norml(l.code)] = l; });
      $('p_t').value.split(/\r?\n/).filter((x) => x.trim()).forEach((ln) => { const c = ln.split('\t'); const name = (c[0] || '').trim(); if (!name) return; if (/^(total|gross profit|ebitda|net profit|operating profit|profit before)/i.test(name)) return;
        const l = idx[norml(name)] || Object.entries(idx).find(([k]) => k.length > 4 && (norml(name).startsWith(k) || k.startsWith(norml(name))))?.[1];
        if (!l) { skipped.push(name); return; } c.slice(1).forEach((x, i) => { const v = parse(x); if (v !== undefined && v !== null) out.push({ month: kOf(start + i) + '-01', line: l.code, [w === 'a' ? 'actual' : 'budget']: v }); }); });
      if (!out.length) { $('p_msg').textContent = 'Nothing imported' + (skipped.length ? ' – no line matched: ' + skipped.join(', ') : '.'); return; }
      try { await api('ma_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(out) }); const fy = MA.fy; await maLoad(); MA.fy = fy; maDraw(el); $('p_msg').textContent = 'Imported ' + out.length + ' figures.' + (skipped.length ? ' Not matched (add them as lines first): ' + skipped.join(', ') : ''); } catch (e) { $('p_msg').textContent = 'Import failed: ' + e.message; }
    };
    $('n_go').onclick = async () => { const name = $('n_l').value.trim(); if (!name) return; const sec = $('n_s').value, code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
      try { await api('ma_lines', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ code, label: name, section: sec, sort: Math.max(0, ...MA.lines.filter((l) => l.section === sec).map((l) => l.sort)) + 1 }) }); const fy = MA.fy; await maLoad(); MA.fy = fy; maDraw(el); } catch (e) { alert('Could not add: ' + e.message); } };
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
    const priced = A.filter((a) => a.cost && a.purchase_date), missing = A.filter((a) => !a.cost || !a.purchase_date);
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
      return `<tr><td><b>${esc(a.ref)}</b></td><td>${esc(a.description || '')}</td>
        <td><select data-id="${a.id}" data-f="category">${cats.map((c) => `<option ${c === a.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
        <td class="n"><input class="mi" data-id="${a.id}" data-f="cost" value="${a.cost == null ? '' : +a.cost}" placeholder="${im ? '~' + Math.round(im.cost) : ''}"></td>
        <td><input type="date" data-id="${a.id}" data-f="purchase_date" value="${a.purchase_date ? String(a.purchase_date).slice(0, 10) : ''}" style="font:inherit;border:1px solid transparent;width:130px" title="${im ? 'HP agreement started ' + String(im.date).slice(0, 10) : ''}"></td>
        <td class="n"><input class="mi" style="width:50px" data-id="${a.id}" data-f="life_years" value="${a.life_years == null ? '' : +a.life_years}" placeholder="${p.life_years || ''}"></td>
        <td class="n">${q ? gbp(q.mc) : '–'}</td><td class="n">${q ? gbp(accAt(a, NOW)) : '–'}</td><td class="n">${q ? gbp(nbvAt(a, NOW)) : '–'}</td><td class="n">${gbp(owed(a.ref))}</td>
        <td data-g="${status(a)}"><span class="pill ${status(a) === 'Depreciating' ? 'g' : status(a) === 'Needs cost / date' ? 'a' : 'b'}">${status(a)}</span></td>
        <td><input type="date" data-id="${a.id}" data-f="disposed_date" value="${a.disposed_date ? String(a.disposed_date).slice(0, 10) : ''}" style="font:inherit;border:1px solid transparent;width:130px"></td></tr>`; };
    el.innerHTML = X.head('Fixed assets & depreciation', 'Cost, depreciation and book value of the fleet · feeds the management accounts') + tiles +
      (missing.length ? `<div class="empty"><b>${missing.length} assets need a cost and purchase date</b> before they depreciate.${canFill ? ` I can estimate ${canFill} of them from their HP agreements (present value of the payments plus any deposit) – a starting point to check against the invoices. <button id="fa_fill" type="button" class="lnk" style="border:0;background:none;color:${C.blue};text-decoration:underline;cursor:pointer;font:inherit">Fill ${canFill} from HP</button>` : ''}</div>` : '') +
      `<div class="row"><div class="card"><h3>Book value by category</h3><div class="hint">Bar = net book value, thin line = original cost.</div><div id="a1"></div></div>
        <div class="card"><h3>Book value against HP owed</h3><div class="hint">Bar = net book value, thin line = HP still to pay. Where HP is higher, the asset is worth less than we owe.</div><div id="a2"></div></div></div>
      <div class="card"><h3>Depreciation charge, next 24 months</h3><div class="hint">By category. This is what goes into the management accounts.</div><div id="a3"></div></div>
      <div class="card"><h3>Depreciation policy</h3><div class="hint">Straight line over the life to the residual value, from the month of purchase. Defaults are a starting point – confirm with the accountant. An asset can have its own life (override in the register).</div>
        <div class="box2"><table><thead><tr><th>Category</th><th class="n">Life (years)</th><th class="n">Residual %</th></tr></thead><tbody>${FA.polRows.map((p) => `<tr><td>${esc(p.category)}</td><td class="n"><input class="mi" style="width:60px" data-pol="${esc(p.category)}" data-f="life_years" value="${+p.life_years}"></td><td class="n"><input class="mi" style="width:60px" data-pol="${esc(p.category)}" data-f="residual_pct" value="${+p.residual_pct}"></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h3>Asset register</h3><div class="hint">Type a cost and purchase date to start depreciating. Faded numbers in the cost box are the HP-implied estimate.</div>
        <div class="box2" style="max-height:640px"><table id="fa_tab"><thead><tr><th>Asset</th><th>Description</th><th>Category</th><th class="n">Cost £</th><th>Purchased</th><th class="n">Life (yrs)</th><th class="n">Per month</th><th class="n">Acc. dep.</th><th class="n">NBV</th><th class="n">HP owed</th><th>Status</th><th>Disposed</th></tr></thead><tbody>${A.map(row1).join('')}</tbody></table></div></div>
      <div class="card"><h3>Add an asset</h3><div class="form"><div><label>Reference</label><input id="fa_r"></div><div><label>Description</label><input id="fa_d"></div><div><label>Category</label><select id="fa_c">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div><div><label>Cost £</label><input id="fa_k" type="number" step="0.01"></div><div><label>Purchased</label><input id="fa_p" type="date"></div><div><button id="fa_add" type="button">Add asset</button></div></div></div>`;
    // charts
    const cat = {}; A.forEach((a) => { const c = a.category || 'Other'; (cat[c] = cat[c] || { cost: 0, nbv: 0, owed: 0, n: 0 }); cat[c].n++; cat[c].owed += owed(a.ref); if (a.cost && a.purchase_date) { cat[c].cost += +a.cost; cat[c].nbv += nbvAt(a, NOW); } });
    const cr = Object.entries(cat).filter(([, x]) => x.cost || x.owed);
    if (cr.length) {
      hbars($('a1'), cr.map(([k, x]) => ({ l: k, v: x.nbv, v2: x.cost, tip: `<b>${esc(k)}</b>` + row('Assets', x.n) + row('Cost', gbp(x.cost)) + row('Net book value', gbp(x.nbv)) + row('Depreciated', x.cost ? pct(1 - x.nbv / x.cost) : '–') })), { title: 'NBV by category', fmt: gbp, left: 150 });
      hbars($('a2'), cr.map(([k, x]) => ({ l: k, v: x.nbv, v2: x.owed, c: x.owed > x.nbv ? C.bad : C.blue2, tip: `<b>${esc(k)}</b>` + row('Net book value', gbp(x.nbv)) + row('HP still owed', gbp(x.owed)) + row('Difference', gbp(x.nbv - x.owed)) })), { title: 'NBV vs HP', fmt: gbp, left: 150 });
    } else { $('a1').innerHTML = $('a2').innerHTML = '<div class="hint">Add costs to see this.</div>'; }
    const PALC = [C.blue, C.orange, C.blue2, C.good, '#7d5ba6', '#8a8f98'], mm = Array.from({ length: 24 }, (_, i) => NOW + i);
    cols($('a3'), mm.map((m) => ({ l: lab(m), parts: cats.map((c, i) => ({ v: A.filter((a) => a.category === c).reduce((t, a) => t + chargeAt(a, m), 0), c: PALC[i % PALC.length], n: c })),
      tip: `<b>${labL(m)}</b>` + cats.map((c) => [c, A.filter((a) => a.category === c).reduce((t, a) => t + chargeAt(a, m), 0)]).filter(([, v]) => v).map(([c, v]) => row(c, gbp(v))).join('') + row('Total', gbp(depMonth(m))) })), { title: 'Depreciation charge', h: 220 });
    X.enhance($('fa_tab'), { filters: ['Category', 'Status'], group: 'Category', sum: 'NBV' });
    // wiring
    const redraw = () => faDraw(el, d);
    el.querySelectorAll('[data-id]').forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.dataset.f; let v = inp.value;
      if (['cost', 'life_years'].includes(f)) { v = parse(v); if (v === undefined) { inp.value = ''; return; } } else if (v === '') v = null;
      try { await api('fa_assets?id=eq.' + inp.dataset.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [f]: v }) }); FA.assets.find((a) => a.id == inp.dataset.id)[f] = v; redraw(); } catch (e) { inp.style.outline = '2px solid ' + C.bad; }
    }));
    el.querySelectorAll('[data-pol]').forEach((inp) => inp.addEventListener('change', async () => { const v = parse(inp.value); if (v == null) return;
      await api('fa_policies?category=eq.' + encodeURIComponent(inp.dataset.pol), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [inp.dataset.f]: v }) }); FA.pol[inp.dataset.pol][inp.dataset.f] = v; redraw(); }));
    if ($('fa_fill')) $('fa_fill').onclick = async () => { const todo = missing.map((a) => [a, implFor(a.ref)]).filter(([, im]) => im);
      await Promise.all(todo.map(([a, im]) => { const body = {}; if (!a.cost) body.cost = Math.round(im.cost * 100) / 100; if (!a.purchase_date) body.purchase_date = String(im.date).slice(0, 10); return api('fa_assets?id=eq.' + a.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }); }));
      await faLoad(); redraw(); };
    $('fa_add').onclick = async () => { const ref = $('fa_r').value.trim().toUpperCase(); if (!ref) return;
      await api('fa_assets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ref, description: $('fa_d').value.trim() || null, category: $('fa_c').value, cost: parse($('fa_k').value) || null, purchase_date: $('fa_p').value || null }) }); await faLoad(); redraw(); };
    window.scrollTo(0, keepY);
  }
})();
