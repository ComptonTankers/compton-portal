/* MONTH END – the few figures that aren't in the portal anywhere else (facility drawn, HP balance, bank)
   plus a checklist so the board pack is only built once the month's data is in. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const ymAdd = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  const lab = (ym) => new Date(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const AUTO = [
    ['pl', 'Management accounts (P&L) loaded', 'Management accounts page'],
    ['mcs', 'MCS hire reports loaded (utilisation and revenue)', 'Fleet performance – upload MCS reports'],
    ['cash', 'Cashflow actuals entered', 'Cash page'],
    ['fac', 'Facility drawn balance entered', 'below'],
    ['hp', 'HP balance entered', 'below'],
    ['bank', 'Bank balance entered', 'below']];
  const MANUAL = [
    ['pipeline', 'Pipeline reviewed – stages, next actions and lost reasons up to date', '#/p-pipeline'],
    ['renewals', 'Renewals and rate reviews reviewed', '#/p-crm'],
    ['sales', 'Sales stock prices and expected sale months checked', '#/p-sales'],
    ['parking', 'Parking agreements checked (new, ended, on notice)', '#/p-parking'],
    ['forecast', 'Revenue forecast updated', '#/p-forecast']];
  let YM = ymAdd(new Date().toISOString().slice(0, 7), -1), ROW = null, AUTOV = {}, HPEST = null;

  async function get(ym) {
    const d = ym + '-01';
    const [me, pl, mcs, cash, sch] = await Promise.all([
      api('month_end?select=*&month=eq.' + d).then((r) => r[0] || null),
      api('ma_entries?select=month&month=eq.' + d + '&actual=not.is.null&limit=1'),
      api('hire_months?select=month&month=eq.' + ym + '&limit=1'),
      api('cf_entries?select=month&month=eq.' + d + '&actual=not.is.null&limit=1'),
      api('hp_schedule?select=amount&month=gt.' + d)]);
    const row = me || { month: d, checks: {} };
    const auto = { pl: pl.length > 0, mcs: mcs.length > 0, cash: cash.length > 0, fac: row.facility_drawn != null, hp: row.hp_balance != null, bank: row.bank_balance != null };
    const hpEst = sch.reduce((t, r) => t + (+r.amount || 0), 0);
    const done = AUTO.every(([k]) => auto[k]) && MANUAL.every(([k]) => (row.checks || {})[k]);
    return { row, auto, hpEst, done };
  }
  X.monthEnd = { get };   // used by the board pack

  X.routes['p-monthend'] = async function (el) {
    el.innerHTML = X.head('Month end', '') + '<div class="empty">Loading…</div>';
    await draw(el);
  };

  async function draw(el) {
    let g; try { g = await get(YM); } catch (e) { el.innerHTML = X.head('Month end', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    ROW = g.row; AUTOV = g.auto; HPEST = g.hpEst;
    const ch = ROW.checks || {}, nDone = AUTO.filter(([k]) => AUTOV[k]).length + MANUAL.filter(([k]) => ch[k]).length, nAll = AUTO.length + MANUAL.length;
    const cur = new Date().toISOString().slice(0, 7), months = Array.from({ length: 13 }, (_, i) => ymAdd(cur, -i));
    const tick = (ok) => `<span style="display:inline-block;width:20px;font-weight:700;color:${ok ? '#16A34A' : '#DC2626'}">${ok ? '✓' : '✗'}</span>`;
    const num = (id, v) => `<input id="${id}" type="number" step="0.01" style="width:160px" value="${v ?? ''}">`;

    el.innerHTML = X.head('Month end', 'Enter the figures that only come from statements, tick off the checks, then close the month. The board pack uses this.') +
      `<div class="form" style="margin-bottom:12px"><label>Month <select id="me_m">${months.map((m) => `<option value="${m}" ${m === YM ? 'selected' : ''}>${lab(m)}</option>`).join('')}</select></label></div>` +
      X.tiles([
        { l: 'Checklist', v: nDone + ' / ' + nAll, s: ROW.closed_at ? 'closed ' + new Date(ROW.closed_at).toLocaleDateString('en-GB') + (ROW.closed_by ? ' by ' + ROW.closed_by : '') : 'month open', c: nDone === nAll ? '' : 'o' },
        { l: 'Facility drawn', v: ROW.facility_drawn != null ? gbp(ROW.facility_drawn) : '–', s: 'at month end' },
        { l: 'HP balance', v: ROW.hp_balance != null ? gbp(ROW.hp_balance) : '–', s: 'portal schedule: ' + gbp(HPEST) + ' still to pay' },
        { l: 'Bank balance', v: ROW.bank_balance != null ? gbp(ROW.bank_balance) : '–', s: 'at month end' }]) +
      `<div class="grid2"><div class="card"><h3>Month-end figures – ${esc(lab(YM))}</h3><div class="hint">From the bank, facility and finance company statements at the last day of the month. The facility figure also updates the facility headroom chart.</div>
        <div class="form" style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;margin-top:10px">
          <span>Facility drawn (£)</span>${num('me_fac', ROW.facility_drawn)}
          <span>HP balance outstanding (£)</span><span>${num('me_hp', ROW.hp_balance)} <a href="#" id="me_hpuse" class="small">use portal figure (${gbp(HPEST)})</a></span>
          <span>Bank balance (£)</span>${num('me_bank', ROW.bank_balance)}</div>
        <h3 style="margin-top:16px">Commentary for the board</h3><div class="hint">A few lines on the month – the board pack puts this on the summary slide.</div>
        <textarea id="me_com" rows="6" style="width:100%">${esc(ROW.commentary || '')}</textarea>
        <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="pri2" id="me_save">Save</button><span id="me_msg" class="small muted"></span></div></div>

        <div class="card"><h3>Checklist</h3><div class="hint">The first six tick themselves when the data is in. Tick the rest when you've reviewed them.</div>
        <table><tbody>
        ${AUTO.map(([k, t, w]) => `<tr><td>${tick(AUTOV[k])}</td><td>${esc(t)}</td><td class="small muted">${AUTOV[k] ? '' : esc(w)}</td></tr>`).join('')}
        ${MANUAL.map(([k, t, href]) => `<tr><td><input type="checkbox" data-ck="${k}" ${ch[k] ? 'checked' : ''}></td><td>${esc(t)}</td><td class="small"><a href="${href}">open</a></td></tr>`).join('')}
        </tbody></table>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
          ${ROW.closed_at ? '<button id="me_reopen">Reopen month</button>' : `<button class="pri2" id="me_close" ${nDone === nAll ? '' : 'disabled title="Finish the checklist first"'}>Close ${esc(lab(YM))}</button>`}
          <span class="small muted">${nDone === nAll ? 'Ready for the board pack.' : (nAll - nDone) + ' still to do.'}</span></div></div></div>`;

    $('me_m').onchange = (e) => { YM = e.target.value; draw(el); };
    $('me_hpuse').onclick = (e) => { e.preventDefault(); $('me_hp').value = HPEST.toFixed(2); };
    const val = (id) => ($(id).value === '' ? null : +$(id).value);
    const upsert = async (extra) => {
      const body = Object.assign({ month: YM + '-01', facility_drawn: val('me_fac'), hp_balance: val('me_hp'), bank_balance: val('me_bank'), commentary: $('me_com').value.trim() || null, checks: ROW.checks || {}, updated_at: new Date().toISOString() }, extra || {});
      await api('month_end?on_conflict=month', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
      if (body.facility_drawn != null) await api('facility?month=eq.' + YM + '-01', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ outstanding: body.facility_drawn }) }).catch(() => null);
    };
    const run = async (extra) => { try { await upsert(extra); await draw(el); } catch (e) { $('me_msg').textContent = 'Could not save: ' + e.message; } };
    $('me_save').onclick = () => run();
    el.querySelectorAll('[data-ck]').forEach((c) => (c.onchange = () => { ROW.checks = Object.assign({}, ROW.checks, { [c.dataset.ck]: c.checked }); run(); }));
    if ($('me_close')) $('me_close').onclick = async () => { const s = await X.session().catch(() => null); run({ closed_at: new Date().toISOString(), closed_by: (s && s.user && s.user.email) || null }); };
    if ($('me_reopen')) $('me_reopen').onclick = () => run({ closed_at: null, closed_by: null });
  }
})();
