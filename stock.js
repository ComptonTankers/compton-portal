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
          ${!j || ['submitted', 'reviewed', 'cancelled'].includes(j.status) ? `<button class="mini" data-newjob="${s.id}">${j ? 'New inspection' : 'Create link'}</button>` : ''}
          ${j ? `<button class="mini" data-deljob="${s.id}" title="Remove this inspection request">${['assigned', 'in_progress'].includes(j.status) ? 'Cancel request' : 'Delete inspection'}</button>` : ''}
          <button class="mini" data-delveh="${s.id}" title="Remove this vehicle from sales stock" style="color:#b3261e">✕</button></td></tr>`;
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
    el.querySelectorAll('[data-deljob]').forEach((b) => b.addEventListener('click', async () => { const s = ST.find((x) => x.id == b.dataset.deljob), j = JOBS[s.id]; if (!j) return;
      const open = ['assigned', 'in_progress'].includes(j.status);
      if (!confirm(open ? 'Cancel the inspection request for ' + s.reg + '? The link will stop working and the request is removed.' : 'Permanently delete the submitted inspection for ' + s.reg + ' (answers and report)? This cannot be undone.')) return;
      try { await api('jobs?id=eq.' + j.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); if (s.status === 'awaiting_inspection' && open) { } const v = $('s_view'); if (v) v.innerHTML = ''; await load(); draw(el); } catch (e) { alert('Could not remove: ' + e.message); } }));
    el.querySelectorAll('[data-delveh]').forEach((b) => b.addEventListener('click', async () => { const s = ST.find((x) => x.id == b.dataset.delveh); if (!s) return;
      if (!confirm('Remove ' + s.reg + ' from sales stock, including its inspection requests and reports? This cannot be undone.')) return;
      try { await api('jobs?stock_id=eq.' + s.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await api('stock?id=eq.' + s.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); await load(); draw(el); } catch (e) { alert('Could not remove: ' + e.message); } }));
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
    /* ---- sales photos: cut out, studio backdrop, logo watermark (originals untouched) ---- */
    const WALK = ['front_driver', 'front_pass', 'rear_pass', 'rear_driver', 'side_driver', 'side_pass', 'square_rear', 'square_front'];
    const hdr0 = box.querySelector('div[style*="display:flex;gap:8px"]');
    const sb = document.createElement('button'); sb.className = 'mini'; sb.textContent = 'Sales photos'; hdr0.insertBefore(sb, hdr0.firstChild);
    sb.onclick = () => salesPhotos(box, (d.photos || []).filter((p) => p.path && WALK.includes(p.key)), s.reg, j, d);
    /* ---- office editing: change values, add rows, add notes ---- */
    const hdr = box.querySelector('div[style*="display:flex;gap:8px"]');
    const eb = document.createElement('button'); eb.className = 'mini'; eb.id = 's_edit'; eb.textContent = 'Edit report'; hdr.insertBefore(eb, hdr.firstChild);
    const tableBox = box.querySelector('.box2');
    const note = d.office_notes || '';
    const noteHtml = () => (d.office_notes ? `<div class="card" style="margin-top:8px;background:#fff8ec;box-shadow:none"><b>Office notes</b><div style="white-space:pre-wrap">${esc(d.office_notes)}</div></div>` : '');
    tableBox.insertAdjacentHTML('afterend', '<div id="s_notes">' + noteHtml() + '</div>');
    eb.onclick = () => {
      let R = rows.map((r) => r.slice()); let N = note;
      const draw = () => {
        let sc = '';
        tableBox.innerHTML = '<table>' + R.map((r, i) => { const h = r[0] !== sc ? `<tr><th colspan="3">${esc(r[0])}</th></tr>` : ''; sc = r[0]; return h + `<tr><td class="muted">${esc(r[1])}</td><td><input data-i="${i}" value="${esc(r[2])}" style="width:100%;padding:5px 7px;font-size:13px"></td><td><button class="mini" data-del="${i}" title="Remove this line">✕</button></td></tr>`; }).join('') + '</table>' +
          `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><input id="s_nl" placeholder="New line, e.g. Tank test due" style="padding:5px 7px;flex:1;min-width:160px"><input id="s_nv" placeholder="Value" style="padding:5px 7px;flex:1;min-width:120px"><button class="mini" id="s_addl">Add line</button></div>
           <div style="margin-top:8px"><b>Office notes</b><textarea id="s_nt" style="width:100%;min-height:70px;padding:6px;font-size:13px" placeholder="Anything extra to add to this report">${esc(N)}</textarea></div>
           <div class="hint" style="margin-top:4px">Tip: for dates, type the date or the word Expired / Not available.</div>
           <div style="margin-top:8px;display:flex;gap:8px"><button class="mini pri2" id="s_save">Save changes</button><button class="mini" id="s_cancel">Cancel</button></div>`;
        tableBox.querySelectorAll('input[data-i]').forEach((inp) => { inp.oninput = () => { R[+inp.dataset.i][2] = inp.value; }; });
        tableBox.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { R.splice(+b.dataset.del, 1); N = $('s_nt').value; draw(); }; });
        $('s_nt').oninput = (e) => { N = e.target.value; };
        $('s_addl').onclick = () => { const l = $('s_nl').value.trim(); if (!l) return; N = $('s_nt').value; let g = 'Added by office'; R.push([g, l, $('s_nv').value]); draw(); };
        $('s_cancel').onclick = () => view(stockId);
        $('s_save').onclick = async (e) => { e.target.disabled = true; try {
          const nd = Object.assign({}, d, { rows: R, office_notes: $('s_nt').value.trim(), edited_at: new Date().toISOString() });
          await api('jobs?id=eq.' + j.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ data: nd }) });
          j.data = nd; view(stockId); } catch (er) { alert('Could not save: ' + er.message); e.target.disabled = false; } };
      };
      draw();
    };
    const ok = $('s_ok'); if (ok) ok.onclick = async () => { try { await api('jobs?id=eq.' + j.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'reviewed', reviewed_at: new Date().toISOString() }) }); await api('stock?id=eq.' + s.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'for_sale' }) }); await load(); draw(document.getElementById('main')); } catch (e) { alert(e.message); } };
    box.scrollIntoView({ behavior: 'smooth' });
    const ph = $('s_ph'); const sess = () => JSON.parse(localStorage.getItem('compton-dash-session') || 'null');
    const items = [...(d.photos || []).map((p, i) => ({ arr: 'photos', i, p })).filter((o) => o.p.path), ...(d.defects || []).map((p, i) => ({ arr: 'defects', i, p })).filter((o) => o.p.path)].map((o) => ({ ...o, path: o.p.path, cap: o.arr === 'photos' ? o.p.label : 'Defect ' + (o.i + 1) + (o.p.note ? ' – ' + o.p.note : '') }));
    const skipped = (d.photos || []).map((p, i) => ({ p, i })).filter((o) => o.p.status === 'skipped');
    const saveD = async () => { d.edited_at = new Date().toISOString(); await api('jobs?id=eq.' + j.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ data: d }) }); j.data = d; };
    const up = async (file) => {
      const im = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = rej; x.src = URL.createObjectURL(file); });
      const sc = Math.min(1, 2000 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', .9)); const path = 'office/' + j.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.jpg';
      const r = await fetch(window.SUPABASE_CONFIG.url + '/storage/v1/object/inspections/' + path, { method: 'POST', headers: { apikey: window.SUPABASE_CONFIG.anonKey, Authorization: 'Bearer ' + sess().access_token, 'Content-Type': 'image/jpeg' }, body: blob });
      if (!r.ok) throw new Error('upload failed (' + r.status + ')'); return path;
    };
    const pick = (multi) => new Promise((res) => { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.multiple = !!multi; f.onchange = () => res([...f.files]); f.click(); });
    ph.insertAdjacentHTML('beforebegin', `<div id="s_addbar" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center"><input id="s_pl" placeholder="Label, e.g. Tank plate" style="padding:5px 7px;flex:1;min-width:140px"><button class="mini" id="s_addph">+ Add photos</button><span id="s_phm" class="small muted"></span></div>`);
    $('s_addph').onclick = async () => { const fs = await pick(true); if (!fs.length) return; const lab = $('s_pl').value.trim(); d.photos = d.photos || [];
      try { for (let k = 0; k < fs.length; k++) { $('s_phm').textContent = `Uploading ${k + 1} of ${fs.length}…`; const path = await up(fs[k]); d.photos.push({ key: 'office', label: lab || 'Added by office', path, status: 'ok', by: 'office' }); } await saveD(); view(stockId); } catch (er) { $('s_phm').innerHTML = '<span style="color:#b3261e">' + esc(er.message) + '</span>'; } };
    ph.innerHTML = items.map((o, i) => `<figure id="ph${i}"><div class="phs">Loading…</div><figcaption>${esc(o.cap)}<br><a href="#" data-rp="${i}">Replace</a> · <a href="#" data-rl="${i}">Rename</a> · <a href="#" data-rm="${i}">Remove</a></figcaption></figure>`).join('') + (skipped.length ? `<div class="small muted" style="grid-column:1/-1">Skipped: ${skipped.map((o) => esc(o.p.label + ' (' + (o.p.reason || 'skipped') + ')') + ` <a href="#" data-sk="${o.i}">Add photo</a>`).join('; ')}</div>` : '') + (d.video && d.video.path ? `<div style="grid-column:1/-1"><b>Walkaround video</b><div id="s_vid" class="small muted">Loading…</div></div>` : '');
    const run = async (fn) => { try { await fn(); await saveD(); view(stockId); } catch (er) { alert('Could not save: ' + er.message); } };
    ph.querySelectorAll('[data-rp]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); const o = items[+a.dataset.rp]; const [f] = await pick(false); if (f) run(async () => { d[o.arr][o.i].path = await up(f); d[o.arr][o.i].status = 'ok'; }); });
    ph.querySelectorAll('[data-rl]').forEach((a) => a.onclick = (e) => { e.preventDefault(); const o = items[+a.dataset.rl]; const v = prompt('Label for this photo', o.arr === 'photos' ? o.p.label : (o.p.note || '')); if (v !== null) run(async () => { d[o.arr][o.i][o.arr === 'photos' ? 'label' : 'note'] = v; }); });
    ph.querySelectorAll('[data-rm]').forEach((a) => a.onclick = (e) => { e.preventDefault(); const o = items[+a.dataset.rm]; if (confirm('Remove this photo from the report?')) run(async () => { d[o.arr].splice(o.i, 1); }); });
    ph.querySelectorAll('[data-sk]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); const i = +a.dataset.sk; const [f] = await pick(false); if (f) run(async () => { d.photos[i].path = await up(f); d.photos[i].status = 'ok'; }); });
    items.forEach(async (it, i) => { const u = await fileUrl(it.path); const f = $('ph' + i); if (f) f.firstChild.outerHTML = u ? `<a href="${u}" target="_blank"><img src="${u}" alt=""></a>` : '<div class="phs">Not available</div>'; });
    if (d.video && d.video.path) { const u = await fileUrl(d.video.path); const v = $('s_vid'); if (v) v.innerHTML = u ? `<video src="${u}" controls style="width:100%;max-height:360px;border-radius:8px"></video>` : 'Not available'; }
  }

  /* Realistic yard backdrop: cloudy sky, grey cladded building, pale concrete forecourt. */
  function drawBackdrop(x, W, H, style) {
    if (style === 'white') { x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); return; }
    if (style === 'navy') { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a5db0'); g.addColorStop(1, '#0f2f6b'); x.fillStyle = g; x.fillRect(0, 0, W, H); return; }
    if (style === 'studio') { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f7f8fb'); g.addColorStop(.62, '#e6eaf1'); g.addColorStop(1, '#cfd6e2'); x.fillStyle = g; x.fillRect(0, 0, W, H); return; }
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bTop = H * .20, bBot = H * .47;
    /* sky */
    let g = x.createLinearGradient(0, 0, 0, bTop + 20); g.addColorStop(0, '#9fb0c4'); g.addColorStop(1, '#dfe5ec'); x.fillStyle = g; x.fillRect(0, 0, W, bTop + 20);
    for (let i = 0; i < 26; i++) { const cx = rnd() * W, cy = rnd() * bTop * .9, r = 90 + rnd() * 200; const c = x.createRadialGradient(cx, cy, 0, cx, cy, r); c.addColorStop(0, 'rgba(255,255,255,.42)'); c.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = c; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
    for (let i = 0; i < 12; i++) { const cx = rnd() * W, cy = rnd() * bTop * .8, r = 100 + rnd() * 180; const c = x.createRadialGradient(cx, cy, 0, cx, cy, r); c.addColorStop(0, 'rgba(110,125,145,.22)'); c.addColorStop(1, 'rgba(110,125,145,0)'); x.fillStyle = c; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
    /* building */
    g = x.createLinearGradient(0, bTop, 0, bBot); g.addColorStop(0, '#9da3ab'); g.addColorStop(1, '#868c95'); x.fillStyle = g; x.fillRect(0, bTop, W, bBot - bTop);
    x.fillStyle = '#a9aeb6'; x.fillRect(0, bTop, W, 5); x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, bTop + 5, W, 6);
    for (let px = 0; px < W; px += 38) { x.fillStyle = (px / 38) % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; x.fillRect(px, bTop + 11, 3, bBot - bTop - 11); }
    x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, bBot - 6, W, 6);
    /* concrete forecourt */
    g = x.createLinearGradient(0, bBot, 0, H); g.addColorStop(0, '#bcbcb7'); g.addColorStop(.35, '#cbcbc6'); g.addColorStop(1, '#d9d9d4'); x.fillStyle = g; x.fillRect(0, bBot, W, H - bBot);
    /* soft mottling + grain */
    for (let i = 0; i < 90; i++) { const cx = rnd() * W, cy = bBot + rnd() * (H - bBot), r = 40 + rnd() * 140; const c = x.createRadialGradient(cx, cy, 0, cx, cy, r); const d = rnd() > .5; c.addColorStop(0, d ? 'rgba(0,0,0,.025)' : 'rgba(255,255,255,.04)'); c.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = c; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
    const t = document.createElement('canvas'); t.width = t.height = 160; const tx = t.getContext('2d'), id = tx.createImageData(160, 160); for (let i = 0; i < id.data.length; i += 4) { const v = 110 + rnd() * 110; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; } tx.putImageData(id, 0, 0);
    x.save(); x.beginPath(); x.rect(0, bBot, W, H - bBot); x.clip(); x.fillStyle = x.createPattern(t, 'repeat'); x.fillRect(0, bBot, W, H - bBot); x.restore();
    /* expansion joints in perspective */
    x.strokeStyle = 'rgba(70,70,65,.10)'; x.lineWidth = 2;
    for (let k = -4; k <= 5; k++) { x.beginPath(); x.moveTo(W / 2 + k * 150, bBot); x.lineTo(W / 2 + k * 520, H); x.stroke(); }
    for (let k = 1; k < 5; k++) { const y = bBot + (H - bBot) * (k * k) / 28; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
    /* vignette */
    g = x.createRadialGradient(W / 2, H * .55, H * .35, W / 2, H * .55, W * .75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.16)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }

  const PROMPT = (reg) => `Edit this photo of a commercial tanker vehicle for a sales listing.
Keep the vehicle EXACTLY as it is: do not change its shape, colour, livery, markings, number plates, dents, wear or any detail, and do not crop any part of it.
Replace ONLY the background and ground with a clean, realistic UK commercial yard: a modern industrial building behind, clean concrete hardstanding, soft overcast daylight, natural sky. Match the lighting and add a natural soft shadow under the vehicle so it sits realistically on the ground.
Keep the same camera angle and framing. Photorealistic, professional dealer-quality finish. No extra vehicles or people, and no other text.
WATERMARK: I have attached the Compton Tankers logo as a second image. Place it small (about 15% of the image width) in the bottom-right corner with a modest margin, slightly translucent (about 85% opacity). The logo has white lettering, so put it on a subtle dark navy rounded translucent panel so it stays readable. Do not alter the logo's colours, shape or spelling, and keep it clear of the vehicle.`;
  function dl(blob, name) { const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = name; document.body.appendChild(l); l.click(); l.remove(); }
  async function salesPhotos(box, items, reg, j, d) {
    let panel = box.querySelector('#s_sales'); if (panel) panel.remove();
    const done = d.sales || [];
    box.insertAdjacentHTML('beforeend', `<div class="card" id="s_sales"><h3 style="margin-top:0">Sales photos (ChatGPT)</h3>
      <div class="hint">Three steps. Your original photos are never changed – the enhanced ones are stored alongside them.</div>
      <div style="margin:10px 0"><b>1.</b> <button class="mini" id="ss_dl">Download the ${items.length} original photos</button> <span class="small muted">(saved one by one, named by angle)</span></div>
      <div style="margin:10px 0"><b>2.</b> Open ChatGPT, attach a photo <b>and the logo</b> (<a href="assets/compton-logo-white.png" download="compton-logo.png">download logo</a>), paste this prompt (add your test background as a further image if you want that exact yard): <button class="mini" id="ss_cp">Copy prompt</button> <a class="mini" style="text-decoration:none" target="_blank" rel="noopener" href="https://chatgpt.com/">Open ChatGPT</a>
        <textarea readonly id="ss_pr" rows="6" style="width:100%;margin-top:6px;font-size:12px">${esc(PROMPT(reg))}</textarea></div>
      <div style="margin:10px 0"><b>3.</b> Save each result, then add them here: <input type="file" id="ss_up" accept="image/*,.zip,application/zip" multiple> <label class="small"><input type="checkbox" id="ss_wm"> add logo here too (leave off if ChatGPT already added it)</label></div>
      <div id="ss_msg" class="small muted"></div><div style="margin:8px 0"><button class="mini" id="ss_dall">Download all enhanced photos</button></div><div id="ss_out" class="phg"></div></div>`);
    const q = (i) => box.querySelector(i); const msg = q('#ss_msg'), out = q('#ss_out');
    q('#s_sales').scrollIntoView({ behavior: 'smooth' });
    const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    async function show() { out.innerHTML = ''; for (const it of (d.sales || [])) { const u = await fileUrl(it.path); out.insertAdjacentHTML('beforeend', `<figure>${u ? `<a href="${u}" target="_blank"><img src="${u}" alt=""></a>` : '<div class="phs">Not available</div>'}<figcaption>${esc(it.name || '')} · ${u ? `<a href="${u}" download="${esc(it.name || 'photo.jpg')}">Download</a> · ` : ''}<a href="#" data-rm="${esc(it.path)}">Remove</a></figcaption></figure>`); }
      out.querySelectorAll('[data-rm]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); if (!confirm('Remove this enhanced photo? The original is not affected.')) return; d.sales = (d.sales || []).filter((x) => x.path !== a.dataset.rm); await save(); show(); }); }
    async function save() { await api('jobs?id=eq.' + j.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ data: d }) }); }
    q('#ss_dall').onclick = async () => { const L = d.sales || []; if (!L.length) { msg.textContent = 'No enhanced photos saved yet.'; return; } for (let i = 0; i < L.length; i++) { const u = await fileUrl(L[i].path); if (u) dl(await (await fetch(u)).blob(), (reg + '-sales-' + (i + 1)).replace(/[^A-Za-z0-9-]+/g, '_') + '.jpg'); await new Promise((r) => setTimeout(r, 500)); } };
    q('#ss_cp').onclick = async () => { try { await navigator.clipboard.writeText(PROMPT(reg)); q('#ss_cp').textContent = 'Copied ✓'; } catch (e) { q('#ss_pr').select(); } };
    q('#ss_dl').onclick = async () => { for (let i = 0; i < items.length; i++) { const u = await fileUrl(items[i].path); if (u) { const b = await (await fetch(u)).blob(); dl(b, (reg + '-' + (i + 1) + '-' + (items[i].label || items[i].key)).replace(/[^A-Za-z0-9-]+/g, '_') + '.jpg'); } await new Promise((r) => setTimeout(r, 500)); } };
    q('#ss_up').onchange = async (e) => {
      let files = [...e.target.files]; if (!files.length) return;
      if (files.some((f) => /\.zip$/i.test(f.name))) {
        try {
          msg.textContent = 'Opening zip…'; if (!window.JSZip) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('could not load the zip tool')); document.head.appendChild(sc); });
          const out2 = []; for (const f of files) { if (!/\.zip$/i.test(f.name)) { out2.push(f); continue; } const z = await window.JSZip.loadAsync(f); const names = Object.keys(z.files).filter((n) => !z.files[n].dir && /\.(jpe?g|png|webp)$/i.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n)).sort(); for (const n of names) { const b = await z.files[n].async('blob'); out2.push(new File([b], n.split('/').pop(), { type: /png$/i.test(n) ? 'image/png' : /webp$/i.test(n) ? 'image/webp' : 'image/jpeg' })); } }
          files = out2; if (!files.length) { msg.textContent = 'No pictures found in that zip.'; e.target.value = ''; return; }
        } catch (er) { msg.innerHTML = '<span style="color:#b3261e">' + esc(er.message || 'Could not read the zip') + '</span>'; e.target.value = ''; return; }
      } const wm = q('#ss_wm').checked; const s = JSON.parse(localStorage.getItem('compton-dash-session') || 'null');
      let lg = null; if (wm) { try { lg = await img('assets/compton-logo.png'); } catch (x) { } }
      d.sales = d.sales || [];
      for (let i = 0; i < files.length; i++) {
        msg.textContent = `Uploading ${i + 1} of ${files.length}…`;
        try {
          const im = await img(URL.createObjectURL(files[i])); const sc = Math.min(1, 2000 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc); const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
          if (lg) { const lw = c.width * .18, lh = lw * lg.height / lg.width; x.save(); x.globalAlpha = .65; x.drawImage(lg, c.width - lw - c.width * .02, c.height - lh - c.width * .02, lw, lh); x.restore(); }
          const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', .92)); const path = 'sales/' + j.id + '/' + Date.now() + '-' + i + '.jpg';
          const r = await fetch(window.SUPABASE_CONFIG.url + '/storage/v1/object/inspections/' + path, { method: 'POST', headers: { apikey: window.SUPABASE_CONFIG.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'image/jpeg' }, body: blob });
          if (!r.ok) throw new Error('upload failed (' + r.status + ')');
          d.sales.push({ path, name: files[i].name.replace(/\.[^.]+$/, '') + '.jpg', at: new Date().toISOString() });
        } catch (er) { msg.innerHTML = '<span style="color:#b3261e">' + esc((er && er.message) || ('Could not read ' + files[i].name)) + '</span>'; }
      }
      try { await save(); msg.textContent = 'Saved ✓'; } catch (er) { msg.textContent = 'Photos uploaded but could not be recorded: ' + er.message; }
      e.target.value = ''; show();
    };
    show();
  }

  const st = document.createElement('style');
  st.textContent = '.phg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.phg figure{margin:0}.phg img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block}.phs{aspect-ratio:4/3;background:#eef2f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#5B6675;font-size:12px}.phg figcaption{font-size:12px;margin-top:3px}input.num{width:96px;text-align:right;padding:5px 7px;font-size:13px}td select{padding:5px 6px;font-size:13px}';
  document.head.appendChild(st);
  X.routes.stock = page;
})();
