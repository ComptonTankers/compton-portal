/* Overview: one page of headline numbers across cash, HP, contracts and stock. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, C } = X;
  const mi = (d) => { const x = new Date(d); return x.getFullYear() * 12 + x.getMonth(); };
  const NOW = (() => { const n = new Date(); return n.getFullYear() * 12 + n.getMonth(); })();
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

  function bars(el, rows, o) {   // rows: [{l, parts:[{v,c}], line}]
    const W = 640, H = 230, L = 52, R = 10, T = 12, B = 28;
    const max = Math.max(1, ...rows.map((r) => Math.max(r.parts.reduce((t, p) => t + Math.max(p.v, 0), 0), r.line || 0)));
    const min = Math.min(0, ...rows.map((r) => r.parts.reduce((t, p) => t + Math.min(p.v, 0), 0)));
    const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min || 1)), bw = (W - L - R) / rows.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.title)}">`;
    for (let i = 0; i <= 4; i++) { const v = min + (max - min) * i / 4; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.line}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${C.mut}">${gbp(v)}</text>`; }
    rows.forEach((r, i) => {
      let pos = 0, neg = 0;
      r.parts.forEach((p) => { const a = p.v >= 0 ? pos : neg, b = a + p.v; if (p.v >= 0) pos = b; else neg = b;
        s += `<rect x="${L + i * bw + bw * .15}" width="${bw * .7}" y="${Math.min(y(a), y(b))}" height="${Math.abs(y(a) - y(b))}" fill="${p.c}"><title>${esc(r.l)} · ${esc(p.n || '')} ${gbp(p.v)}</title></rect>`; });
      s += `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${C.mut}">${r.l}</text>`;
    });
    if (o.hline != null) s += `<line x1="${L}" x2="${W - R}" y1="${y(o.hline)}" y2="${y(o.hline)}" stroke="${C.orange}" stroke-dasharray="5 4"/><text x="${W - R}" y="${y(o.hline) - 4}" text-anchor="end" font-size="11" fill="${C.orange}">${o.hlabel}</text>`;
    const pts = rows.map((r, i) => r.line != null ? `${L + i * bw + bw / 2},${y(r.line)}` : null).filter(Boolean);
    if (pts.length) s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${C.orange}" stroke-width="2.5"/>` + pts.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3.5" fill="${C.orange}"/>`).join('');
    el.innerHTML = s + '</svg>';
  }
  const legend = (a) => '<div class="hint" style="display:flex;gap:14px;flex-wrap:wrap">' + a.map(([c, t]) => `<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};margin-right:5px"></i>${t}</span>`).join('') + '</div>';

  X.routes.home = async (el) => {
    el.innerHTML = X.head('Overview', 'Cash, HP, contracts and stock at a glance') + '<div class="empty">Loading…</div>';
    const [d, M, stock, jobs] = await Promise.all([X.loadFinance(), X.cf.load(), all('stock', 'created_at.desc'), all('jobs', 'created_at.desc')]);
    const R = X.cf.compute(M), open = R.filter((r) => !r.closed), lastClosed = [...R].reverse().find((r) => r.closed);
    const cash = lastClosed ? lastClosed.closeA : M.s.opening_actual;
    const low = open.reduce((w, r) => (w == null || r.head < w.head ? r : w), null);
    const live = d.agr.filter((a) => a.active && mi(a.end_month) >= NOW), liveIds = new Set(live.map((a) => a.id));
    const hpBy = {}; d.sch.filter((r) => liveIds.has(r.agreement_id)).forEach((r) => { hpBy[r.m] = (hpBy[r.m] || 0) + r.amount; });
    const con = d.con.filter((c) => c.active !== false);
    const inM = (c, m) => mi(c.start_date) <= m && (c.rolling || !c.end_date || mi(c.end_date) >= m);
    const incomeIn = (m, rolling) => con.filter((c) => inM(c, m) && !!c.rolling === rolling).reduce((t, c) => t + (+c.monthly_rate || 0), 0);
    const incNow = incomeIn(NOW, false) + incomeIn(NOW, true), hpNow = hpBy[NOW] || 0;
    const held = stock.filter((s) => !['sold', 'moved_to_hire'].includes(s.status));
    const toReview = jobs.filter((j) => j.status === 'submitted').length;

    const months = Array.from({ length: 12 }, (_, i) => NOW + i);
    const rows = months.map((m) => ({ l: lab(m), parts: [{ v: incomeIn(m, false), c: C.blue, n: 'Fixed-term contracts' }, { v: incomeIn(m, true), c: '#9fb6e0', n: 'Rolling contracts' }], line: hpBy[m] || 0 }));
    const cashRows = R.map((r) => ({ l: lab(mi(r.k + '-01')), parts: [{ v: r.eff, c: r.closed ? C.blue : C.blue2, n: r.closed ? 'Actual close' : 'Forecast close' }] }));

    const soon = [];
    con.filter((c) => !c.rolling && c.end_date && mi(c.end_date) >= NOW && mi(c.end_date) <= NOW + 3).forEach((c) => soon.push(['Contract ends', `${c.unit} · ${c.customer}`, c.end_date, +c.monthly_rate]));
    live.filter((a) => mi(a.end_month) <= NOW + 3).forEach((a) => soon.push(['HP ends', `${a.finance_company} · ${a.agreement_ref}`, a.end_month, +a.regular_payment]));
    soon.sort((a, b) => String(a[2]).localeCompare(String(b[2])));
    const fd = (d0) => new Date(d0).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    el.innerHTML = X.head('Overview', 'Cash, HP, contracts and stock at a glance') +
      X.tiles([
        { l: 'Cash at ' + (lastClosed ? lastClosed.k : 'start'), v: gbp(cash), s: 'actual, last closed month', c: 'g' },
        { l: 'Lowest headroom ahead', v: low ? gbp(low.head) : '–', s: low ? 'in ' + lab(mi(low.k + '-01')) + (low.head < 0 ? ' · below buffer' : ' · above buffer') : '', c: low && low.head < 0 ? 'r' : '' },
        { l: 'Contracted hire / month', v: gbp(incNow), s: con.filter((c) => inM(c, NOW)).length + ' contracts running now' },
        { l: 'HP / month', v: gbp(hpNow), s: live.length + ' live agreements' },
        { l: 'Contract cover of HP', v: hpNow ? (incNow / hpNow).toFixed(2) + '×' : '–', s: incNow >= hpNow ? 'contracts cover HP' : 'HP exceeds contracts', c: incNow >= hpNow ? 'g' : 'r' },
        { l: 'Sales stock held', v: held.length, s: 'asking ' + gbp(held.reduce((t, s) => t + (+s.asking_price || 0), 0)) + (toReview ? ' · ' + toReview + ' inspection(s) to review' : '') }]) +
      `<div class="card"><h3>Cash position</h3><div class="hint">Month-end cash: actual where the month is closed, forecast after. Dashed line is the minimum buffer.</div><div id="h1"></div></div>
       <div class="card"><h3>Contracted hire income against HP</h3><div class="hint">Next 12 months. Rolling hires are shown lighter because either side can end them.</div>${legend([[C.blue, 'Fixed-term contracts'], ['#9fb6e0', 'Rolling contracts'], [C.orange, 'HP payments']])}<div id="h2"></div></div>
       <div class="card"><h3>Coming up (next 3 months)</h3>${soon.length ? '<table><thead><tr><th>What</th><th>Detail</th><th>Date</th><th class="n">Monthly</th></tr></thead><tbody>' + soon.map((r) => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${fd(r[2])}</td><td class="n">${gbp(r[3])}</td></tr>`).join('') + '</tbody></table>' : '<div class="empty">Nothing ending in the next three months.</div>'}</div>`;
    bars(document.getElementById('h1'), cashRows, { title: 'Month-end cash', hline: +M.s.min_buffer, hlabel: 'buffer ' + gbp(M.s.min_buffer) });
    bars(document.getElementById('h2'), rows, { title: 'Contracted income against HP' });
  };
})();
