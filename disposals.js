/* Settling HP agreements and recording asset sales (dialogs shared by the HP and Fixed asset pages). */
(function () {
  const X = window.CT; if (!X) return;
  const { api, gbp, esc, mon } = X;
  const norm = (u) => String(u || '').replace(/\s+/g, '').toUpperCase();
  const css = document.createElement('style');
  css.textContent = '.dlg-bg{position:fixed;inset:0;background:rgba(22,32,45,.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}.dlg{background:#fff;border-radius:12px;padding:22px;width:min(96vw,460px);max-height:92vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)}.dlg h3{margin:0 0 6px;font-size:22px}.dlg label{display:block;font-size:13px;margin:12px 0 4px}.dlg input,.dlg select{width:100%;font:inherit;padding:8px 10px;border:1px solid #cdd5e0;border-radius:8px}.dlg .acts{display:flex;gap:8px;margin-top:18px;justify-content:flex-end}.dlg .acts button{font:inherit;padding:9px 16px;border-radius:8px;border:1px solid #cdd5e0;background:#fff;cursor:pointer}.dlg .acts button.go{background:#E3641D;border-color:#E3641D;color:#fff;font-weight:600}.dlg .note{font-size:13px;color:#5B6675;margin-top:8px}.dlg .err{color:#b3261e;min-height:18px;font-size:13px}';
  document.head.appendChild(css);

  function dialog(title, bodyHTML, okLabel, onOk) {
    const bg = document.createElement('div'); bg.className = 'dlg-bg';
    bg.innerHTML = `<div class="dlg" role="dialog"><h3>${title}</h3>${bodyHTML}<div class="err"></div><div class="acts"><button type="button" class="no">Cancel</button><button type="button" class="go">${okLabel}</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove(), err = bg.querySelector('.err');
    bg.querySelector('.no').onclick = close; bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    bg.querySelector('.go').onclick = async (e) => { e.target.disabled = true; err.textContent = ''; try { await onOk(bg); close(); } catch (ex) { err.textContent = 'Could not save: ' + ex.message; e.target.disabled = false; } };
    return bg;
  }
  // add an amount to a Cash flow forecast cell (only if that month exists in the cash flow)
  async function addCf(line, ym, amount) {
    if (!amount) return;
    const m = await api('cf_months?select=month&month=eq.' + ym + '-01'); if (!m.length) return;
    const cur = await api('cf_entries?select=forecast&month=eq.' + ym + '-01&line=eq.' + line);
    const v = Math.round(((cur[0] && +cur[0].forecast || 0) + amount) * 100) / 100;
    await api('cf_entries?on_conflict=month,line', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ month: ym + '-01', line, forecast: v, updated_at: new Date().toISOString() }) });
  }
  const today = () => new Date().toISOString().slice(0, 10);
  async function settleAgreement(a, date, amount, note) {
    await api('hp_agreements?id=eq.' + a.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false, settled_date: date, settlement_amount: amount, notes: ((a.notes ? a.notes + ' · ' : '') + 'Settled ' + date + (note ? ' – ' + note : '')).slice(0, 500) }) });
    await addCf('hp_settlement', date.slice(0, 7), amount);
  }
  const METHODS = ['Sold', 'Part exchange', 'Scrapped', 'Written off', 'Transferred', 'Stolen / insurance'];
  const FLEET_REASON = { Sold: 'Sold', 'Part exchange': 'Sold', Scrapped: 'Scrapped / disposed', 'Written off': 'Scrapped / disposed', 'Stolen / insurance': 'Scrapped / disposed', Transferred: 'Moved off fleet' };
  const monOf = (d) => { const x = new Date(d); return x.getFullYear() * 12 + x.getMonth(); };
  // book value just before it went (charges stop the month it is disposed of)
  function bookValueAt(fa, date) { if (!X.fa || !X.fa.sched) return null; const live = Object.assign({}, fa, { disposed_date: null }); if (!X.fa.sched(live)) return null; return X.fa.nbvAt(live, monOf(date || today()) - 1); }
  const sameUnit = (u, fa) => norm(u.fa_ref || u.unit) === norm(fa.ref) || norm(u.unit) === norm(fa.ref);
  async function record(fa, d) {
    const body = { disposed_date: d.date, disposal_method: d.method || 'Sold', disposal_buyer: d.buyer || null, disposal_proceeds: d.proceeds === '' || d.proceeds == null ? null : +d.proceeds,
      disposal_invoice: d.invoice || null, disposal_notes: d.notes || null, disposal_quote_id: d.quote_id || fa.disposal_quote_id || null };
    await api('fa_assets?id=eq.' + fa.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    const hit = (await api('assets?select=id,unit,fa_ref,active')).filter((u) => u.active && sameUnit(u, fa));
    for (const u of hit) await api('assets?id=eq.' + u.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: false, removed_reason: FLEET_REASON[body.disposal_method] || 'Sold', removed_at: d.date, updated_at: new Date().toISOString() }) });
    Object.assign(fa, body); return hit.length;
  }
  async function undo(fa) {
    await api('fa_assets?id=eq.' + fa.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ disposed_date: null, disposal_proceeds: null, disposal_method: null, disposal_buyer: null, disposal_invoice: null, disposal_quote_id: null, disposal_notes: null }) });
    for (const u of (await api('assets?select=id,unit,fa_ref,active')).filter((u) => !u.active && sameUnit(u, fa)))
      await api('assets?id=eq.' + u.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: true, removed_reason: null, removed_at: null, updated_at: new Date().toISOString() }) });
  }
  X.dispose = {
    dialog, addCf,
    settle(a, est, done) {
      const bg = dialog('Settle HP agreement', `<div class="note"><b>${esc(a.agreement_ref || '#' + a.id)}</b> · ${esc(a.finance_company || '')}<br>It leaves the HP overview, forecasts and exposure from the settlement month, and the settlement is added to the Cash flow as an HP settlement outflow.</div>
        <label>Settlement date</label><input id="d_dt" type="date" value="${today()}"><label>Settlement amount £</label><input id="d_am" type="number" step="0.01" value="${Math.round(est || 0)}"><label>Note (optional)</label><input id="d_nt" placeholder="e.g. unit sold">`, 'Settle agreement', async () => {
        const dt = bg.querySelector('#d_dt').value, am = parseFloat(bg.querySelector('#d_am').value) || 0; if (!dt) throw new Error('Choose a date');
        await settleAgreement(a, dt, am, bg.querySelector('#d_nt').value.trim()); await X.loadFinance(true); done && done();
      });
    },
    async reinstate(a, done) {
      await api('hp_agreements?id=eq.' + a.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: true, settled_date: null, settlement_amount: null }) });
      await X.loadFinance(true); done && done();
    },
    // record a disposal (sold, part-ex, scrapped …), optionally settle the HP on it, and take the unit off the fleet register
    sold(asset, info, done, preset) {   // info: {nbv, agreements:[{a, est, shared}]}; preset: {date, proceeds, buyer, method, invoice, quote_id}
      const ag = info.agreements || [], p = Object.assign({ date: asset.disposed_date || today(), method: asset.disposal_method || 'Sold', buyer: asset.disposal_buyer || '', proceeds: asset.disposal_proceeds ?? '', invoice: asset.disposal_invoice || '', notes: asset.disposal_notes || '' }, preset || {});
      const bg = dialog('Record disposal of ' + esc(asset.ref), `<div class="note">${esc(asset.description || '')}. Depreciation stops from the month it goes, and it comes off the fleet register so it no longer shows as available.</div>
        <label>Date it went</label><input id="s_dt" type="date" value="${esc(p.date)}">
        <label>How</label><select id="s_mt">${METHODS.map((m) => `<option ${m === p.method ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <label>Buyer / where it went</label><input id="s_by" value="${esc(p.buyer)}">
        <label>Proceeds £ (ex VAT)</label><input id="s_pr" type="number" step="0.01" placeholder="0" value="${esc(p.proceeds)}">
        <label>Sales invoice no.</label><input id="s_iv" value="${esc(p.invoice)}" placeholder="e.g. Xero INV-1234">
        <label>Notes</label><input id="s_nt" value="${esc(p.notes)}">
        <div id="s_res" class="note"></div>
        ${ag.length ? '<label>HP on this asset</label>' + ag.map((x, i) => `<div style="margin:6px 0"><label style="display:flex;gap:8px;align-items:flex-start;margin:0"><input type="checkbox" data-ag="${i}" checked style="width:auto;margin-top:3px"><span>Settle <b>${esc(x.a.agreement_ref || '#' + x.a.id)}</b> (${esc((x.a.finance_company || '').replace(/ (PLC|LTD|LIMITED)$/i, ''))}) – est. ${gbp(x.est)}${x.shared ? ' <span style="color:#b7791f">· covers other assets too</span>' : ''}</span></label><input type="number" step="0.01" data-am="${i}" value="${Math.round(x.est)}" style="margin-top:4px"></div>`).join('') : '<div class="note">No live HP agreement is linked to this asset.</div>'}`,
        'Record disposal', async () => {
          const q = (id) => bg.querySelector('#' + id).value.trim(), dt = q('s_dt'), pr = q('s_pr') === '' ? null : parseFloat(q('s_pr')), mt = q('s_mt'); if (!dt) throw new Error('Choose a date');
          await record(asset, { date: dt, method: mt, buyer: q('s_by'), proceeds: pr, invoice: q('s_iv'), notes: q('s_nt'), quote_id: p.quote_id });
          if (pr && ['Sold', 'Part exchange'].includes(mt) && !asset._cfDone) await addCf('asset_sales', dt.slice(0, 7), Math.round(pr * 1.2 * 100) / 100);
          for (const cb of bg.querySelectorAll('[data-ag]:checked')) { const i = +cb.dataset.ag; await settleAgreement(ag[i].a, dt, parseFloat(bg.querySelector(`[data-am="${i}"]`).value) || 0, 'unit ' + asset.ref + ' ' + mt.toLowerCase()); }
          await X.loadFinance(true); done && done();
        });
      const res = bg.querySelector('#s_res'), upd = () => { const pv = parseFloat(bg.querySelector('#s_pr').value), bv = bookValueAt(asset, bg.querySelector('#s_dt').value);
        res.innerHTML = bv == null ? 'No cost / purchase date on the register, so there is no book value to compare.' : 'Book value when it went: <b>' + gbp(bv) + '</b>' + (isNaN(pv) ? '' : ' · ' + (pv - bv >= 0 ? 'Profit on disposal: <b style="color:#15803D">' + gbp(pv - bv) : 'Loss on disposal: <b style="color:#b3261e">' + gbp(bv - pv)) + '</b>'); };
      bg.querySelector('#s_pr').addEventListener('input', upd); bg.querySelector('#s_dt').addEventListener('change', upd); upd();
    },
    // works out the live HP on an asset, then opens the disposal dialog
    async open(asset, done, preset) {
      const d = await X.loadFinance(), NOW = X.NOW, k = norm(asset.ref);
      const pvEst = (a) => { const rt = a.interest_rate != null ? +a.interest_rate / (+a.interest_rate > 1 ? 100 : 1) : 0.08, r = Math.pow(1 + rt, 1 / 12) - 1; return d.sch.filter((x) => x.agreement_id === a.id && x.m >= NOW).reduce((t, x) => t + x.amount / Math.pow(1 + r, Math.max(0, x.m - NOW)), 0); };
      const agreements = asset.disposed_date ? [] : [...new Set(d.ass.filter((x) => { const u = norm(x.unit); return u === k || (k.length >= 4 && u.startsWith(k)); }).map((x) => x.agreement_id))].map((id) => d.agr.find((g) => g.id === id)).filter((g) => g && g.active)
        .map((g) => { const as = d.ass.filter((x) => x.agreement_id === g.id), tot = as.reduce((t, x) => t + (+x.share || 1), 0) || 1, mine = as.filter((x) => norm(x.unit) === k || (k.length >= 4 && norm(x.unit).startsWith(k))).reduce((t, x) => t + (+x.share || 1), 0); return { a: g, est: pvEst(g) * (as.length > 1 ? mine / tot : 1), shared: as.length > 1 }; });
      if (asset.disposed_date) asset._cfDone = true;
      X.dispose.sold(asset, { agreements }, done, preset);
    },
    async unsell(asset, done) { await undo(asset); done && done(); },
    METHODS, bookValueAt, record
  };
})();
