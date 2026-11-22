/* BOARD PACK – one button builds the month's board deck from the portal: finance, cash and funding,
   fleet, revenue forecast, pipeline, customers, sales stock, parking and a strategy page.
   Opens as 16:9 slides in a new window; text marked with a dotted line can be typed over, then Print → Save as PDF. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, esc } = X;
  const $ = (id) => document.getElementById(id);
  const ymAdd = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  const lab = (ym) => new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const sl = (ym) => new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'short' });
  const g0 = (v) => (v == null || isNaN(v) ? '–' : (v < 0 ? '−' : '') + '£' + Math.round(Math.abs(v)).toLocaleString('en-GB'));
  const gk = (v) => (v == null || isNaN(v) ? '–' : (v < 0 ? '−' : '') + '£' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + 'm' : Math.round(Math.abs(v) / 1000) + 'k'));
  const sg = (v) => (v == null || isNaN(v) ? '' : (v >= 0 ? '+' : '−') + gk(Math.abs(v)).replace('−', ''));
  const pc = (v, d = 0) => (v == null || isNaN(v) ? '–' : (v * 100).toFixed(d) + '%');
  const NAVY = '#164698', DARK = '#0B2A66', OR = '#E4611D', GRN = '#16A34A', RED = '#DC2626', MUT = '#94A3B8', SOFT = '#9DB4E0';
  // financial year runs 1 May – 30 April; FY27 = May 2026 – Apr 2027
  const fyOf = (ym) => (+ym.slice(5, 7) >= 5 ? +ym.slice(0, 4) : +ym.slice(0, 4) - 1);
  const fyL = (fy) => 'FY' + String(fy + 1).slice(2);
  const qOf = (ym) => Math.floor(((+ym.slice(5, 7) - 5 + 12) % 12) / 3) + 1;
  const QN = ['May–Jul', 'Aug–Oct', 'Nov–Jan', 'Feb–Apr'];
  const CUR = new Date().toISOString().slice(0, 7), LAST = ymAdd(CUR, -1);
  let KIND = 'month', KEY = LAST;
  // a period: its months (only completed ones), the equal period before it, and labels
  function period(kind, key) {
    if (kind === 'month') return { kind, months: [key], prev: [ymAdd(key, -1)], end: key, label: lab(key), short: sl(key), prevName: sl(ymAdd(key, -1)) };
    const [fy, q] = String(key).split('-').map(Number), start = kind === 'qtr' ? ymAdd(fy + '-05', (q - 1) * 3) : fy + '-05', len = kind === 'qtr' ? 3 : 12;
    const all = Array.from({ length: len }, (_, i) => ymAdd(start, i)), months = all.filter((m) => m <= LAST), part = months.length < len;
    const end = months[months.length - 1] || start, prev = months.map((m) => ymAdd(m, -len));
    const name = kind === 'qtr' ? 'Q' + q + ' ' + fyL(fy) : fyL(fy), span = sl(all[0]) + ' ' + all[0].slice(0, 4) + ' – ' + sl(all[len - 1]) + ' ' + all[len - 1].slice(0, 4);
    return { kind, months, all, prev, end, part, label: name + ' (' + span + ')' + (part ? ' – to ' + lab(end) : ''), short: name, prevName: kind === 'qtr' ? (q === 1 ? 'Q4 ' + fyL(fy - 1) : 'Q' + (q - 1) + ' ' + fyL(fy)) : fyL(fy - 1) + (part ? ' same months' : '') };
  }
  function options(kind) {
    if (kind === 'month') return Array.from({ length: 12 }, (_, i) => ymAdd(CUR, -i)).map((m) => [m, lab(m)]);
    const fy = fyOf(CUR);
    if (kind === 'year') return [fy, fy - 1, fy - 2].map((y) => [String(y), fyL(y) + ' (May ' + y + ' – Apr ' + (y + 1) + ')' + (y === fy ? ' – year to date' : '')]);
    const out = []; for (let y = fy; y >= fy - 1; y--) for (let q = 4; q >= 1; q--) { const st = ymAdd(y + '-05', (q - 1) * 3); if (st <= LAST) out.push([y + '-' + q, 'Q' + q + ' ' + fyL(y) + ' · ' + QN[q - 1] + (ymAdd(st, 2) > LAST ? ' – to date' : '')]); }
    return out;
  }

  X.routes['p-boardpack'] = async function (el) {
    el.innerHTML = X.head('Board pack', '') + '<div class="empty">Checking the month…</div>';
    const opts = options(KIND); if (!opts.some(([k]) => k === KEY)) KEY = KIND === 'month' ? LAST : opts[0][0];
    const per = period(KIND, KEY);
    let me = null; try { me = X.monthEnd ? await X.monthEnd.get(per.end) : null; } catch (e) { me = null; }
    const missing = me ? [['pl', 'management accounts'], ['mcs', 'MCS hire reports'], ['cash', 'cash actuals'], ['fac', 'facility balance'], ['hp', 'HP balance'], ['bank', 'bank balance']].filter(([k]) => !me.auto[k]).map(([, t]) => t) : [];
    const what = KIND === 'month' ? '11 slides: cover · month at a glance · profit and loss · cash and funding · fleet and utilisation · revenue forecast · pipeline · customers · sales stock · parking · strategy and decisions.'
      : '7 slides, headline view only: cover · ' + (KIND === 'qtr' ? 'quarter' : 'year') + ' at a glance (against budget and the ' + (KIND === 'qtr' ? 'previous quarter' : 'previous year') + ') · profit and loss · cash and funding · fleet and customers · growth and outlook (pipeline, sales, parking, forecast) · strategy and decisions.';
    el.innerHTML = X.head('Board pack', 'Builds the board deck from what’s in the portal. You add the commentary. Financial year runs May to April.') +
      `<div class="card"><div class="form" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
        <label>Pack <select id="bp_k">${[['month', 'Monthly'], ['qtr', 'Quarterly'], ['year', 'Annual']].map(([k, t]) => `<option value="${k}" ${k === KIND ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Period <select id="bp_m">${opts.map(([k, t]) => `<option value="${k}" ${k === KEY ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <button class="pri2" id="bp_go">Build board pack</button><span id="bp_msg" class="small muted"></span></div>
        <div class="hint" style="margin-top:12px">${me ? (me.done ? `<b style="color:${GRN}">${esc(lab(per.end))} is closed off and ready.</b>` : `<b style="color:${OR}">Month end isn’t finished for ${esc(lab(per.end))}.</b> ${missing.length ? 'Missing: ' + esc(missing.join(', ')) + '. ' : ''}You can still build the pack – gaps show as “–”. <a href="#/p-monthend">Open Month end</a>`) : ''}</div>
        <div class="hint">${esc(what)}</div>
        <div class="hint">The deck opens in a new window. Anything with a dotted underline can be typed over (commentary, decisions, actions). Then use <b>Print → Save as PDF</b>, landscape, no margins.</div></div>`;
    $('bp_k').onchange = (e) => { KIND = e.target.value; KEY = null; X.routes['p-boardpack'](el); };
    $('bp_m').onchange = (e) => { KEY = e.target.value; X.routes['p-boardpack'](el); };
    $('bp_go').onclick = async () => {
      const w = window.open('', '_blank'); if (!w) { $('bp_msg').textContent = 'Allow pop-ups for this site, then try again.'; return; }
      w.document.write('<p style="font-family:sans-serif;padding:40px">Building the board pack…</p>');
      $('bp_msg').textContent = 'Building…';
      try { const html = await build(per); w.document.open(); w.document.write(html); w.document.close(); $('bp_msg').textContent = 'Opened in a new window.'; }
      catch (e) { console.error(e); w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:40px">Could not build: ' + esc(e.message) + '</p>'; $('bp_msg').textContent = 'Could not build: ' + e.message; }
    };
  };

  // ---------- small SVG charts ----------
  function bars(labels, series, o = {}) {
    const W = o.w || 560, H = o.h || 220, L = 52, B = 26, T = 10, n = labels.length, cw = (W - L - 8) / n;
    const tot = labels.map((_, i) => o.stack ? series.reduce((t, s) => t + Math.max(0, s.vals[i] || 0), 0) : Math.max(...series.map((s) => s.vals[i] || 0)));
    const lineV = o.line ? o.line.vals : [], max = o.max || Math.max(1, ...tot, ...lineV.filter((v) => v != null)) * 1.08, y = (v) => T + (H - T - B) * (1 - v / max);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;font:11px Poppins,sans-serif">`;
    [0, .5, 1].forEach((f) => { const v = max * f; s += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E5E9F2"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" fill="#64748B">${(o.fmt || gk)(v)}</text>`; });
    labels.forEach((lb, i) => {
      const x0 = L + i * cw;
      if (o.stack) { let acc = 0; series.forEach((se) => { const v = Math.max(0, se.vals[i] || 0); if (v) { s += `<rect x="${x0 + cw * .18}" y="${y(acc + v)}" width="${cw * .64}" height="${y(acc) - y(acc + v)}" fill="${(se.cf && se.cf(i)) || se.color}"/>`; } acc += v; }); }
      else { const bw = cw * .7 / series.length; series.forEach((se, j) => { const v = se.vals[i]; if (v != null) s += `<rect x="${x0 + cw * .15 + j * bw}" y="${y(Math.max(0, v))}" width="${bw - 2}" height="${Math.abs(y(0) - y(Math.abs(v)))}" fill="${(se.cf && se.cf(i)) || se.color}"/>`; }); }
      s += `<text x="${x0 + cw / 2}" y="${H - 8}" text-anchor="middle" fill="#64748B">${esc(lb)}</text>`;
    });
    if (o.line) { const pts = lineV.map((v, i) => (v == null ? null : [L + i * cw + cw / 2, y(v)])).filter(Boolean); if (pts.length) s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${o.line.color || DARK}" stroke-width="2" stroke-dasharray="${o.line.dash ? '5 4' : ''}"/>` + pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${o.line.color || DARK}"/>`).join(''); }
    if (o.hline != null) s += `<line x1="${L}" x2="${W}" y1="${y(o.hline)}" y2="${y(o.hline)}" stroke="${RED}" stroke-dasharray="4 4"/>`;
    return s + '</svg>';
  }
  const legend = (items) => `<div class="lg">${items.map(([c, t, d]) => `<span><i style="background:${d ? 'none' : c};border-top:${d ? '2px dashed ' + c : 'none'}"></i>${esc(t)}</span>`).join('')}</div>`;
  const tile = (l, v, s, c) => `<div class="tile"><div class="tl">${esc(l)}</div><div class="tv" style="${c ? 'color:' + c : ''}">${v}</div><div class="ts">${s || ''}</div></div>`;
  const table = (head, rows, o = {}) => `<table class="t"><thead><tr>${head.map((h, i) => `<th${o.n && o.n.includes(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td${o.n && o.n.includes(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" class="mut">${esc(o.empty || 'Nothing to show')}</td></tr>`}</tbody></table>`;
  const ed = (txt, ph) => `<div class="ed" contenteditable="true" data-ph="${esc(ph || 'Type here…')}">${txt ? esc(txt).replace(/\n/g, '<br>') : ''}</div>`;

  // ---------- gather everything ----------
  async function build(per) {
    const ym = per.end;
    const safe = (p) => Promise.resolve().then(p).catch((e) => { console.warn(e); return null; });
    const [P, cfM, me, hm, fac] = await Promise.all([
      safe(() => X.ma && X.ma.data()), safe(() => X.cf && X.cf.load()), safe(() => X.monthEnd && X.monthEnd.get(ym)),
      safe(() => all('hire_months', 'month.asc')), safe(() => api('facility?select=*&order=month.asc'))]);
    await Promise.all([safe(() => X.pipeline && X.pipeline.load()), safe(() => X.crm && X.crm.load()), safe(() => X.salesStock && X.salesStock.load()), safe(() => X.forecast && X.forecast.load())]);
    if (X.parking) await safe(() => X.parking.load());
    const R = cfM && X.cf ? safe(() => X.cf.compute(cfM)) : null, cfRows = (await R) || [];
    const ctx = { ym, per, label: per.label, P, cfRows, cfM, me, hm: hm || [], fac: fac || [] };
    const slides = (per.kind === 'month' ? [cover, glance, pl, cash, fleet, forecast, pipeline, customers, sales, parking, strategy] : [cover, glanceP, plP, cashP, fleetP, outlookP, strategy]).map((f, i) => { try { return f(ctx, i + 1); } catch (e) { console.error(e); return frame('Could not build this slide', `<div class="mut">${esc(e.message)}</div>`, i + 1, ctx); } });
    return page(slides.join(''), per.label);
  }
  const frame = (title, body, n, ctx, sub) => `<section class="slide"><header><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><img src="${new URL('assets/compton-logo.png', location.href).href}" alt=""></header><main>${body}</main><footer><span>Compton Tankers · Board meeting · ${esc(ctx.label)}</span><span>Confidential – directors only</span><span>${n}</span></footer></section>`;

  // month index helpers for the management accounts model (ms are integers year*12+month-1)
  const miOf = (ym) => +ym.slice(0, 4) * 12 + +ym.slice(5, 7) - 1;
  function maMonth(P, ym) { if (!P || !P.ms) return null; const k = P.ms.find((m) => m === miOf(ym)) ?? P.ms.find((m) => String(m) === ym); return k == null ? null : k; }

  function cover(c) {
    return `<section class="slide cover"><div class="cv"><img src="${new URL('assets/compton-logo-white.png', location.href).href}" alt="Compton Tankers"><h1>Board meeting</h1><h2>${c.per.kind === 'month' ? 'Management information' : c.per.kind === 'qtr' ? 'Quarterly review' : 'Annual review'} · ${esc(c.label)}</h2>
      <div class="ag">${ed('1. Health & safety – JC\n2. Finance – FC\n3. Business development & customers – PM\n4. Strategy – all', 'Agenda')}</div>
      <div class="cvf">Tanker Rent UK Ltd, trading as Compton Tankers · prepared ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div></section>`;
  }

  function glance(c, n) {
    const h = c.hm.find((x) => x.month === c.ym), hp = c.hm.find((x) => x.month === ymAdd(c.ym, -1)), P = c.P, k = maMonth(P, c.ym);
    const A = k != null && P.ytd.includes(k) ? P.A(k) : null, Bm = k != null ? P.B(k) : null;
    const cf = c.cfRows.find((r) => String(r.k).slice(0, 7) === c.ym), buf = c.cfM && c.cfM.s ? +c.cfM.s.min_buffer : null;
    const fr = c.fac.find((f) => String(f.month).slice(0, 7) === c.ym), me = c.me && c.me.row;
    const drawn = me && me.facility_drawn != null ? +me.facility_drawn : fr && fr.outstanding != null ? +fr.outstanding : null, tot = fr ? +fr.total : null;
    const util = h && +h.chargeable_days ? Math.min(1, +h.on_hire_days / +h.chargeable_days) : null, utilP = hp && +hp.chargeable_days ? Math.min(1, +hp.on_hire_days / +hp.chargeable_days) : null;
    const close = cf ? (cf.closed ? cf.closeA : cf.eff) : null;
    return frame('Month at a glance', `<div class="tiles6">
      ${tile('Turnover (MCS)', gk(h && +h.turnover), h && hp ? sg(h.turnover - hp.turnover) + ' on ' + sl(hp.month) : '')}
      ${tile('Net profit – month', gk(A && A.net), A && Bm ? sg(A.net - Bm.net) + ' v budget ' + gk(Bm.net) : 'accounts not loaded', A && Bm ? (A.net >= Bm.net ? GRN : RED) : '')}
      ${tile('Net profit – year to date', gk(P && P.la != null ? P.yA('net') : null), P && P.la != null ? sg(P.yA('net') - P.yB('net')) + ' v budget' : '', P && P.la != null ? (P.yA('net') >= P.yB('net') ? GRN : RED) : '')}
      ${tile('Closing cash', gk(close), buf != null ? 'buffer ' + gk(buf) + (close != null ? ' · headroom ' + gk(close - buf) : '') : '', close != null && buf != null && close < buf ? RED : '')}
      ${tile('Facility drawn', gk(drawn), tot ? 'of ' + gk(tot) + ' · headroom ' + gk(drawn != null ? tot - drawn : null) : '')}
      ${tile('Time utilisation', pc(util, 1), utilP != null ? (util >= utilP ? '+' : '−') + (Math.abs(util - utilP) * 100).toFixed(1) + ' pts on ' + sl(hp.month) : '')}</div>
      <div class="box"><h3>Commentary</h3>${ed(me && me.commentary, 'Headlines for the month – what went well, what didn’t, what the board needs to decide.')}</div>`, n, c);
  }

  function pl(c, n) {
    const P = c.P; if (!P || P.la == null) return frame('Profit and loss', '<div class="mut">Management accounts not loaded for this month.</div>', n, c);
    const k = maMonth(P, c.ym) ?? P.la, has = P.ytd.includes(k), A = has ? P.A(k) : null, B = P.B(k);
    const ytdTo = P.ytd.filter((m) => m <= k), S = (f, w) => ytdTo.reduce((t, m) => t + (w === 'a' ? P.A(m)[f] : P.B(m)[f]), 0);
    const row = (l, f, cost) => { const a = A ? A[f] : null, b = B[f], ya = S(f, 'a'), yb = S(f, 'b'), good = (x, y) => (cost ? x <= y : x >= y);
      return [`<b>${l}</b>`, g0(a), g0(b), a == null ? '–' : `<span style="color:${good(a, b) ? GRN : RED}">${sg(cost ? b - a : a - b)}</span>`, g0(ya), g0(yb), `<span style="color:${good(ya, yb) ? GRN : RED}">${sg(cost ? yb - ya : ya - yb)}</span>`]; };
    const L = X.pv && X.pv.lab ? X.pv.lab : (m) => m;
    const top = (P.lines || []).filter((x) => Math.abs(x.f) > 500).sort((a, b) => Math.abs(b.f) - Math.abs(a.f)).slice(0, 5);
    return frame('Profit and loss', `<div class="g2"><div>${table(['', 'Month', 'Budget', 'Var', 'YTD', 'YTD budget', 'Var'], [row('Income', 'income'), row('Cost of sales', 'cos', 1), row('Gross profit', 'gp'), row('Overheads', 'overhead', 1), row('Net profit', 'net')], { n: [1, 2, 3, 4, 5, 6] })}
      <div class="mini2">Full-year outlook <b>${g0(P.out('net'))}</b> against a budget of ${g0(P.fB('net'))} (${sg(P.out('net') - P.fB('net'))}). Outlook = actuals to date plus budget for the rest of ${esc(P.fyLabel || 'the year')}.</div>
      <h3>Biggest variances, year to date</h3>${table(['Line', 'Actual', 'Budget', 'Effect on profit'], top.map((x) => [esc(x.l.label), g0(x.a), g0(x.b), `<span style="color:${x.f >= 0 ? GRN : RED}">${sg(x.f)}</span>`]), { n: [1, 2, 3] })}</div>
      <div><h3>Net profit by month</h3>${bars(P.ms.map((m) => String(L(m)).slice(0, 3)), [{ vals: P.ms.map((m) => (P.ytd.includes(m) ? P.A(m).net : null)), color: NAVY }], { line: { vals: P.ms.map((m) => P.B(m).net), color: MUT, dash: 1 }, h: 250 })}${legend([[NAVY, 'Actual'], [MUT, 'Budget', 1]])}
      <div class="box sm">${ed('', 'Notes on the P&L (e.g. disposals, one-offs)')}</div></div></div>`, n, c, esc(P.fyLabel || ''));
  }

  function cash(c, n) {
    const R = c.cfRows, i = R.findIndex((r) => String(r.k).slice(0, 7) === c.ym), win = R.slice(Math.max(0, i - 5), i >= 0 ? i + 4 : 9), buf = c.cfM && c.cfM.s ? +c.cfM.s.min_buffer : null;
    const me = c.me && c.me.row, fr = c.fac.find((f) => String(f.month).slice(0, 7) === c.ym), drawn = me && me.facility_drawn != null ? +me.facility_drawn : fr && fr.outstanding != null ? +fr.outstanding : null;
    const facWin = c.fac.filter((f) => String(f.month).slice(0, 7) <= c.ym && f.outstanding != null).slice(-6), low = R.slice(i + 1, i + 7).filter((r) => buf != null && r.eff < buf);
    return frame('Cash and funding', `<div class="tiles4">${tile('Bank balance', gk(me && me.bank_balance), 'at month end (statement)')}${tile('Facility drawn', gk(drawn), fr ? 'limit ' + gk(+fr.total) + ' · headroom ' + gk(drawn != null ? +fr.total - drawn : null) : '')}${tile('HP outstanding', gk(me && me.hp_balance), c.me ? 'schedule still to pay ' + gk(c.me.hpEst) : '')}${tile('Months below buffer (next 6)', low.length, low.length ? low.map((r) => sl(String(r.k).slice(0, 7))).join(', ') : 'none', low.length ? RED : GRN)}</div>
      <div class="g2"><div><h3>Closing cash – actual then forecast</h3>${win.length ? bars(win.map((r) => sl(String(r.k).slice(0, 7))), [{ vals: win.map((r) => (r.closed ? r.closeA : r.eff)), color: NAVY, cf: (j) => (win[j].closed ? NAVY : SOFT) }], { hline: buf, h: 240 }) + legend([[NAVY, 'Actual'], [SOFT, 'Forecast'], [RED, 'Minimum buffer', 1]]) : '<div class="mut">No cashflow loaded.</div>'}</div>
      <div><h3>Facility drawn</h3>${facWin.length ? bars(facWin.map((f) => sl(String(f.month).slice(0, 7))), [{ vals: facWin.map((f) => +f.outstanding), color: OR }], { line: { vals: facWin.map((f) => +f.total), color: MUT, dash: 1 }, h: 240 }) + legend([[OR, 'Drawn'], [MUT, 'Facility limit', 1]]) : '<div class="mut">Enter the facility balance on Month end.</div>'}</div></div>`, n, c);
  }

  function fleet(c, n) {
    const hm = c.hm.filter((h) => h.month <= c.ym).slice(-6), h = hm[hm.length - 1];
    const u = (x) => (+x.chargeable_days ? Math.min(1, +x.on_hire_days / +x.chargeable_days) : null);
    return frame('Fleet and utilisation', `<div class="tiles4">${tile('Hire revenue', gk(h && +h.hire_revenue), h ? sl(h.month) : '')}${tile('Time utilisation', pc(h && u(h), 1), 'on-hire days ÷ chargeable days')}${tile('Units on hire', h ? (h.units_on_hire || 0) + ' / ' + (h.units || 0) : '–', h ? (h.units_idle || 0) + ' off hire all month' : '')}${tile('Customers billed', h ? h.customers || '–' : '–', 'hire customers in MCS')}</div>
      <div class="g2"><div><h3>Hire revenue – last 6 months</h3>${bars(hm.map((x) => sl(x.month)), [{ vals: hm.map((x) => +x.hire_revenue), color: NAVY }], { h: 230 })}</div>
      <div><h3>Utilisation – last 6 months</h3>${bars(hm.map((x) => sl(x.month)), [{ vals: hm.map((x) => u(x) || 0), color: OR }], { h: 230, max: 1, fmt: (v) => Math.round(v * 100) + '%' })}</div></div>
      <div class="box sm">${ed('', 'Fleet notes – units coming off hire, new kit arriving, units moved to sale')}</div>`, n, c);
  }

  function forecast(c, n) {
    if (!X.forecast) return frame('Revenue forecast', '<div class="mut">Forecast not available.</div>', n, c);
    const { rows, other } = X.forecast.build(), f = rows.filter((r) => r.fut).slice(0, 12), S = (k, rs = f) => rs.reduce((t, r) => t + (r[k] || 0), 0), wb = f.filter((r) => r.budget != null);
    return frame('Revenue forecast – next 12 months', `<div class="tiles4">${tile('Next 12 months', gk(S('auto')), 'portal forecast')}${tile('Under contract', gk(S('con')), S('auto') ? pc(S('con') / S('auto')) + ' of the forecast' : '')}${tile('Weighted pipeline', gk(S('pipe')), 'value × probability')}${tile('Against budget', wb.length ? sg(S('auto', wb) - S('budget', wb)) : '–', wb.length ? 'for the ' + wb.length + ' months budgeted' : 'no budget', wb.length && S('auto', wb) < S('budget', wb) ? RED : GRN)}</div>
      <h3>Revenue by month</h3>${bars(f.map((r) => sl(r.m)), [{ vals: f.map((r) => r.con), color: NAVY }, { vals: f.map((r) => r.other || 0), color: SOFT }, { vals: f.map((r) => r.pipe), color: OR }, { vals: f.map((r) => r.park), color: '#8B5CF6' }, { vals: f.map((r) => r.sales), color: GRN }], { stack: 1, line: { vals: f.map((r) => r.budget), color: DARK, dash: 1 }, w: 1100, h: 250 })}
      ${legend([[NAVY, 'Contracted hire'], [SOFT, 'Other hire (run rate ' + gk(other) + '/month)'], [OR, 'Weighted pipeline'], ['#8B5CF6', 'Parking'], [GRN, 'Planned sales'], [DARK, 'Budget', 1]])}`, n, c);
  }

  function pipeline(c, n) {
    const Pp = X.pipeline; if (!Pp) return frame('Pipeline', '<div class="mut">Pipeline not available.</div>', n, c);
    const D = Pp.data() || [], open = D.filter((d) => Pp.OPEN.includes(d.stage)), inM = (s) => s && String(s).slice(0, 7) === c.ym;
    const won = D.filter((d) => inM(d.won_at)), lost = D.filter((d) => inM(d.lost_at)), y1 = ymAdd(c.ym, -11);
    const w12 = D.filter((d) => d.won_at && String(d.won_at).slice(0, 7) >= y1).length, l12 = D.filter((d) => d.lost_at && String(d.lost_at).slice(0, 7) >= y1);
    const reasons = {}; l12.forEach((d) => { const r = d.lost_reason || 'Not given'; reasons[r] = (reasons[r] || 0) + 1; });
    const top = open.slice().sort((a, b) => Pp.wpm(b) - Pp.wpm(a)).slice(0, 8);
    return frame('Pipeline and quotes', `<div class="tiles4">${tile('Open deals', open.length, gk(open.reduce((t, d) => t + Pp.pm(d), 0)) + ' a month at full value')}${tile('Weighted', gk(open.reduce((t, d) => t + Pp.wpm(d), 0)) + '/m', 'value × probability')}${tile('Won / lost this month', won.length + ' / ' + lost.length, won.length ? won.map((d) => esc(d.customer)).join(', ') : '')}${tile('Win rate, 12 months', w12 + l12.length ? pc(w12 / (w12 + l12.length)) : '–', w12 + ' won · ' + l12.length + ' lost')}</div>
      <div class="g2w"><div>${table(['Customer', 'Kit', 'Stage', '£/month', 'Weighted', 'Next action'], top.map((d) => [`<b>${esc(d.customer)}</b>`, esc(((d.qty > 1 ? d.qty + ' × ' : '') + (d.kit || d.fleet_type || '')).slice(0, 40)), esc(d.stage) + ' <span class="mut">' + Pp.prob(d) + '%</span>', g0(Pp.pm(d)), g0(Pp.wpm(d)), esc(d.next_action || '') + (d.next_action_date ? ' <span class="mut">' + new Date(d.next_action_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</span>' : '')]), { n: [3, 4], empty: 'No open deals' })}</div>
      <div><h3>Why we lost (12 months)</h3>${table(['Reason', 'Deals'], Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([r, k]) => [esc(r), k]), { n: [1], empty: 'None lost' })}<div class="box sm">${ed('', 'Pipeline notes')}</div></div></div>`, n, c);
  }

  function customers(c, n) {
    const C = X.crm; if (!C) return frame('Customers', '<div class="mut">Customer log not available.</div>', n, c);
    const cs = C.customers(), pm = ymAdd(c.ym, -1), tot = cs.reduce((t, x) => t + (x.rev[c.ym] || 0), 0);
    const top = cs.filter((x) => x.rev[c.ym] || x.rev[pm]).sort((a, b) => (b.rev[c.ym] || 0) - (a.rev[c.ym] || 0)).slice(0, 8);
    const { CON, EV } = C.data(), end6 = ymAdd(c.ym, 7) + '-01', from = ymAdd(c.ym, 1) + '-01';
    const ren = CON.filter((k) => k.active && !k.rolling && k.end_date && k.end_date >= from && k.end_date < end6).sort((a, b) => a.end_date.localeCompare(b.end_date)).slice(0, 8);
    const s1 = C.svcStats(EV, c.ym + '-01', from), s0 = C.svcStats(EV, pm + '-01', c.ym + '-01');
    return frame('Customers', `<div class="g2"><div><h3>Top customers – ${esc(sl(c.ym))} hire revenue</h3>${table(['Customer', esc(sl(c.ym)), 'Share', 'v ' + sl(pm)], top.map((x) => [esc(x.name), g0(x.rev[c.ym]), tot ? pc((x.rev[c.ym] || 0) / tot) : '', `<span style="color:${(x.rev[c.ym] || 0) >= (x.rev[pm] || 0) ? GRN : RED}">${sg((x.rev[c.ym] || 0) - (x.rev[pm] || 0))}</span>`]), { n: [1, 2, 3] })}
      <h3>Service</h3>${table(['', sl(c.ym), sl(pm)], C.SERVICE.map((k) => [esc(k), s1.by[k], s0.by[k]]).concat([['<b>Total</b>', '<b>' + s1.n + '</b>', s0.n], ['Average hours to fix', s1.fix != null ? s1.fix.toFixed(1) : '–', s0.fix != null ? s0.fix.toFixed(1) : '–']]), { n: [1, 2] })}</div>
      <div><h3>Contracts ending in the next 6 months</h3>${table(['Customer', 'Unit', 'Ends', '£/month', 'Status'], ren.map((k) => [esc(k.customer), esc(k.unit || ''), new Date(k.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }), g0(k.monthly_rate), `<span style="color:${!k.renewal_status || k.renewal_status === 'Not started' ? RED : k.renewal_status === 'Renewed' ? GRN : DARK}">${esc(k.renewal_status || 'Not started')}</span>`]), { n: [3], empty: 'None ending' })}
      <div class="box sm">${ed('', 'Customer notes – rate reviews, risks, wins')}</div></div></div>`, n, c);
  }

  function sales(c, n) {
    const S = X.salesStock; if (!S) return frame('Sales stock', '<div class="mut">Sales stock not available.</div>', n, c);
    const held = S.held().map((s) => Object.assign({ s }, S.val(s))), sum = (k, r = held) => r.reduce((t, x) => t + (x[k] || 0), 0);
    const q = [ymAdd(c.ym, 1), ymAdd(c.ym, 2), ymAdd(c.ym, 3)], due = held.filter((r) => r.s.expected_sale && q.includes(String(r.s.expected_sale).slice(0, 7)));
    const old = held.filter((r) => r.days > 90);
    return frame('Sales stock and dealership', `<div class="tiles4">${tile('Units for sale', held.length, held.filter((r) => r.ask != null).length + ' priced')}${tile('Asking value', gk(sum('ask')), 'profit on sale ' + gk(sum('profit')))}${tile('Cash it releases', gk(sum('cash')), 'after settling HP of ' + gk(sum('settle')))}${tile('Over 90 days in stock', old.length, old.length ? old.slice(0, 4).map((r) => esc(r.s.reg)).join(', ') : '', old.length ? OR : '')}</div>
      <div class="g2w"><div><h3>Expected to sell in the next 3 months</h3>${table(['Unit', 'Type', 'Month', 'Asking', 'Cash released', 'Profit'], due.sort((a, b) => String(a.s.expected_sale).localeCompare(b.s.expected_sale)).map((r) => [`<b>${esc(r.s.reg)}</b>`, esc(r.s.vehicle_type || ''), sl(String(r.s.expected_sale).slice(0, 7)), g0(r.ask), g0(r.cash), g0(r.profit)]), { n: [3, 4, 5], empty: 'No sales dated – set expected sale months on the Sales stock page' })}</div>
      <div><div class="box">${ed('', 'Dealership notes – enquiries, export leads, units to move from hire to sale')}</div></div></div>`, n, c);
  }

  function parking(c, n) {
    const K = X.parking; if (!K) return frame('Parking', '<div class="mut">Parking not available.</div>', n, c);
    const { SITES, AG } = K.data(), end = c.ym + '-' + String(new Date(+c.ym.slice(0, 4), +c.ym.slice(5, 7), 0).getDate()).padStart(2, '0');
    const o = K.occupancy(null, end), act = AG.filter((a) => K.live(a, end)), wk = act.reduce((t, a) => t + K.weekly(a), 0), wait = AG.filter((a) => a.status === 'Waiting list');
    const m6 = Array.from({ length: 6 }, (_, i) => ymAdd(c.ym, i - 5));
    return frame('Parking', `<div class="tiles4">${tile('Occupancy', o.pct == null ? '–' : pc(o.pct / 100), o.used + ' of ' + o.cap + ' spaces let')}${tile(sl(c.ym) + ' revenue', gk(K.monthRevenue(c.ym)), 'pro rata from agreements')}${tile('Weekly run rate', g0(wk), gk(wk * 52) + ' a year')}${tile('Waiting list', wait.length, wait.reduce((t, a) => t + (+a.spaces || 0), 0) + ' spaces wanted')}</div>
      <div class="g2"><div><h3>Parking revenue – last 6 months</h3>${bars(m6.map(sl), [{ vals: m6.map((m) => K.monthRevenue(m)), color: '#8B5CF6' }], { h: 220 })}</div>
      <div><h3>Sites</h3>${table(['Site', 'Status', 'Spaces let', 'Occupancy', '£/week'], SITES.map((s) => { const so = K.occupancy(s.id, end); return [esc(s.name), esc(s.status), so.used + ' / ' + so.cap, so.pct == null ? '–' : Math.round(so.pct) + '%', g0(act.filter((a) => a.site_id === s.id).reduce((t, a) => t + K.weekly(a), 0))]; }), { n: [2, 3, 4] })}
      <div class="box sm">${ed('', 'Parking notes – Leighton Buzzard development, Ellesmere Port progress')}</div></div></div>`, n, c);
  }

  // ================= quarterly and annual packs: headline view only =================
  const sumH = (c, ms, f) => ms.reduce((t, m) => t + (+((c.hm.find((h) => h.month === m) || {})[f]) || 0), 0);
  const utilH = (c, ms) => { const ch = sumH(c, ms, 'chargeable_days'); return ch ? Math.min(1, sumH(c, ms, 'on_hire_days') / ch) : null; };
  const hasH = (c, ms) => ms.some((m) => c.hm.find((h) => h.month === m));
  function plSum(c, ms) {   // actual and budget over the months that have actuals; null if none
    const P = c.P; if (!P || !P.ms) return null;
    const ks = ms.map((m) => miOf(m)).filter((k) => P.ms.includes(k) && P.ytd.includes(k)); if (!ks.length) return null;
    const S = (w, f) => ks.reduce((t, k) => t + (w === 'a' ? P.A(k) : P.B(k))[f], 0), o = { n: ks.length, a: {}, b: {} };
    ['income', 'cos', 'gp', 'overhead', 'net'].forEach((f) => { o.a[f] = S('a', f); o.b[f] = S('b', f); }); return o;
  }
  const chg = (a, b, money = true) => (a == null || b == null || !b && !a ? '' : (money ? sg(a - b) : '') + (b ? ' (' + (a >= b ? '+' : '−') + Math.abs((a - b) / Math.abs(b) * 100).toFixed(0) + '%)' : ''));
  const cfAt = (c, ym) => { const r = c.cfRows.find((x) => String(x.k).slice(0, 7) === ym); return r ? (r.closed ? r.closeA : r.eff) : null; };
  const facAt = (c, ym) => { const f = c.fac.find((x) => String(x.month).slice(0, 7) === ym), me = c.me && c.me.row && String(c.me.row.month).slice(0, 7) === ym ? c.me.row : null;
    return { drawn: me && me.facility_drawn != null ? +me.facility_drawn : f && f.outstanding != null ? +f.outstanding : null, total: f ? +f.total : null }; };
  const wonIn = (ms) => { const Pp = X.pipeline; if (!Pp) return []; return (Pp.data() || []).filter((d) => d.won_at && ms.includes(String(d.won_at).slice(0, 7))); };
  const lostIn = (ms) => { const Pp = X.pipeline; if (!Pp) return []; return (Pp.data() || []).filter((d) => d.lost_at && ms.includes(String(d.lost_at).slice(0, 7))); };
  const word = (c) => (c.per.kind === 'qtr' ? 'quarter' : 'year');

  function glanceP(c, n) {
    const p = c.per, t = sumH(c, p.months, 'turnover'), tp = sumH(c, p.prev, 'turnover'), L = plSum(c, p.months), u = utilH(c, p.months), up = utilH(c, p.prev);
    const close = cfAt(c, p.end), buf = c.cfM && c.cfM.s ? +c.cfM.s.min_buffer : null, f = facAt(c, p.end), won = wonIn(p.months);
    return frame((p.kind === 'qtr' ? 'Quarter' : 'Year') + ' at a glance', `<div class="tiles6">
      ${tile('Turnover (MCS)', gk(t), hasH(c, p.prev) ? chg(t, tp) + ' on ' + esc(p.prevName) : '')}
      ${tile('Net profit', gk(L && L.a.net), L ? sg(L.a.net - L.b.net) + ' v budget ' + gk(L.b.net) + (L.n < p.months.length ? ' (' + L.n + ' months in)' : '') : 'accounts not loaded', L ? (L.a.net >= L.b.net ? GRN : RED) : '')}
      ${tile('Closing cash', gk(close), 'at ' + esc(lab(p.end)) + (buf != null && close != null ? ' · headroom over buffer ' + gk(close - buf) : ''), close != null && buf != null && close < buf ? RED : '')}
      ${tile('Facility headroom', gk(f.total != null && f.drawn != null ? f.total - f.drawn : null), f.drawn != null ? gk(f.drawn) + ' drawn of ' + gk(f.total) : 'facility balance not entered')}
      ${tile('Time utilisation', pc(u, 1), up != null && u != null ? (u >= up ? '+' : '−') + (Math.abs(u - up) * 100).toFixed(1) + ' pts on ' + esc(p.prevName) : '')}
      ${tile('Deals won', won.length, won.length ? gk(won.reduce((x, d) => x + X.pipeline.pm(d), 0)) + ' a month of new hire' : 'in the ' + word(c))}</div>
      <div class="box"><h3>Commentary</h3>${ed('', 'The ' + word(c) + ' in a few lines – what went well, what didn’t, what the board needs to decide.')}</div>`, n, c);
  }

  function plP(c, n) {
    const p = c.per, P = c.P, L = plSum(c, p.months), Lp = plSum(c, p.prev);
    if (!L) return frame('Profit and loss', '<div class="mut">Management accounts not loaded for this period.</div>', n, c);
    const row = (l, f, cost) => { const a = L.a[f], b = L.b[f], pa = Lp ? Lp.a[f] : null, good = (x, y) => (cost ? x <= y : x >= y);
      return [`<b>${l}</b>`, g0(a), g0(b), `<span style="color:${good(a, b) ? GRN : RED}">${sg(cost ? b - a : a - b)}</span>`, g0(pa), pa == null ? '–' : `<span style="color:${good(a, pa) ? GRN : RED}">${sg(a - pa)}</span>`]; };
    const ms = p.all, inFy = P.ms.includes(miOf(p.end)), top = p.kind === 'year' && inFy ? (P.lines || []).filter((x) => Math.abs(x.f) > 500).sort((a, b) => Math.abs(b.f) - Math.abs(a.f)).slice(0, 5) : [];
    return frame('Profit and loss – ' + p.short, `<div class="g2"><div>${table(['', p.short, 'Budget', 'Var', p.prevName, 'Change'], [row('Income', 'income'), row('Cost of sales', 'cos', 1), row('Gross profit', 'gp'), row('Overheads', 'overhead', 1), row('Net profit', 'net')], { n: [1, 2, 3, 4, 5] })}
      <div class="mini2">Gross margin ${L.a.income ? pc(L.a.gp / L.a.income, 1) : '–'} (budget ${L.b.income ? pc(L.b.gp / L.b.income, 1) : '–'}).${inFy ? ` Full-year outlook <b>${g0(P.out('net'))}</b> against a budget of ${g0(P.fB('net'))} (${sg(P.out('net') - P.fB('net'))}).` : ''}</div>
      ${top.length ? '<h3>Biggest variances, year to date</h3>' + table(['Line', 'Actual', 'Budget', 'Effect on profit'], top.map((x) => [esc(x.l.label), g0(x.a), g0(x.b), `<span style="color:${x.f >= 0 ? GRN : RED}">${sg(x.f)}</span>`]), { n: [1, 2, 3] }) : ''}</div>
      <div><h3>Net profit by month</h3>${bars(ms.map(sl), [{ vals: ms.map((m) => { const k = miOf(m); return P.ms.includes(k) && P.ytd.includes(k) ? P.A(k).net : null; }), color: NAVY }], { line: { vals: ms.map((m) => (P.ms.includes(miOf(m)) ? P.B(miOf(m)).net : null)), color: MUT, dash: 1 }, h: 250 })}${legend([[NAVY, 'Actual'], [MUT, 'Budget', 1]])}
      <div class="box sm">${ed('', 'Notes on the P&L (disposals, one-offs, timing)')}</div></div></div>`, n, c);
  }

  function cashP(c, n) {
    const p = c.per, buf = c.cfM && c.cfM.s ? +c.cfM.s.min_buffer : null, win = p.months.concat([1, 2, 3].map((i) => ymAdd(p.end, i)));
    const vals = win.map((m) => cfAt(c, m)), act = p.months.map((m) => cfAt(c, m)).filter((v) => v != null), low = act.length ? Math.min(...act) : null;
    const f = facAt(c, p.end), fs = p.months.map((m) => facAt(c, m)), me = c.me && c.me.row;
    return frame('Cash and funding', `<div class="tiles4">${tile('Closing cash', gk(cfAt(c, p.end)), 'at ' + esc(lab(p.end)))}${tile('Lowest month-end cash', gk(low), 'in the ' + word(c) + (buf != null ? ' · buffer ' + gk(buf) : ''), low != null && buf != null && low < buf ? RED : '')}${tile('Facility drawn', gk(f.drawn), f.total ? 'limit ' + gk(f.total) + ' · headroom ' + gk(f.drawn != null ? f.total - f.drawn : null) : '')}${tile('HP outstanding', gk(me && me.hp_balance), 'at ' + esc(lab(p.end)))}</div>
      <div class="g2"><div><h3>Month-end cash, then the next 3 months forecast</h3>${bars(win.map(sl), [{ vals, color: NAVY, cf: (j) => (j < p.months.length ? NAVY : SOFT) }], { hline: buf, h: 240 })}${legend([[NAVY, 'Actual'], [SOFT, 'Forecast'], [RED, 'Minimum buffer', 1]])}</div>
      <div><h3>Facility drawn</h3>${fs.some((x) => x.drawn != null) ? bars(p.months.map(sl), [{ vals: fs.map((x) => x.drawn), color: OR }], { line: { vals: fs.map((x) => x.total), color: MUT, dash: 1 }, h: 240 }) + legend([[OR, 'Drawn'], [MUT, 'Facility limit', 1]]) : '<div class="mut">Enter facility balances on Month end.</div>'}</div></div>`, n, c);
  }

  function fleetP(c, n) {
    const p = c.per, r = sumH(c, p.months, 'hire_revenue'), rp = sumH(c, p.prev, 'hire_revenue'), u = utilH(c, p.months), h = c.hm.find((x) => x.month === p.end), h0 = c.hm.find((x) => x.month === ymAdd(p.months[0], -1));
    let top = [], tot = 0, n3 = 0, cnt = 0;
    if (X.crm) { const cs = X.crm.customers().map((x) => ({ name: x.name, v: p.months.reduce((t, m) => t + (x.rev[m] || 0), 0), pv: p.prev.reduce((t, m) => t + (x.rev[m] || 0), 0) })).filter((x) => x.v || x.pv);
      tot = cs.reduce((t, x) => t + x.v, 0); cnt = cs.filter((x) => x.v).length; top = cs.sort((a, b) => b.v - a.v).slice(0, 8); n3 = top.slice(0, 3).reduce((t, x) => t + x.v, 0); }
    return frame('Fleet and customers', `<div class="tiles4">${tile('Hire revenue', gk(r), hasH(c, p.prev) ? chg(r, rp) + ' on ' + esc(p.prevName) : '')}${tile('Time utilisation', pc(u, 1), 'average for the ' + word(c))}${tile('Fleet on hire', h ? (h.units_on_hire || 0) + ' / ' + (h.units || 0) : '–', h && h0 && h0.units ? 'fleet ' + ((h.units || 0) - (h0.units || 0) >= 0 ? '+' : '−') + Math.abs((h.units || 0) - (h0.units || 0)) + ' units over the ' + word(c) : 'at ' + esc(lab(p.end)))}${tile('Customers billed', cnt || '–', tot ? 'top 3 = ' + pc(n3 / tot) + ' of hire revenue' : '', tot && n3 / tot > .5 ? OR : '')}</div>
      <div class="g2"><div><h3>Hire revenue and utilisation by month</h3>${bars(p.all.map(sl), [{ vals: p.all.map((m) => { const x = c.hm.find((y) => y.month === m); return x ? +x.hire_revenue : null; }), color: NAVY }], { h: 230 })}
      <div class="lg">${p.months.map((m) => `<span>${sl(m)} ${pc(utilH(c, [m]))}</span>`).join('')}</div></div>
      <div><h3>Top customers – ${esc(p.short)}</h3>${table(['Customer', 'Hire revenue', 'Share', 'v ' + p.prevName], top.map((x) => [esc(x.name), g0(x.v), tot ? pc(x.v / tot) : '', x.pv ? `<span style="color:${x.v >= x.pv ? GRN : RED}">${sg(x.v - x.pv)}</span>` : '<span class="mut">new</span>']), { n: [1, 2, 3] })}</div></div>`, n, c);
  }

  function outlookP(c, n) {
    const p = c.per, Pp = X.pipeline, won = wonIn(p.months), lost = lostIn(p.months), open = Pp ? (Pp.data() || []).filter((d) => Pp.OPEN.includes(d.stage)) : [];
    const reasons = {}; lost.forEach((d) => { const r = d.lost_reason || 'Not given'; reasons[r] = (reasons[r] || 0) + 1; });
    const salesT = sumH(c, p.months, 'sales_turnover'), S = X.salesStock, held = S ? S.held().map((x) => S.val(x)) : [], sum = (k) => held.reduce((t, x) => t + (x[k] || 0), 0);
    const K = X.parking, parkRev = K ? p.months.reduce((t, m) => t + K.monthRevenue(m), 0) : null, occ = K ? K.occupancy(null) : null;
    let fc = null; if (X.forecast) { const f = X.forecast.build().rows.filter((r) => r.fut).slice(0, 12), wb = f.filter((r) => r.budget != null), T = (k, rs = f) => rs.reduce((t, r) => t + (r[k] || 0), 0); fc = { f, tot: T('auto'), con: T('con'), vb: wb.length ? T('auto', wb) - T('budget', wb) : null, nb: wb.length }; }
    const li = (a) => '<ul class="ul">' + a.map((x) => `<li>${x}</li>`).join('') + '</ul>';
    return frame('Growth and outlook', `<div class="g4">
      <div class="box"><h3>Pipeline</h3>${li([`<b>${won.length}</b> won · <b>${lost.length}</b> lost in the ${word(c)}` + (won.length + lost.length ? ' (win rate ' + pc(won.length / (won.length + lost.length)) + ')' : ''), 'New hire won: <b>' + gk(won.reduce((t, d) => t + Pp.pm(d), 0)) + '</b> a month', 'Open now: <b>' + open.length + '</b> deals, weighted <b>' + gk(open.reduce((t, d) => t + Pp.wpm(d), 0)) + '</b> a month', Object.keys(reasons).length ? 'Main reason lost: ' + esc(Object.entries(reasons).sort((a, b) => b[1] - a[1])[0][0]) : 'No losses recorded'])}</div>
      <div class="box"><h3>Sales and dealership</h3>${li(['Sales turnover in the ' + word(c) + ': <b>' + gk(salesT) + '</b> (MCS)', 'Units for sale now: <b>' + held.length + '</b>, asking <b>' + gk(sum('ask')) + '</b>', 'Cash they would release: <b>' + gk(sum('cash')) + '</b> after HP', 'Over 90 days in stock: <b>' + held.filter((x) => x.days > 90).length + '</b>'])}</div>
      <div class="box"><h3>Parking</h3>${li(['Revenue in the ' + word(c) + ': <b>' + gk(parkRev) + '</b>', occ ? 'Occupancy now: <b>' + (occ.pct == null ? '–' : pc(occ.pct / 100)) + '</b> (' + occ.used + ' of ' + occ.cap + ' spaces)' : '', ed('', 'Site development notes')])}</div>
      <div class="box"><h3>Revenue – next 12 months</h3>${fc ? li(['Portal forecast <b>' + gk(fc.tot) + '</b>', 'Under contract <b>' + (fc.tot ? pc(fc.con / fc.tot) : '–') + '</b>', fc.vb == null ? 'No budget loaded ahead' : '<span style="color:' + (fc.vb >= 0 ? GRN : RED) + '">' + sg(fc.vb) + '</span> against budget for the ' + fc.nb + ' months budgeted']) : '<div class="mut">Forecast not available.</div>'}</div></div>
      ${fc ? '<h3>Revenue forecast by month</h3>' + bars(fc.f.map((r) => sl(r.m)), [{ vals: fc.f.map((r) => r.con), color: NAVY }, { vals: fc.f.map((r) => r.other || 0), color: SOFT }, { vals: fc.f.map((r) => r.pipe), color: OR }, { vals: fc.f.map((r) => r.park + r.sales), color: GRN }], { stack: 1, line: { vals: fc.f.map((r) => r.budget), color: DARK, dash: 1 }, w: 1180, h: 170 }) + legend([[NAVY, 'Contracted hire'], [SOFT, 'Other hire'], [OR, 'Weighted pipeline'], [GRN, 'Parking and sales'], [DARK, 'Budget', 1]]) : ''}`, n, c);
  }

  function strategy(c, n) {
    return frame('Strategy and decisions', `<div class="g2"><div class="box"><h3>Decisions needed from the board</h3>${ed('', '1. …\n2. …')}</div><div class="box"><h3>Strategy – where we are</h3>${ed('Grow steadily with careful risk management, keep generating cash.\nGrow the dealership (sales) and parking.\nNew hire deals use cash first – balance growth against headroom.', '')}</div></div>
      <div class="box"><h3>Actions</h3>${table(['Action', 'Owner', 'By'], [[ed('', 'Action'), ed('', 'Who'), ed('', 'When')], [ed('', 'Action'), ed('', 'Who'), ed('', 'When')], [ed('', 'Action'), ed('', 'Who'), ed('', 'When')]])}</div>`, n, c);
  }

  function page(body, label) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Compton Tankers – Board pack ${esc(label)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page{size:1280px 720px;margin:0}*{box-sizing:border-box}body{margin:0;background:#E9EDF5;font-family:Poppins,Arial,sans-serif;color:#1E293B;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:5;background:${DARK};color:#fff;padding:10px 20px;display:flex;gap:14px;align-items:center;font-size:13px}.bar button{background:${OR};color:#fff;border:0;border-radius:6px;padding:8px 16px;font:600 13px Poppins,sans-serif;cursor:pointer}
.slide{width:1280px;height:720px;margin:20px auto;background:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 18px rgba(11,42,102,.15);page-break-after:always;break-after:page}
header{display:flex;justify-content:space-between;align-items:center;padding:26px 48px 10px;border-bottom:3px solid ${OR}}header h1{margin:0;font-size:30px;color:${NAVY};font-weight:700}header .sub{color:#64748B;font-size:13px}header img{height:44px}
main{flex:1;padding:16px 48px;overflow:hidden}footer{display:flex;justify-content:space-between;padding:8px 48px;font-size:11px;color:#64748B;border-top:1px solid #E5E9F2}
h3{margin:12px 0 6px;font-size:14px;color:${DARK};font-weight:600}.mut{color:#94A3B8}
.tiles6{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.tiles4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:6px}
.tile{background:#F4F7FC;border-left:4px solid ${NAVY};border-radius:6px;padding:12px 14px}.tl{font-size:12px;color:#64748B}.tv{font-size:28px;font-weight:700;color:${DARK};line-height:1.25}.ts{font-size:11.5px;color:#475569}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:28px}.g2w{display:grid;grid-template-columns:1.7fr 1fr;gap:28px}.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.g4 .box{margin-top:0}.ul{margin:0;padding-left:16px;font-size:12.5px;line-height:1.55}
.t{width:100%;border-collapse:collapse;font-size:12.5px}.t th{text-align:left;color:#64748B;font-weight:500;border-bottom:2px solid #E5E9F2;padding:5px 6px}.t td{border-bottom:1px solid #EEF1F6;padding:5px 6px;vertical-align:top}.n{text-align:right;white-space:nowrap}
.box{background:#F8FAFD;border:1px solid #E5E9F2;border-radius:8px;padding:10px 14px;margin-top:14px}.box.sm{margin-top:10px}.mini2{font-size:12.5px;margin:10px 0;color:#334155}
.ed{min-height:24px;font-size:14px;line-height:1.5;border-bottom:1px dotted ${MUT};outline:none;white-space:normal}.ed:empty:before{content:attr(data-ph);color:#A0AEC0;white-space:pre-line}.t .ed{font-size:12.5px}
.lg{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#475569;margin-top:4px}.lg i{display:inline-block;width:12px;height:10px;margin-right:5px;vertical-align:middle}
.cover{background:linear-gradient(135deg,${DARK},${NAVY});color:#fff}.cv{padding:70px 90px;height:100%;display:flex;flex-direction:column}.cv img{height:70px;align-self:flex-start}.cv h1{font-size:64px;margin:60px 0 0;font-weight:700}.cv h2{font-size:24px;font-weight:400;margin:8px 0 0;color:#FFD9C6;border-left:5px solid ${OR};padding-left:14px}
.cv .ag{margin-top:40px;max-width:640px}.cv .ed{color:#fff;font-size:17px;border-bottom-color:rgba(255,255,255,.4)}.cvf{margin-top:auto;font-size:12px;opacity:.75}
@media print{body{background:#fff}.bar{display:none}.slide{margin:0;box-shadow:none}.ed{border-bottom:0}.ed:empty:before{content:''}}
</style></head><body><div class="bar"><b>Board pack · ${esc(label)}</b><span>Type over anything with a dotted underline, then print. Choose “Save as PDF”, no margins.</span><button onclick="window.print()">Print / save as PDF</button></div>${body}</body></html>`;
  }
})();
