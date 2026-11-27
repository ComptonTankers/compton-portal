/* FLEET AVAILABILITY – what's on hire, what's booked and what's free, unit by unit on a timeline.
   On hire = live contracts (and bookings started from a hire agreement). Booked = hire_bookings.
   Click an empty part of a row to book that unit; click a bar to see or change it. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const DAY = 864e5, iso = (d) => new Date(d).toISOString().slice(0, 10), today = () => iso(Date.now());
  const add = (s, n) => iso(new Date(s).getTime() + n * DAY);
  const fd = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '');
  const C = { hire: '#164698', booked: '#7C3AED', shop: '#D97706', sale: '#94A3B8', free: '#16A34A' };
  const HU = () => (FR = FR || X.fleetReg).units().filter((u) => !FR.forHire || FR.forHire(u));
  let FR, QUOTES = [], CUSTS = [], F = { cat: '', show: 'all', q: '', weeks: 26 }, EL;

  async function load() {
    FR = X.fleetReg; await FR.load();
    [QUOTES] = await Promise.all([api('quotes?select=id,ref,version,customer,status,lines,valid_until&status=in.(Draft,Sent,Accepted)&order=id.desc').catch(() => [])]);
    CUSTS = [...new Set([...FR.contracts().map((c) => c.customer), ...QUOTES.map((q) => q.customer)].filter(Boolean))].sort();
  }
  // every period a unit is tied up: [{kind, from, to (null = open-ended), label, ref}]
  function spans(u) {
    FR = FR || X.fleetReg;   // used by hire agreements and quotes before this page has loaded
    const out = [], n = FR.norm(u.unit);
    FR.contracts().filter((c) => FR.norm(c.unit) === n).forEach((c) => out.push({ kind: 'hire', from: c.start_date || '2000-01-01', to: c.rolling || !c.end_date ? null : c.end_date, label: c.customer, c }));
    FR.allBookings().filter((b) => FR.norm(b.unit) === n && b.status !== 'Cancelled').forEach((b) => out.push({ kind: b.status === 'On hire' ? 'hire' : 'booked', from: b.start_date, to: b.end_date, label: b.customer, b }));
    if (['Workshop', 'For sale', 'On order', 'Reserved'].includes(u.status) && !out.some((s) => s.kind === 'hire' && s.from <= today())) out.push({ kind: u.status === 'For sale' ? 'sale' : 'shop', from: '2000-01-01', to: null, label: u.status });
    return out;
  }
  const overlaps = (s, a, b) => s.from <= (b || '9999-12-31') && (s.to || '9999-12-31') >= a;
  const freeBetween = (u, a, b) => !spans(u).some((s) => overlaps(s, a, b));
  const freeFrom = (u) => { // first date from today with nothing on it
    let d = today(); const sp = spans(u).sort((x, y) => (x.from < y.from ? -1 : 1));
    for (let i = 0; i < 50; i++) { const hit = sp.find((s) => overlaps(s, d, d)); if (!hit) return d; if (!hit.to) return null; d = add(hit.to, 1); }
    return null; };
  const nowState = (u) => { const s = spans(u).find((x) => overlaps(x, today(), today())); return s ? s.kind : 'free'; };

  X.routes['p-availability'] = async function (el) {
    EL = el; el.innerHTML = X.head('Fleet availability', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Fleet availability', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    const prm = new URLSearchParams(location.hash.split('?')[1] || ''); if (prm.get('cat')) F.cat = prm.get('cat');
    draw();
  };

  function draw() {
    const U = HU(), st = U.map((u) => [u, nowState(u)]), n = (k) => st.filter(([, s]) => s === k).length;
    const in30 = add(today(), 30), in60 = add(today(), 60);
    const bookedSoon = FR.allBookings().filter((b) => b.status === 'Booked' && b.start_date <= in30 && (!b.end_date || b.end_date >= today()));
    const offHire = FR.contracts().filter((c) => c.end_date && !c.rolling && c.end_date >= today() && c.end_date <= in60);
    const hireN = n('hire'), live = U.length - n('sale');
    EL.innerHTML = X.head('Fleet availability', 'What’s on hire, what’s booked and what’s free – now and over the coming months. Click an empty part of a row to book a unit.') +
      X.tiles([{ l: 'On hire now', v: hireN, s: live ? Math.round(hireN / live * 100) + '% utilisation (excl. for sale)' : '' },
        { l: 'Booked', v: n('booked') + ' now · ' + bookedSoon.length + ' in 30 days', s: 'reserved for a customer, not yet out' },
        { l: 'Available now', v: n('free'), s: n('shop') + ' in workshop / on order · ' + n('sale') + ' for sale' },
        { l: 'Due off hire (60 days)', v: offHire.length, s: offHire.length ? 'next: ' + offHire.sort((a, b) => (a.end_date < b.end_date ? -1 : 1)).slice(0, 2).map((c) => esc(c.unit) + ' ' + fd(c.end_date)).join(', ') : 'fixed-term contracts ending' }]) +
      `<div class="card"><h3 style="margin-top:0">By category</h3><table><thead><tr><th>Category</th><th class="n">Units</th><th class="n">On hire</th><th class="n">Booked</th><th class="n">Available now</th><th class="n">Free within 30 days</th><th class="n">Workshop / sale</th><th class="n">Standard £/wk</th><th></th></tr></thead><tbody>
      ${FR.cats().filter((c) => U.some((u) => u.category_id === c.id)).map((c) => { const cu = st.filter(([u]) => u.category_id === c.id), k = (x) => cu.filter(([, s]) => s === x).length;
        const soon = cu.filter(([u, s]) => s !== 'free' && s !== 'sale' && (() => { const f = freeFrom(u); return f && f <= in30; })()).length;
        return `<tr><td><b>${esc(c.name)}</b></td><td class="n">${cu.length}</td><td class="n">${k('hire') || ''}</td><td class="n">${k('booked') || ''}</td><td class="n" style="color:${C.free};font-weight:700">${k('free') || '<span class="muted">0</span>'}</td><td class="n">${soon || ''}</td><td class="n">${k('shop') + k('sale') || ''}</td>
          <td class="n">${c.default_weekly_rate != null ? gbp(c.default_weekly_rate) : '–'}</td><td><a href="#" data-fc="${c.id}">Show</a></td></tr>`; }).join('')}</tbody></table></div>
      <div class="card"><h3 style="margin-top:0">Find units for a hire</h3><div class="form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <label>Category <select id="fa_c">${FR.cats().map((c) => `<option value="${c.id}" ${String(c.id) === F.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>From <input id="fa_from" type="date" value="${today()}"></label><label>Until (blank = open-ended) <input id="fa_to" type="date"></label>
        <button class="pri2" id="fa_go">Find free units</button></div><div id="fa_res" style="margin-top:8px"></div></div>
      <div class="card"><div class="form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:8px">
        <label>Category <select id="pl_c"><option value="">All</option>${FR.cats().map((c) => `<option value="${c.id}" ${String(c.id) === F.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Show <select id="pl_s">${[['all', 'All units'], ['free', 'Available now'], ['hire', 'On hire'], ['booked', 'Booked'], ['soon', 'Coming free in 60 days'], ['shop', 'Workshop / on order / for sale']].map(([k, t]) => `<option value="${k}" ${k === F.show ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Search <input id="pl_q" value="${esc(F.q)}" placeholder="Unit or customer"></label>
        <label>Look ahead <select id="pl_w">${[13, 26, 52].map((w) => `<option value="${w}" ${w === F.weeks ? 'selected' : ''}>${w === 13 ? '3 months' : w === 26 ? '6 months' : '12 months'}</option>`).join('')}</select></label>
        <span class="small" style="margin-left:auto">${[['hire', 'On hire'], ['booked', 'Booked'], ['shop', 'Workshop / on order'], ['sale', 'For sale']].map(([k, t]) => `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${C[k]};vertical-align:-2px"></span> ${t}`).join(' &nbsp; ')}</span></div>
        <div id="pl_box"></div><div id="pl_form"></div></div>`;
    EL.querySelectorAll('[data-fc]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); F.cat = a.dataset.fc; draw(); $('pl_box').scrollIntoView({ behavior: 'smooth' }); }));
    $('pl_c').onchange = (e) => { F.cat = e.target.value; planner(); };
    $('pl_s').onchange = (e) => { F.show = e.target.value; planner(); };
    $('pl_w').onchange = (e) => { F.weeks = +e.target.value; planner(); };
    $('pl_q').oninput = (e) => { F.q = e.target.value; planner(); };
    $('fa_go').onclick = finder;
    planner();
  }

  function finder() {
    const cid = +$('fa_c').value, a = $('fa_from').value || today(), b = $('fa_to').value || null;
    const units = HU().filter((u) => u.category_id === cid), free = units.filter((u) => u.status !== 'For sale' && freeBetween(u, a, b));
    const later = units.filter((u) => !free.includes(u) && u.status !== 'For sale').map((u) => { const f = freeFrom(u); if (f && f <= a) { const nx = spans(u).filter((s) => s.from > a).sort((x, y) => (x.from < y.from ? -1 : 1))[0]; return [u, f, nx ? add(nx.from, -1) : null]; } return [u, f > a ? f : null]; }).filter(([, f]) => f).sort((x, y) => (x[1] < y[1] ? -1 : 1));
    $('fa_res').innerHTML = `<div class="small" style="margin-bottom:6px"><b>${free.length}</b> of ${units.length} free from ${fd(a)}${b ? ' to ' + fd(b) : ' (open-ended)'}.</div>` +
      (free.length ? free.map((u) => `<label style="display:inline-block;margin:3px 10px 3px 0"><input type="checkbox" data-fu="${esc(u.unit)}"> <b>${esc(u.unit)}</b> <span class="small muted">${esc([u.description, u.year, u.condition].filter(Boolean).join(' · '))}</span></label>`).join('') +
        `<div style="margin-top:8px"><button class="pri2" id="fa_book">Book the ticked units</button></div>` : '') +
      (later.length ? `<div class="small muted" style="margin-top:8px">Not free for the whole period: ${later.slice(0, 8).map(([u, f, until]) => esc(u.unit) + (until ? ' free until ' + fd(until) : ' free from ' + fd(f))).join(' · ')}</div>` : '');
    if ($('fa_book')) $('fa_book').onclick = () => { const us = [...document.querySelectorAll('[data-fu]:checked')].map((x) => x.dataset.fu); if (!us.length) return; bookForm({ units: us, start_date: a, end_date: b }); };
  }

  function planner() {
    const W = F.weeks, start = (() => { const d = new Date(today()); return add(today(), -((d.getUTCDay() + 6) % 7)); })(), end = add(start, W * 7), span = W * 7 * DAY;
    const pct = (s) => Math.max(0, Math.min(100, (new Date(s).getTime() - new Date(start).getTime()) / span * 100));
    const q = F.q.toLowerCase(), in60 = add(today(), 60);
    const rows = HU().filter((u) => (!F.cat || String(u.category_id) === F.cat)).map((u) => ({ u, sp: spans(u), now: nowState(u) }))
      .filter(({ u, sp, now }) => (F.show === 'all' || (F.show === 'soon' ? now !== 'free' && now !== 'sale' && (() => { const f = freeFrom(u); return f && f <= in60; })() : F.show === 'shop' ? ['shop', 'sale'].includes(now) : now === F.show))
        && (!q || (u.unit + ' ' + sp.map((s) => s.label).join(' ')).toLowerCase().includes(q)))
      .sort((a, b) => (FR.cat(a.u.category_id).name || '').localeCompare(FR.cat(b.u.category_id).name || '') || a.u.unit.localeCompare(b.u.unit, undefined, { numeric: true }));
    // month ticks
    const ticks = []; { let y = +start.slice(0, 4), m = +start.slice(5, 7); for (;;) { m++; if (m > 12) { m = 1; y++; } const t = y + '-' + String(m).padStart(2, '0') + '-01'; if (t >= end) break; ticks.push(t); } }
    let lastCat = null;
    $('pl_box').innerHTML = `<div class="small muted" style="margin-bottom:4px">${rows.length} units</div><div class="avp" style="position:relative;font-size:12px">
      <div style="display:flex;border-bottom:1px solid #CBD5E1;position:sticky;top:0;background:#fff;z-index:2"><div style="width:190px;flex:none;padding:4px 6px;font-weight:700">Unit</div><div style="flex:1;position:relative;height:22px">
        ${ticks.map((t) => `<div style="position:absolute;left:${pct(t)}%;top:0;bottom:0;border-left:1px solid #CBD5E1;padding-left:3px;color:#64748B">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+t.slice(5, 7) - 1]}${t.slice(5, 7) === '01' ? ' ' + t.slice(2, 4) : ''}</div>`).join('')}
        <div style="position:absolute;left:${pct(today())}%;top:0;color:#DC2626;font-weight:700;transform:translateX(-50%)">today</div></div></div>
      ${rows.map(({ u, sp, now }) => { const c = FR.cat(u.category_id), hdr = c.name !== lastCat ? `<div style="padding:8px 6px 3px;font-weight:700;color:#164698;border-bottom:1px solid #E3E7EE">${esc(c.name || 'No category')}</div>` : ''; lastCat = c.name;
        return hdr + `<div style="display:flex;border-bottom:1px solid #F1F5F9;align-items:center"><div style="width:190px;flex:none;padding:3px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${esc(u.unit)}</b> <span style="color:${now === 'free' ? C.free : C[now]};font-size:11px">${now === 'free' ? 'available' : now === 'hire' ? 'on hire' : now === 'booked' ? 'booked' : esc(u.status.toLowerCase())}</span></div>
          <div class="avrow" data-unit="${esc(u.unit)}" style="flex:1;position:relative;height:24px;cursor:copy;background:repeating-linear-gradient(90deg,transparent 0 calc(${100 / W}% - 1px),#F1F5F9 calc(${100 / W}% - 1px) ${100 / W}%)">
          <div style="position:absolute;left:${pct(today())}%;top:0;bottom:0;border-left:2px solid #DC2626;opacity:.5"></div>
          ${sp.filter((s) => s.from < end && (!s.to || s.to >= start)).map((s, i) => { const l = pct(s.from), r = s.to ? pct(add(s.to, 1)) : 100;
            const tip = esc(s.label + (s.kind === 'hire' || s.kind === 'booked' ? ' · ' + fd(s.from) + ' → ' + (s.to ? fd(s.to) : 'open-ended') : '') + (s.c ? ' · ' + gbp(s.c.monthly_rate * 12 / 52) + '/wk' : '') + (s.b && s.b.notes ? ' · ' + s.b.notes : ''));
            return `<div class="avbar" data-u="${esc(u.unit)}" data-i="${i}" title="${tip}" style="position:absolute;top:3px;bottom:3px;left:${l}%;width:${Math.max(0.6, r - l)}%;background:${C[s.kind]};${!s.to && s.kind === 'hire' ? `background:linear-gradient(90deg,${C.hire} 85%,${C.hire}55)` : ''};border-radius:4px;color:#fff;font-size:11px;padding:2px 5px;overflow:hidden;white-space:nowrap;cursor:pointer">${esc(s.label)}</div>`; }).join('')}
          </div></div>`; }).join('') || '<div class="muted" style="padding:10px">No units match.</div>'}</div>`;
    $('pl_box').querySelectorAll('.avrow').forEach((r) => (r.onclick = (e) => { if (e.target.closest('.avbar')) return; const b = r.getBoundingClientRect(), d = add(start, Math.floor((e.clientX - b.left) / b.width * W * 7)); bookForm({ units: [r.dataset.unit], start_date: d < today() ? today() : d }); }));
    $('pl_box').querySelectorAll('.avbar').forEach((b) => (b.onclick = () => { const u = HU().find((x) => x.unit === b.dataset.u), s = spans(u)[+b.dataset.i]; if (s.b) bookForm(s.b); else if (s.c) showContract(u, s.c); }));
  }

  function showContract(u, c) {
    $('pl_form').innerHTML = `<div class="box2" style="padding:12px;margin-top:10px"><b>${esc(u.unit)}</b> on hire to <b>${esc(c.customer)}</b> since ${fd(c.start_date)} – ${c.end_date && !c.rolling ? 'fixed term to ' + fd(c.end_date) : 'rolling' + (c.notice_days ? ', ' + c.notice_days + ' days’ notice' : '')}. ${gbp(c.monthly_rate)}/month (${gbp(c.monthly_rate * 12 / 52)}/week).
      <div style="margin-top:8px;display:flex;gap:8px"><button id="sc_next">Book it for the next customer from ${fd(c.end_date ? add(c.end_date, 1) : today())}</button><button id="sc_x">Close</button></div></div>`;
    $('sc_x').onclick = () => ($('pl_form').innerHTML = '');
    $('sc_next').onclick = () => bookForm({ units: [u.unit], start_date: c.end_date ? add(c.end_date, 1) : today() });
    $('pl_form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // create (units[]) or edit (an existing booking row)
  function bookForm(b) {
    const edit = !!b.id, units = edit ? [b.unit] : b.units;
    $('pl_form').innerHTML = `<div class="box2" style="padding:12px;margin-top:10px"><h3 style="margin-top:0">${edit ? 'Booking – ' + esc(b.unit) : 'Book ' + esc(units.join(', '))}</h3><div class="form" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
      <label style="grid-column:span 2">Customer<input id="bk_cust" list="bk_cl" value="${esc(b.customer || '')}"><datalist id="bk_cl">${CUSTS.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>From<input id="bk_from" type="date" value="${esc(b.start_date || today())}"></label><label>Until (blank = open-ended)<input id="bk_to" type="date" value="${esc(b.end_date || '')}"></label>
      <label style="grid-column:span 2">Quote<select id="bk_q"><option value="">– none –</option>${QUOTES.map((q) => `<option value="${q.id}" ${q.id === b.quote_id ? 'selected' : ''}>${esc(q.ref)} v${q.version} · ${esc(q.customer)} (${esc(q.status)})</option>`).join('')}</select></label>
      <label style="grid-column:span 2">Notes<input id="bk_notes" value="${esc(b.notes || '')}"></label></div><div id="bk_warn" class="small" style="color:#B91C1C;margin-top:6px"></div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="pri2" id="bk_save">${edit ? 'Save' : 'Book'}</button>${edit ? '<button id="bk_cancel" style="border-color:#DC2626;color:#B91C1C">Cancel booking</button>' : ''}<button id="bk_x">Close</button>
      ${edit && b.agreement_id ? `<a href="#/p-agreements?a=${b.agreement_id}" class="small">Open hire agreement</a>` : ''}<span id="bk_msg" class="small muted"></span></div></div>`;
    $('pl_form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('bk_q').onchange = () => { const q = QUOTES.find((x) => x.id === +$('bk_q').value); if (q && !$('bk_cust').value) $('bk_cust').value = q.customer; };
    const check = () => { const a = $('bk_from').value, z = $('bk_to').value || null;
      const clash = units.filter((un) => { const u = HU().find((x) => x.unit === un); return u && spans(u).some((s) => !(s.b && s.b.id === b.id) && overlaps(s, a, z)); });
      $('bk_warn').textContent = clash.length ? 'Clashes with something already on ' + clash.join(', ') + ' over those dates – check the timeline.' : ''; return clash; };
    $('bk_from').onchange = $('bk_to').onchange = check; check();
    $('bk_x').onclick = () => ($('pl_form').innerHTML = '');
    $('bk_save').onclick = async () => {
      const body = { customer: $('bk_cust').value.trim(), start_date: $('bk_from').value, end_date: $('bk_to').value || null, quote_id: +$('bk_q').value || null, notes: $('bk_notes').value.trim() || null, updated_at: new Date().toISOString() };
      if (!body.customer || !body.start_date) { $('bk_msg').textContent = 'Customer and start date please.'; return; }
      if (body.end_date && body.end_date < body.start_date) { $('bk_msg').textContent = 'The end date is before the start.'; return; }
      if (check().length && !confirm('That clashes with an existing hire or booking. Book anyway?')) return;
      try { if (edit) await api('hire_bookings?id=eq.' + b.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
        else await api('hire_bookings', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(units.map((u) => Object.assign({ unit: u, status: 'Booked' }, body))) });
        await load(); draw(); } catch (e) { $('bk_msg').textContent = 'Could not save: ' + e.message; } };
    if ($('bk_cancel')) $('bk_cancel').onclick = async () => { if (!confirm('Cancel this booking?')) return; await api('hire_bookings?id=eq.' + b.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'Cancelled', updated_at: new Date().toISOString() }) }); await load(); draw(); };
  }
  X.availability = { spans, freeBetween, freeFrom, nowState };
})();
