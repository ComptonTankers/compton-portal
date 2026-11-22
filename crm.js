/* CUSTOMERS – the customer log behind the board pack's CRM slides:
   contract renewals with a status, rate-review dates, contacts, and a log of calls, meetings
   and service events (breakdowns, call-outs, complaints, late deliveries) that builds the service scorecard. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const KINDS = ['Call', 'Meeting', 'Email', 'Note', 'Rate review', 'Breakdown', 'Call-out', 'Complaint', 'Late delivery/collection'];
  const SERVICE = ['Breakdown', 'Call-out', 'Complaint', 'Late delivery/collection'];
  const RSTAT = ['Not started', 'In talks', 'Renewed', 'Going rolling', 'Ending – off hire', 'Ending – customer buying'];
  const SECTORS = ['Energy', 'Waste & industrial', 'Other'];
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fd = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const key = (s) => String(s || '').trim().toUpperCase().replace(/\s+(LIMITED|LTD\.?|PLC)$/, '').replace(/[^A-Z0-9]/g, '');
  let CON = [], REV = [], CUS = [], PPL = [], EV = [], OPEN = null, Q = '';

  async function load() {
    [CON, REV, CUS, PPL, EV] = await Promise.all([all('contracts', 'end_date.asc.nullslast'), all('hire_customers', 'month.asc'), all('crm_customers', 'name.asc').catch(() => []), all('crm_contacts', 'name.asc').catch(() => []), all('crm_events', 'event_date.desc').catch(() => [])]);
  }
  // one row per customer, joining names that differ only by "Ltd"/case
  function customers() {
    const m = new Map(), get = (n) => { const k = key(n); if (!m.has(k)) m.set(k, { k, name: String(n).trim(), rev: {}, cons: [], ev: [], ppl: [] }); return m.get(k); };
    REV.forEach((r) => { const c = get(r.customer); c.rev[r.month] = (c.rev[r.month] || 0) + (+r.revenue || 0); });
    CON.filter((c) => c.active && c.customer).forEach((c) => get(c.customer).cons.push(c));
    CUS.forEach((c) => { const x = get(c.name); x.crm = c; x.name = c.name; });
    EV.forEach((e) => get(e.customer).ev.push(e)); PPL.forEach((p) => get(p.customer).ppl.push(p));
    return [...m.values()];
  }
  const svcStats = (evs, from, to) => { const r = evs.filter((e) => SERVICE.includes(e.kind) && e.event_date >= from && e.event_date < to), fix = r.filter((e) => e.hours_to_fix != null);
    return { n: r.length, by: Object.fromEntries(SERVICE.map((k) => [k, r.filter((e) => e.kind === k).length])), fix: fix.length ? fix.reduce((t, e) => t + +e.hours_to_fix, 0) / fix.length : null }; };
  X.crm = { load, customers, svcStats, data: () => ({ CON, REV, EV }), SERVICE };   // used by the board pack

  X.routes['p-crm'] = async function (el) {
    el.innerHTML = X.head('Customers', 'Renewals, rate reviews, contacts and the service log') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Customers', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    draw(el);
  };

  function draw(el) {
    const C = customers(), months = [...new Set(REV.map((r) => r.month))].sort(), L = months[months.length - 1], P = months[months.length - 2];
    const totL = C.reduce((t, c) => t + (c.rev[L] || 0), 0), t = today(), in90 = addDays(t, 90), in183 = addDays(t, 183), ago31 = addDays(t, -31);
    const ren = CON.filter((c) => c.active && !c.rolling && c.end_date && c.end_date <= in183 && (c.end_date >= ago31 || !['Renewed', 'Ending – off hire', 'Ending – customer buying', 'Going rolling'].includes(c.renewal_status || '')) && c.end_date >= addDays(t, -120));
    const due90 = ren.filter((c) => c.end_date <= in90 && c.end_date >= t), notStarted = ren.filter((c) => !c.renewal_status || c.renewal_status === 'Not started');
    const m0 = t.slice(0, 7) + '-01', pm = (() => { const d = new Date(m0); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })();
    const sNow = svcStats(EV, m0, '9999'), sPrev = svcStats(EV, pm, m0), openIssues = EV.filter((e) => SERVICE.includes(e.kind) && !e.resolved);
    const reviews = CUS.filter((c) => c.rate_review_date && c.rate_review_date <= in90);
    let rows = C.filter((c) => c.rev[L] || c.rev[P] || c.cons.length || c.crm);
    if (Q) rows = rows.filter((c) => c.name.toLowerCase().includes(Q.toLowerCase()));
    rows.sort((a, b) => (b.rev[L] || 0) - (a.rev[L] || 0));

    el.innerHTML = X.head('Customers', 'Renewals, rate reviews, contacts and the service log. Revenue is hire revenue from MCS.') +
      X.tiles([
        { l: 'Customers billed ' + (L ? new Date(L + '-01').toLocaleDateString('en-GB', { month: 'short' }) : ''), v: C.filter((c) => c.rev[L]).length, s: gbp(totL) + ' hire revenue' },
        { l: 'Contracts ending in 90 days', v: due90.length, s: gbp(due90.reduce((x, c) => x + +c.monthly_rate, 0)) + ' a month', c: due90.length ? 'o' : '' },
        { l: 'Renewals not started', v: notStarted.length, s: 'ending within 6 months', c: notStarted.length ? 'r' : '' },
        { l: 'Rate reviews due', v: reviews.length, s: 'in the next 90 days' },
        { l: 'Service events this month', v: sNow.n, s: 'last month ' + sPrev.n + (sNow.fix != null ? ' · avg fix ' + sNow.fix.toFixed(1) + 'h' : '') },
        { l: 'Open service issues', v: openIssues.length, s: 'not marked resolved', c: openIssues.length ? 'r' : '' }]) +
      `<div class="card"><h3>Contract renewals</h3><div class="hint">Contracts ending in the next 6 months, plus any that ended in the last month without a decision. Start talks at least 3 months before the end.</div>
      <div class="box2"><table><thead><tr><th>Customer</th><th>Unit</th><th>Ends</th><th class="n">£ a month</th><th>Status</th><th>Notes</th></tr></thead><tbody>
      ${ren.length ? ren.map((c) => { const late = c.end_date < in90 && (!c.renewal_status || c.renewal_status === 'Not started');
        return `<tr><td><a href="#" data-open="${esc(key(c.customer))}">${esc(c.customer)}</a></td><td>${esc(c.unit)}</td><td style="${c.end_date < t ? 'color:#b3261e;font-weight:600' : late ? 'color:#B8470F;font-weight:600' : ''}">${fd(c.end_date)}</td><td class="n">${gbp(+c.monthly_rate)}</td>
        <td><select data-rs="${c.id}"><option value=""></option>${RSTAT.map((s) => `<option ${s === c.renewal_status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><input data-rn="${c.id}" value="${esc(c.renewal_notes || '')}" style="width:100%" placeholder="e.g. Quote sent 12 Dec"></td></tr>`; }).join('') : '<tr><td colspan="6" class="empty">No contracts ending in the next 6 months.</td></tr>'}
      </tbody></table></div><span id="cr_rmsg" class="small"></span></div>
      <div class="card"><h3>Service scorecard</h3><div class="hint">Counted from the service events logged against customers below.</div>
      <div class="box2"><table><thead><tr><th></th>${SERVICE.map((k) => `<th class="n">${k}</th>`).join('')}<th class="n">Average time to fix</th></tr></thead><tbody>
      <tr><td>This month</td>${SERVICE.map((k) => `<td class="n">${sNow.by[k]}</td>`).join('')}<td class="n">${sNow.fix != null ? sNow.fix.toFixed(1) + ' hours' : '–'}</td></tr>
      <tr><td>Last month</td>${SERVICE.map((k) => `<td class="n">${sPrev.by[k]}</td>`).join('')}<td class="n">${sPrev.fix != null ? sPrev.fix.toFixed(1) + ' hours' : '–'}</td></tr></tbody></table></div>
      ${openIssues.length ? `<div style="margin-top:8px"><b>Open issues:</b> ${openIssues.map((e) => `${esc(e.customer)} – ${esc(e.kind)}${e.unit ? ' (' + esc(e.unit) + ')' : ''}, ${fd(e.event_date)}`).join(' · ')}</div>` : ''}</div>
      <div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Customers</h3><input id="cr_q" placeholder="Search…" value="${esc(Q)}" style="max-width:220px"><button class="mini" id="cr_new">+ Add a customer</button><span id="cr_msg" class="small"></span></div>
      <div id="cr_panel"></div>
      <div class="box2" style="margin-top:8px"><table><thead><tr><th>Customer</th><th class="n">${L ? new Date(L + '-01').toLocaleDateString('en-GB', { month: 'short' }) : ''}</th><th class="n">${P ? new Date(P + '-01').toLocaleDateString('en-GB', { month: 'short' }) : ''}</th><th class="n">Change</th><th class="n">Share</th><th class="n">Contracts</th><th>Next end</th><th>Last contact</th><th class="n">Open issues</th><th>Rate review</th></tr></thead><tbody>
      ${rows.map((c) => { const l = c.rev[L] || 0, p = c.rev[P] || 0, d = l - p, next = c.cons.filter((x) => x.end_date && x.end_date >= t).sort((a, b) => a.end_date < b.end_date ? -1 : 1)[0], last = c.ev.filter((e) => !SERVICE.includes(e.kind))[0], oi = c.ev.filter((e) => SERVICE.includes(e.kind) && !e.resolved).length;
        return `<tr><td><a href="#" data-open="${esc(c.k)}"><b>${esc(c.name)}</b></a>${c.crm && c.crm.sector ? `<div class="small muted">${esc(c.crm.sector)}</div>` : ''}</td><td class="n">${l ? gbp(l) : '–'}</td><td class="n">${p ? gbp(p) : '–'}</td>
          <td class="n" style="color:${d > 0 ? '#1b7f4b' : d < 0 ? '#b3261e' : 'inherit'}">${d ? (d > 0 ? '+' : '') + gbp(d) : ''}</td><td class="n">${totL && l ? (l / totL * 100).toFixed(1) + '%' : ''}</td><td class="n">${c.cons.length || ''}</td>
          <td>${next ? fd(next.end_date) : ''}</td><td>${last ? fd(last.event_date) + ' <span class="small muted">' + esc(last.kind) + '</span>' : '<span class="muted">–</span>'}</td><td class="n" style="${oi ? 'color:#b3261e;font-weight:600' : ''}">${oi || ''}</td>
          <td>${c.crm && c.crm.rate_review_date ? fd(c.crm.rate_review_date) : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
    wire(el, C);
    if (OPEN) panel(el, C.find((c) => c.k === OPEN));
  }

  function wire(el, C) {
    const say = (id, t, ok) => { const m = $(id); if (m) m.innerHTML = `<span style="color:${ok ? '#1b7f4b' : '#b3261e'}">${esc(t)}</span>`; };
    $('cr_q').oninput = (e) => { Q = e.target.value; clearTimeout(window.__crq); window.__crq = setTimeout(() => { draw(el); const i = $('cr_q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
    el.querySelectorAll('[data-open]').forEach((a) => a.onclick = (e) => { e.preventDefault(); OPEN = a.dataset.open; panel(el, C.find((c) => c.k === OPEN)); });
    el.querySelectorAll('[data-rs]').forEach((s) => s.onchange = async () => { try { await api('contracts?id=eq.' + s.dataset.rs, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ renewal_status: s.value || null }) }); say('cr_rmsg', 'Saved ✓', 1); await load(); } catch (e) { say('cr_rmsg', 'Could not save: ' + e.message); } });
    el.querySelectorAll('[data-rn]').forEach((i) => i.onchange = async () => { try { await api('contracts?id=eq.' + i.dataset.rn, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ renewal_notes: i.value.trim() || null }) }); say('cr_rmsg', 'Saved ✓', 1); await load(); } catch (e) { say('cr_rmsg', 'Could not save: ' + e.message); } });
    $('cr_new').onclick = async () => { const n = (prompt('Customer name, as on their invoices') || '').trim(); if (!n) return; try { await api('crm_customers', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ name: n }) }); OPEN = key(n); await load(); draw(el); } catch (e) { say('cr_msg', 'Could not add: ' + e.message); } };
  }

  // one customer: details, contacts, contracts and the log
  async function panel(el, c) {
    const p = $('cr_panel'); if (!c) { p.innerHTML = ''; return; }
    const who = await X.session().then((s) => s && s.user && (s.user.user_metadata?.name || s.user.email)).catch(() => null);
    const cr = c.crm || {};
    p.innerHTML = `<div class="card" style="margin-top:10px;border:2px solid #164698"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(c.name)}</h3><button class="mini" id="cp_close">Close</button></div>
      <div class="form" style="margin-top:8px"><div><label>Sector</label><select id="cp_sector"><option value=""></option>${SECTORS.map((s) => `<option ${s === cr.sector ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div><label>Account manager</label><input id="cp_am" value="${esc(cr.account_manager || '')}"></div><div><label>Next rate review</label><input id="cp_rr" type="date" value="${esc(cr.rate_review_date || '')}"></div>
        <div style="grid-column:span 2"><label>Notes</label><input id="cp_notes" value="${esc(cr.notes || '')}"></div><div><button class="mini pri2" id="cp_save">Save details</button></div></div>
      <div class="grid2" style="margin-top:12px"><div><h4>Contacts</h4>${c.ppl.length ? `<table><tbody>${c.ppl.map((x) => `<tr><td><b>${esc(x.name)}</b>${x.role ? ' · ' + esc(x.role) : ''}</td><td>${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}</td><td>${esc(x.phone || '')}</td><td><button class="mini" data-delp="${x.id}">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="hint">No contacts yet.</div>'}
        <div class="form" style="margin-top:6px"><div><label>Name</label><input id="cn_name"></div><div><label>Role</label><input id="cn_role"></div><div><label>Email</label><input id="cn_email"></div><div><label>Phone</label><input id="cn_phone"></div><div><button class="mini" id="cn_add">Add contact</button></div></div></div>
      <div><h4>Contracts</h4>${c.cons.length ? `<table><thead><tr><th>Unit</th><th>Ends</th><th class="n">£/month</th></tr></thead><tbody>${c.cons.map((x) => `<tr><td>${esc(x.unit)}</td><td>${x.rolling || !x.end_date ? 'Rolling' : fd(x.end_date)}</td><td class="n">${gbp(+x.monthly_rate)}</td></tr>`).join('')}</tbody></table>` : '<div class="hint">No active contracts.</div>'}</div></div>
      <h4 style="margin-top:12px">Log</h4>
      <div class="form"><div><label>Date</label><input id="ce_date" type="date" value="${today()}"></div><div><label>What</label><select id="ce_kind">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></div><div><label>Unit (if any)</label><input id="ce_unit"></div>
        <div style="grid-column:span 2"><label>Notes</label><input id="ce_notes"></div><div><label>Hours to fix</label><input id="ce_fix" type="number" step="0.5" title="Breakdowns and call-outs"></div><div><button class="mini pri2" id="ce_add">Add to log</button></div></div>
      <div class="box2" style="margin-top:8px"><table><thead><tr><th>Date</th><th>What</th><th>Unit</th><th>Notes</th><th>By</th><th></th></tr></thead><tbody>
      ${c.ev.length ? c.ev.map((e) => `<tr><td>${fd(e.event_date)}</td><td>${SERVICE.includes(e.kind) ? `<b style="color:#B8470F">${esc(e.kind)}</b>` : esc(e.kind)}</td><td>${esc(e.unit || '')}</td><td>${esc(e.notes || '')}${e.hours_to_fix != null ? ` <span class="small muted">(${e.hours_to_fix}h to fix)</span>` : ''}</td><td class="small">${esc(e.logged_by || '')}</td>
        <td>${SERVICE.includes(e.kind) ? (e.resolved ? `<span class="small" style="color:#1b7f4b">Resolved ${fd(e.resolved_at)}</span>` : `<button class="mini" data-res="${e.id}">Mark resolved</button>`) : ''} <button class="mini" data-dele="${e.id}">✕</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Nothing logged yet.</td></tr>'}
      </tbody></table></div><span id="cp_msg" class="small"></span></div>`;
    const say = (t, ok) => { $('cp_msg').innerHTML = `<span style="color:${ok ? '#1b7f4b' : '#b3261e'}">${esc(t)}</span>`; };
    const re = async () => { await load(); draw(el); };
    $('cp_close').onclick = () => { OPEN = null; p.innerHTML = ''; };
    $('cp_save').onclick = async () => { try { await api('crm_customers?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ name: c.name, sector: $('cp_sector').value || null, account_manager: $('cp_am').value.trim() || null, rate_review_date: $('cp_rr').value || null, notes: $('cp_notes').value.trim() || null, updated_at: new Date().toISOString() }) }); await re(); } catch (e) { say('Could not save: ' + e.message); } };
    $('cn_add').onclick = async () => { const n = $('cn_name').value.trim(); if (!n) { say('Enter a name.'); return; } try { await api('crm_contacts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ customer: c.name, name: n, role: $('cn_role').value.trim() || null, email: $('cn_email').value.trim() || null, phone: $('cn_phone').value.trim() || null }) }); await re(); } catch (e) { say('Could not add: ' + e.message); } };
    $('ce_add').onclick = async () => { try { await api('crm_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ customer: c.name, event_date: $('ce_date').value || today(), kind: $('ce_kind').value, unit: $('ce_unit').value.trim() || null, notes: $('ce_notes').value.trim() || null, hours_to_fix: $('ce_fix').value === '' ? null : +$('ce_fix').value, logged_by: who }) }); await re(); } catch (e) { say('Could not add: ' + e.message); } };
    p.querySelectorAll('[data-res]').forEach((b) => b.onclick = async () => { try { await api('crm_events?id=eq.' + b.dataset.res, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ resolved: true, resolved_at: today() }) }); await re(); } catch (e) { say(e.message); } });
    p.querySelectorAll('[data-dele]').forEach((b) => b.onclick = async () => { if (!confirm('Delete this log entry?')) return; try { await api('crm_events?id=eq.' + b.dataset.dele, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await re(); } catch (e) { say(e.message); } });
    p.querySelectorAll('[data-delp]').forEach((b) => b.onclick = async () => { if (!confirm('Delete this contact?')) return; try { await api('crm_contacts?id=eq.' + b.dataset.delp, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await re(); } catch (e) { say(e.message); } });
  }
})();
