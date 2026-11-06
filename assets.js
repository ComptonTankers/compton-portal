/* Asset summary: one row per fleet asset – earnings, utilisation, HP owed / settlement, book value and residual. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, NOW, mon } = X;
  const $ = (id) => document.getElementById(id);
  const norm = (u) => String(u || '').replace(/\s+/g, '').toUpperCase();
  const pc = (v) => v == null || isNaN(v) ? '–' : (v * 100).toFixed(1) + '%';
  const S = { q: '', type: '', st: '', hp: '', sort: 'rev', dir: -1, open: null };
  let ROWS = [], META = {};

  async function build() {
    const [d, fa, pol] = await Promise.all([X.loadFinance(), all('fa_assets', 'ref.asc').catch(() => []), api('fa_policies?select=*').catch(() => [])]);
    const P = {}; pol.forEach((p) => { P[p.category] = p; });
    const live = d.agr.filter((a) => a.active && !a.settled_date && mon(a.end_month) >= NOW), liveIds = new Set(live.map((a) => a.id));
    const rate = (g) => { const r = g.interest_rate != null ? +g.interest_rate / (+g.interest_rate > 1 ? 100 : 1) : 0.08; return Math.pow(1 + r, 1 / 12) - 1; };
    const U = new Map(); // unit -> {owed, settle, pm, lenders:Set, ends}
    const asUnits = new Map(); d.ass.forEach((x) => { if (!asUnits.has(x.agreement_id)) asUnits.set(x.agreement_id, []); asUnits.get(x.agreement_id).push(x); });
    d.sch.filter((r) => liveIds.has(r.agreement_id) && r.m >= NOW).forEach((r) => {
      const g = d.byId.get(r.agreement_id), as = asUnits.get(r.agreement_id) || [], tot = as.reduce((t, x) => t + (+x.share || 1), 0) || 1, i = rate(g);
      as.forEach((x) => { const k = norm(x.unit), f = (+x.share || 1) / tot; if (!U.has(k)) U.set(k, { owed: 0, settle: 0, pm: 0, lenders: new Set(), end: 0 });
        const u = U.get(k); u.owed += r.amount * f; u.settle += r.amount * f / Math.pow(1 + i, Math.max(0, r.m - NOW)); if (r.m === NOW) u.pm += r.amount * f; u.lenders.add((g.finance_company || '').replace(/ (PLC|LTD|LIMITED)$/i, '')); u.end = Math.max(u.end, r.m); });
    });
    const hpFor = (k) => U.get(k) || (k.length >= 4 && [...U.entries()].find(([h]) => h.startsWith(k) || k.startsWith(h))?.[1]) || null;
    const faFor = (k) => fa.find((a) => norm(a.ref) === k) || (k.length >= 4 ? fa.find((a) => norm(a.ref).startsWith(k) || k.startsWith(norm(a.ref))) : null);
    const today = new Date().toISOString().slice(0, 10), cons = d.con.filter((c) => c.active && (c.rolling || !c.end_date || c.end_date >= today) && (!c.start_date || c.start_date <= today));
    const cFor = (k) => cons.filter((c) => norm(c.unit) === k);
    ROWS = d.fleet.map((f) => {
      const k = norm(f.unit), h = hpFor(k), a = faFor(k), cs = cFor(k);
      let cost = null, nbv = null, resid = null, age = null;
      if (a && a.cost && (a.purchase_date || a.nbv_open != null)) { const p = P[a.category] || { life_years: 5, residual_pct: 0 }, life = a.life_years != null ? +a.life_years : +p.life_years, res = a.residual_pct != null ? +a.residual_pct : +p.residual_pct, Lf = Math.max(1, Math.round(life * 12)); cost = +a.cost; resid = cost * res / 100; const mc = cost * (1 - res / 100) / Lf;
        if (a.nbv_open != null && a.nbv_open_date) { nbv = Math.max(resid, +a.nbv_open - mc * Math.max(0, NOW - mon(a.nbv_open_date))); age = a.purchase_date ? (NOW - mon(a.purchase_date)) / 12 : null; } else { const s = mon(a.purchase_date); nbv = NOW < s ? cost : Math.max(resid, cost - Math.min(NOW - s + 1, Lf) * mc); age = (NOW - s) / 12; } }
      const chd = +f.chargeable_days || 0, ytdc = +f.ytd_chargeable_days || 0;
      const rowx = { unit: f.unit, type: f.type || 'Other', onHire: (+f.on_hire_days || 0) > 0, util: chd ? Math.min(1, (+f.on_hire_days || 0) / chd) : null, fyUtil: ytdc ? Math.min(1, (+f.ytd_on_hire_days || 0) / ytdc) : null, rev: +f.ytd_revenue || 0, mrev: +f.revenue || 0,
        cust: [...new Set(cs.map((c) => c.customer))].join(', '), crate: cs.reduce((t, c) => t + (+c.monthly_rate || 0), 0), hasHP: !!h, owed: h ? h.owed : 0, settle: h ? h.settle : 0, pm: h ? h.pm : 0, lender: h ? [...h.lenders].join(', ') : '', hpEnd: h && h.end ? h.end : null,
        cost, nbv, resid, age, equity: nbv != null ? nbv - (h ? h.settle : 0) : null, faId: a && a.id };
      return rowx;
    });
    META = { month: d.fleet.length ? d.fleet[0].month : null };
  }

  const COLS = [['unit', 'Unit', 0], ['type', 'Type', 0], ['st', 'Status', 0], ['cust', 'Customer', 0], ['crate', 'Contract £/mo', 1], ['mrev', 'Last month hire', 1], ['rev', 'FY hire revenue', 1], ['util', 'Util (month)', 1], ['fyUtil', 'Util (FY)', 1],
    ['lender', 'Lender', 0], ['pm', 'HP / month', 1], ['owed', 'HP remaining', 1], ['settle', 'Est. settlement', 1], ['cost', 'Cost', 1], ['nbv', 'Book value', 1], ['resid', 'Residual', 1], ['equity', 'Book equity', 1]];

  function draw(el) {
    const R = ROWS, vis = R.filter((r) => (!S.type || r.type === S.type) && (!S.st || (S.st === 'On hire') === r.onHire) && (!S.hp || (S.hp === 'On HP') === r.hasHP) && (!S.q || (r.unit + ' ' + r.type + ' ' + r.cust + ' ' + r.lender).toLowerCase().includes(S.q)));
    const sum = (a, k) => a.reduce((t, r) => t + (r[k] || 0), 0), key = (r, k) => k === 'st' ? (r.onHire ? 1 : 0) : r[k];
    vis.sort((a, b) => { const x = key(a, S.sort), y = key(b, S.sort); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.dir; });
    const hpU = vis.filter((r) => r.hasHP), priced = vis.filter((r) => r.nbv != null), types = [...new Set(R.map((r) => r.type))].sort();
    const idle = vis.filter((r) => !r.onHire), idleHP = sum(idle, 'pm');
    const gross = sum(vis, 'mrev');
    const cell = (r, k) => { const v = r[k]; switch (k) {
      case 'unit': return `<b>${esc(r.unit)}</b>`; case 'type': return esc(r.type); case 'st': return `<span class="pill ${r.onHire ? 'g' : 'a'}">${r.onHire ? 'On hire' : 'Off hire'}</span>`; case 'cust': return esc(r.cust || '–'); case 'lender': return esc(r.lender || (r.hasHP ? '' : 'Owned'));
      case 'util': case 'fyUtil': return pc(v); case 'cost': case 'nbv': case 'resid': case 'equity': return v == null ? '<span class="hint">n/a</span>' : gbp(v);
      default: return v ? gbp(v) : '–'; } };
    const grp = new Map(); vis.forEach((r) => { if (!grp.has(r.type)) grp.set(r.type, []); grp.get(r.type).push(r); });
    el.innerHTML = X.head('Asset summary', 'Every fleet asset: what it earns, how hard it works, what is owed on it and what it is worth' + (META.month ? ' · hire data to ' + META.month.slice(0, 7) : '')) +
      X.tiles([{ l: 'Assets in view', v: vis.length, s: vis.filter((r) => r.onHire).length + ' on hire · ' + idle.length + ' off hire', c: 'o' },
        { l: 'FY hire revenue', v: gbp(sum(vis, 'rev')), s: gbp(gross) + ' last month' },
        { l: 'HP remaining', v: gbp(sum(vis, 'owed')), s: hpU.length + ' assets on HP · ' + gbp(sum(vis, 'pm')) + '/month' },
        { l: 'Est. settlement today', v: gbp(sum(vis, 'settle')), s: 'discounted at each agreement’s rate' },
        { l: 'Book value', v: gbp(sum(priced, 'nbv')), s: priced.length + ' of ' + vis.length + ' priced · residual ' + gbp(sum(priced, 'resid')) },
        { l: 'Book equity', v: gbp(sum(priced, 'equity')), s: 'book value less settlement', c: sum(priced, 'equity') < 0 ? 'r' : 'g' },
        { l: 'HP on idle assets', v: gbp(idleHP), s: idle.filter((r) => r.hasHP).length + ' off-hire assets still on HP', c: idleHP ? 'r' : '' }]) +
      `<div class="card"><div class="flt"><input type="search" id="as_q" placeholder="Search unit, customer, lender…" value="${esc(S.q)}"><select id="as_t"><option value="">All types</option>${types.map((t) => `<option ${S.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><select id="as_s"><option value="">On &amp; off hire</option>${['On hire', 'Off hire'].map((t) => `<option ${S.st === t ? 'selected' : ''}>${t}</option>`).join('')}</select><select id="as_h"><option value="">HP &amp; owned</option>${['On HP', 'Owned'].map((t) => `<option ${S.hp === t ? 'selected' : ''}>${t}</option>`).join('')}</select><button type="button" class="lnk" id="as_e">Expand / collapse groups</button><span class="cnt">${vis.length} of ${R.length}</span></div>
      <div class="hint">Grouped by equipment type; click a type to open its assets, click a column to sort. Settlement is an estimate (remaining payments discounted at the agreement rate). Book value uses the Fixed assets depreciation policy; residual is cost × residual %. Shared agreements are split across their units.</div>
      <div class="box2"><table id="as_tb"><thead><tr>${COLS.map(([k, t, n]) => `<th class="${n ? 'n' : ''}" data-k="${k}" style="cursor:pointer">${t}${S.sort === k ? (S.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${[...grp.entries()].sort((a, b) => sum(b[1], 'rev') - sum(a[1], 'rev')).map(([t, rs]) => {
        const o = S.open == null ? false : S.open.has(t), pr = rs.filter((r) => r.nbv != null);
        return `<tr class="ug-g" data-t="${esc(t)}" style="cursor:pointer;background:var(--soft,#f1f4fa);font-weight:600"><td colspan="3">${o ? '▾' : '▸'} ${esc(t)} (${rs.length})</td><td>${rs.filter((r) => r.onHire).length} on hire</td><td class="n">${gbp(sum(rs, 'crate'))}</td><td class="n">${gbp(sum(rs, 'mrev'))}</td><td class="n">${gbp(sum(rs, 'rev'))}</td><td class="n">${pc(avg(rs, 'util'))}</td><td class="n">${pc(avg(rs, 'fyUtil'))}</td><td></td><td class="n">${gbp(sum(rs, 'pm'))}</td><td class="n">${gbp(sum(rs, 'owed'))}</td><td class="n">${gbp(sum(rs, 'settle'))}</td><td class="n">${gbp(sum(pr, 'cost'))}</td><td class="n">${gbp(sum(pr, 'nbv'))}</td><td class="n">${gbp(sum(pr, 'resid'))}</td><td class="n">${gbp(sum(pr, 'equity'))}</td></tr>` +
          (o ? rs.map((r) => `<tr>${COLS.map(([k, , n]) => `<td class="${n ? 'n' : ''}">${cell(r, k)}</td>`).join('')}</tr>`).join('') : ''); }).join('')}</tbody></table></div></div>`;
    const re = () => draw(el);
    $('as_q').oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); if (S.q && S.open == null) S.open = new Set(); if (S.q) vis.forEach((r) => S.open.add(r.type)); re(); const q = $('as_q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); };
    $('as_t').onchange = (e) => { S.type = e.target.value; re(); }; $('as_s').onchange = (e) => { S.st = e.target.value; re(); }; $('as_h').onchange = (e) => { S.hp = e.target.value; re(); };
    $('as_e').onclick = () => { S.open = S.open && S.open.size ? new Set() : new Set(R.map((r) => r.type)); re(); };
    el.querySelectorAll('tr.ug-g').forEach((tr) => tr.onclick = () => { if (S.open == null) S.open = new Set(); const t = tr.dataset.t; S.open.has(t) ? S.open.delete(t) : S.open.add(t); re(); });
    el.querySelectorAll('th[data-k]').forEach((th) => th.onclick = () => { const k = th.dataset.k; if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = ['unit', 'type', 'cust', 'lender'].includes(k) ? 1 : -1; } re(); });
  }
  function avg(a, k) { const v = a.map((r) => r[k]).filter((x) => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; }

  X.routes.assets = async (el) => { el.innerHTML = X.head('Asset summary', 'Loading…') + '<div class="empty">Loading…</div>'; await build(); draw(el); };
})();
