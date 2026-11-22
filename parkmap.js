/* PARKING MAP – a scaled plan of each parking site (in metres) with numbered bays.
   View mode: drag customers from the list onto bays, click a bay for its details, see what's free.
   Edit mode: draw rows of bays, move/rotate/renumber them, draw buildings, no-go areas, gates and the boundary. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const KINDS = { 'HGV': [4, 18.5], 'Artic / trailer': [3.8, 15], 'Rigid': [3.5, 12], 'Van': [3, 7], 'Car': [2.5, 5], 'Container / storage': [3, 12.5], 'Other': [3.5, 10] };
  const ST = { free: ['#FFFFFF', '#16A34A', 'Free'], let: ['#164698', '#0B2A66', 'Let'], notice: ['#E4611D', '#B4470F', 'On notice / ending'], reserved: ['#C4B5FD', '#7C3AED', 'Reserved'], out: ['#E5E7EB', '#9CA3AF', 'Out of use'] };
  const FEAT = { building: ['#CBD5E1', '#64748B', 'Building'], nogo: ['#FECACA', '#DC2626', 'No parking'], road: ['#F1F5F9', '#CBD5E1', 'Roadway'], area: ['#FEF3C7', '#D97706', 'Area'] };
  const today = () => new Date().toISOString().slice(0, 10);
  const in60 = () => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); };
  const r1 = (v) => Math.round(v * 4) / 4;
  let SITES = [], SITE = null, BAYS = [], AG = [], CAP = [], DEL = [], DIRTY = false, MODE = 'view', TOOL = 'select', SEL = new Set(), HL = '', VB = null, PLAN = null, PEND = null, ROWOPT = { kind: 'HGV', w: 4, l: 18.5, prefix: '', flip: false };
  let EL = null;

  async function load() {
    [SITES, AG, CAP] = await Promise.all([all('park_sites', 'id.asc'), all('park_agreements', 'customer.asc'), all('park_capacity', 'id.asc')]);
    if (!SITE || !SITES.find((s) => s.id === SITE)) SITE = (SITES.find((s) => s.status === 'Open') || SITES[0] || {}).id;
    BAYS = SITE ? await api('park_bays?select=*&site_id=eq.' + SITE + '&order=code.asc') : [];
    BAYS.forEach((b) => ['x', 'y', 'w', 'l', 'rot'].forEach((k) => (b[k] = +b[k])));
    const s = SITES.find((x) => x.id === SITE); PLAN = JSON.parse(JSON.stringify((s && s.plan) || {}));
    PLAN.width_m = PLAN.width_m || 140; PLAN.height_m = PLAN.height_m || 90; PLAN.features = PLAN.features || []; PLAN.boundary = PLAN.boundary || [];
    DEL = []; DIRTY = false; SEL.clear();
  }
  const agOf = (b) => (b.agreement_id ? AG.find((a) => a.id === b.agreement_id) : null);
  function stateOf(b) {
    if (b.state === 'out') return 'out'; const a = agOf(b);
    if (a && a.status !== 'Ended' && a.status !== 'Waiting list') return a.status === 'On notice' || (a.end_date && a.end_date <= in60()) ? 'notice' : 'let';
    return b.state === 'reserved' ? 'reserved' : 'free';
  }
  X.parkMap = { stateOf };

  X.routes['p-parkmap'] = async function (el) {
    EL = el; el.innerHTML = X.head('Parking map', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Parking map', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    VB = null; draw();
  };
  window.addEventListener('beforeunload', (e) => { if (DIRTY) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- page ----------
  function draw() {
    const el = EL, site = SITES.find((s) => s.id === SITE) || {};
    const cnt = (k) => BAYS.filter((b) => stateOf(b) === k).length, kinds = [...new Set(BAYS.map((b) => b.kind))];
    const rate = (k) => +((CAP.find((c) => c.site_id === SITE && c.kind === k) || {}).list_rate || 0);
    const freeVal = BAYS.filter((b) => stateOf(b) === 'free').reduce((t, b) => t + rate(b.kind), 0);
    const ags = AG.filter((a) => a.site_id === SITE && a.status !== 'Ended');
    el.innerHTML = X.head('Parking map', 'Drag a customer onto a bay to let it. Click a bay for details. Shift-click to pick several bays, then drop a customer on any of them.') +
      `<div class="pm-top"><label>Site <select id="pm_site">${SITES.map((s) => `<option value="${s.id}" ${s.id === SITE ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
       <div class="pm-seg">${['view', 'edit'].map((m) => `<button data-mode="${m}" class="${MODE === m ? 'on' : ''}">${m === 'view' ? 'Manage bays' : 'Edit layout'}</button>`).join('')}</div>
       <input id="pm_hl" placeholder="Find customer or bay…" value="${esc(HL)}" style="width:200px">
       <span class="pm-stat">${BAYS.length} bays · <b style="color:#16A34A">${cnt('free')} free</b> · ${cnt('let')} let · ${cnt('notice')} on notice · ${cnt('reserved')} reserved · ${cnt('out')} out of use${freeVal ? ' · free bays worth ' + gbp(freeVal) + '/week at list rate' : ''}</span>
       ${DIRTY ? '<button class="pri2" id="pm_save">Save layout</button><button id="pm_undo">Discard changes</button>' : ''}<span id="pm_msg" class="small muted"></span></div>
      <div class="pm-wrap"><div class="pm-side" id="pm_side"></div>
       <div class="pm-mapbox"><svg id="pm_svg" class="pm-svg"></svg>
        <div class="pm-zoom"><button id="pm_zi">+</button><button id="pm_zo">−</button><button id="pm_fit" title="Fit">⤢</button></div>
        <div class="pm-legend">${Object.entries(ST).map(([k, [f, s, t]]) => `<span><i style="background:${f};border-color:${s}"></i>${t}</span>`).join('')}</div></div></div>
      <style>
       .pm-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.pm-stat{font-size:13px;color:#475569}
       .pm-seg{display:inline-flex;border:1px solid #CBD5E1;border-radius:8px;overflow:hidden}.pm-seg button{border:0;background:#fff;padding:7px 12px;cursor:pointer;font:inherit}.pm-seg button.on{background:#164698;color:#fff}
       .pm-wrap{display:grid;grid-template-columns:300px 1fr;gap:12px;height:calc(100vh - 230px);min-height:520px}
       .pm-side{background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:12px;overflow:auto;font-size:13px}
       .pm-mapbox{position:relative;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden}
       .pm-svg{width:100%;height:100%;display:block;touch-action:none;user-select:none}
       .pm-zoom{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:4px}.pm-zoom button{width:32px;height:32px;border:1px solid #CBD5E1;background:#fff;border-radius:6px;font-size:16px;cursor:pointer}
       .pm-legend{position:absolute;left:10px;bottom:8px;background:rgba(255,255,255,.92);padding:5px 10px;border-radius:6px;font-size:11.5px;display:flex;gap:12px;flex-wrap:wrap}.pm-legend i{display:inline-block;width:12px;height:12px;border:2px solid;border-radius:2px;margin-right:4px;vertical-align:-2px}
       .pm-cust{border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px;margin:6px 0;cursor:grab;background:#fff}.pm-cust:hover{border-color:#164698;background:#F4F7FC}.pm-cust b{display:block}
       .pm-cust .bar{height:5px;background:#E2E8F0;border-radius:3px;margin-top:5px;overflow:hidden}.pm-cust .bar i{display:block;height:100%;background:#164698}
       .pm-side h4{margin:12px 0 6px;font-size:13px;color:#0B2A66}.pm-side label{display:block;margin:6px 0 2px;font-size:12px;color:#64748B}.pm-side input,.pm-side select{width:100%;box-sizing:border-box}
       .pm-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pm-tools button{padding:7px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;cursor:pointer;font:inherit;font-size:12.5px}.pm-tools button.on{background:#164698;color:#fff;border-color:#164698}
       .pm-tip{background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px;padding:8px;font-size:12px;margin-top:8px}
      </style>`;
    $('pm_site').onchange = async (e) => { if (DIRTY && !confirm('Discard unsaved layout changes?')) { e.target.value = SITE; return; } SITE = +e.target.value; await load(); VB = null; draw(); };
    el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { MODE = b.dataset.mode; TOOL = 'select'; PEND = null; SEL.clear(); draw(); }));
    $('pm_hl').oninput = (e) => { HL = e.target.value; render(); };
    if ($('pm_save')) $('pm_save').onclick = save;
    if ($('pm_undo')) $('pm_undo').onclick = async () => { await load(); draw(); };
    $('pm_zi').onclick = () => zoom(0.8); $('pm_zo').onclick = () => zoom(1.25); $('pm_fit').onclick = () => { VB = null; render(); };
    wireSvg(); side(); render();
  }

  // ---------- side panel ----------
  function side() {
    const p = $('pm_side'); if (!p) return;
    const sel = BAYS.filter((b) => SEL.has(b));
    if (MODE === 'view') {
      const ags = AG.filter((a) => a.site_id === SITE && (a.status === 'Active' || a.status === 'On notice' || a.status === 'Waiting list'));
      const one = sel.length === 1 ? sel[0] : null, a = one && agOf(one);
      p.innerHTML = (sel.length ? `<h4>${sel.length === 1 ? 'Bay ' + esc(one.code) : sel.length + ' bays selected'}</h4>
        ${one ? `<div class="small muted">${esc(one.kind)} · ${one.w} × ${one.l} m</div>${a ? `<div style="margin:8px 0"><b>${esc(a.customer)}</b><div class="small">${gbp(a.weekly_rate)}/space/week · ${esc(a.status)}${a.end_date ? ' · ends ' + new Date(a.end_date).toLocaleDateString('en-GB') : ''}</div>${a.contact_name ? `<div class="small">${esc(a.contact_name)} ${esc(a.contact_phone || '')}</div>` : ''}</div>` : '<div style="margin:8px 0;color:#16A34A"><b>Free</b></div>'}` : `<div class="small muted">${sel.map((b) => esc(b.code)).join(', ')}</div>`}
        <label>Let to</label><select id="pv_ag"><option value="">– free –</option>${AG.filter((x) => x.site_id === SITE && x.status !== 'Ended').map((x) => `<option value="${x.id}" ${one && one.agreement_id === x.id ? 'selected' : ''}>${esc(x.customer)} (${x.spaces} × ${esc(x.kind)})</option>`).join('')}</select>
        <label>Bay status</label><select id="pv_st">${[['open', 'Available'], ['reserved', 'Reserved'], ['out', 'Out of use']].map(([k, t]) => `<option value="${k}" ${one && one.state === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label>Reserved for / note</label><input id="pv_rf" value="${esc(one ? one.reserved_for || one.notes || '' : '')}" placeholder="e.g. Compton hire fleet, sales stock">
        <div style="margin-top:10px;display:flex;gap:6px"><button class="pri2" id="pv_ok">Save</button><button id="pv_cl">Close</button></div><hr style="margin:14px 0;border:0;border-top:1px solid #E2E8F0">` : '') +
        `<h4>Customers – drag onto a bay</h4><div class="small muted">Bars show bays placed against spaces agreed.</div>
        ${ags.length ? ags.map((x) => { const n = BAYS.filter((b) => b.agreement_id === x.id).length, full = n >= x.spaces;
          return `<div class="pm-cust" draggable="true" data-ag="${x.id}"><b>${esc(x.customer)}</b><span class="small">${x.status === 'Waiting list' ? '<span style="color:#E4611D">Waiting list</span> · ' : ''}${n} of ${x.spaces} × ${esc(x.kind)} placed${n > x.spaces ? ' <span style="color:#DC2626">– more bays than agreed</span>' : ''}</span><div class="bar"><i style="width:${Math.min(100, n / Math.max(1, x.spaces) * 100)}%;background:${full ? '#16A34A' : '#164698'}"></i></div></div>`; }).join('') : '<div class="small muted">No agreements at this site yet – add them on the <a href="#/p-parking">Parking</a> page.</div>'}
        <h4>Free bays by type</h4>${Object.keys(KINDS).map((k) => { const t = BAYS.filter((b) => b.kind === k), f = t.filter((b) => stateOf(b) === 'free').length; return t.length ? `<div class="small">${esc(k)}: <b>${f}</b> free of ${t.length}</div>` : ''; }).join('') || '<div class="small muted">No bays yet – use Edit layout.</div>'}
        <div style="margin-top:10px"><button class="mini" id="pv_cap">Update Parking page space counts from the map</button></div>`;
      p.querySelectorAll('[data-ag]').forEach((d) => (d.ondragstart = (e) => { e.dataTransfer.setData('text/plain', d.dataset.ag); e.dataTransfer.effectAllowed = 'move'; }));
      if ($('pv_ok')) $('pv_ok').onclick = async () => {
        const ag = $('pv_ag').value ? +$('pv_ag').value : null, st = $('pv_st').value, rf = $('pv_rf').value.trim() || null;
        await patchBays(sel, { agreement_id: ag, state: ag ? 'open' : st, reserved_for: rf }); };
      if ($('pv_cl')) $('pv_cl').onclick = () => { SEL.clear(); side(); render(); };
      $('pv_cap').onclick = syncCap;
      return;
    }
    // edit mode
    p.innerHTML = `<h4>Tools</h4><div class="pm-tools">${[['select', 'Select / move'], ['row', 'Draw a row of bays'], ['building', 'Building'], ['nogo', 'No-parking area'], ['road', 'Roadway'], ['area', 'Labelled area'], ['gate', 'Gate'], ['boundary', 'Site boundary']].map(([k, t]) => `<button data-tool="${k}" class="${TOOL === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${TOOL === 'row' ? `<div class="pm-tip">Click where the row starts, then where it ends. Bays fill the line at the width set below, facing to the left of the line (tick Flip for the other side).</div>
        <label>Bay type</label><select id="pe_kind">${Object.keys(KINDS).map((k) => `<option ${k === ROWOPT.kind ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Width (m)</label><input id="pe_w" type="number" step="0.1" value="${ROWOPT.w}"></div><div><label>Length (m)</label><input id="pe_l" type="number" step="0.1" value="${ROWOPT.l}"></div></div>
        <label>Number prefix (row)</label><input id="pe_px" value="${esc(ROWOPT.prefix || nextPrefix())}" placeholder="A">
        <label><input type="checkbox" id="pe_flip" ${ROWOPT.flip ? 'checked' : ''} style="width:auto"> Flip side</label>` : ''}
      ${['building', 'nogo', 'road', 'area'].includes(TOOL) ? '<div class="pm-tip">Drag on the map to draw the rectangle. Click it later (Select tool) to label, resize or delete.</div>' : ''}
      ${TOOL === 'gate' ? '<div class="pm-tip">Click on the map where the gate is.</div>' : ''}
      ${TOOL === 'boundary' ? '<div class="pm-tip">Click each corner of the site in turn. Double-click to finish. This replaces the old boundary.</div>' : ''}
      ${TOOL === 'select' ? selPanel(sel) : ''}
      <h4>Site size</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Width (m)</label><input id="pe_sw" type="number" value="${PLAN.width_m}"></div><div><label>Depth (m)</label><input id="pe_sh" type="number" value="${PLAN.height_m}"></div></div>
      ${PLAN.bg ? `<h4>Background image</h4><label>Show <input type="range" id="pe_op" min="0" max="1" step="0.05" value="${PLAN.bg.opacity ?? 0.6}"></label>` : ''}
      <div class="small muted" style="margin-top:12px">Keys: Delete removes · R turns 90° · [ and ] turn 5° · arrow keys nudge 0.25 m (Shift = 1 m). Drag empty map to pan, scroll to zoom.</div>`;
    p.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => { TOOL = b.dataset.tool; PEND = null; if (TOOL !== 'select') SEL.clear(); side(); render(); }));
    if ($('pe_kind')) { $('pe_kind').onchange = (e) => { ROWOPT.kind = e.target.value; [ROWOPT.w, ROWOPT.l] = KINDS[ROWOPT.kind]; side(); };
      $('pe_w').onchange = (e) => (ROWOPT.w = +e.target.value || 4); $('pe_l').onchange = (e) => (ROWOPT.l = +e.target.value || 18.5);
      $('pe_px').onchange = (e) => (ROWOPT.prefix = e.target.value.trim()); $('pe_flip').onchange = (e) => { ROWOPT.flip = e.target.checked; render(); }; }
    $('pe_sw').onchange = (e) => { PLAN.width_m = +e.target.value || PLAN.width_m; dirty(); };
    $('pe_sh').onchange = (e) => { PLAN.height_m = +e.target.value || PLAN.height_m; dirty(); };
    if ($('pe_op')) $('pe_op').oninput = (e) => { PLAN.bg.opacity = +e.target.value; DIRTY = true; render(); };
    wireSelPanel(sel);
  }
  function selPanel(sel) {
    const f = PEND && PEND.feat;
    if (f) return `<h4>${esc((FEAT[f.type] || ['', '', 'Gate'])[2])}</h4><label>Label</label><input id="pf_lb" value="${esc(f.label || '')}">
      ${f.type !== 'gate' ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Width (m)</label><input id="pf_w" type="number" step="0.5" value="${f.w}"></div><div><label>Depth (m)</label><input id="pf_h" type="number" step="0.5" value="${f.h}"></div></div>` : ''}
      <div style="margin-top:8px;display:flex;gap:6px"><button id="pf_del">Delete</button><button id="pf_cl">Done</button></div>`;
    if (!sel.length) return '<div class="small muted" style="margin-top:10px">Click a bay to edit it, Shift-click or drag a box to pick several. Drag to move.</div>';
    const one = sel.length === 1 ? sel[0] : null;
    return `<h4>${one ? 'Bay ' + esc(one.code) : sel.length + ' bays selected'}</h4>
      ${one ? `<label>Number</label><input id="ps_code" value="${esc(one.code)}">` : `<label>Renumber as</label><div style="display:flex;gap:6px"><input id="ps_px" placeholder="Prefix e.g. B" style="width:50%"><input id="ps_n0" type="number" value="1" style="width:50%"></div>`}
      <label>Type</label><select id="ps_kind"><option value="">${one ? '' : '(keep)'}</option>${Object.keys(KINDS).map((k) => `<option ${one && one.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><div><label>Width</label><input id="ps_w" type="number" step="0.1" value="${one ? one.w : ''}"></div><div><label>Length</label><input id="ps_l" type="number" step="0.1" value="${one ? one.l : ''}"></div><div><label>Angle°</label><input id="ps_r" type="number" step="5" value="${one ? one.rot : ''}"></div></div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button id="ps_ok" class="pri2">Apply</button><button id="ps_dup">Copy</button><button id="ps_del">Delete</button></div>`;
  }
  function wireSelPanel(sel) {
    if ($('pf_lb')) { const f = PEND.feat; $('pf_lb').oninput = (e) => { f.label = e.target.value; dirty(false); render(); };
      if ($('pf_w')) { $('pf_w').onchange = (e) => { f.w = +e.target.value || f.w; dirty(); }; $('pf_h').onchange = (e) => { f.h = +e.target.value || f.h; dirty(); }; }
      $('pf_del').onclick = () => { PLAN.features = PLAN.features.filter((x) => x !== f); PEND = null; dirty(); }; $('pf_cl').onclick = () => { PEND = null; side(); render(); }; return; }
    if (!$('ps_ok')) return;
    $('ps_ok').onclick = () => {
      const k = $('ps_kind').value, w = $('ps_w').value, l = $('ps_l').value, r = $('ps_r').value;
      sel.forEach((b) => { if (k) b.kind = k; if (w !== '') b.w = +w; if (l !== '') b.l = +l; if (r !== '') b.rot = +r; b._d = 1; });
      if (sel.length === 1) { const c = $('ps_code').value.trim(); if (c && c !== sel[0].code) { if (BAYS.some((b) => b !== sel[0] && b.code === c)) { msg('Bay ' + c + ' already exists.'); return; } sel[0].code = c; } }
      else { const px = $('ps_px').value.trim(); if (px) renumber(sel, px, +$('ps_n0').value || 1); }
      dirty();
    };
    $('ps_dup').onclick = () => { const nb = sel.map((b) => Object.assign({}, b, { id: null, agreement_id: null, x: b.x + 2, y: b.y + 2, code: uniqueCode(b.code), _d: 1 })); BAYS.push(...nb); SEL = new Set(nb); dirty(); };
    $('ps_del').onclick = delSel;
  }
  function renumber(list, px, n0) {
    // order along the row: by position projected on the row direction
    const o = list.slice().sort((a, b) => (Math.abs(a.y - b.y) > a.l / 2 ? a.y - b.y : a.x - b.x)); const taken = new Set(BAYS.filter((b) => !list.includes(b)).map((b) => b.code));
    o.forEach((b, i) => { let c = px + (n0 + i); while (taken.has(c)) c += "'"; b.code = c; b._d = 1; });
  }
  const nextPrefix = () => { const used = new Set(BAYS.map((b) => (b.code.match(/^[A-Z]+/i) || [''])[0].toUpperCase())); for (const c of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!used.has(c)) return c; return 'Z'; };
  const uniqueCode = (c) => { let n = c + "'"; while (BAYS.some((b) => b.code === n)) n += "'"; return n; };
  function delSel() { const sel = BAYS.filter((b) => SEL.has(b)); if (sel.some((b) => b.agreement_id) && !confirm('Some of these bays are let. Delete them anyway?')) return; sel.forEach((b) => b.id && DEL.push(b.id)); BAYS = BAYS.filter((b) => !SEL.has(b)); SEL.clear(); dirty(); }
  function dirty(redraw = true) { const was = DIRTY; DIRTY = true; if (!was) draw(); else { if (redraw) side(); render(); } }
  const msg = (t) => { const m = $('pm_msg'); if (m) m.textContent = t; };

  // ---------- drawing ----------
  function render() {
    const svg = $('pm_svg'); if (!svg) return;
    const W = PLAN.width_m, H = PLAN.height_m;
    if (!VB) { const r = svg.getBoundingClientRect(), asp = r.width / Math.max(1, r.height); let w = W + 10, h = H + 10; if (w / h < asp) w = h * asp; else h = w / asp; VB = { x: W / 2 - w / 2, y: H / 2 - h / 2, w, h }; }
    svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
    const q = HL.trim().toLowerCase(), hit = (b) => !q || b.code.toLowerCase() === q || ((agOf(b) || {}).customer || '').toLowerCase().includes(q) || (b.reserved_for || '').toLowerCase().includes(q);
    let s = `<defs><pattern id="pmgrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#E2E8F0" stroke-width="0.15"/></pattern>
      <pattern id="pmhatch" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.5" stroke="#9CA3AF" stroke-width="0.4"/></pattern></defs>
      <rect x="-500" y="-500" width="${W + 1000}" height="${H + 1000}" fill="url(#pmgrid)" data-bg="1"/>`;
    if (PLAN.bg && PLAN.bg.url) s += `<image href="${esc(PLAN.bg.url)}" x="${PLAN.bg.x || 0}" y="${PLAN.bg.y || 0}" width="${PLAN.bg.w || W}" height="${PLAN.bg.h || H}" opacity="${PLAN.bg.opacity ?? 0.6}" preserveAspectRatio="none" pointer-events="none"/>`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#CBD5E1" stroke-width="0.2" stroke-dasharray="1 1" pointer-events="none"/>`;
    if (PLAN.boundary.length > 2) s += `<polygon points="${PLAN.boundary.map((p) => p.join(',')).join(' ')}" fill="rgba(255,255,255,.35)" stroke="#0B2A66" stroke-width="0.5" pointer-events="none"/>`;
    PLAN.features.forEach((f, i) => {
      if (f.type === 'gate') { s += `<g data-feat="${i}" style="cursor:${MODE === 'edit' ? 'move' : 'default'}"><circle cx="${f.x}" cy="${f.y}" r="1.6" fill="#E4611D" stroke="#fff" stroke-width="0.3"/><text x="${f.x}" y="${f.y - 2.3}" font-size="2" text-anchor="middle" fill="#B4470F" font-weight="700">${esc(f.label || 'Gate')}</text></g>`; return; }
      const [fill, st] = FEAT[f.type] || FEAT.area; const on = PEND && PEND.feat === f;
      s += `<g data-feat="${i}" style="cursor:${MODE === 'edit' ? 'move' : 'default'}"><rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="${f.type === 'nogo' ? 'url(#pmhatch)' : fill}" stroke="${on ? '#E4611D' : st}" stroke-width="${on ? 0.6 : 0.3}" ${f.type === 'nogo' ? '' : ''}/>${f.type === 'nogo' ? `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="${fill}" opacity="0.35" pointer-events="none"/>` : ''}
        ${f.label ? `<text x="${f.x + f.w / 2}" y="${f.y + f.h / 2}" font-size="${Math.max(1.5, Math.min(4, f.w / 8))}" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-weight="600" pointer-events="none">${esc(f.label)}</text>` : ''}</g>`;
    });
    BAYS.forEach((b, i) => {
      const k = stateOf(b), [fill, st] = ST[k], a = agOf(b), on = SEL.has(b), dim = q && !hit(b);
      const fs = Math.max(0.8, Math.min(1.6, b.w * 0.36)), name = a ? a.customer : b.state === 'reserved' ? b.reserved_for || 'Reserved' : '';
      const tc = k === 'let' || k === 'notice' ? '#fff' : '#0B2A66', vert = Math.abs(((b.rot % 180) + 180) % 180 - 90) > 45;   // text runs along the bay's length
      s += `<g data-bay="${i}" transform="translate(${b.x},${b.y}) rotate(${b.rot})" opacity="${dim ? 0.25 : 1}" style="cursor:pointer">
        <rect x="${-b.w / 2}" y="${-b.l / 2}" width="${b.w}" height="${b.l}" fill="${k === 'out' ? 'url(#pmhatch)' : fill}" stroke="${on ? '#E4611D' : q && hit(b) ? '#E4611D' : st}" stroke-width="${on || (q && hit(b)) ? 0.5 : 0.2}"/>
        <g transform="rotate(${vert ? -90 : 0})"><text y="${name ? -fs * 0.35 : 0}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="${tc}" font-weight="700" pointer-events="none">${esc(b.code)}</text>
        ${name ? `<text y="${fs * 0.75}" font-size="${fs * 0.62}" text-anchor="middle" dominant-baseline="middle" fill="${tc}" pointer-events="none">${esc(name.length > 18 ? name.slice(0, 17) + '…' : name)}</text>` : ''}</g></g>`;
    });
    if (PEND && PEND.row) s += rowPreview();
    if (PEND && PEND.rect) { const r = PEND.rect; s += `<rect x="${Math.min(r.x0, r.x1)}" y="${Math.min(r.y0, r.y1)}" width="${Math.abs(r.x1 - r.x0)}" height="${Math.abs(r.y1 - r.y0)}" fill="rgba(228,97,29,.12)" stroke="#E4611D" stroke-width="0.3" stroke-dasharray="1 0.6" pointer-events="none"/>`; }
    if (PEND && PEND.poly) s += `<polyline points="${PEND.poly.concat(PEND.hover ? [PEND.hover] : []).map((p) => p.join(',')).join(' ')}" fill="none" stroke="#E4611D" stroke-width="0.4" pointer-events="none"/>`;
    // scale bar
    const sb = VB.w > 120 ? 20 : VB.w > 50 ? 10 : 5, sx = VB.x + VB.w - sb - VB.w * 0.03, sy = VB.y + VB.h - VB.h * 0.04;
    s += `<g pointer-events="none"><line x1="${sx}" y1="${sy}" x2="${sx + sb}" y2="${sy}" stroke="#0B2A66" stroke-width="${VB.w / 400}"/><text x="${sx + sb / 2}" y="${sy - VB.h * 0.012}" font-size="${VB.w / 70}" text-anchor="middle" fill="#0B2A66">${sb} m</text></g>`;
    svg.innerHTML = s;
  }
  function rowLayout(p0, p1) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy); if (len < 1) return [];
    const d = [dx / len, dy / len], nrm = ROWOPT.flip ? [d[1], -d[0]] : [-d[1], d[0]], n = Math.floor(len / ROWOPT.w + 0.001);
    const rot = Math.round(Math.atan2(-nrm[0], nrm[1]) * 180 / Math.PI * 10) / 10;
    return Array.from({ length: n }, (_, i) => ({ x: r1(p0[0] + d[0] * ROWOPT.w * (i + 0.5) + nrm[0] * ROWOPT.l / 2), y: r1(p0[1] + d[1] * ROWOPT.w * (i + 0.5) + nrm[1] * ROWOPT.l / 2), w: ROWOPT.w, l: ROWOPT.l, rot }));
  }
  function rowPreview() {
    const R = PEND.row; if (!R.p1) return `<circle cx="${R.p0[0]}" cy="${R.p0[1]}" r="0.7" fill="#E4611D"/>`;
    const bs = rowLayout(R.p0, R.p1);
    return `<line x1="${R.p0[0]}" y1="${R.p0[1]}" x2="${R.p1[0]}" y2="${R.p1[1]}" stroke="#E4611D" stroke-width="0.3"/>` + bs.map((b) => `<rect x="${-b.w / 2}" y="${-b.l / 2}" width="${b.w}" height="${b.l}" transform="translate(${b.x},${b.y}) rotate(${b.rot})" fill="rgba(228,97,29,.15)" stroke="#E4611D" stroke-width="0.2"/>`).join('') +
      `<text x="${R.p1[0]}" y="${R.p1[1] - 1.5}" font-size="2" fill="#B4470F" font-weight="700">${bs.length} bays · ${Math.round(Math.hypot(R.p1[0] - R.p0[0], R.p1[1] - R.p0[1]) * 10) / 10} m</text>`;
  }

  // ---------- mouse / keys ----------
  function pt(e) { const svg = $('pm_svg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = p.matrixTransform(svg.getScreenCTM().inverse()); return [m.x, m.y]; }
  function zoom(f, c) { c = c || [VB.x + VB.w / 2, VB.y + VB.h / 2]; VB = { x: c[0] - (c[0] - VB.x) * f, y: c[1] - (c[1] - VB.y) * f, w: VB.w * f, h: VB.h * f }; render(); }
  function wireSvg() {
    const svg = $('pm_svg'); let drag = null;
    svg.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 0.87, pt(e)); };
    svg.ondragover = (e) => { if (MODE === 'view') e.preventDefault(); };
    svg.ondrop = (e) => { e.preventDefault(); const g = document.elementFromPoint(e.clientX, e.clientY); const bi = g && g.closest('[data-bay]'); if (!bi) { msg('Drop the customer onto a bay.'); return; }
      const b = BAYS[+bi.dataset.bay], ag = +e.dataTransfer.getData('text/plain'), list = SEL.has(b) ? BAYS.filter((x) => SEL.has(x)) : [b];
      const busy = list.filter((x) => x.agreement_id && x.agreement_id !== ag); if (busy.length && !confirm(busy.map((x) => x.code).join(', ') + ' already let to ' + [...new Set(busy.map((x) => agOf(x).customer))].join(', ') + '. Move to the new customer?')) return;
      patchBays(list, { agreement_id: ag, state: 'open' }); };
    svg.onpointerdown = (e) => {
      const p = pt(e), bg = e.target.closest('[data-bay]'), fg = e.target.closest('[data-feat]');
      if (MODE === 'edit' && TOOL === 'row') { if (!PEND || !PEND.row) PEND = { row: { p0: [r1(p[0]), r1(p[1])] } }; else { addRow(PEND.row.p0, [r1(p[0]), r1(p[1])]); PEND = null; } render(); return; }
      if (MODE === 'edit' && FEAT[TOOL]) { PEND = { rect: { x0: r1(p[0]), y0: r1(p[1]), x1: r1(p[0]), y1: r1(p[1]) } }; svg.setPointerCapture(e.pointerId); return; }
      if (MODE === 'edit' && TOOL === 'gate') { PLAN.features.push({ type: 'gate', x: r1(p[0]), y: r1(p[1]), label: 'Gate' }); PEND = { feat: PLAN.features[PLAN.features.length - 1] }; TOOL = 'select'; dirty(); return; }
      if (MODE === 'edit' && TOOL === 'boundary') { PEND = PEND && PEND.poly ? PEND : { poly: [] }; PEND.poly.push([r1(p[0]), r1(p[1])]); render(); return; }
      if (bg) { const b = BAYS[+bg.dataset.bay];
        if (e.shiftKey) { SEL.has(b) ? SEL.delete(b) : SEL.add(b); } else if (!SEL.has(b)) { SEL.clear(); SEL.add(b); }
        PEND = null; side(); render();
        if (MODE === 'edit') { drag = { kind: 'bays', p, start: BAYS.filter((x) => SEL.has(x)).map((x) => [x, x.x, x.y]) }; svg.setPointerCapture(e.pointerId); }
        return; }
      if (MODE === 'edit' && fg) { const f = PLAN.features[+fg.dataset.feat]; SEL.clear(); PEND = { feat: f }; side(); render(); drag = { kind: 'feat', p, f, x: f.x, y: f.y }; svg.setPointerCapture(e.pointerId); return; }
      if (MODE === 'edit' && e.shiftKey) { PEND = { box: 1, rect: { x0: p[0], y0: p[1], x1: p[0], y1: p[1] } }; svg.setPointerCapture(e.pointerId); return; }
      if (!e.shiftKey && (SEL.size || PEND)) { SEL.clear(); PEND = null; side(); render(); }
      drag = { kind: 'pan', cx: e.clientX, cy: e.clientY, vb: Object.assign({}, VB) }; svg.setPointerCapture(e.pointerId);
    };
    svg.onpointermove = (e) => {
      const p = pt(e);
      if (PEND && PEND.row && !drag) { PEND.row.p1 = [r1(p[0]), r1(p[1])]; render(); return; }
      if (PEND && PEND.poly) { PEND.hover = [r1(p[0]), r1(p[1])]; render(); return; }
      if (PEND && PEND.rect) { PEND.rect.x1 = PEND.box ? p[0] : r1(p[0]); PEND.rect.y1 = PEND.box ? p[1] : r1(p[1]); render(); return; }
      if (!drag) return;
      if (drag.kind === 'pan') { const r = svg.getBoundingClientRect(), k = VB.w / r.width; VB.x = drag.vb.x - (e.clientX - drag.cx) * k; VB.y = drag.vb.y - (e.clientY - drag.cy) * k; render(); return; }
      const dx = r1(p[0] - drag.p[0]), dy = r1(p[1] - drag.p[1]); if (!dx && !dy) return; drag.moved = 1;
      if (drag.kind === 'bays') drag.start.forEach(([b, x, y]) => { b.x = x + dx; b.y = y + dy; b._d = 1; });
      if (drag.kind === 'feat') { drag.f.x = drag.x + dx; drag.f.y = drag.y + dy; }
      render();
    };
    svg.onpointerup = () => {
      if (PEND && PEND.rect) { const r = PEND.rect, x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
        if (PEND.box) { BAYS.forEach((b) => { if (b.x >= x && b.x <= x + w && b.y >= y && b.y <= y + h) SEL.add(b); }); PEND = null; side(); render(); }
        else if (w > 1 && h > 1) { const f = { type: TOOL, x, y, w, h, label: TOOL === 'building' ? 'Building' : TOOL === 'road' ? '' : TOOL === 'nogo' ? 'No parking' : 'Area' }; PLAN.features.push(f); PEND = { feat: f }; TOOL = 'select'; dirty(); }
        else { PEND = null; render(); } }
      if (drag && drag.moved && drag.kind !== 'pan') dirty(); drag = null;
    };
    svg.ondblclick = () => { if (PEND && PEND.poly && PEND.poly.length > 2) { const pts = PEND.poly.slice(0, -1).length > 2 ? PEND.poly.slice(0, -1) : PEND.poly; PLAN.boundary = pts; PEND = null; TOOL = 'select'; dirty(); } };
    document.onkeydown = (e) => {
      if (!$('pm_svg') || MODE !== 'edit' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const sel = BAYS.filter((b) => SEL.has(b));
      if (e.key === 'Escape') { PEND = null; SEL.clear(); side(); render(); return; }
      if (PEND && PEND.feat && (e.key === 'Delete' || e.key === 'Backspace')) { PLAN.features = PLAN.features.filter((x) => x !== PEND.feat); PEND = null; dirty(); return; }
      if (!sel.length) return; const st = e.shiftKey ? 1 : 0.25;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (mv) { e.preventDefault(); sel.forEach((b) => { b.x += mv[0]; b.y += mv[1]; b._d = 1; }); dirty(false); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); return; }
      const turn = e.key === 'r' || e.key === 'R' ? 90 : e.key === ']' ? 5 : e.key === '[' ? -5 : 0;
      if (turn) { // turn the group about its centre
        const cx = sel.reduce((t, b) => t + b.x, 0) / sel.length, cy = sel.reduce((t, b) => t + b.y, 0) / sel.length, a = turn * Math.PI / 180;
        sel.forEach((b) => { const x = b.x - cx, y = b.y - cy; b.x = r1(cx + x * Math.cos(a) - y * Math.sin(a)); b.y = r1(cy + x * Math.sin(a) + y * Math.cos(a)); b.rot = ((b.rot + turn) % 360 + 360) % 360; b._d = 1; }); dirty(false); }
    };
  }
  function addRow(p0, p1) {
    const bs = rowLayout(p0, p1); if (!bs.length) return;
    const px = ($('pe_px') && $('pe_px').value.trim()) || ROWOPT.prefix || nextPrefix();
    const used = BAYS.filter((b) => b.code.startsWith(px)).map((b) => +(b.code.slice(px.length).match(/^\d+/) || [0])[0]); let n = used.length ? Math.max(...used) + 1 : 1;
    const nb = bs.map((b) => Object.assign(b, { id: null, site_id: SITE, kind: ROWOPT.kind, code: px + n++, state: 'open', agreement_id: null, _d: 1 }));
    BAYS.push(...nb); ROWOPT.prefix = ''; SEL = new Set(nb); TOOL = 'select'; dirty();
  }

  // ---------- saving ----------
  async function save() {
    const codes = BAYS.map((b) => b.code), dup = codes.find((c, i) => codes.indexOf(c) !== i); if (dup) { msg('Two bays are numbered ' + dup + ' – renumber one first.'); return; }
    msg('Saving…');
    try {
      const body = (b) => ({ site_id: SITE, code: b.code, kind: b.kind, x: b.x, y: b.y, w: b.w, l: b.l, rot: b.rot, state: b.state || 'open', reserved_for: b.reserved_for || null, agreement_id: b.agreement_id || null, notes: b.notes || null, updated_at: new Date().toISOString() });
      if (DEL.length) await api('park_bays?id=in.(' + DEL.join(',') + ')', { method: 'DELETE' });
      // park codes temporarily so renumbering can't clash with the unique (site, code) rule
      const old = BAYS.filter((b) => b.id && b._d); if (old.length) await Promise.all(old.map((b) => api('park_bays?id=eq.' + b.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ code: '~' + b.id }) })));
      await Promise.all(old.map((b) => api('park_bays?id=eq.' + b.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body(b)) })));
      const nw = BAYS.filter((b) => !b.id); if (nw.length) await api('park_bays', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(nw.map(body)) });
      await api('park_sites?id=eq.' + SITE, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ plan: PLAN }) });
      await load(); draw(); msg('Saved.');
    } catch (e) { msg('Could not save: ' + e.message); }
  }
  async function patchBays(list, body) {
    if (DIRTY) { list.forEach((b) => Object.assign(b, body, { _d: 1 })); side(); render(); msg('Changed – press Save layout to keep it.'); return; }
    try { const ids = list.filter((b) => b.id).map((b) => b.id); if (!ids.length) return;
      await api('park_bays?id=in.(' + ids.join(',') + ')', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, body)) });
      list.forEach((b) => Object.assign(b, body)); const a = body.agreement_id && AG.find((x) => x.id === body.agreement_id);
      draw(); msg(a ? list.map((b) => b.code).join(', ') + ' let to ' + a.customer + '.' : 'Saved.');
    } catch (e) { msg('Could not save: ' + e.message); }
  }
  async function syncCap() {
    const by = {}; BAYS.filter((b) => b.state !== 'out').forEach((b) => (by[b.kind] = (by[b.kind] || 0) + 1));
    try { for (const [kind, n] of Object.entries(by)) await api('park_capacity?on_conflict=site_id,kind', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ site_id: SITE, kind, spaces: n }) });
      CAP = await all('park_capacity', 'id.asc'); msg('Parking page now shows ' + Object.entries(by).map(([k, n]) => n + ' ' + k).join(', ') + '.'); } catch (e) { msg('Could not update: ' + e.message); }
  }
})();
