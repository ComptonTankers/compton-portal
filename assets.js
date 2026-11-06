/* Asset summary: one row per fleet asset – lifetime earnings and profit, utilisation, HP owed / settlement, book value and residual. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, NOW, mon } = X;
  const $ = (id) => document.getElementById(id);
  const norm = (u) => String(u || '').replace(/\s+/g, '').toUpperCase();
  const pc = (v) => v == null || isNaN(v) ? '–' : (v * 100).toFixed(1) + '%';
  const FYM = mon('2026-09-01'); /* revenue on record starts Sep 2026 */
  const S = { q: '', type: '', st: '', hp: '', sort: 'life', dir: -1, open: null };
  let ROWS = [], META = {};

  async function build() {
    await X.fa.load(); const d = await X.loadFinance(), fa = await all('fa_assets', 'ref.asc').catch(() => []);
    const rateOf = (g) => { const r = g.interest_rate != null ? +g.interest_rate / (+g.interest_rate > 1 ? 100 : 1) : 0.08; return Math.pow(1 + r, 1 / 12) - 1; };
    const live = d.agr.filter((a) => a.active && !a.settled_date && mon(a.end_month) >= NOW), liveIds = new Set(live.map((a) => a.id));
    const asUnits = new Map(); d.ass.forEach((x) => { if (!asUnits.has(x.agreement_id)) asUnits.set(x.agreement_id, []); asUnits.get(x.agreement_id).push(x); });
    const U = new Map(); const get = (k) => { if (!U.has(k)) U.set(k, { owed: 0, settle: 0, pm: 0, lenders: new Set(), end: 0, intLife: 0, intFY: 0 }); return U.get(k); };
    /* remaining payments, settlement estimate and finance cost (interest) per unit */
    d.agr.filter((g) => g.active).forEach((g) => {
      const pays = d.sch.filter((r) => r.agreement_id === g.id).sort((a, b) => a.m - b.m); if (!pays.length) return;
      const i = rateOf(g), as = asUnits.get(g.id) || [], tot = as.reduce((t, x) => t + (+x.share || 1), 0) || 1;
      let bal = pays.reduce((t, r, idx) => t + r.amount / Math.pow(1 + i, idx + 1), 0); const ints = [];
      pays.forEach((r) => { const it = bal * i; bal = bal + it - r.amount; ints.push([r.m, it]); });
      as.forEach((x) => { const k = norm(x.unit), f = (+x.share || 1) / tot, u = get(k);
        ints.forEach(([m, it]) => { if (m <= NOW) u.intLife += it * f; if (m <= NOW && m >= FYM) u.intFY += it * f; });
        if (liveIds.has(g.id)) { pays.filter((r) => r.m >= NOW).forEach((r) => { u.owed += r.amount * f; u.settle += r.amount * f / Math.pow(1 + i, Math.max(0, r.m - NOW)); if (r.m === NOW) u.pm += r.amount * f; u.end = Math.max(u.end, r.m); }); u.lenders.add((g.finance_company || '').replace(/ (PLC|LTD|LIMITED)$/i, '')); } });
    });
    const hpFor = (k) => U.get(k) || (k.length >= 4 && [...U.entries()].find(([h]) => h.startsWith(k) || k.startsWith(h))?.[1]) || null;
    const faFor = (k) => fa.find((a) => norm(a.ref) === k) || (k.length >= 4 ? fa.find((a) => norm(a.ref).startsWith(k) || k.startsWith(norm(a.ref))) : null);
    const today = new Date().toISOString().slice(0, 10), cons = d.con.filter((c) => c.active && (c.rolling || !c.end_date || c.end_date >= today) && (!c.start_date || c.start_date <= today));
    ROWS = d.fleet.map((f) => {
      const k = norm(f.unit), h = hpFor(k), a = faFor(k), cs = cons.filter((c) => norm(c.unit) === k);
      let cost = null, nbv = null, resid = null, depLife = null, depFY = null;
      if (a) { const q = X.fa.sched(a); if (q) { cost = q.cost; resid = q.cost * q.res / 100; nbv = X.fa.nbvAt(a, NOW); depLife = cost - nbv; depFY = X.fa.nbvAt(a, FYM - 1) - nbv; } }
      const chd = +f.chargeable_days || 0, ytdc = +f.ytd_chargeable_days || 0, fyRev = +f.ytd_revenue || 0, prior = a && a.prior_revenue != null ? +a.prior_revenue : null;
      const life = fyRev + (prior || 0), hasLife = prior != null;
      const intr = h ? (hasLife ? h.intLife : h.intFY) : 0, dep = depLife == null ? null : (hasLife ? depLife : depFY);
      return { unit: f.unit, type: f.type || 'Other', onHire: (+f.on_hire_days || 0) > 0, fyUtil: ytdc ? Math.min(1, (+f.ytd_on_hire_days || 0) / ytdc) : null, life, fyRev, prior, hasLife, faId: a && a.id,
        cust: [...new Set(cs.map((c) => c.customer))].join(', '), crate: cs.reduce((t, c) => t + (+c.monthly_rate || 0), 0), hasHP: !!h, owed: h ? h.owed : 0, settle: h ? h.settle : 0, pm: h ? h.pm : 0, lender: h ? [...h.lenders].join(', ') : '',
        cost, nbv, resid, profit: dep == null ? null : life - dep - intr, dep, intr };
    });
    META = { month: d.fleet.length ? d.fleet[0].month : null };
  }

  const COLS = [['unit', 'Unit', 0], ['st', 'Status', 0], ['cust', 'Customer', 0], ['crate', 'Contract £/mo', 1], ['life', 'Lifetime earnings', 1], ['profit', 'Lifetime profit', 1], ['fyUtil', 'Util (on record)', 1],
    ['owed', 'HP remaining', 1], ['settle', 'Est. settlement', 1], ['nbv', 'Book value', 1], ['resid', 'Residual', 1]];

  function draw(el) {
    const R = ROWS, vis = R.filter((r) => (!S.type || r.type === S.type) && (!S.st || (S.st === 'On hire') === r.onHire) && (!S.hp || (S.hp === 'On HP') === r.hasHP) && (!S.q || (r.unit + ' ' + r.type + ' ' + r.cust + ' ' + r.lender).toLowerCase().includes(S.q)));
    const sum = (a, k) => a.reduce((t, r) => t + (r[k] || 0), 0), key = (r, k) => k === 'st' ? (r.onHire ? 1 : 0) : r[k];
    vis.sort((a, b) => { const x = key(a, S.sort), y = key(b, S.sort); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.dir; });
    const types = [...new Set(R.map((r) => r.type))].sort(), priced = vis.filter((r) => r.nbv != null), idle = vis.filter((r) => !r.onHire), idleHP = sum(idle, 'pm');
    const full = vis.filter((r) => r.hasLife).length, pr = vis.filter((r) => r.profit != null);
    const neg = (v) => v < 0 ? ' style="color:var(--bad,#b3261e)"' : '';
    const cell = (r, k) => { const v = r[k]; switch (k) {
      case 'unit': return `<b>${esc(r.unit)}</b>`; case 'st': return `<span class="pill ${r.onHire ? 'g' : 'a'}">${r.onHire ? 'On hire' : 'Off hire'}</span>`; case 'cust': return esc(r.cust || '–');
      case 'life': return `<span title="On record ${gbp(r.fyRev)}${r.hasLife ? ' + earlier ' + gbp(r.prior) : ' (earlier £ not entered)'}">${gbp(v)}${r.hasLife ? '' : '*'}</span> <input class="mi" style="width:74px;opacity:.75" data-prior="${r.faId || ''}" placeholder="earlier £" value="${r.prior == null ? '' : r.prior}" title="Hire revenue earned before September 2026">`;
      case 'profit': return v == null ? '<span class="hint">n/a</span>' : `<b${neg(v)} title="Earnings ${gbp(r.life)} less depreciation ${gbp(r.dep)} less HP interest ${gbp(r.intr)}${r.hasLife ? '' : ' – months on record only'}">${gbp(v)}${r.hasLife ? '' : '*'}</b>`;
      case 'fyUtil': return pc(v); case 'owed': return v ? `<span title="${esc(r.lender)} · ${gbp(r.pm)} a month">${gbp(v)}</span>` : '–'; case 'nbv': return v == null ? '<span class="hint">n/a</span>' : `<span title="Cost ${gbp(r.cost)}">${gbp(v)}</span>`; case 'resid': return v == null ? '<span class="hint">n/a</span>' : gbp(v);
      default: return v ? gbp(v) : '–'; } };
    const grp = new Map(); vis.forEach((r) => { if (!grp.has(r.type)) grp.set(r.type, []); grp.get(r.type).push(r); });
    el.innerHTML = X.head('Asset summary', 'Every fleet asset: what it has earned, what it has made, what is owed on it and what it is worth' + (META.month ? ' · hire data to ' + META.month.slice(0, 7) : '')) +
      X.tiles([{ l: 'Assets in view', v: vis.length, s: vis.filter((r) => r.onHire).length + ' on hire · ' + idle.length + ' off hire', c: 'o' },
        { l: 'Lifetime earnings', v: gbp(sum(vis, 'life')), s: full + ' of ' + vis.length + ' have earlier £ entered; the rest show months on record only' },
        { l: 'Lifetime profit', v: gbp(sum(pr, 'profit')), s: 'earnings – depreciation – HP interest', c: sum(pr, 'profit') < 0 ? 'r' : 'g' },
        { l: 'HP remaining', v: gbp(sum(vis, 'owed')), s: gbp(sum(vis, 'pm')) + '/month · settlement ≈ ' + gbp(sum(vis, 'settle')) },
        { l: 'Book value', v: gbp(sum(priced, 'nbv')), s: priced.length + ' of ' + vis.length + ' priced · residual ' + gbp(sum(priced, 'resid')) },
        { l: 'Book value after settling HP', v: gbp(sum(priced, 'nbv') - sum(priced.filter((r) => r.hasHP), 'settle')), s: 'what is left on the books if every HP were paid off today', c: 'g' },
        { l: 'HP on idle assets', v: gbp(idleHP), s: idle.filter((r) => r.hasHP).length + ' off-hire assets still on HP', c: idleHP ? 'r' : '' }]) +
      `<div class="card"><div class="flt"><input type="search" id="as_q" placeholder="Search unit, customer, lender…" value="${esc(S.q)}"><select id="as_t"><option value="">All descriptions</option>${types.map((t) => `<option ${S.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><select id="as_s"><option value="">On &amp; off hire</option>${['On hire', 'Off hire'].map((t) => `<option ${S.st === t ? 'selected' : ''}>${t}</option>`).join('')}</select><select id="as_h"><option value="">HP &amp; owned</option>${['On HP', 'Owned'].map((t) => `<option ${S.hp === t ? 'selected' : ''}>${t}</option>`).join('')}</select><button type="button" class="lnk" id="as_e">Expand / collapse groups</button><span class="cnt">${vis.length} of ${R.length}</span></div>
      <div class="hint">Grouped by description; click a group to open it, click a column heading to sort. Hover a figure for the detail. <b>Lifetime earnings</b> = revenue on record (monthly MCS reports loaded since September 2026) + the “earlier £” you enter for anything before. <b>*</b> = earlier £ not entered yet, so earnings and profit only cover the months on record. Profit = earnings – depreciation over the same period – estimated HP interest. Book value uses the Fixed assets depreciation settings.</div>
      <div class="box2"><table id="as_tb"><thead><tr>${COLS.map(([k, t, n]) => `<th class="${n ? 'n' : ''}" data-k="${k}" style="cursor:pointer">${t}${S.sort === k ? (S.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${[...grp.entries()].sort((a, b) => sum(b[1], 'life') - sum(a[1], 'life')).map(([t, rs]) => {
        const o = S.open == null ? false : S.open.has(t), p = rs.filter((r) => r.nbv != null), q2 = rs.filter((r) => r.profit != null);
        return `<tr class="ug-g" data-t="${esc(t)}" style="cursor:pointer;background:var(--soft,#f1f4fa);font-weight:600"><td>${o ? '▾' : '▸'} ${esc(t)} (${rs.length})</td><td>${rs.filter((r) => r.onHire).length} on hire</td><td></td><td class="n">${gbp(sum(rs, 'crate'))}</td><td class="n">${gbp(sum(rs, 'life'))}</td><td class="n">${gbp(sum(q2, 'profit'))}</td><td class="n">${pc(avg(rs, 'fyUtil'))}</td><td class="n">${gbp(sum(rs, 'owed'))}</td><td class="n">${gbp(sum(rs, 'settle'))}</td><td class="n">${gbp(sum(p, 'nbv'))}</td><td class="n">${gbp(sum(p, 'resid'))}</td></tr>` +
          (o ? rs.map((r) => `<tr>${COLS.map(([k, , n]) => `<td class="${n ? 'n' : ''}">${cell(r, k)}</td>`).join('')}</tr>`).join('') : ''); }).join('')}</tbody></table></div></div>`;
    const re = () => draw(el);
    $('as_q').oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); if (S.q) { if (S.open == null) S.open = new Set(); vis.forEach((r) => S.open.add(r.type)); } re(); const q = $('as_q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); };
    $('as_t').onchange = (e) => { S.type = e.target.value; re(); }; $('as_s').onchange = (e) => { S.st = e.target.value; re(); }; $('as_h').onchange = (e) => { S.hp = e.target.value; re(); };
    $('as_e').onclick = () => { S.open = S.open && S.open.size ? new Set() : new Set(R.map((r) => r.type)); re(); };
    el.querySelectorAll('tr.ug-g').forEach((tr) => tr.onclick = () => { if (S.open == null) S.open = new Set(); const t = tr.dataset.t; S.open.has(t) ? S.open.delete(t) : S.open.add(t); re(); });
    el.querySelectorAll('th[data-k]').forEach((th) => th.onclick = () => { const k = th.dataset.k; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = ['unit', 'cust'].includes(k) ? 1 : -1; } re(); });
    el.querySelectorAll('input[data-prior]').forEach((inp) => { inp.onclick = (e) => e.stopPropagation(); inp.onchange = async () => {
      const id = inp.dataset.prior; if (!id) return; const t = inp.value.replace(/[£,\s]/g, ''), v = t === '' ? null : +t; if (v !== null && isNaN(v)) { inp.style.outline = '2px solid #b3261e'; return; }
      try { await api('fa_assets?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ prior_revenue: v }) }); await build(); re(); } catch (e) { inp.style.outline = '2px solid #b3261e'; } }; });
  }
  function avg(a, k) { const v = a.map((r) => r[k]).filter((x) => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; }

  X.routes.assets = async (el) => { el.innerHTML = X.head('Asset summary', 'Loading…') + '<div class="empty">Loading…</div>'; await build(); draw(el); };
})();
