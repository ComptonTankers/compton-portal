/* SALES STOCK & OPPORTUNITY – what each unit for sale is worth to the business once sold:
   asking price against book value (profit on sale) and against HP still owed (cash it releases),
   when we expect to sell it (feeds the cashflow and profit on disposal), and which hire units
   are worth more to us sold than kept. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const HELD = (s) => !['sold', 'moved_to_hire', 'written_off'].includes(s.status);
  const TYPEMAP = [[/petroleum.*rigid|fuel.*rigid/i, 'rigid_fuel'], [/petroleum|aviation/i, 'artic_petroleum'], [/bitumen/i, 'artic_bitumen'], [/combination/i, 'rigid_combi'], [/waste.*artic/i, 'artic_waste'], [/waste|gully/i, 'rigid_waste'], [/tractor/i, 'tractor_unit']];
  const stockType = (t) => (TYPEMAP.find(([re]) => re.test(t || '')) || [null, 'artic_petroleum'])[1];
  const ym = (d) => (d ? String(d).slice(0, 7) : '');
  const mlab = (m) => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  let ST = [], A = null, CF = [], CFM = [], FAS = [], S = { opp: 'idle', sort: 'cash' };

  async function load() {
    try { if (X.fa) { await X.fa.load(); FAS = X.fa.get().assets.filter((a) => a.active); } } catch (e) { FAS = []; }
    [ST, A, CF, CFM] = await Promise.all([all('stock', 'created_at.desc'), X.assetData(), api("cf_entries?select=month,line,forecast&line=in.(asset_sales,hp_settlement)").catch(() => []), api('cf_months?select=month&order=month').catch(() => [])]);
  }
  // value of one stock unit: book value, HP settlement, cash released and profit on sale
  function val(s) {
    const fl = s.fa_id ? FAS.find((x) => x.id === s.fa_id) : null, k = A.norm(fl ? fl.ref : s.reg), fa = s.source === 'purchased' ? null : A.faFor(k), hp = s.source === 'purchased' ? null : A.hpFor(k);
    const nbv = fa ? A.nbvOf(fa) : null, settle = s.hp_settle_override != null ? +s.hp_settle_override : hp ? hp.settle : 0;
    const ask = s.asking_price != null ? +s.asking_price : null, basis = nbv != null ? nbv : s.cost != null ? +s.cost : null;
    const days = Math.max(0, Math.round((Date.now() - new Date(s.created_at)) / 864e5));
    return { nbv, basis, settle, hpKnown: !!hp || s.hp_settle_override != null, ask, cash: ask != null ? ask - settle : null, profit: ask != null && basis != null ? ask - basis : null, days, pm: hp ? hp.pm : 0, faId: fa && fa.id };
  }
  X.salesStock = { load, val, held: () => ST.filter(HELD) };   // used by the board pack

  X.routes['p-sales'] = async function (el) {
    el.innerHTML = X.head('Dealership stock', 'What each unit is worth to us when sold, and when the cash lands') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Dealership stock', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    draw(el);
  };

  function draw(el) {
    const held = ST.filter(HELD).map((s) => Object.assign({ s }, val(s)));
    const sum = (k, rows = held) => rows.reduce((t, r) => t + (r[k] || 0), 0);
    const priced = held.filter((r) => r.ask != null);
    const fy0 = (() => { const d = new Date(); const y = d.getMonth() >= 4 ? d.getFullYear() : d.getFullYear() - 1; return y + '-05-01'; })();
    const soldFY = ST.filter((s) => s.status === 'sold' && (s.sold_at || '') >= fy0);
    // forecast effect by expected sale month
    const now = new Date(), months = Array.from({ length: 6 }, (_, i) => { const t = now.getFullYear() * 12 + now.getMonth() + i; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); });
    const fc = (m, line) => { const r = CF.find((x) => ym(x.month) === m && x.line === line); return r && r.forecast != null ? +r.forecast : null; };
    const byM = months.map((m) => { const rs = priced.filter((r) => ym(r.s.expected_sale) === m); const ex = sum('ask', rs);
      return { m, n: rs.length, ex, inc: ex * 1.2, settle: sum('settle', rs), profit: sum('profit', rs), cfSales: fc(m, 'asset_sales'), cfSettle: fc(m, 'hp_settlement'), inCF: CFM.some((x) => ym(x.month) === m) }; });
    const unsched = priced.filter((r) => !r.s.expected_sale || ym(r.s.expected_sale) > months[5]).length;
    // opportunity: hire units not already in sales stock
    const inStock = new Set(ST.filter(HELD).map((s) => A.norm(s.reg)));
    let opp = A.rows.filter((r) => !inStock.has(A.norm(r.unit)) && r.nbv != null).map((r) => { const fa = A.faFor(A.norm(r.unit)), est = fa && fa.est_market_value != null ? +fa.est_market_value : null, v = est != null ? est : r.nbv;
      return Object.assign({}, r, { est, v, oProfit: v - r.nbv, oCash: v - r.settle, income: r.crate || 0, net: (r.pm || 0) - (r.crate || 0), faId: fa && fa.id }); });
    if (S.opp === 'idle') opp = opp.filter((r) => !r.onHire); else if (S.opp === 'low') opp = opp.filter((r) => !r.onHire || (r.fyUtil != null && r.fyUtil < 0.5));
    opp.sort((a, b) => (S.sort === 'cash' ? b.oCash - a.oCash : S.sort === 'profit' ? b.oProfit - a.oProfit : (a.fyUtil ?? 0) - (b.fyUtil ?? 0)));

    el.innerHTML = X.head('Dealership stock', 'Asking price against book value (profit on sale) and against HP still owed (cash released). Values ex VAT unless marked.') +
      X.tiles([
        { l: 'Units for sale', v: held.length, s: priced.length + ' with an asking price' },
        { l: 'Asking price total', v: gbp(sum('ask', priced)), s: 'book value ' + gbp(sum('basis', priced)) },
        { l: 'Profit on sale', v: gbp(sum('profit', priced)), s: 'asking price less book value', c: 'g' },
        { l: 'Cash released', v: gbp(sum('cash', priced)), s: 'after settling HP of ' + gbp(sum('settle', priced)), c: 'o' },
        { l: 'Average days in stock', v: held.length ? Math.round(sum('days') / held.length) : '–', s: held.filter((r) => r.days > 90).length + ' over 90 days' },
        { l: 'Sold this financial year', v: soldFY.length, s: gbp(soldFY.reduce((t, s) => t + (+s.sale_price || +s.asking_price || 0), 0)) + ' sales' }]) +
      `<div class="card"><h3>Units for sale</h3><div class="hint">Book value from the fixed asset register; HP settlement estimated from the HP schedule (type your own over it if you have a settlement figure). Set the month you expect to sell so the cash and profit feed the forecasts.</div>
      <div class="box2"><table><thead><tr><th>Unit</th><th>Bought as</th><th>Status</th><th class="n">Days in stock</th><th class="n">Asking £</th><th class="n">Book value</th><th class="n">Profit on sale</th><th class="n">HP settlement</th><th class="n">Cash released</th><th>Expected sale</th><th class="n">Enquiries</th><th></th></tr></thead><tbody>
      ${held.length ? held.map((r) => `<tr><td><b>${esc(r.s.reg)}</b><div class="small muted">${esc(r.s.vehicle_type || '')}</div></td><td class="small"><select data-src="${r.s.id}"><option value="purchased" ${r.s.source !== 'ex_fleet' ? 'selected' : ''}>Bought for resale</option><option value="ex_fleet" ${r.s.source === 'ex_fleet' ? 'selected' : ''}>Ex-fleet</option></select>${r.s.source === 'ex_fleet' ? `<br><input data-faref="${r.s.id}" list="sl_fal" value="${esc((FAS.find((x) => x.id === r.s.fa_id) || {}).ref || '')}" placeholder="Asset register ref" style="width:110px;margin-top:3px">` : ''}</td><td>${esc((r.s.status || '').replace(/_/g, ' '))}</td>
        <td class="n" style="${r.days > 90 ? 'color:#b3261e;font-weight:600' : ''}">${r.days}</td>
        <td class="n"><input data-ask="${r.s.id}" type="number" step="100" value="${r.ask ?? ''}" style="width:100px;text-align:right"></td>
        <td class="n">${r.nbv != null ? gbp(r.nbv) : r.s.cost != null ? `<span title="Not in the fixed asset register – using cost">${gbp(+r.s.cost)}*</span>` : '<span class="muted">–</span>'}</td>
        <td class="n" style="color:${r.profit == null ? 'inherit' : r.profit < 0 ? '#b3261e' : '#1b7f4b'}">${r.profit != null ? gbp(r.profit) : '–'}</td>
        <td class="n"><input data-settle="${r.s.id}" type="number" step="100" value="${r.s.hp_settle_override ?? ''}" placeholder="${r.hpKnown ? Math.round(r.settle) : 'none'}" style="width:100px;text-align:right" title="Leave blank to use the estimate from the HP schedule"></td>
        <td class="n"><b>${r.cash != null ? gbp(r.cash) : '–'}</b></td>
        <td><input data-sale="${r.s.id}" type="month" value="${ym(r.s.expected_sale)}"></td>
        <td class="n"><button class="mini" data-enq="${r.s.id}" data-d="-1">−</button> ${r.s.enquiries || 0} <button class="mini" data-enq="${r.s.id}" data-d="1">+</button></td><td style="white-space:nowrap"><a class="mini" href="#/p-quotes?stock=${r.s.id}" style="text-decoration:none">Quote</a> <button class="mini" data-wo="${r.s.id}">Scrap / write off</button></td></tr>`).join('') : '<tr><td colspan="12" class="empty">No units for sale.</td></tr>'}
      </tbody></table></div><datalist id="sl_fal">${FAS.filter((a) => !a.disposed_date).map((a) => `<option value="${esc(a.ref)}">${esc(a.description || '')}</option>`).join('')}</datalist><div class="small muted" style="margin-top:6px">* bought for resale (not on the fixed asset register), so cost is used instead of book value. <b>Ex-fleet</b> units are on the fixed asset register: selling or scrapping them here records the disposal there too.</div><span id="sl_msg" class="small"></span></div>

      <div class="card"><h3>Effect on cash and profit</h3><div class="hint">From the expected sale month of each priced unit. Cash in includes VAT (paid over at the next VAT return). ${unsched ? `<b>${unsched}</b> priced unit${unsched > 1 ? 's have' : ' has'} no sale month in the next 6 months and ${unsched > 1 ? 'are' : 'is'} left out.` : ''}</div>
      <div class="box2"><table><thead><tr><th>Month</th><th class="n">Units</th><th class="n">Sales ex VAT</th><th class="n">Cash in inc VAT</th><th class="n">HP settlements</th><th class="n">Net cash</th><th class="n">Profit on disposal</th><th class="n">Cashflow forecast now: sales / HP settlements</th></tr></thead><tbody>
      ${byM.map((r) => `<tr><td>${mlab(r.m)}</td><td class="n">${r.n || ''}</td><td class="n">${r.n ? gbp(r.ex) : ''}</td><td class="n">${r.n ? gbp(r.inc) : ''}</td><td class="n">${r.n ? gbp(r.settle) : ''}</td><td class="n"><b>${r.n ? gbp(r.inc - r.settle) : ''}</b></td><td class="n">${r.n ? gbp(r.profit) : ''}</td>
        <td class="n muted">${r.inCF ? `${r.cfSales != null ? gbp(r.cfSales) : '–'} / ${r.cfSettle != null ? gbp(r.cfSettle) : '–'}` : 'not in forecast'}</td></tr>`).join('')}
      </tbody></table></div>
      <div style="margin-top:8px"><button class="mini pri2" id="sl_tocf">Put these into the cashflow forecast</button> <span class="small muted">Replaces the forecast asset sales and HP settlement for the months above that have sales in them. Sales not held as stock here (sold straight from the fleet) would need adding back by hand.</span> <span id="sl_cfmsg" class="small"></span></div></div>

      <div class="card"><h3>Opportunity: hire units worth more sold?</h3><div class="hint">Hire fleet units not already in sales stock. Type an estimated sale value where you know the market (blank uses book value). <b>Cash released</b> = value less HP settlement. <b>Monthly effect</b> = HP no longer paid less contract income lost.</div>
      <div class="form" style="max-width:600px;margin-bottom:8px"><div><label>Show</label><select id="op_f"><option value="idle" ${S.opp === 'idle' ? 'selected' : ''}>Off hire now</option><option value="low" ${S.opp === 'low' ? 'selected' : ''}>Off hire or under 50% utilised</option><option value="all" ${S.opp === 'all' ? 'selected' : ''}>All hire units</option></select></div>
        <div><label>Sort by</label><select id="op_s"><option value="cash" ${S.sort === 'cash' ? 'selected' : ''}>Cash released</option><option value="profit" ${S.sort === 'profit' ? 'selected' : ''}>Profit on sale</option><option value="util" ${S.sort === 'util' ? 'selected' : ''}>Lowest utilisation</option></select></div></div>
      ${X.tiles([{ l: 'Units shown', v: opp.length, s: 'not in sales stock' }, { l: 'Value if sold', v: gbp(opp.reduce((t, r) => t + r.v, 0)), s: 'book value ' + gbp(opp.reduce((t, r) => t + r.nbv, 0)) }, { l: 'Cash released', v: gbp(opp.reduce((t, r) => t + r.oCash, 0)), s: 'after HP of ' + gbp(opp.reduce((t, r) => t + r.settle, 0)), c: 'o' }, { l: 'Monthly effect', v: gbp(opp.reduce((t, r) => t + r.net, 0)), s: 'HP saved less contract income lost' }])}
      <div class="box2"><table><thead><tr><th>Unit</th><th>Type</th><th>Now</th><th class="n">Utilisation (on record)</th><th class="n">Contract £/mo</th><th class="n">HP £/mo</th><th class="n">Book value</th><th class="n">Est. sale value</th><th class="n">Profit on sale</th><th class="n">HP settlement</th><th class="n">Cash released</th><th class="n">Monthly effect</th><th></th></tr></thead><tbody>
      ${opp.length ? opp.slice(0, 150).map((r) => `<tr><td><b>${esc(r.unit)}</b></td><td class="small">${esc(r.type)}</td><td>${r.onHire ? 'On hire' : '<span style="color:#B8470F">Idle</span>'}</td><td class="n">${r.fyUtil != null ? Math.round(r.fyUtil * 100) + '%' : '–'}</td><td class="n">${r.crate ? gbp(r.crate) : '–'}</td><td class="n">${r.pm ? gbp(r.pm) : '–'}</td>
        <td class="n">${gbp(r.nbv)}</td><td class="n">${r.faId ? `<input data-est="${r.faId}" type="number" step="500" value="${r.est ?? ''}" placeholder="${Math.round(r.nbv)}" style="width:100px;text-align:right">` : '–'}</td>
        <td class="n" style="color:${r.oProfit < 0 ? '#b3261e' : '#1b7f4b'}">${gbp(r.oProfit)}</td><td class="n">${r.settle ? gbp(r.settle) : '–'}</td><td class="n"><b>${gbp(r.oCash)}</b></td><td class="n" style="color:${r.net < 0 ? '#b3261e' : '#1b7f4b'}">${gbp(r.net)}</td>
        <td><button class="mini" data-tostock="${esc(r.unit)}">Add to sales stock</button></td></tr>`).join('') : '<tr><td colspan="13" class="empty">No units match.</td></tr>'}
      </tbody></table></div><span id="op_msg" class="small"></span></div>`;
    wire(el, byM, opp);
  }

  const patch = (t, id, body) => api(t + '?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  function wire(el, byM, opp) {
    const say = (id, t, ok) => { const m = $(id); if (m) m.innerHTML = `<span style="color:${ok ? '#1b7f4b' : '#b3261e'}">${esc(t)}</span>`; };
    const redraw = async () => { await load(); draw(el); };
    el.querySelectorAll('[data-ask]').forEach((i) => i.onchange = async () => { try { await patch('stock', i.dataset.ask, { asking_price: i.value === '' ? null : +i.value }); await redraw(); } catch (e) { say('sl_msg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-settle]').forEach((i) => i.onchange = async () => { try { await patch('stock', i.dataset.settle, { hp_settle_override: i.value === '' ? null : +i.value }); await redraw(); } catch (e) { say('sl_msg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-sale]').forEach((i) => i.onchange = async () => { try { await patch('stock', i.dataset.sale, { expected_sale: i.value ? i.value + '-01' : null }); await redraw(); } catch (e) { say('sl_msg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-enq]').forEach((b) => b.onclick = async () => { const s = ST.find((x) => x.id == b.dataset.enq); try { await patch('stock', s.id, { enquiries: Math.max(0, (s.enquiries || 0) + +b.dataset.d) }); await redraw(); } catch (e) { say('sl_msg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-est]').forEach((i) => i.onchange = async () => { try { await patch('fa_assets', i.dataset.est, { est_market_value: i.value === '' ? null : +i.value }); await redraw(); } catch (e) { say('op_msg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-src]').forEach((i) => i.onchange = async () => { const s = ST.find((x) => x.id == i.dataset.src), fa = i.value === 'ex_fleet' ? FAS.find((a) => A.norm(a.ref) === A.norm(s.reg)) : null;
      try { await patch('stock', s.id, { source: i.value, fa_id: i.value === 'ex_fleet' ? (fa ? fa.id : s.fa_id) : null }); await redraw(); } catch (e) { say('sl_msg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-faref]').forEach((i) => i.onchange = async () => { const fa = FAS.find((a) => A.norm(a.ref) === A.norm(i.value));
      if (i.value && !fa) { say('sl_msg', i.value + ' is not on the fixed asset register.'); return; }
      try { await patch('stock', i.dataset.faref, { fa_id: fa ? fa.id : null }); await redraw(); } catch (e) { say('sl_msg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-wo]').forEach((b) => b.onclick = () => { const s = ST.find((x) => x.id == b.dataset.wo), fa = s.fa_id ? FAS.find((x) => x.id === s.fa_id) : null; if (!X.dispose) return;
      const bg = X.dispose.dialog('Scrap / write off ' + esc(s.reg), `<div class="note">${s.source === 'ex_fleet' ? 'Ex-fleet unit' + (fa ? ' – the disposal is recorded on the fixed asset register (' + esc(fa.ref) + ') and it comes off the fleet register.' : ' – <b>not linked to the asset register yet</b>, so only the stock record changes.') : 'Bought for resale – only the stock record changes.'}</div>
        <label>Date</label><input id="wo_dt" type="date" value="${new Date().toISOString().slice(0, 10)}"><label>How</label><select id="wo_mt"><option>Scrapped</option><option>Written off</option><option>Stolen / insurance</option></select>
        <label>Scrap value / insurance received £ (ex VAT, if any)</label><input id="wo_pr" type="number" step="0.01" placeholder="0"><label>Reason</label><input id="wo_rs" placeholder="e.g. beyond economic repair">`, 'Record it', async () => {
        const q = (id) => bg.querySelector('#' + id).value.trim(), dt = q('wo_dt'), pr = q('wo_pr') === '' ? null : +q('wo_pr'), mt = q('wo_mt'); if (!dt) throw new Error('Choose a date');
        await patch('stock', s.id, { status: 'written_off', sold_at: dt, sale_price: pr, write_off_reason: (mt + (q('wo_rs') ? ' – ' + q('wo_rs') : '')) });
        if (fa && !fa.disposed_date) await X.dispose.record(fa, { date: dt, method: mt, proceeds: pr, notes: q('wo_rs') });
        if (pr) await X.dispose.addCf('asset_sales', dt.slice(0, 7), Math.round(pr * 1.2 * 100) / 100);
        await redraw(); say('sl_msg', s.reg + ' recorded as ' + mt.toLowerCase() + '.', 1); }); });
    $('op_f').onchange = (e) => { S.opp = e.target.value; draw(el); };
    $('op_s').onchange = (e) => { S.sort = e.target.value; draw(el); };
    el.querySelectorAll('[data-tostock]').forEach((b) => b.onclick = async () => {
      const r = opp.find((x) => x.unit === b.dataset.tostock); if (!r || !confirm('Add ' + r.unit + ' to sales stock at ' + gbp(r.v) + '? It will need an inspection before it can be advertised.')) return;
      try { await api('stock', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ reg: r.unit, source: 'ex_fleet', fa_id: r.faId || null, vehicle_type: stockType(r.type), status: 'awaiting_inspection', cost: Math.round(r.nbv), asking_price: r.est != null ? r.est : null, notes: 'Added from Sales opportunity', advert: { avail: 'sale', cond: 'Used' } }) });
        await redraw(); say('op_msg', r.unit + ' added to sales stock ✓ – create its inspection link in Stock & inspections', 1); } catch (e) { say('op_msg', 'Could not add: ' + e.message); } });
    $('sl_tocf').onclick = async () => {
      const rows = byM.filter((r) => r.n && r.inCF), skipped = byM.filter((r) => r.n && !r.inCF);
      if (!rows.length) { say('sl_cfmsg', 'No sales with an expected month inside the cashflow forecast.'); return; }
      if (!confirm('Replace the cashflow forecast for ' + rows.map((r) => mlab(r.m)).join(', ') + ':\n' + rows.map((r) => `${mlab(r.m)}: asset sales ${gbp(r.inc)} (was ${r.cfSales != null ? gbp(r.cfSales) : '–'}), HP settlements ${gbp(r.settle)} (was ${r.cfSettle != null ? gbp(r.cfSettle) : '–'})`).join('\n'))) return;
      try { const body = []; rows.forEach((r) => { body.push({ month: r.m + '-01', line: 'asset_sales', forecast: Math.round(r.inc) }, { month: r.m + '-01', line: 'hp_settlement', forecast: Math.round(r.settle) }); });
        await api('cf_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
        await redraw(); say('sl_cfmsg', 'Cashflow forecast updated ✓' + (skipped.length ? ' (' + skipped.map((r) => mlab(r.m)).join(', ') + ' not in the forecast yet)' : ''), 1);
      } catch (e) { say('sl_cfmsg', 'Could not update: ' + e.message); } };
  }
})();
