/* Business overview: fleet, contracts, HP, cash and stock - headline numbers, hover charts, and what needs attention. */
(function () {
  const X = window.CT; if (!X) return;
  const { all, gbp, esc, C, T, NOW, mon, fmtD } = X;
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const labL = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const pct = (v, d = 0) => (v == null || isNaN(v) ? '–' : (v * 100).toFixed(d) + '%');
  const norm = (u) => String(u || '').replace(/\s+/g, '').toUpperCase();
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:14px"><span style="opacity:.75">${k}</span><b>${v}</b></div>`;
  const svgOpen = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}" style="display:block">`;

  /* column chart: rows [{l, parts:[{v,c,n}], line:{v,c}, tip}] — hovering a column shows the full detail */
  function cols(el, rows, o) {
    const W = 720, H = o.h || 240, L = 56, R = 12, Tp = 12, B = 28;
    const tops = rows.map((r) => r.parts.reduce((t, p) => t + Math.max(p.v, 0), 0));
    const max = Math.max(1, o.hline || 0, ...tops, ...rows.map((r) => (r.line ? r.line.v : 0)));
    const min = Math.min(0, ...rows.map((r) => r.parts.reduce((t, p) => t + Math.min(p.v, 0), 0)));
    const y = (v) => Tp + (H - Tp - B) * (1 - (v - min) / (max - min || 1)), bw = (W - L - R) / rows.length;
    let s = svgOpen(W, H, o.title);
    for (let i = 0; i <= 4; i++) { const v = min + (max - min) * i / 4; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${C.line}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${C.mut}">${gbp(v)}</text>`; }
    rows.forEach((r, i) => {
      let pos = 0, neg = 0;
      r.parts.forEach((p) => { const a = p.v >= 0 ? pos : neg, b = a + p.v; if (p.v >= 0) pos = b; else neg = b;
        s += `<rect class="mk" data-i="${i}" x="${L + i * bw + bw * .17}" width="${bw * .66}" y="${Math.min(y(a), y(b))}" height="${Math.max(0, Math.abs(y(a) - y(b)))}" fill="${p.c}" rx="2"/>`; });
      s += `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${C.mut}">${r.l}</text>`;
    });
    if (o.hline != null) s += `<line x1="${L}" x2="${W - R}" y1="${y(o.hline)}" y2="${y(o.hline)}" stroke="${C.orange}" stroke-dasharray="5 4"/><text x="${W - R}" y="${y(o.hline) - 4}" text-anchor="end" font-size="11" fill="${C.orange}">${o.hlabel}</text>`;
    if (rows.some((r) => r.line)) {
      const pts = rows.map((r, i) => (r.line ? [L + i * bw + bw / 2, y(r.line.v)] : null)).filter(Boolean);
      s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${C.orange}" stroke-width="2.5"/>` + pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${C.orange}"/>`).join('');
    }
    rows.forEach((r, i) => { s += `<rect class="hit" data-i="${i}" x="${L + i * bw}" width="${bw}" y="${Tp}" height="${H - Tp - B}" fill="transparent"/>`; });
    el.innerHTML = s + '</svg>';
    el.querySelectorAll('.hit').forEach((h) => {
      const i = +h.dataset.i;
      h.addEventListener('mousemove', (e) => { el.querySelectorAll('.mk').forEach((m) => (m.style.opacity = +m.dataset.i === i ? 1 : .45)); T.show(e, rows[i].tip); });
      h.addEventListener('mouseleave', () => { el.querySelectorAll('.mk').forEach((m) => (m.style.opacity = 1)); T.hide(); });
    });
  }

  /* horizontal bars: rows [{l, v, v2, tip, c}] */
  function hbars(el, rows, o) {
    const W = 720, rh = 30, L = o.left || 190, H = rows.length * rh + 8, max = Math.max(o.max || 0, ...rows.map((r) => Math.max(r.v, r.v2 || 0)), 1e-9);
    let s = svgOpen(W, H, o.title);
    rows.forEach((r, i) => {
      const y = 4 + i * rh, w = (v) => Math.max(2, (W - L - 70) * v / max);
      s += `<text x="${L - 8}" y="${y + 17}" text-anchor="end" font-size="12.5" fill="#1b2430">${esc(r.l.length > 28 ? r.l.slice(0, 27) + '…' : r.l)}</text>`;
      if (r.v2 != null) s += `<rect x="${L}" y="${y + 17}" width="${w(r.v2)}" height="5" rx="2.5" fill="${C.blue}" opacity=".35"/>`;
      s += `<rect x="${L}" y="${y + 4}" width="${w(r.v)}" height="${r.v2 != null ? 13 : 16}" rx="3" fill="${r.c || C.blue2}"/><text x="${L + w(r.v) + 6}" y="${y + 15}" font-size="12" fill="${C.mut}">${o.fmt(r.v)}</text>`;
      s += `<rect class="hit" data-i="${i}" x="0" y="${y}" width="${W}" height="${rh}" fill="transparent"/>`;
    });
    el.innerHTML = s + '</svg>';
    el.querySelectorAll('.hit').forEach((h) => { const i = +h.dataset.i; h.addEventListener('mousemove', (e) => T.show(e, rows[i].tip)); h.addEventListener('mouseleave', T.hide); });
  }

  function stackBar(el, segs) {   // [{n,v,c}]
    const tot = segs.reduce((t, s) => t + s.v, 0) || 1; let x = 0;
    let s = svgOpen(720, 46, 'Fleet status');
    segs.forEach((g, i) => { const w = 720 * g.v / tot; s += `<rect class="hit" data-i="${i}" x="${x}" y="4" width="${Math.max(w - 2, 0)}" height="38" fill="${g.c}" rx="4"/>` + (w > 60 ? `<text x="${x + w / 2}" y="28" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${g.v}</text>` : ''); x += w; });
    el.innerHTML = s + '</svg>';
    el.querySelectorAll('.hit').forEach((h) => { const g = segs[+h.dataset.i]; h.addEventListener('mousemove', (e) => T.show(e, `<b>${g.n}</b><br>${g.v} units · ${pct(g.v / tot)} of the fleet`)); h.addEventListener('mouseleave', T.hide); });
  }

  const list = (items, empty) => items.length ? '<ul style="margin:0;padding:0;list-style:none">' + items.map((i) => `<li style="padding:9px 0;border-bottom:1px solid ${C.line};font-size:14px;line-height:1.4">${i.h}${i.go ? ` <a href="#/${i.go}" style="color:${C.blue};white-space:nowrap">${i.lk || 'Open'} →</a>` : ''}</li>`).join('') + '</ul>' : `<div class="hint">${empty}</div>`;

  X.routes.home = async (el) => {
    el.innerHTML = X.head('Business overview', 'Loading…') + '<div class="empty">Loading…</div>';
    const [d, M, stock, jobs, months, types, custs, units] = await Promise.all([X.loadFinance(), X.cf.load(), all('stock', 'created_at.desc'), all('jobs', 'created_at.desc'),
      all('hire_months', 'month.asc'), all('hire_types', 'month.asc,type.asc'), all('hire_customers', 'month.asc,customer.asc'), all('hire_units', 'month.asc,unit.asc')]);
    const K = X.calcHPVC(d), R = X.cf.compute(M);

    /* ---- fleet (latest MCS month) ---- */
    const F = months[months.length - 1] || {}, FM = F.month;
    const fUtil = F.chargeable_days ? F.on_hire_days / F.chargeable_days : null, fYtd = F.ytd_chargeable_days ? F.ytd_on_hire_days / F.ytd_chargeable_days : null;
    const fTypes = types.filter((t) => t.month === FM), fCust = custs.filter((c) => c.month === FM).sort((a, b) => b.revenue - a.revenue), fUnits = units.filter((u) => u.month === FM);
    const custTot = fCust.reduce((t, c) => t + (+c.revenue || 0), 0);
    const revPerOn = F.units_on_hire ? F.hire_revenue / F.units_on_hire : 0;

    /* ---- HP per unit ---- */
    const hpKeys = [...K.hpUnit.keys()];
    const hpFor = (u) => { const k = norm(u); const h = hpKeys.find((x) => { const hk = norm(x); return hk === k || (k.length >= 4 && hk.startsWith(k)); }); return h ? (K.hpUnit.get(h).get(NOW) || [...K.hpUnit.get(h).values()][0] || 0) : 0; };
    const idle = fUnits.filter((u) => +u.chargeable_days > 0 && +u.on_hire_days === 0).map((u) => Object.assign({ hp: hpFor(u.unit) }, u));
    const idleHP = idle.filter((u) => u.hp > 0).sort((a, b) => b.hp - a.hp), idleOwned = idle.filter((u) => !u.hp);
    const idleHPcost = idleHP.reduce((t, u) => t + u.hp, 0);

    /* ---- contracts & HP ---- */
    const live = d.agr.filter((a) => a.active && mon(a.end_month) >= NOW), liveIds = new Set(live.map((a) => a.id));
    const fixedNow = K.fixed.get(NOW) || 0, rollNow = K.roll.get(NOW) || 0, incNow = fixedNow + rollNow, hpNow = K.hpMonth.get(NOW) || 0;
    const atRisk = K.expoAll.filter((x) => x.k !== 'fixed'), atRiskAmt = atRisk.reduce((t, x) => t + x.amt, 0);
    const lapsed = K.expoAll.filter((x) => x.k === 'none' || x.k === 'expired'), unlinked = K.expoAll.filter((x) => x.k === 'unlinked');
    const hpEnding = live.filter((a) => mon(a.end_month) <= NOW + 12), hpFreed = hpEnding.reduce((t, a) => t + (+a.regular_payment || 0), 0);
    const endSoon = K.con.filter((c) => !c.rolling && c.end_date && mon(c.end_date) >= NOW && mon(c.end_date) <= NOW + 3);

    /* ---- cash ---- */
    const open = R.filter((r) => !r.closed), lastClosed = [...R].reverse().find((r) => r.closed);
    const cash = lastClosed ? lastClosed.closeA : M.s.opening_actual;
    const low = open.reduce((w, r) => (w == null || r.head < w.head ? r : w), null), nextVat = open.find((r) => r.vatAuto);
    const rm = (k) => mon(k + '-01');
    const staleOpen = open.filter((r) => rm(r.k) <= NOW);

    /* ---- stock ---- */
    const held = stock.filter((s) => !['sold', 'moved_to_hire'].includes(s.status)), toReview = jobs.filter((j) => j.status === 'submitted').length;
    const awaiting = stock.filter((s) => s.status === 'awaiting_inspection').length, ready = stock.filter((s) => s.status === 'for_sale');
    const readyAsk = ready.reduce((t, s) => t + (+s.asking_price || 0), 0);

    /* ---- takeaways ---- */
    const concerns = [], focus = [], opps = [];
    if (idleHP.length) concerns.push({ h: `<b>${idleHP.length} units sat idle all month but are still on HP</b> – ${gbp(idleHPcost)}/month of finance with no hire behind it (biggest: ${idleHP.slice(0, 3).map((u) => esc(u.unit) + ' ' + gbp(u.hp)).join(', ')}).`, go: 'fleet', lk: 'Fleet' });
    if (lapsed.length) concerns.push({ h: `<b>${lapsed.length} assets on HP have no live contract term</b> (${K.expoAll.filter((x) => x.k === 'none').length} with no contract, ${K.expoAll.filter((x) => x.k === 'expired').length} with an expired term) – ${gbp(lapsed.reduce((t, x) => t + x.amt, 0))} of HP still to pay.`, go: 'hpvc', lk: 'Exposure by asset' });
    if (unlinked.length) concerns.push({ h: `<b>${unlinked.length} financed assets are on hire in MCS but have no contract loaded here</b> (about ${gbp(unlinked.reduce((t, x) => t + x.rate, 0))}/month of hire). Their contract terms are missing, so the income and risk figures are understated until the MCS link is in.`, go: 'hpvc', lk: 'Exposure by asset' });
    if (incNow && rollNow / incNow > .4) concerns.push({ h: `<b>${pct(rollNow / incNow)} of contracted income is rolling hire</b> (${gbp(rollNow)}/month) – customers can end it on notice while the HP carries on.`, go: 'hpvc' });
    if (low && low.head < 0) concerns.push({ h: `<b>Cash dips below the ${gbp(M.s.min_buffer)} buffer in ${labL(rm(low.k))}</b> (${gbp(low.head)} headroom).`, go: 'cashflow', lk: 'Cash flow' });
    else if (low && low.head < 25000) concerns.push({ h: `<b>Cash headroom is thin in ${labL(rm(low.k))}</b> – only ${gbp(low.head)} above the buffer.`, go: 'cashflow', lk: 'Cash flow' });
    if (fCust[0] && custTot && fCust[0].revenue / custTot > .2) concerns.push({ h: `<b>${esc(fCust[0].customer)} is ${pct(fCust[0].revenue / custTot)} of hire revenue</b> – losing one customer would be felt.`, go: 'fleet' });
    if (fUtil != null && fYtd != null && fUtil < fYtd - .03) concerns.push({ h: `<b>Utilisation is down</b> – ${pct(fUtil)} this month against ${pct(fYtd)} for the year so far.`, go: 'fleet' });
    if (incNow && hpNow && incNow < hpNow * 1.1) concerns.push({ h: `<b>Contracted income barely covers HP</b> – ${(incNow / hpNow).toFixed(2)}×.`, go: 'hpvc' });

    staleOpen.forEach((r) => focus.push({ h: `<b>${labL(rm(r.k))} is still open</b> in the cash flow – enter the actuals and close it so the next month rolls forward.`, go: 'cashflow', lk: 'Cash flow' }));
    if (nextVat) focus.push({ h: `<b>VAT ${nextVat.vatAuto.net < 0 ? 'refund of' : 'payment of'} ${gbp(Math.abs(nextVat.vatAuto.net))}</b> is due in ${labL(rm(nextVat.k))}.`, go: 'cashflow', lk: 'Cash flow' });
    if (endSoon.length) focus.push({ h: `<b>${endSoon.length} contracts end in the next 3 months</b> (${gbp(endSoon.reduce((t, c) => t + +c.monthly_rate, 0))}/month): ${[...new Set(endSoon.map((c) => c.customer))].slice(0, 3).map(esc).join(', ')}. Talk to them about renewing.`, go: 'hpvc' });
    if (toReview) focus.push({ h: `<b>${toReview} vehicle inspection${toReview > 1 ? 's' : ''} submitted</b> and waiting for you to review.`, go: 'stock', lk: 'Stock' });
    if (awaiting) focus.push({ h: `<b>${awaiting} vehicle${awaiting > 1 ? 's' : ''} awaiting inspection</b> in the yard.`, go: 'stock', lk: 'Stock' });
    if (K.expoAll[0]) focus.push({ h: `<b>Biggest HP exposure:</b> ${K.expoAll.filter((x) => x.k !== 'fixed').slice(0, 3).map((x) => esc(x.u) + ' (' + gbp(x.amt) + ')').join(', ')}.`, go: 'hpvc', lk: 'Exposure by asset' });

    if (idleOwned.length) opps.push({ h: `<b>${idleOwned.length} owned units with no HP are off hire</b> – at the fleet's average of ${gbp(revPerOn)}/month each that is up to ${gbp(idleOwned.length * revPerOn)}/month if they were working.`, go: 'fleet' });
    if (hpEnding.length) opps.push({ h: `<b>${hpEnding.length} HP agreements finish within 12 months</b>, freeing ${gbp(hpFreed)}/month.`, go: 'hp', lk: 'HP overview' });
    if (rollNow) opps.push({ h: `<b>${gbp(rollNow)}/month is on rolling hire</b> – offering fixed terms to those customers secures the income against the HP.`, go: 'hpvc' });
    if (ready.length) opps.push({ h: `<b>${ready.length} vehicle${ready.length > 1 ? 's' : ''} ready to sell</b> – asking ${gbp(readyAsk)}.`, go: 'stock', lk: 'Stock' });
    const bestT = fTypes.filter((t) => +t.chargeable_days > 100).map((t) => ({ n: t.type, u: t.on_hire_days / t.chargeable_days })).sort((a, b) => b.u - a.u)[0];
    if (bestT && bestT.u > (fUtil || 0) + .05) opps.push({ h: `<b>${esc(bestT.n)} is your strongest type</b> at ${pct(bestT.u)} utilisation – the place to add capacity.`, go: 'fleet' });
    if (incNow && hpNow && incNow > hpNow * 1.3) opps.push({ h: `<b>Contract cover is healthy</b> at ${(incNow / hpNow).toFixed(2)}× HP – room to take on more finance for growth.` });

    /* ---- render ---- */
    el.innerHTML = X.head('Business overview', `Fleet, contracts, HP, cash and stock · MCS data to ${FM ? labL(mon(FM + '-01')) : 'n/a'}`) +
      X.tiles([
        { l: 'Hire turnover · ' + (FM ? lab(mon(FM + '-01')) : ''), v: gbp(F.hire_revenue), s: F.sales_turnover ? gbp(F.sales_turnover) + ' sales too' : 'latest MCS month', c: 'o' },
        { l: 'Time utilisation', v: pct(fUtil, 1), s: fYtd != null ? pct(fYtd, 1) + ' year to date' : '' },
        { l: 'Units on hire', v: F.units_on_hire != null ? F.units_on_hire + ' / ' + F.units : '–', s: (F.units_idle || 0) + ' off hire all month', c: F.units_idle > 20 ? 'r' : '' },
        { l: 'Contracted hire / month', v: gbp(incNow), s: gbp(fixedNow) + ' fixed · ' + gbp(rollNow) + ' rolling' },
        { l: 'HP / month', v: gbp(hpNow), s: live.length + ' live agreements · ' + (hpNow ? (incNow / hpNow).toFixed(2) + '× covered' : '') },
        { l: 'HP at risk', v: gbp(atRiskAmt), s: atRisk.length + ' assets without a secured term', c: 'r' },
        { l: 'Cash · ' + (lastClosed ? lab(rm(lastClosed.k)) + ' close' : 'start'), v: gbp(cash), s: low ? 'tightest: ' + lab(rm(low.k)) + ' (' + gbp(low.head) + ' over buffer)' : '', c: low && low.head < 0 ? 'r' : 'g' },
        { l: 'Sales stock held', v: held.length, s: 'asking ' + gbp(held.reduce((t, s) => t + (+s.asking_price || 0), 0)) }]) +
      `<div class="row">
        <div class="card" style="border-top:4px solid ${C.bad}"><h3>Concerns</h3><div class="hint">Things losing money or exposed to risk.</div>${list(concerns, 'Nothing flagged.')}</div>
        <div class="card" style="border-top:4px solid ${C.blue}"><h3>Where to focus</h3><div class="hint">What needs doing now.</div>${list(focus, 'Nothing pending.')}</div>
      </div>
      <div class="card" style="border-top:4px solid ${C.good}"><h3>Opportunities</h3><div class="hint">Where there is money to be made or saved.</div>${list(opps, 'Nothing flagged.')}</div>
      <div class="row">
        <div class="card"><h3>Cash position</h3><div class="hint">Month-end cash (actual where closed, forecast after). Hover a month for the detail.</div><div id="h1"></div></div>
        <div class="card"><h3>Contracted income against HP</h3><div class="hint">Next 12 months. Rolling hire is lighter – it can end on notice.</div><div class="legend"><span><i style="background:${C.blue}"></i>Fixed term</span><span><i style="background:#9fb6e0"></i>Rolling</span><span><i style="background:${C.orange}"></i>HP</span></div><div id="h2"></div></div>
      </div>
      <div class="row">
        <div class="card"><h3>Fleet status · ${FM ? labL(mon(FM + '-01')) : ''}</h3><div class="hint">Every unit by how much it was on hire. Hover a section.</div><div id="h3"></div>
          <div class="legend"><span><i style="background:${C.blue}"></i>On hire all month</span><span><i style="background:${C.blue2};opacity:.55"></i>Part of the month</span><span><i style="background:${C.orange}"></i>Off hire all month</span></div>
          <h3 style="margin-top:16px">Hire revenue by customer</h3><div class="hint">Share of the month's hire revenue.</div><div id="h5"></div></div>
        <div class="card"><h3>Utilisation by type</h3><div class="hint">This month (bar) against the financial year to date (thin line).</div><div id="h4"></div></div>
      </div>` +
      (months.length > 1 ? `<div class="card"><h3>Monthly hire revenue</h3><div class="hint">Every month loaded from MCS.</div><div id="h6"></div></div>` : '') +
      `<div class="card"><h3>Assets to watch</h3><div class="hint">Off hire all month while still on finance – the costliest first.</div>${idleHP.length ? '<div class="box2"><table><thead><tr><th>Asset</th><th>Type</th><th class="n">HP / month</th><th class="n">FY utilisation</th><th class="n">FY revenue</th></tr></thead><tbody>' + idleHP.map((u) => `<tr><td><b>${esc(u.unit)}</b></td><td>${esc(u.type || '')}</td><td class="n">${gbp(u.hp)}</td><td class="n">${u.ytd_chargeable_days ? pct(u.ytd_on_hire_days / u.ytd_chargeable_days) : '–'}</td><td class="n">${gbp(u.ytd_revenue)}</td></tr>`).join('') + '</tbody></table></div>' : '<div class="hint">No financed units were idle all month.</div>'}</div>`;

    /* ---- charts ---- */
    cols(document.getElementById('h1'), R.map((r) => ({ l: lab(rm(r.k)), parts: [{ v: r.eff, c: r.closed ? C.blue : C.blue2 }],
      tip: `<b>${labL(rm(r.k))}</b> ${r.closed ? '(closed)' : '(forecast)'}` + row('Opening', gbp(r.closed ? r.openA : r.openF)) + row('Money in', gbp(r.closed ? r.inA : r.inF)) + row('Money out', gbp(r.closed ? r.outA : r.outF)) + row('Closing', gbp(r.eff)) + (r.closed ? row('vs forecast', gbp(r.closeA - r.closeF)) : '') + row('Headroom over buffer', gbp(r.head)) })),
      { title: 'Month-end cash', hline: +M.s.min_buffer, hlabel: 'buffer ' + gbp(M.s.min_buffer) });
    const ms = Array.from({ length: 12 }, (_, i) => NOW + i);
    cols(document.getElementById('h2'), ms.map((m) => { const fx = K.fixed.get(m) || 0, rl = K.roll.get(m) || 0, hp = K.hpMonth.get(m) || 0;
      return { l: lab(m), parts: [{ v: fx, c: C.blue }, { v: rl, c: '#9fb6e0' }], line: { v: hp },
        tip: `<b>${labL(m)}</b>` + row('Fixed-term hire', gbp(fx)) + row('Rolling hire', gbp(rl)) + row('HP payments', gbp(hp)) + row('Net (fixed − HP)', gbp(fx - hp)) + row('Net incl. rolling', gbp(fx + rl - hp)) + row('Cover', hp ? ((fx + rl) / hp).toFixed(2) + '×' : '–') }; }),
      { title: 'Contracted income against HP' });
    stackBar(document.getElementById('h3'), [{ n: 'On hire all month', v: F.units_on_hire - F.units_part || 0, c: C.blue }, { n: 'Part of the month', v: F.units_part || 0, c: '#8fb0e8' }, { n: 'Off hire all month', v: F.units_idle || 0, c: C.orange }].filter((s) => s.v > 0));
    hbars(document.getElementById('h4'), fTypes.filter((t) => +t.chargeable_days > 0).map((t) => ({ l: t.type, v: t.on_hire_days / t.chargeable_days, v2: t.ytd_chargeable_days ? t.ytd_on_hire_days / t.ytd_chargeable_days : null,
      tip: `<b>${esc(t.type)}</b>` + row('Units', t.units) + row('Utilisation', pct(t.on_hire_days / t.chargeable_days, 1)) + row('Year to date', t.ytd_chargeable_days ? pct(t.ytd_on_hire_days / t.ytd_chargeable_days, 1) : '–') + row('Off hire all month', t.units_idle) + row('Hire revenue', gbp(t.revenue)) + row('Year-to-date revenue', gbp(t.ytd_revenue)) })), { title: 'Utilisation by type', max: 1, fmt: (v) => pct(v), left: 180 });
    hbars(document.getElementById('h5'), fCust.slice(0, 10).map((c) => ({ l: c.customer, v: +c.revenue, tip: `<b>${esc(c.customer)}</b>` + row('Hire revenue', gbp(c.revenue)) + row('Share of month', pct(c.revenue / custTot, 1)) })), { title: 'Top customers', fmt: gbp });
    if (document.getElementById('h6')) cols(document.getElementById('h6'), months.map((m) => ({ l: lab(mon(m.month + '-01')), parts: [{ v: +m.hire_revenue, c: C.blue }],
      tip: `<b>${labL(mon(m.month + '-01'))}</b>` + row('Hire revenue', gbp(m.hire_revenue)) + row('Sales', gbp(m.sales_turnover)) + row('Utilisation', m.chargeable_days ? pct(m.on_hire_days / m.chargeable_days, 1) : '–') + row('Units on hire', m.units_on_hire + ' / ' + m.units) + row('Customers', m.customers) })), { title: 'Monthly hire revenue', h: 200 });
  };
})();
