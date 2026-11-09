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
    // asset sold: record the sale and (optionally) settle the HP on it
    sold(asset, info, done) {   // info: {nbv, agreements:[{a, est, shared}]}
      const ag = info.agreements || [];
      const bg = dialog('Mark ' + esc(asset.ref) + ' as sold', `<div class="note">${esc(asset.description || '')}. Depreciation stops from the sale month. Net book value now: <b>${gbp(info.nbv || 0)}</b>.</div>
        <label>Date sold</label><input id="s_dt" type="date" value="${today()}"><label>Sale price £ (ex VAT)</label><input id="s_pr" type="number" step="0.01" placeholder="0">
        <div id="s_res" class="note"></div>
        ${ag.length ? '<label>HP on this asset</label>' + ag.map((x, i) => `<div style="margin:6px 0"><label style="display:flex;gap:8px;align-items:flex-start;margin:0"><input type="checkbox" data-ag="${i}" checked style="width:auto;margin-top:3px"><span>Settle <b>${esc(x.a.agreement_ref || '#' + x.a.id)}</b> (${esc((x.a.finance_company || '').replace(/ (PLC|LTD|LIMITED)$/i, ''))}) – est. ${gbp(x.est)}${x.shared ? ' <span style="color:#b7791f">· covers other assets too</span>' : ''}</span></label><input type="number" step="0.01" data-am="${i}" value="${Math.round(x.est)}" style="margin-top:4px"></div>`).join('') : '<div class="note">No live HP agreement is linked to this asset.</div>'}`,
        'Mark as sold', async () => {
          const dt = bg.querySelector('#s_dt').value, pr = parseFloat(bg.querySelector('#s_pr').value) || 0; if (!dt) throw new Error('Choose a date');
          await api('fa_assets?id=eq.' + asset.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ disposed_date: dt, disposal_proceeds: pr }) });
          await addCf('asset_sales', dt.slice(0, 7), Math.round(pr * 1.2 * 100) / 100);
          for (const cb of bg.querySelectorAll('[data-ag]:checked')) { const i = +cb.dataset.ag; await settleAgreement(ag[i].a, dt, parseFloat(bg.querySelector(`[data-am="${i}"]`).value) || 0, 'unit ' + asset.ref + ' sold'); }
          await X.loadFinance(true); done && done();
        });
      const res = bg.querySelector('#s_res'), upd = () => { const p = parseFloat(bg.querySelector('#s_pr').value); res.innerHTML = isNaN(p) ? '' : (p - (info.nbv || 0) >= 0 ? 'Profit on disposal: <b>' + gbp(p - info.nbv) + '</b>' : 'Loss on disposal: <b>' + gbp(info.nbv - p) + '</b>') + ' (enter it in Management accounts → Loss on disposal for the month).'; };
      bg.querySelector('#s_pr').addEventListener('input', upd);
    },
    async unsell(asset, done) { await api('fa_assets?id=eq.' + asset.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ disposed_date: null, disposal_proceeds: null }) }); done && done(); }
  };
})();
