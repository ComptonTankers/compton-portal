/* INVOICES – sales invoices raised from the portal and created in Xero (Xero numbers them, emails them and takes payment).
   Deposit invoice → final invoice less the deposit. The Xero link runs through the "xero" edge function. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + (+n || 0)); return x.toISOString().slice(0, 10); };
  const fd = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
  const r2 = (n) => Math.round((+n || 0) * 100) / 100;
  let ST = null, SET = {}, ACC = null;

  async function call(action, body) {
    const s = await X.session(), cfg = window.SUPABASE_CONFIG;
    const r = await fetch(cfg.url + '/functions/v1/xero', { method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, body || {})) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Xero link failed (' + r.status + ')'); return j;
  }
  async function status(force) { if (!ST || force) { try { ST = await call('status'); } catch (e) { ST = { error: e.message }; } try { SET = (await api('xero_settings?select=*&id=eq.1'))[0] || {}; } catch (e) { SET = {}; } } return ST; }
  async function accounts() { if (!ACC) { try { ACC = (await call('accounts')).accounts || []; } catch (e) { ACC = []; } } return ACC; }
  const accOpts = (sel) => (ACC || []).map((a) => `<option value="${esc(a.code)}" ${a.code === sel ? 'selected' : ''}>${esc(a.code)} – ${esc(a.name)}</option>`).join('');

  // ---------- modal ----------
  function modal(title, html, wide) {
    const bg = document.createElement('div'); bg.className = 'dlg-bg';
    bg.innerHTML = `<div class="dlg" role="dialog" style="width:min(96vw,${wide ? 900 : 480}px)"><h3>${title}</h3>${html}<div class="err" style="color:#b3261e;margin-top:8px"></div></div>`;
    document.body.appendChild(bg); bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); }); return bg;
  }

  // ---------- the invoice builder (used by deposit, final and one-off invoices) ----------
  // o: { kind, title, customer, email, reference, lines:[{desc,qty,rate,account}], quote_id, stock_id, deposit_ids, due_days, note, after(inv) }
  async function builder(o) {
    const st = await status(); if (!st.connected) { alert('Connect Xero first – Invoices page.'); location.hash = '#/p-invoices'; return; }
    await accounts();
    const L = o.lines.map((l) => Object.assign({ qty: 1, account: SET.sales_account || '' }, l));
    const bg = modal(esc(o.title || 'New invoice'), `${o.note ? `<div class="note">${o.note}</div>` : ''}
      <div class="form" style="display:grid;grid-template-columns:2fr 2fr 1fr 1fr;gap:8px">
        <label>Customer (as in Xero)<input id="iv_cu" list="iv_cl" value="${esc(o.customer || '')}" autocomplete="off"><datalist id="iv_cl"></datalist></label>
        <label>Email the invoice to<input id="iv_em" type="email" value="${esc(o.email || '')}" placeholder="accounts@customer.co.uk"></label>
        <label>Invoice date<input id="iv_dt" type="date" value="${today()}"></label><label>Due date<input id="iv_due" type="date" value="${addDays(today(), o.due_days ?? SET.due_days ?? 7)}"></label>
        <label style="grid-column:span 2">Reference (shows on the invoice)<input id="iv_ref" value="${esc(o.reference || '')}"></label>
        <label style="grid-column:span 2;align-self:end" class="small"><input type="checkbox" id="iv_upd" style="width:auto"> Replace the email on the Xero contact if it already has one</label></div>
      <table style="margin-top:10px"><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit £ (ex VAT)</th><th>Xero account</th><th class="n">Net</th><th></th></tr></thead><tbody id="iv_lines"></tbody></table>
      <button class="mini" id="iv_add" style="margin-top:6px">+ Line</button><div id="iv_tot" style="margin-top:10px;text-align:right"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px"><button id="iv_x">Cancel</button><button id="iv_draft">Save as draft in Xero</button><button id="iv_make">Create in Xero</button><button class="pri2" id="iv_send">Create in Xero and email it</button></div>`, true);
    const q = (s) => bg.querySelector(s), err = q('.err');
    const draw = () => {
      q('#iv_lines').innerHTML = L.map((l, i) => `<tr><td><textarea data-i="${i}" data-k="desc" rows="2" style="width:100%;min-width:340px">${esc(l.desc || '')}</textarea></td><td class="n"><input data-i="${i}" data-k="qty" type="number" step="1" value="${l.qty}" style="width:60px;text-align:right"></td>
        <td class="n"><input data-i="${i}" data-k="rate" type="number" step="0.01" value="${l.rate}" style="width:110px;text-align:right"></td><td><select data-i="${i}" data-k="account" style="max-width:200px"><option value="">–</option>${accOpts(l.account)}</select></td>
        <td class="n">${gbp((+l.qty || 0) * (+l.rate || 0))}</td><td><a href="#" data-del="${i}" class="small">remove</a></td></tr>`).join('');
      const net = r2(L.reduce((t, l) => t + (+l.qty || 0) * (+l.rate || 0), 0)), vat = r2(net * 0.2);
      q('#iv_tot').innerHTML = `Net <b>${gbp(net)}</b> · VAT 20% <b>${gbp(vat)}</b> · Total <b style="font-size:1.15em">${gbp(net + vat)}</b> <span class="small muted">(Xero works out the exact figures)</span>`;
      bg.querySelectorAll('[data-k]').forEach((i) => (i.onchange = () => { const l = L[+i.dataset.i]; l[i.dataset.k] = i.dataset.k === 'desc' || i.dataset.k === 'account' ? i.value : i.value === '' ? '' : +i.value; draw(); }));
      bg.querySelectorAll('[data-del]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); L.splice(+a.dataset.del, 1); draw(); }));
    };
    draw();
    q('#iv_add').onclick = () => { L.push({ desc: '', qty: 1, rate: '', account: SET.sales_account || '' }); draw(); };
    q('#iv_x').onclick = () => bg.remove();
    let tm; q('#iv_cu').oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { try { const c = (await call('contacts', { q: q('#iv_cu').value })).contacts; bg._contacts = c;
      q('#iv_cl').innerHTML = c.map((x) => `<option value="${esc(x.name)}">${esc(x.email || '')}</option>`).join(''); const hit = c.find((x) => x.name === q('#iv_cu').value); if (hit && hit.email && !q('#iv_em').value) q('#iv_em').value = hit.email; } catch (e) {} }, 350); };
    const go = async (mode, btn) => {
      err.textContent = ''; const cust = q('#iv_cu').value.trim(), email = q('#iv_em').value.trim();
      if (!cust) { err.textContent = 'Enter the customer'; return; }
      if (mode === 'send' && !email) { err.textContent = 'Enter the email address Xero should send it to'; return; }
      const lines = L.filter((l) => String(l.desc || '').trim() && l.rate !== '');
      if (!lines.length) { err.textContent = 'Add at least one line'; return; }
      if (lines.some((l) => !l.account)) { err.textContent = 'Choose the Xero account on every line'; return; }
      bg.querySelectorAll('button').forEach((b) => (b.disabled = true)); btn.textContent = 'Working…';
      try {
        const hit = (bg._contacts || []).find((x) => x.name === cust);
        const net = r2(lines.reduce((t, l) => t + (+l.qty || 0) * (+l.rate || 0), 0));
        const ss = await X.session();
        const [row] = await api('invoices', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ kind: o.kind || 'other', quote_id: o.quote_id || null, stock_id: o.stock_id || null, customer: cust, contact_email: email || null, xero_contact_id: hit ? hit.id : null,
          reference: q('#iv_ref').value.trim() || null, issue_date: q('#iv_dt').value, due_date: q('#iv_due').value, lines, net, vat: r2(net * 0.2), total: r2(net * 1.2), deposit_invoice_ids: o.deposit_ids || null, created_by: (ss.user && ss.user.email) || null }) });
        let inv;
        try { inv = (await call('create', { id: row.id, draft: mode === 'draft', update_email: q('#iv_upd').checked })).invoice; }
        catch (e) { await api('invoices?id=eq.' + row.id, { method: 'DELETE' }).catch(() => {}); throw e; }
        if (mode === 'send') await call('email', { id: row.id });
        bg.remove();
        if (o.after) await o.after(inv, mode);
        alert('Invoice ' + (inv.number || '') + ' created in Xero' + (mode === 'send' ? ' and emailed to ' + email : mode === 'draft' ? ' as a draft' : '') + '.');
      } catch (e) { err.textContent = e.message; bg.querySelectorAll('button').forEach((b) => (b.disabled = false)); btn.textContent = mode === 'send' ? 'Create in Xero and email it' : mode === 'draft' ? 'Save as draft in Xero' : 'Create in Xero'; }
    };
    q('#iv_send').onclick = (e) => go('send', e.target); q('#iv_make').onclick = (e) => go('make', e.target); q('#iv_draft').onclick = (e) => go('draft', e.target);
  }

  // ---------- from a quote ----------
  const forQuote = async (qid) => api('invoices?select=*&quote_id=eq.' + qid + '&order=created_at').catch(() => []);
  const live = (i) => i.xero_invoice_id && !['VOIDED', 'DELETED'].includes(i.status);
  const summary = (q) => (q.lines || []).filter((l) => l.type === 'sale').map((l) => l.desc).join(', ') || (q.lines || []).map((l) => l.desc).join(', ');
  async function deposit(q, done) {
    await status(); const bg = modal('Deposit invoice – ' + esc(q.ref), `<div class="note">Invoices <b>${esc(q.customer || '')}</b> for a deposit to secure ${esc(summary(q))}. The final invoice will take it off the balance.</div>
      <div class="form"><label>Deposit amount £</label><input id="dp_am" type="number" step="0.01"><label class="small"><input type="radio" name="dp_v" value="inc" checked style="width:auto"> includes VAT</label> <label class="small"><input type="radio" name="dp_v" value="ex" style="width:auto"> plus VAT</label></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button id="dp_x">Cancel</button><button class="pri2" id="dp_go">Next</button></div>`);
    bg.querySelector('#dp_x').onclick = () => bg.remove();
    bg.querySelector('#dp_go').onclick = () => { const a = parseFloat(bg.querySelector('#dp_am').value); if (!a) { bg.querySelector('.err').textContent = 'Enter the deposit'; return; }
      const net = bg.querySelector('[name=dp_v]:checked').value === 'inc' ? r2(a / 1.2) : a; bg.remove();
      builder({ kind: 'deposit', title: 'Deposit invoice – ' + esc(q.ref), customer: q.customer, email: q.contact_email, reference: q.ref + ' deposit', quote_id: q.id, due_days: SET.deposit_due_days ?? 7,
        lines: [{ desc: 'Deposit to secure the purchase of ' + summary(q) + ' (our quote ' + q.ref + '). The balance is due before collection.', qty: 1, rate: net, account: SET.deposit_account || SET.sales_account || '' }],
        after: async () => { done && done(); } }); };
  }
  async function final(q, done) {
    const prev = (await forQuote(q.id)).filter(live), deps = prev.filter((i) => i.kind === 'deposit');
    if (prev.some((i) => i.kind === 'final') && !confirm('A final invoice has already been raised for this quote. Raise another?')) return;
    await status();
    const lines = (q.lines || []).filter((l) => l.type !== 'hire').map((l) => ({ desc: [l.desc, l.notes].filter(Boolean).join('\n'), qty: +l.qty || 1, rate: +l.rate || 0, account: l.type === 'sale' ? SET.sales_account || '' : SET.charges_account || SET.sales_account || '' }));
    deps.forEach((d) => lines.push({ desc: 'Less deposit paid – invoice ' + d.number + ' of ' + fd(d.issue_date), qty: 1, rate: -r2(d.net), account: SET.deposit_account || SET.sales_account || '' }));
    const full = r2((q.lines || []).filter((l) => l.type !== 'hire').reduce((t, l) => t + (+l.qty || 1) * (+l.rate || 0), 0));
    builder({ kind: 'final', title: 'Invoice – ' + esc(q.ref), customer: q.customer, email: q.contact_email, reference: q.ref, quote_id: q.id, stock_id: ((q.lines || []).find((l) => l.stock_id) || {}).stock_id, deposit_ids: deps.map((d) => d.id),
      note: deps.length ? `Takes off ${deps.length > 1 ? 'the deposits' : 'the deposit'} already invoiced (${deps.map((d) => esc(d.number) + ' ' + gbp(d.total) + (d.status === 'PAID' ? ' paid' : ' <b style="color:#b3261e">not paid yet</b>')).join(', ')}).` : 'No deposit invoice on this quote.',
      lines, after: async (inv, mode) => { if (mode !== 'draft' && X.quoteInvoiced) await X.quoteInvoiced(q, inv.number, inv.issue_date || today(), full); done && done(); } });
  }
  X.invoices = { call, status, builder, deposit, final, forQuote };

  // ---------- page ----------
  const SCOL = { PAID: '#15803D', AUTHORISED: '#164698', DRAFT: '#B45309', SUBMITTED: '#B45309', VOIDED: '#94A3B8', DELETED: '#94A3B8' };
  X.routes['p-invoices'] = async function (el) {
    el.innerHTML = X.head('Invoices', '') + '<div class="empty">Loading…</div>';
    const flag = (/[?&]xero=([^&]+)/.exec(location.hash) || [])[1];
    const st = await status(true); let INV = [];
    try { INV = await all('invoices', 'created_at.desc'); } catch (e) {}
    if (st.connected) await accounts();
    const owed = INV.filter((i) => live(i) && i.status !== 'PAID' && i.status !== 'DRAFT');
    el.innerHTML = X.head('Invoices', 'Sales invoices raised here are created in Xero – Xero numbers them, emails them with the pay-online link and records the payments.') +
      (flag ? `<div class="card" style="border-left:4px solid ${flag === 'connected' ? '#16A34A' : '#DC2626'}">${flag === 'connected' ? '<b>Xero is connected.</b> Choose the sales accounts below, then invoices can be raised from any accepted quote.' : 'Xero did not connect: ' + esc(decodeURIComponent(flag))}</div>` : '') +
      X.tiles([{ l: 'Owed to us', v: gbp(owed.reduce((t, i) => t + (+i.amount_due || 0), 0)), s: owed.length + ' unpaid invoices' }, { l: 'Overdue', v: gbp(owed.filter((i) => i.due_date < today()).reduce((t, i) => t + (+i.amount_due || 0), 0)), s: owed.filter((i) => i.due_date < today()).length + ' invoices', c: 'o' },
        { l: 'Deposits waiting', v: INV.filter((i) => i.kind === 'deposit' && live(i) && i.status !== 'PAID').length, s: 'not paid yet' }, { l: 'Xero', v: st.connected ? 'Connected' : 'Not connected', s: st.connected ? esc(st.tenant || '') : 'set up below' }]) +
      xeroCard(st) +
      `<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><h3 style="margin:0">Invoices</h3>${st.connected ? '<button class="mini" id="in_ref">Update payments from Xero</button><button class="mini pri2" id="in_new">+ New invoice</button>' : ''}<span class="small muted">Deposit and final invoices for a sale are raised from the accepted quote.</span><span id="in_msg" class="small"></span></div>
      <table><thead><tr><th>Number</th><th>Type</th><th>Customer</th><th>Reference</th><th>Date</th><th>Due</th><th class="n">Total</th><th class="n">Still owed</th><th>Status</th><th></th></tr></thead><tbody>
      ${INV.map((i) => `<tr><td><b>${esc(i.number || '–')}</b></td><td>${esc(i.kind)}</td><td>${esc(i.customer)}</td><td class="small">${esc(i.reference || '')}${i.quote_id ? ` <a href="#/p-quotes?q=${i.quote_id}">quote</a>` : ''}</td><td>${fd(i.issue_date)}</td>
        <td style="${i.status !== 'PAID' && i.due_date < today() && live(i) ? 'color:#b3261e;font-weight:600' : ''}">${fd(i.due_date)}</td><td class="n">${gbp(i.total)}</td><td class="n">${i.status === 'PAID' ? '–' : gbp(i.amount_due ?? i.total)}</td>
        <td><span style="color:${SCOL[i.status] || '#334155'};font-weight:600">${esc(i.status === 'AUTHORISED' ? 'Awaiting payment' : i.status === 'PAID' ? 'Paid ' + fd(i.paid_at) : (i.status || '').toLowerCase())}</span>${i.sent_at ? `<div class="small muted">emailed ${fd(i.sent_at)}</div>` : ''}</td>
        <td style="white-space:nowrap">${i.xero_invoice_id ? `<button class="mini" data-pdf="${i.id}">PDF</button> ${i.status === 'AUTHORISED' ? `<button class="mini" data-em="${i.id}">${i.sent_at ? 'Email again' : 'Email'}</button>` : ''} ${i.online_url ? `<a class="mini" href="${esc(i.online_url)}" target="_blank" rel="noopener">Online</a>` : ''}` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">No invoices yet.</td></tr>'}</tbody></table></div>`;
    wire(el, st, INV);
  };
  function xeroCard(st) {
    if (st.error) return `<div class="card"><h3>Xero</h3><div class="hint">The Xero link could not be reached: ${esc(st.error)}</div></div>`;
    if (!st.configured) return `<div class="card"><h3>Connect Xero – one-off setup</h3><ol style="line-height:1.7">
      <li>Go to <a href="https://developer.xero.com/app/manage" target="_blank" rel="noopener">developer.xero.com → My Apps</a>, sign in with your Xero login and click <b>New app</b>.</li>
      <li>Name: <b>Compton portal</b>. Integration type: <b>Web app</b>. Company URL: <b>https://www.comptontankers.com</b>.</li>
      <li>Redirect URI – copy this exactly: <input readonly value="${esc(st.redirect_uri)}" onclick="this.select()" style="width:100%;max-width:560px"></li>
      <li>Create the app, then open <b>Configuration</b> and click <b>Generate a secret</b>.</li>
      <li>In Supabase (project <b>compton</b>) open <b>Edge Functions → Secrets</b> and add two secrets: <b>XERO_CLIENT_ID</b> (the Client ID) and <b>XERO_CLIENT_SECRET</b> (the secret). Don't send them to anyone, including me.</li>
      <li>Come back here and refresh – a <b>Connect to Xero</b> button will appear.</li></ol></div>`;
    if (!st.connected) return `<div class="card"><h3>Xero</h3><p>The Xero app is set up. Connect it to your organisation – Xero will ask you to sign in and pick the organisation.</p><button class="pri2" id="xr_con">Connect to Xero</button> <span id="xr_msg" class="small"></span></div>`;
    return `<div class="card"><h3>Xero – connected to ${esc(st.tenant || '')}</h3><div class="hint">Connected ${fd(st.connected_at)}${st.connected_by ? ' by ' + esc(st.connected_by) : ''}. Choose which Xero accounts the lines go to (you can change it on each line).</div>
      <div class="form" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:900px">
        <label>Vehicle / equipment sales<select data-set="sales_account"><option value="">–</option>${accOpts(SET.sales_account)}</select></label>
        <label>Deposits<select data-set="deposit_account"><option value="">same as sales</option>${accOpts(SET.deposit_account)}</select></label>
        <label>Delivery and other charges<select data-set="charges_account"><option value="">same as sales</option>${accOpts(SET.charges_account)}</select></label>
        <label>Payment due after (days)<input data-set="due_days" type="number" value="${SET.due_days ?? 7}"></label><label>Deposit due after (days)<input data-set="deposit_due_days" type="number" value="${SET.deposit_due_days ?? 7}"></label>
        <label>VAT<select data-set="tax_type">${[['OUTPUT2', '20% (VAT on income)'], ['ZERORATEDOUTPUT', 'Zero rated (e.g. export)'], ['NONE', 'No VAT']].map(([k, t]) => `<option value="${k}" ${k === (SET.tax_type || 'OUTPUT2') ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      ${(ACC || []).length ? '' : '<div class="small" style="color:#b3261e">Could not read the account list from Xero.</div>'}<div style="margin-top:8px"><button class="mini" id="xr_off">Disconnect Xero</button> <span id="xr_msg" class="small"></span></div></div>`;
  }
  function wire(el, st, INV) {
    const $ = (s) => el.querySelector(s), say = (id, t, ok) => { const m = $(id); if (m) m.innerHTML = `<span style="color:${ok ? '#15803D' : '#b3261e'}">${esc(t)}</span>`; };
    const again = () => X.routes['p-invoices'](el);
    if ($('#xr_con')) $('#xr_con').onclick = async () => { try { const r = await call('auth_url', { return_url: location.href.replace(/#.*$/, '') }); location.href = r.url; } catch (e) { say('#xr_msg', e.message); } };
    if ($('#xr_off')) $('#xr_off').onclick = async () => { if (!confirm('Disconnect Xero? Invoices already raised stay in Xero.')) return; try { await call('disconnect'); ST = null; again(); } catch (e) { say('#xr_msg', e.message); } };
    el.querySelectorAll('[data-set]').forEach((i) => (i.onchange = async () => { const k = i.dataset.set, v = i.type === 'number' ? +i.value : i.value || null;
      try { await api('xero_settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [k]: v, updated_at: new Date().toISOString() }) }); SET[k] = v; i.style.background = '#ECFDF3'; } catch (e) { say('#xr_msg', 'Could not save: ' + e.message); } }));
    if ($('#in_ref')) $('#in_ref').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Updating…'; try { await call('refresh'); again(); } catch (er) { say('#in_msg', er.message); e.target.disabled = false; } };
    if ($('#in_new')) $('#in_new').onclick = () => builder({ kind: 'other', title: 'New invoice', lines: [{ desc: '', qty: 1, rate: '' }], after: async () => again() });
    el.querySelectorAll('[data-em]').forEach((b) => (b.onclick = async () => { const i = INV.find((x) => x.id === +b.dataset.em); if (!confirm('Have Xero email ' + i.number + ' to ' + (i.contact_email || 'the contact') + '?')) return;
      b.disabled = true; try { await call('email', { id: i.id }); again(); } catch (e) { say('#in_msg', e.message); b.disabled = false; } }));
    el.querySelectorAll('[data-pdf]').forEach((b) => (b.onclick = async () => { b.disabled = true; b.textContent = '…'; try { const r = await call('pdf', { id: +b.dataset.pdf });
      const bin = atob(r.base64), u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
      window.open(URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })), '_blank'); } catch (e) { say('#in_msg', e.message); } b.disabled = false; b.textContent = 'PDF'; }));
  }
})();
