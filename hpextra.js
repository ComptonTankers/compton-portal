/* HP page extras: which assets earn most against their HP, and where settling HP is best value. */
(function () {
  const X = window.CT; if (!X) return;
  const { all, gbp, esc, NOW, mon } = X;
  const norm = (u) => String(u || '').replace(/\s+/g, '').toUpperCase();
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const fmt = (v) => (v < 0 ? '-' : '') + gbp(Math.abs(v));
  const col = (v) => (v < 0 ? 'color:#b3261e' : 'color:#1e7a4d');
  let S = { sort: 'margin', dir: -1, budget: '', plan: 'settle', mode: 'term', over: {} };

  X.hpExtra = async function (el, d) {
    const host = document.createElement('div'); host.id = 'hpx'; el.appendChild(host);
    let hu = []; try { hu = await all('hire_units', 'month.asc'); } catch (e) { hu = []; }
    const rev = new Map(); hu.forEach((r) => { const k = norm(r.unit), o = rev.get(k) || { sum: 0, n: 0, type: r.type, last: 0 }; o.sum += +r.revenue || 0; o.n++; o.last = +r.revenue || 0; o.type = r.type || o.type; rev.set(k, o); });
    const revFor = (k) => rev.get(k) || (k.length >= 4 && [...rev.entries()].find(([h]) => h.startsWith(k) || k.startsWith(h))?.[1]) || null;
    const live = d.agr.filter((a) => a.active && !a.settled_date && mon(a.end_month) >= NOW);
    const ass = new Map(); d.ass.forEach((x) => { if (!ass.has(x.agreement_id)) ass.set(x.agreement_id, []); ass.get(x.agreement_id).push(x); });
    const cust = new Map(); (d.con || []).filter((c) => c.active).forEach((c) => { const k = norm(c.unit); if (!cust.has(k)) cust.set(k, new Set()); cust.get(k).add(c.customer); });
    const units = new Map(), ags = [];
    live.forEach((g) => {
      const pays = d.sch.filter((r) => r.agreement_id === g.id && r.m >= NOW).sort((a, b) => a.m - b.m); if (!pays.length) return;
      const rate = g.interest_rate != null ? +g.interest_rate / (+g.interest_rate > 1 ? 100 : 1) : 0.08, i = Math.pow(1 + rate, 1 / 12) - 1;
      const pm = (pays.find((r) => r.m === NOW) || pays[0]).amount, owed = pays.reduce((t, r) => t + r.amount, 0), settle = pays.reduce((t, r) => t + r.amount / Math.pow(1 + i, Math.max(0, r.m - NOW)), 0);
      const as = ass.get(g.id) || [], tot = as.reduce((t, x) => t + (+x.share || 1), 0) || 1;
      let arev = 0, known = 0;
      as.forEach((x) => { const k = norm(x.unit), f = (+x.share || 1) / tot, r = revFor(k), mr = r ? r.sum / r.n : null;
        const u = units.get(k) || { unit: x.unit, pm: 0, owed: 0, settle: 0, left: 0, ends: 0, refs: [], rev: mr, type: r ? r.type : '', cust: [...(cust.get(k) || [])].join(', ') };
        u.pm += pm * f; u.owed += owed * f; u.settle += settle * f; u.left = Math.max(u.left, pays.length); u.ends = Math.max(u.ends, pays[pays.length - 1].m); u.refs.push(g.agreement_ref || '#' + g.id); units.set(k, u);
        if (mr != null) { arev += mr; known++; } });
      ags.push({ pays, i, B: settle, g, ref: g.agreement_ref || '#' + g.id, lender: (g.finance_company || '').replace(/ (PLC|LTD|LIMITED)$/i, ''), units: as.map((x) => x.unit), pm, owed, settle, saved: owed - settle, payback: pm ? settle / pm : 1e9, left: pays.length, end: pays[pays.length - 1].m, arev, known, est: g.interest_rate == null });
    });
    const U = [...units.values()].map((u) => Object.assign(u, { margin: u.rev == null ? null : u.rev - u.pm, cover: u.rev == null || !u.pm ? null : u.rev / u.pm }));
    /* effect of paying X off the balance now: keep the payment (finish sooner) or keep the term (lower payment) */
    function ov(a, x) {
      x = Math.max(0, Math.min(+x || 0, a.B)); if (!x) return { x: 0, saved: 0, months: 0, pm: a.pm };
      if (S.mode === 'pay') { const f = (a.B - x) / a.B; return { x, saved: a.owed - x - a.owed * f, months: 0, pm: a.pm * f }; }
      let bal = a.B - x, paid = 0, k = 0;
      for (; k < a.pays.length; k++) { const p = a.pays[k].amount; if (bal <= p) { paid += Math.max(bal, 0); k++; bal = 0; break; } paid += p; bal = (bal - p) * (1 + a.i); }
      if (bal > 0) paid += bal;
      return { x, saved: a.owed - x - paid, months: a.pays.length - k, pm: a.pm };
    }
    draw();

    function draw() {
      const rows = U.slice().sort((a, b) => { const x = a[S.sort], y = b[S.sort]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.dir; });
      const tR = U.reduce((t, u) => t + (u.rev || 0), 0), tH = U.reduce((t, u) => t + u.pm, 0), neg = U.filter((u) => u.margin != null && u.margin < 0);
      const mx = Math.max(1, ...U.map((u) => Math.abs(u.margin || 0)));
      const th = (k, l, n) => `<th class="${n ? 'n' : ''}" data-s="${k}" style="cursor:pointer">${l}${S.sort === k ? (S.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      const T1 = `<div class="card"><h3>Assets on HP – revenue against what we pay</h3><div class="hint">Average monthly hire revenue on record (since Sep 2026) against the monthly HP payment for each asset on finance. Margin = revenue less HP – before running costs and depreciation. Shared agreements are split across their assets. Click a heading to sort.</div>
        <div style="display:flex;gap:26px;flex-wrap:wrap;margin:6px 0 10px"><div><div class="hint">Revenue a month</div><b style="font-size:20px">${gbp(tR)}</b></div><div><div class="hint">HP a month</div><b style="font-size:20px">${gbp(tH)}</b></div><div><div class="hint">Margin</div><b style="font-size:20px;${col(tR - tH)}">${fmt(tR - tH)}</b></div><div><div class="hint">Assets not covering their HP</div><b style="font-size:20px;color:#b3261e">${neg.length}</b> <span class="hint">of ${U.length}</span></div></div>
        <div class="box2"><table><thead><tr>${th('unit', 'Asset')}${th('type', 'Type')}<th>Customer</th>${th('rev', 'Revenue / month', 1)}${th('pm', 'HP / month', 1)}${th('margin', 'Margin / month', 1)}<th>Margin</th>${th('cover', 'Cover', 1)}${th('settle', 'Est. settlement', 1)}${th('left', 'Months left', 1)}</tr></thead><tbody>${rows.map((u) => `<tr><td><b>${esc(u.unit)}</b></td><td>${esc(u.type || '')}</td><td>${esc(u.cust || '')}</td><td class="n">${u.rev == null ? '–' : gbp(u.rev)}</td><td class="n">${gbp(u.pm)}</td><td class="n" style="${u.margin == null ? '' : col(u.margin)};font-weight:600">${u.margin == null ? '–' : fmt(u.margin)}</td><td style="width:130px">${u.margin == null ? '' : `<div style="height:9px;border-radius:5px;background:${u.margin < 0 ? '#e8a0a0' : '#9fd1b3'};width:${Math.max(3, Math.abs(u.margin) / mx * 100)}%"></div>`}</td><td class="n">${u.cover == null ? '–' : u.cover.toFixed(1) + '×'}</td><td class="n">${gbp(u.settle)}</td><td class="n">${u.left}</td></tr>`).join('')}</tbody></table></div></div>`;
      const budget = parseFloat(S.budget) || 0, rk = ags.slice().sort((a, b) => a.payback - b.payback);
      let left = budget; const pick = new Set(), alloc = new Map();
      if (budget && S.plan === 'settle') rk.forEach((a) => { if (a.settle <= left) { pick.add(a.ref); left -= a.settle; } });
      if (budget && S.plan === 'over') ags.map((a) => ({ a, r: ov(a, a.B * 0.1).saved / (a.B * 0.1) })).sort((p, q) => q.r - p.r).forEach(({ a }) => { const x = Math.min(left, Math.max(0, a.B - a.pm)); if (x > 1) { alloc.set(a.ref, x); pick.add(a.ref); left -= x; } });
      const pk = rk.filter((a) => pick.has(a.ref)), isO = S.plan === 'over', freed = pk.reduce((t, a) => t + (isO ? a.pm - ov(a, alloc.get(a.ref)).pm : a.pm), 0), spent = pk.reduce((t, a) => t + (isO ? alloc.get(a.ref) : a.settle), 0), sv = pk.reduce((t, a) => t + (isO ? ov(a, alloc.get(a.ref)).saved : a.saved), 0);
      const own = rk.map((a) => ({ a, o: ov(a, S.over[a.ref] != null && S.over[a.ref] !== '' ? S.over[a.ref] : alloc.get(a.ref)) })), oTot = own.reduce((t, z) => t + z.o.x, 0), oSav = own.reduce((t, z) => t + z.o.saved, 0);
      const T2 = `<div class="card"><h3>Best HP to settle</h3><div class="hint">Ranked by payback – how many months of the saved HP payment it takes to earn back the settlement (settlement ÷ monthly payment). Short payback = cash freed fastest for the least outlay. Interest saved = payments still to make less the settlement. Estimates only (agreements with * have no recorded rate, so 8% is used) – get the lender's settlement quote before deciding.</div>
        <div class="form" style="margin:6px 0 10px"><div><label>If we put aside £ (cash for HP)</label><input id="hpx_b" type="number" step="1000" value="${S.budget}" placeholder="e.g. 100000"></div><div><label>Use it to</label><select id="hpx_p"><option value="settle" ${S.plan === 'settle' ? 'selected' : ''}>Settle agreements in full</option><option value="over" ${S.plan === 'over' ? 'selected' : ''}>Overpay (spread by best return)</option></select></div><div><label>An overpayment…</label><select id="hpx_m"><option value="term" ${S.mode === 'term' ? 'selected' : ''}>keeps the payment, ends sooner</option><option value="pay" ${S.mode === 'pay' ? 'selected' : ''}>keeps the end date, lowers the payment</option></select></div></div>
        ${budget ? `<div style="margin:0 0 10px;padding:10px 12px;border-radius:8px;background:rgba(47,143,91,.1)"><b>${gbp(budget)}</b> ${isO ? 'overpaid across' : 'would settle'} <b>${pk.length}</b> agreement${pk.length === 1 ? '' : 's'} (${gbp(spent)}), ${S.mode === 'pay' && isO ? 'lowering the monthly bill by' : 'freeing'} <b>${gbp(freed)} a month</b>${isO && S.mode === 'term' ? ' once they end sooner' : ''} and saving about <b>${gbp(sv)}</b> of interest. Highlighted below.</div>` : ''}
        <div class="box2"><table><thead><tr><th>#</th><th>Agreement</th><th>Lender</th><th>Assets</th><th class="n">HP / month</th><th class="n">Est. settlement</th><th class="n">Payback</th><th class="n">Interest saved</th><th class="n">Months left</th><th class="n">Overpay £</th><th class="n">Interest saved by overpaying</th><th>Result</th><th class="n">Assets' revenue / month</th><th class="n">Margin after settling</th><th>Ends</th></tr></thead><tbody>${rk.map((a, n) => { const oo = ov(a, S.over[a.ref] != null && S.over[a.ref] !== '' ? S.over[a.ref] : alloc.get(a.ref)); return `<tr style="${pick.has(a.ref) ? 'background:rgba(47,143,91,.12)' : ''}"><td>${n + 1}</td><td><b>${esc(a.ref)}</b></td><td>${esc(a.lender)}</td><td>${esc(a.units.join(', ') || '–')}</td><td class="n">${gbp(a.pm)}</td><td class="n">${gbp(a.settle)}${a.est ? ' *' : ''}</td><td class="n"><b>${a.payback > 1e6 ? '–' : a.payback.toFixed(1) + ' mo'}</b></td><td class="n">${gbp(a.saved)}</td><td class="n">${a.left}</td><td class="n"><input data-o="${esc(a.ref)}" type="number" step="1000" style="width:90px;padding:4px 6px" value="${S.over[a.ref] != null && S.over[a.ref] !== '' ? S.over[a.ref] : (alloc.has(a.ref) ? Math.round(alloc.get(a.ref)) : '')}" placeholder="0"></td><td class="n"><b>${oo.x ? gbp(oo.saved) : '–'}</b></td><td>${oo.x ? (S.mode === 'pay' ? 'payment ' + gbp(a.pm) + ' → ' + gbp(oo.pm) : oo.months > 0 ? 'ends ' + oo.months + ' mo sooner' : 'settled') : ''}</td><td class="n">${a.known ? gbp(a.arev) : '–'}</td><td class="n" style="${a.known ? col(a.arev) : ''}">${a.known ? fmt(a.arev) : '–'}</td><td>${lab(a.end)}</td></tr>`; }).join('')}</tbody></table></div>
        ${oTot ? `<div style="margin-top:8px"><b>Overpayments entered / planned:</b> ${gbp(oTot)} paid now, interest saved about <b>${gbp(oSav)}</b> (${S.mode === 'pay' ? 'payments fall, same end dates' : 'same payments, agreements end sooner'}).</div>` : ''}
        <div class="hint" style="margin-top:6px">Overpayments: type an amount against any agreement to see the interest saved. Lenders differ – some only allow full settlement and some apply a rebate formula, so confirm with them. Margin after settling = the assets' monthly revenue once the HP payment is gone. Settling an agreement on assets that earn well keeps that income without the payment; settling on idle assets frees cash but earns nothing. Use <b>Settle</b> in the table above to record one once it is done.</div></div>`;
      host.innerHTML = T1 + T2;
      host.querySelectorAll('[data-s]').forEach((h) => { h.onclick = () => { const k = h.dataset.s; S.dir = S.sort === k ? -S.dir : (k === 'unit' || k === 'type' ? 1 : -1); S.sort = k; draw(); }; });
      const b = host.querySelector('#hpx_b'); b.onchange = () => { S.budget = b.value; S.over = {}; draw(); };
      host.querySelector('#hpx_p').onchange = (e) => { S.plan = e.target.value; S.over = {}; draw(); };
      host.querySelector('#hpx_m').onchange = (e) => { S.mode = e.target.value; draw(); };
      host.querySelectorAll('[data-o]').forEach((i) => { i.onchange = () => { S.over[i.dataset.o] = i.value; draw(); }; });
    }
  };
})();
