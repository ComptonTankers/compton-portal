/* INSPECTION QUESTIONS – edit the photos and questions the inspection app asks, per vehicle type.
   Stored in the inspection_templates table; the inspection app reads them when a job link is opened.
   Every save keeps the previous version in inspection_template_history so it can be restored. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, esc } = X;
  const TYPES = { rigid_combi: 'Rigid – combination tanker (jetvac)', rigid_waste: 'Rigid – waste tanker', rigid_fuel: 'Rigid – fuel tanker', tractor_unit: 'Tractor unit', artic_petroleum: 'Artic – petroleum tanker', artic_bitumen: 'Artic – bitumen tanker', artic_waste: 'Artic – waste tanker' };
  const ATYPES = [['text', 'Short text'], ['textarea', 'Long text'], ['number', 'Number'], ['select', 'Drop-down list'], ['yesno', 'Yes / No'], ['rating', 'Rating 1–5'], ['date', 'Date']];
  const SPECIALS = { tread: 'Tyre tread depths screen', compartments: 'Compartments and sizes screen' };
  const KEEP = new Set(['front_driver', 'front_pass', 'rear_pass', 'rear_driver', 'side_driver', 'side_pass', 'square_rear', 'square_front']);
  const slug = (s) => (String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'q') + '_' + Math.random().toString(36).slice(2, 6);
  const mv = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let cur = null, dirty = false, typeSel = 'rigid_combi';

  X.routes['p-inspq'] = async function (el) {
    el.innerHTML = X.head('Inspection questions', 'The photos and questions the inspection app asks, for each vehicle type') + '<div class="empty">Loading…</div>';
    let list = [];
    try { list = await api('inspection_templates?select=vehicle_type,label,version,updated_at,updated_by&order=vehicle_type'); } catch (e) { el.innerHTML = X.head('Inspection questions', '') + `<div class="card"><div class="hint">Could not load the question sets: ${esc(e.message)}</div></div>`; return; }
    const have = new Set(list.map((t) => t.vehicle_type));
    el.innerHTML = X.head('Inspection questions', 'The photos and questions the inspection app asks, for each vehicle type') +
      `<div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Vehicle type</b> <select id="iq_type" style="padding:6px">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === typeSel ? 'selected' : ''}>${esc(v)}${have.has(k) ? '' : ' (not set up)'}</option>`).join('')}</select>
        <span id="iq_meta" class="small muted"></span></div>
        <div class="hint" style="margin-top:8px">Changes apply to inspection links opened <b>after</b> you save – including links already sent that haven't been started. Inspections already sent to the office keep the questions they were done with.</div></div>
      <div id="iq_body"></div>`;
    const typeEl = el.querySelector('#iq_type');
    typeEl.onchange = () => { if (dirty && !confirm('You have unsaved changes. Discard them?')) { typeEl.value = typeSel; return; } typeSel = typeEl.value; load(); };
    async function load() {
      dirty = false; const body = el.querySelector('#iq_body'); body.innerHTML = '<div class="empty">Loading…</div>';
      const r = await api('inspection_templates?select=*&vehicle_type=eq.' + typeSel);
      if (!r.length) { body.innerHTML = '<div class="card"><div class="hint">This vehicle type has no question set yet. The inspection app is using its built-in questions for it.</div></div>'; el.querySelector('#iq_meta').textContent = ''; return; }
      cur = r[0]; cur.def.photos = cur.def.photos || []; cur.def.fields = cur.def.fields || []; cur.def.groups = cur.def.groups || []; cur.def.photoSections = cur.def.photoSections || [];
      el.querySelector('#iq_meta').textContent = `Version ${cur.version} · saved ${new Date(cur.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${cur.updated_by ? ' by ' + cur.updated_by : ''}`;
      draw();
    }
    function draw() {
      const d = cur.def, body = el.querySelector('#iq_body');
      const nP = d.photos.reduce((n, p) => n + (p.count || 1), 0), nQ = d.fields.filter((f) => !f.special).length;
      body.innerHTML = `
      <div class="card" style="position:sticky;top:0;z-index:3;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="mini pri2" id="iq_save">Save changes</button><button class="mini" id="iq_undo">Discard changes</button><button class="mini" id="iq_try">Try it as the inspector</button><button class="mini" id="iq_hist">Earlier versions</button>
        <span class="small muted"><b>${nP}</b> photos + video · <b>${nQ}</b> questions</span><span id="iq_msg" class="small" style="margin-left:auto">${dirty ? '<span style="color:#b3261e">Unsaved changes</span>' : ''}</span></div>
      <div id="iq_histbox"></div>
      <div class="card"><h3 style="margin-top:0">Photos</h3><div class="hint">Shown to the inspector in this order, section by section. The walkaround video comes after the "Walkaround photos" section.</div>
        ${d.photoSections.map((sec, si) => `<div style="margin-top:14px;border-top:2px solid #e3e7ee;padding-top:8px"><div style="display:flex;gap:6px;align-items:center"><b style="font-size:15px">${esc(sec)}</b>
          <button class="mini" data-ps="${si}" data-a="up">▲</button><button class="mini" data-ps="${si}" data-a="dn">▼</button><button class="mini" data-ps="${si}" data-a="ren">Rename</button><button class="mini" data-ps="${si}" data-a="del">Delete section</button></div>
          <table class="pv-tbl" style="margin-top:6px;width:100%"><thead><tr><th style="width:24%">Photo</th><th>Instruction to the inspector</th><th style="width:70px">Shots</th><th style="width:150px"></th></tr></thead><tbody>
          ${d.photos.map((p, i) => [p, i]).filter(([p]) => p.section === sec).map(([p, i]) => `<tr>
            <td><input data-p="${i}" data-k="label" value="${esc(p.label)}" style="width:100%;padding:5px"></td>
            <td><textarea data-p="${i}" data-k="tip" rows="2" style="width:100%;padding:5px;font:inherit;font-size:13px">${esc(p.tip || '')}</textarea>
              ${(p.count || 1) > 1 ? `<div class="small muted" style="margin-top:4px">Name of each shot (one per line):</div><textarea data-p="${i}" data-k="subs" rows="${p.count}" style="width:100%;padding:5px;font:inherit;font-size:13px">${esc((p.subs || []).join('\n'))}</textarea>` : ''}</td>
            <td><input data-p="${i}" data-k="count" type="number" min="1" max="6" value="${p.count || 1}" style="width:56px;padding:5px"></td>
            <td style="white-space:nowrap"><button class="mini" data-pi="${i}" data-a="up">▲</button><button class="mini" data-pi="${i}" data-a="dn">▼</button>
              <select data-pi="${i}" data-a="sec" class="mini" title="Move to section">${d.photoSections.map((s) => `<option ${s === sec ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
              <button class="mini" data-pi="${i}" data-a="del" title="Remove">✕</button></td></tr>`).join('')}
          </tbody></table><button class="mini" data-ps="${si}" data-a="add" style="margin-top:6px">+ Add photo to ${esc(sec)}</button></div>`).join('')}
        <button class="mini" id="iq_addsec" style="margin-top:12px">+ Add photo section</button></div>

      <div class="card"><h3 style="margin-top:0">Questions</h3><div class="hint">Each section is one or two screens on the phone. Tick <b>Optional</b> if the inspector can leave it blank (otherwise they must answer or tick "Not available"). Tick <b>For sale</b> if it must be answered before the vehicle can be approved for sale.</div>
        ${d.groups.map((g, gi) => `<div style="margin-top:14px;border-top:2px solid #e3e7ee;padding-top:8px"><div style="display:flex;gap:6px;align-items:center"><b style="font-size:15px">${esc(g)}</b>
          <button class="mini" data-gs="${gi}" data-a="up">▲</button><button class="mini" data-gs="${gi}" data-a="dn">▼</button><button class="mini" data-gs="${gi}" data-a="ren">Rename</button><button class="mini" data-gs="${gi}" data-a="del">Delete section</button></div>
          <table class="pv-tbl" style="margin-top:6px;width:100%"><thead><tr><th style="width:26%">Question</th><th style="width:15%">Answer type</th><th>Choices / unit / help text</th><th style="width:62px">Optional</th><th style="width:62px">For sale</th><th style="width:150px"></th></tr></thead><tbody>
          ${d.fields.map((f, i) => [f, i]).filter(([f]) => f.group === g).map(([f, i]) => f.special ? `<tr style="background:#f6f8fc"><td><b>${esc(SPECIALS[f.special] || f.special)}</b></td><td colspan="2" class="small muted">${f.special === 'tread' ? `<label><input type="checkbox" data-q="${i}" data-k="mode" ${f.mode === 'axle' ? 'checked' : ''}> One reading per axle (lowest), instead of each side</label>` : 'Number of compartments and the size of each (litres)'}</td><td></td><td>${f.special === 'compartments' ? `<input type="checkbox" data-q="${i}" data-k="sale" ${f.sale ? 'checked' : ''}>` : ''}</td>
            <td style="white-space:nowrap"><button class="mini" data-qi="${i}" data-a="up">▲</button><button class="mini" data-qi="${i}" data-a="dn">▼</button>${grpSel(i, g)}<button class="mini" data-qi="${i}" data-a="del">✕</button></td></tr>` : `<tr>
            <td><input data-q="${i}" data-k="label" value="${esc(f.label)}" style="width:100%;padding:5px"></td>
            <td><select data-q="${i}" data-k="type" style="width:100%;padding:5px">${ATYPES.map(([k, v]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td>${f.type === 'select' ? `<input data-q="${i}" data-k="options" value="${esc((f.options || []).join(', '))}" placeholder="Choices, separated by commas" style="width:100%;padding:5px">` : ''}
              ${f.type === 'number' ? `<input data-q="${i}" data-k="unitx" value="${esc(f.units ? f.units.join(', ') : (f.unit || ''))}" placeholder="Unit, e.g. kg – or a choice: litres, gallons" style="width:100%;padding:5px">` : ''}
              <input data-q="${i}" data-k="hint" value="${esc(f.hint || f.ph || '')}" placeholder="Help text / example (optional)" style="width:100%;padding:5px;margin-top:3px;font-size:12px"></td>
            <td style="text-align:center"><input type="checkbox" data-q="${i}" data-k="optional" ${f.optional ? 'checked' : ''}></td>
            <td style="text-align:center"><input type="checkbox" data-q="${i}" data-k="sale" ${f.sale ? 'checked' : ''}></td>
            <td style="white-space:nowrap"><button class="mini" data-qi="${i}" data-a="up">▲</button><button class="mini" data-qi="${i}" data-a="dn">▼</button>${grpSel(i, g)}<button class="mini" data-qi="${i}" data-a="del" title="Remove">✕</button></td></tr>`).join('')}
          </tbody></table><button class="mini" data-gs="${gi}" data-a="add" style="margin-top:6px">+ Add question to ${esc(g)}</button>
          ${Object.keys(SPECIALS).filter((k) => !d.fields.some((f) => f.special === k)).map((k) => ` <button class="mini" data-gs="${gi}" data-a="sp" data-sp="${k}">+ ${esc(SPECIALS[k])}</button>`).join('')}</div>`).join('')}
        <button class="mini" id="iq_addgrp" style="margin-top:12px">+ Add question section</button></div>`;
      wire(body);
    }
    const grpSel = (i, g) => `<select data-qi="${i}" data-a="grp" class="mini" title="Move to section">${cur.def.groups.map((x) => `<option ${x === g ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    const touch = () => { dirty = true; const m = el.querySelector('#iq_msg'); if (m) m.innerHTML = '<span style="color:#b3261e">Unsaved changes</span>'; };
    function wire(body) {
      const d = cur.def, q = (s) => body.querySelector(s);
      body.querySelectorAll('[data-p]').forEach((inp) => inp.onchange = () => { const p = d.photos[+inp.dataset.p], k = inp.dataset.k;
        if (k === 'count') { const n = Math.max(1, Math.min(6, parseInt(inp.value) || 1)); if (n > 1) { p.count = n; p.subs = Array.from({ length: n }, (_, i) => (p.subs || [])[i] || 'Shot ' + (i + 1)); } else { delete p.count; delete p.subs; } touch(); draw(); return; }
        if (k === 'subs') p.subs = inp.value.split('\n'); else p[k] = inp.value; touch(); });
      body.querySelectorAll('[data-pi]').forEach((b) => (b.tagName === 'SELECT' ? b.onchange = act : b.onclick = act));
      function act(e) { const b = e.target, i = +b.dataset.pi, a = b.dataset.a, p = d.photos[i];
        if (a === 'up' || a === 'dn') { const same = d.photos.map((x, k) => [x, k]).filter(([x]) => x.section === p.section).map(([, k]) => k); const pos = same.indexOf(i), to = same[pos + (a === 'up' ? -1 : 1)]; if (to == null) return; [d.photos[i], d.photos[to]] = [d.photos[to], d.photos[i]]; }
        if (a === 'sec') { p.section = b.value; d.photos.splice(i, 1); d.photos.push(p); }
        if (a === 'del') { if (KEEP.has(p.id) && !confirm('This is one of the main walkaround shots used for adverts and sales photos. Remove it anyway?')) return; if (!confirm('Remove the photo “' + p.label + '”?')) return; d.photos.splice(i, 1); }
        touch(); draw(); }
      body.querySelectorAll('[data-ps]').forEach((b) => b.onclick = () => { const si = +b.dataset.ps, a = b.dataset.a, sec = d.photoSections[si];
        if (a === 'up' || a === 'dn') mv(d.photoSections, si, a === 'up' ? -1 : 1);
        if (a === 'ren') { const n = (prompt('New name for this photo section', sec) || '').trim(); if (!n || d.photoSections.includes(n)) return; d.photoSections[si] = n; d.photos.forEach((p) => { if (p.section === sec) p.section = n; }); }
        if (a === 'del') { if (d.photos.some((p) => p.section === sec)) { alert('Move or remove the photos in this section first.'); return; } d.photoSections.splice(si, 1); }
        if (a === 'add') { const l = (prompt('Name of the new photo', '') || '').trim(); if (!l) return; d.photos.push({ id: slug(l), label: l, section: sec, tip: '' }); }
        touch(); draw(); });
      q('#iq_addsec').onclick = () => { const n = (prompt('Name of the new photo section', '') || '').trim(); if (!n || d.photoSections.includes(n)) return; d.photoSections.push(n); touch(); draw(); };
      body.querySelectorAll('[data-q]').forEach((inp) => inp.onchange = () => { const f = d.fields[+inp.dataset.q], k = inp.dataset.k;
        if (k === 'optional' || k === 'sale') { if (inp.checked) f[k] = k === 'optional' ? 1 : true; else delete f[k]; touch(); return; }
        if (k === 'mode') { if (inp.checked) f.mode = 'axle'; else delete f.mode; touch(); return; }
        if (k === 'type') { f.type = inp.value; if (f.type !== 'select') delete f.options; if (f.type !== 'number') { delete f.unit; delete f.units; } touch(); draw(); return; }
        if (k === 'options') { f.options = inp.value.split(',').map((x) => x.trim()).filter(Boolean); touch(); return; }
        if (k === 'unitx') { const u = inp.value.split(',').map((x) => x.trim()).filter(Boolean); delete f.unit; delete f.units; if (u.length > 1) f.units = u; else if (u.length) f.unit = u[0]; touch(); return; }
        if (k === 'hint') { delete f.ph; if (inp.value.trim()) f.hint = inp.value.trim(); else delete f.hint; touch(); return; }
        f[k] = inp.value; touch(); });
      body.querySelectorAll('[data-qi]').forEach((b) => (b.tagName === 'SELECT' ? b.onchange = qact : b.onclick = qact));
      function qact(e) { const b = e.target, i = +b.dataset.qi, a = b.dataset.a, f = d.fields[i];
        if (a === 'up' || a === 'dn') { const same = d.fields.map((x, k) => [x, k]).filter(([x]) => x.group === f.group).map(([, k]) => k); const pos = same.indexOf(i), to = same[pos + (a === 'up' ? -1 : 1)]; if (to == null) return; [d.fields[i], d.fields[to]] = [d.fields[to], d.fields[i]]; }
        if (a === 'grp') { f.group = b.value; d.fields.splice(i, 1); d.fields.push(f); }
        if (a === 'del') { if (!confirm('Remove “' + (f.label || SPECIALS[f.special]) + '”?')) return; d.fields.splice(i, 1); }
        touch(); draw(); }
      body.querySelectorAll('[data-gs]').forEach((b) => b.onclick = () => { const gi = +b.dataset.gs, a = b.dataset.a, g = d.groups[gi];
        if (a === 'up' || a === 'dn') mv(d.groups, gi, a === 'up' ? -1 : 1);
        if (a === 'ren') { const n = (prompt('New name for this question section', g) || '').trim(); if (!n || d.groups.includes(n)) return; d.groups[gi] = n; d.fields.forEach((f) => { if (f.group === g) f.group = n; }); }
        if (a === 'del') { if (d.fields.some((f) => f.group === g)) { alert('Move or remove the questions in this section first.'); return; } d.groups.splice(gi, 1); }
        if (a === 'add') { const l = (prompt('The new question, as the inspector will see it', '') || '').trim(); if (!l) return; d.fields.push({ id: slug(l), label: l, group: g, type: 'text' }); }
        if (a === 'sp') { const sp = b.dataset.sp; d.fields.push(sp === 'tread' ? { id: 'tread', label: 'Tyre tread depths', group: g, special: 'tread', mode: 'axle' } : { id: 'compartments', label: 'Compartments and sizes', group: g, special: 'compartments' }); }
        touch(); draw(); });
      q('#iq_addgrp').onclick = () => { const n = (prompt('Name of the new question section', '') || '').trim(); if (!n || d.groups.includes(n)) return; d.groups.push(n); touch(); draw(); };
      q('#iq_undo').onclick = () => { if (!dirty || confirm('Discard your changes?')) load(); };
      q('#iq_try').onclick = () => { if (dirty) { alert('Save first – the inspection app uses the saved version.'); return; } const j = { v: 1, id: 'TRY' + Date.now().toString(36).toUpperCase(), type: cur.vehicle_type, reg: 'TEST', stock: '', inspector: '', where: '', notes: 'Practice run – nothing is sent to the office.', created: new Date().toISOString().slice(0, 10) };
        window.open(location.origin + location.pathname.replace(/[^/]*$/, '') + 'inspect/#j=' + b64e(j), '_blank'); };
      q('#iq_save').onclick = async () => { const m = q('#iq_msg');
        const bad = d.fields.filter((f) => !f.special && (!String(f.label || '').trim() || (f.type === 'select' && !(f.options || []).length)));
        if (bad.length) { m.innerHTML = '<span style="color:#b3261e">Every question needs wording, and every drop-down needs at least one choice: ' + esc(bad.map((f) => f.label || '(blank)').join(', ')) + '</span>'; return; }
        d.groups = d.groups.filter((g) => d.fields.some((f) => f.group === g)); d.photoSections = d.photoSections.filter((s) => d.photos.some((p) => p.section === s));
        try { m.textContent = 'Saving…'; const s = await X.session(); const who = (s && s.user && (s.user.user_metadata?.name || s.user.email)) || null;
          await api('inspection_templates?vehicle_type=eq.' + cur.vehicle_type, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ def: d, updated_by: who }) });
          await load(); el.querySelector('#iq_msg').innerHTML = '<span style="color:#1b7f4b">Saved ✓ – new inspection links use this now</span>';
        } catch (e) { m.innerHTML = '<span style="color:#b3261e">Could not save: ' + esc(e.message) + '</span>'; } };
      q('#iq_hist').onclick = async () => { const box = q('#iq_histbox'); if (box.innerHTML) { box.innerHTML = ''; return; }
        const h = await api('inspection_template_history?select=id,version,saved_at,saved_by&vehicle_type=eq.' + cur.vehicle_type + '&order=version.desc&limit=20');
        box.innerHTML = `<div class="card"><b>Earlier versions</b>${h.length ? `<ul style="margin:6px 0 0 18px">${h.map((x) => `<li>Version ${x.version} – ${new Date(x.saved_at).toLocaleString('en-GB')}${x.saved_by ? ' by ' + esc(x.saved_by) : ''} <a href="#" data-rs="${x.id}">Load this version</a></li>`).join('')}</ul><div class="hint">Loading a version puts it on screen; press Save to make it live again.</div>` : '<div class="hint">No earlier versions yet.</div>'}</div>`;
        box.querySelectorAll('[data-rs]').forEach((a) => a.onclick = async (e) => { e.preventDefault(); const r = await api('inspection_template_history?select=def&id=eq.' + a.dataset.rs); if (r[0]) { cur.def = r[0].def; dirty = true; draw(); } }); };
    }
    load();
  };
})();
