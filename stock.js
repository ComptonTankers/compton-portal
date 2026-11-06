/* Sales stock: vehicles held for sale, inspection links sent to the yard, and the submitted inspections. */
(function () {
  const X = window.CT; if (!X) return;
  const { api, all, gbp, esc, T, C } = X;
  const $ = (id) => document.getElementById(id);
  const TYPES = [['artic_petroleum', 'Artic – petroleum tanker'], ['artic_bitumen', 'Artic – bitumen tanker'], ['artic_waste', 'Artic – waste tanker'], ['tractor_unit', 'Tractor unit'], ['rigid_fuel', 'Rigid – fuel tanker']];
  const TLAB = Object.fromEntries(TYPES);
  const STAT = { awaiting_inspection: ['Awaiting inspection', 'a'], inspected: ['Inspected', 'b'], for_sale: ['For sale', 'g'], reserved: ['Reserved', 'a'], sold: ['Sold', 'r'], moved_to_hire: ['Moved to hire fleet', 'b'] };
  const JS = { assigned: ['Link sent', 'a'], in_progress: ['In progress', 'b'], submitted: ['Submitted', 'g'], reviewed: ['Reviewed', 'g'], cancelled: ['Cancelled', 'r'] };
  let ST = [], JOBS = {};
  const base = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  const link = (jobId) => base() + 'inspect/#c=' + jobId;
  const msg = (s, jobId) => `Vehicle inspection for ${s.reg} (${TLAB[s.vehicle_type] || 'vehicle'}). Open this link on your phone and follow the steps: ${link(jobId)}`;

  async function load() {
    ST = await all('stock', 'created_at.desc');
    const jobs = await all('jobs', 'created_at.desc');
    JOBS = {}; jobs.forEach((j) => { if (j.stock_id && !JOBS[j.stock_id]) JOBS[j.stock_id] = j; });   // newest job per vehicle
  }

  async function page(el) {
    el.innerHTML = X.head('Sales stock', 'Loading…');
    await load(); draw(el);
  }

  function draw(el, open) {
    const held = ST.filter((s) => !['sold', 'moved_to_hire'].includes(s.status));
    const cost = held.reduce((t, s) => t + (+s.cost || 0), 0), ask = held.reduce((t, s) => t + (+s.asking_price || 0), 0);
    const await_ = ST.filter((s) => s.status === 'awaiting_inspection').length, ready = ST.filter((s) => s.status === 'for_sale').length;
    const toReview = ST.filter((s) => JOBS[s.id] && JOBS[s.id].status === 'submitted').length;
    const rows = ST.map((s) => {
      const j = JOBS[s.id], st = STAT[s.status] || [s.status, 'b'], js = j ? JS[j.status] : null;
      return `<tr data-id="${s.id}"><td><b>${esc(s.reg)}</b><div class="small muted">${esc(s.stock_ref || '')}</div></td><td>${esc(TLAB[s.vehicle_type] || s.vehicle_type || '')}</td>
        <td><select data-st="${s.id}">${Object.entries(STAT).map(([k, v]) => `<option value="${k}" ${k === s.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></td>
        <td class="n"><input class="num" data-f="cost" data-id="${s.id}" value="${s.cost == null ? '' : Number(s.cost).toLocaleString('en-GB')}" placeholder="0"></td>
        <td class="n"><input class="num" data-f="asking_price" data-id="${s.id}" value="${s.asking_price == null ? '' : Number(s.asking_price).toLocaleString('en-GB')}" placeholder="0"></td>
        <td>${js ? `<span class="pill ${js[1]}">${js[0]}</span>` : '<span class="muted small">no job</span>'}</td>
        <td style="white-space:nowrap">${j && ['assigned', 'in_progress'].includes(j.status) ? `<button class="mini" data-copy="${j.id}" data-s="${s.id}">Copy link</button> <a class="mini" style="text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg(s, j.id))}">WhatsApp</a> <a class="mini" style="text-decoration:none;display:inline-block" href="sms:?&body=${encodeURIComponent(msg(s, j.id))}">Text</a>` : ''}
          ${j && ['submitted', 'reviewed'].includes(j.status) ? `<button class="mini pri2" data-view="${s.id}">View inspection</button>` : ''}
          ${!j || ['submitted', 'reviewed', 'cancelled'].includes(j.status) ? `<button class="mini" data-newjob="${s.id}">${j ? 'New inspection' : 'Create link'}</button>` : ''}</td></tr>`;
    }).join('');
    el.innerHTML = X.head('Sales stock', 'Vehicles held for sale and their inspections') +
      X.tiles([{ l: 'Vehicles in sales stock', v: held.length, s: ST.length - held.length + ' sold or moved to hire' },
        { l: 'Stock value at cost', v: gbp(cost), c: 'o' }, { l: 'Asking price total', v: gbp(ask), s: ask && cost ? 'margin ' + gbp(ask - cost) : '', c: 'g' },
        { l: 'Awaiting inspection', v: await_ }, { l: 'Inspections to review', v: toReview, c: toReview ? 'r' : '', s: ready + ' marked for sale' }]) +
      `<div class="card"><h3>Add a vehicle</h3><div class="hint">Creates the stock record and a link you can text or WhatsApp to someone in the yard. They open it on their phone, take the photos and answer the questions, and it comes straight back here.</div>
      <div class="form"><div><label>Registration / trailer ID</label><input id="s_reg" style="text-transform:uppercase"></div>
      <div><label>Vehicle type</label><select id="s_type">${TYPES.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>Stock ref (optional)</label><input id="s_ref"></div><div><label>Where is it?</label><input id="s_loc" placeholder="Yard / site"></div>
      <div><label>Cost £</label><input id="s_cost" type="number" step="0.01"></div><div><label>Asking price £</label><input id="s_ask" type="number" step="0.01"></div>
      <div><label>Notes for the person in the yard</label><input id="s_notes"></div><button id="s_add" type="button">Add &amp; create link</button></div><div class="err" id="s_err"></div><div id="s_out"></div></div>` +
      `<div class="card"><h3>Stock</h3><div class="hint">Change status from the dropdown. Cost and asking price save when you leave the box. “Moved to hire fleet” takes it out of sales stock.</div>
      ${ST.length ? `<div class="box2"><table><thead><tr><th>Vehicle</th><th>Type</th><th>Status</th><th class="n">Cost £</th><th class="n">Asking £</th><th>Inspection</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No vehicles yet. Add the first one above.</div>'}</div><div id="s_view"></div>`;
    wire(el);
    if (open) view(open);
  }

  function wire(el) {
    X.enhance([...el.querySelectorAll('table')].find((t) => t.querySelector('th') && t.querySelector('th').textContent === 'Vehicle'), { filters: ['Type', 'Status'], group: 'Status' });
    const err = (t) => { const e = $('s_err'); if (e) e.textContent = t || ''; };
    $('s_add').onclick = async () => {
      const reg = $('s_reg').value.trim().toUpperCase(); if (!reg) { err('Enter the registration or trailer ID.'); return; }
      try {
        err('');
        const [s] = await api('stock', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ reg, vehicle_type: $('s_type').value, stock_ref: $('s_ref').value.trim() || null, location: $('s_loc').value.trim() || null, cost: +$('s_cost').value || null, asking_price: +$('s_ask').value || null, notes: $('s_notes').value.trim() || null }) });
        const j = await newJob(s, $('s_notes').value.trim());
        await load(); draw(el); showLink(s, j);
      } catch (e) { err('Could not save: ' + e.message); }
    };
    el.querySelectorAll('[data-st]').forEach((sel) => sel.addEventListener('change', async () => { try { await api('stock?id=eq.' + sel.dataset.st, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: sel.value, sold_at: sel.value === 'sold' ? new Date().toISOString().slice(0, 10) : null }) }); await load(); draw(el); } catch (e) { alert('Could not save: ' + e.message); } }));
    el.querySelectorAll('input.num').forEach((inp) => inp.addEventListener('change', async () => { const raw = inp.value.replace(/[£,\s]/g, ''); const v = raw === '' ? null : Number(raw); if (raw !== '' && !isFinite(v)) return; try { await api('stock?id=eq.' + inp.dataset.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [inp.dataset.f]: v }) }); await load(); draw(el); } catch (e) { alert('Could not save: ' + e.message); } }));
    el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => { const s = ST.find((x) => x.id == b.dataset.s); try { await navigator.clipboard.writeText(msg(s, b.dataset.copy)); b.textContent = 'Copied ✓'; } catch (e) { prompt('Copy this message', msg(s, b.dataset.copy)); } }));
    el.querySelectorAll('[data-newjob]').forEach((b) => b.addEventListener('click', async () => { const s = ST.find((x) => x.id == b.dataset.newjob); try { const j = await newJob(s, s.notes || ''); await load(); draw(el); showLink(s, j); } catch (e) { alert('Could not create: ' + e.message); } }));
    el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => view(b.dataset.view)));
  }

  async function newJob(s, notes) {
    const id = crypto.randomUUID();
    const [j] = await api('jobs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id, ref: 'J' + Date.now().toString(36).toUpperCase(), vehicle_type: s.vehicle_type, reg: s.reg, stock_ref: s.stock_ref, location: s.location, notes: notes || null, stock_id: s.id, status: 'assigned' }) });
    return j;
  }
  function showLink(s, j) {
    const out = $('s_out'); if (!out) return; const m = msg(s, j.id);
    out.innerHTML = `<h3 style="margin-top:14px">Link for ${esc(s.reg)}</h3><div class="hint">Send this to whoever is in the yard.</div><input readonly value="${esc(link(j.id))}" onclick="this.select()">
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="mini" id="s_cp">Copy message</button><a class="mini" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(m)}">WhatsApp</a><a class="mini" style="text-decoration:none" href="sms:?&body=${encodeURIComponent(m)}">Text message</a></div>`;
    $('s_cp').onclick = async () => { try { await navigator.clipboard.writeText(m); $('s_cp').textContent = 'Copied ✓'; } catch (e) { prompt('Copy this message', m); } };
    out.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function fileUrl(path) {
    const s = JSON.parse(localStorage.getItem('compton-dash-session') || 'null'); if (!s) return null;
    const r = await fetch(window.SUPABASE_CONFIG.url + '/storage/v1/object/authenticated/inspections/' + path, { headers: { apikey: window.SUPABASE_CONFIG.anonKey, Authorization: 'Bearer ' + s.access_token } });
    if (!r.ok) return null; return URL.createObjectURL(await r.blob());
  }
  async function view(stockId) {
    const s = ST.find((x) => x.id == stockId), j = JOBS[stockId]; const box = $('s_view'); if (!j || !box) return;
    const d = j.data || {}; const rows = d.rows || [];
    let sec = '';
    box.innerHTML = `<div class="card" id="s_card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><div><h3>Inspection – ${esc(s.reg)}</h3><div class="hint">${esc(TLAB[s.vehicle_type] || '')} · submitted ${j.submitted_at ? new Date(j.submitted_at).toLocaleString('en-GB') : ''}${j.inspector_id ? '' : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${j.status !== 'reviewed' ? '<button class="mini pri2" id="s_ok">Approve – mark for sale</button>' : '<span class="pill g">Reviewed</span>'}<button class="mini" id="s_close">Close</button></div></div>
      <div class="row"><div><h3 style="font-size:17px">Details</h3><div class="box2"><table>${rows.map(([g, l, v]) => { const h = g !== sec ? `<tr><th colspan="2">${esc(g)}</th></tr>` : ''; sec = g; return h + `<tr><td class="muted">${esc(l)}</td><td>${esc(v)}</td></tr>`; }).join('') || '<tr><td>No details recorded.</td></tr>'}</table></div></div>
      <div><h3 style="font-size:17px">Photos</h3><div id="s_ph" class="phg"></div></div></div></div>`;
    $('s_close').onclick = () => { box.innerHTML = ''; };
    const ok = $('s_ok'); if (ok) ok.onclick = async () => { try { await api('jobs?id=eq.' + j.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'reviewed', reviewed_at: new Date().toISOString() }) }); await api('stock?id=eq.' + s.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'for_sale' }) }); await load(); draw(document.getElementById('main')); } catch (e) { alert(e.message); } };
    box.scrollIntoView({ behavior: 'smooth' });
    const ph = $('s_ph'); const items = [...(d.photos || []).filter((p) => p.path).map((p) => ({ path: p.path, cap: p.label })), ...(d.defects || []).filter((p) => p.path).map((p, i) => ({ path: p.path, cap: 'Defect ' + (i + 1) + (p.note ? ' – ' + p.note : '') }))];
    const skipped = (d.photos || []).filter((p) => p.status === 'skipped');
    ph.innerHTML = items.map((_, i) => `<figure id="ph${i}"><div class="phs">Loading…</div><figcaption>${esc(items[i].cap)}</figcaption></figure>`).join('') + (skipped.length ? `<div class="small muted" style="grid-column:1/-1">Skipped: ${skipped.map((p) => esc(p.label + ' (' + p.reason + ')')).join('; ')}</div>` : '') + (d.video && d.video.path ? `<div style="grid-column:1/-1"><b>Walkaround video</b><div id="s_vid" class="small muted">Loading…</div></div>` : '');
    items.forEach(async (it, i) => { const u = await fileUrl(it.path); const f = $('ph' + i); if (f) f.firstChild.outerHTML = u ? `<a href="${u}" target="_blank"><img src="${u}" alt=""></a>` : '<div class="phs">Not available</div>'; });
    if (d.video && d.video.path) { const u = await fileUrl(d.video.path); const v = $('s_vid'); if (v) v.innerHTML = u ? `<video src="${u}" controls style="width:100%;max-height:360px;border-radius:8px"></video>` : 'Not available'; }
  }

  const st = document.createElement('style');
  st.textContent = '.phg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.phg figure{margin:0}.phg img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block}.phs{aspect-ratio:4/3;background:#eef2f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#5B6675;font-size:12px}.phg figcaption{font-size:12px;margin-top:3px}input.num{width:96px;text-align:right;padding:5px 7px;font-size:13px}td select{padding:5px 6px;font-size:13px}';
  document.head.appendChild(st);
  X.routes.stock = page;
})();
