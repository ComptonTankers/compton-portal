/* PARKING MAP – a scaled plan of each parking site (in metres) with numbered bays.
   View mode: drag customers from the list onto bays, click a bay for its details, see what's free.
   Edit mode: draw rows of bays, move/rotate/renumber them, draw buildings, no-go areas, gates and the boundary. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const KINDS = { 'HGV': [4, 18], 'Small bay': [4, 7], 'Artic / trailer': [3.8, 15], 'Rigid': [3.5, 12], 'Van': [3, 7], 'Car': [2.5, 5], 'Container / storage': [3, 12.5], 'Other': [3.5, 10] };
  const ST = { free: ['rgba(74,222,128,.16)', '#FFFFFF', 'Free'], let: ['#2F6BD8', '#FFFFFF', 'Let'], notice: ['#E4611D', '#FFD3BC', 'On notice / ending'], reserved: ['#6D4BC2', '#C4B5FD', 'Reserved'], out: ['#334155', '#64748B', 'Out of use'] };
  const FEAT = { building: ['#164698', '#FFFFFF', 'Building'], nogo: ['rgba(248,113,113,.25)', '#F87171', 'No parking'], road: ['rgba(255,255,255,.07)', '#5B7FC4', 'Roadway'], area: ['rgba(250,204,21,.10)', '#FACC15', 'Area'] };
  const BG = '#0B2A66', DIM = '#FFB27A', HI = '#FACC15';   // drawing colours: navy sheet, orange dimensions, yellow selection
  let SAT = false;
  const today = () => new Date().toISOString().slice(0, 10);
  const in60 = () => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); };
  const r1 = (v) => Math.round(v * 4) / 4;
  let SITES = [], SITE = null, BAYS = [], AG = [], CAP = [], DEL = [], DIRTY = false, MODE = 'view', TOOL = 'select', SEL = new Set(), HL = '', VB = null, PLAN = null, PEND = null, ROWOPT = { kind: 'HGV', w: 4, l: 18, prefix: '', flip: false };
  let EL = null;

  async function load() {
    [SITES, AG, CAP] = await Promise.all([all('park_sites', 'id.asc'), all('park_agreements', 'customer.asc'), all('park_capacity', 'id.asc')]);
    if (!SITE || !SITES.find((s) => s.id === SITE)) SITE = (SITES.find((s) => s.status === 'Open') || SITES[0] || {}).id;
    BAYS = SITE ? await api('park_bays?select=*&site_id=eq.' + SITE + '&order=code.asc') : [];
    BAYS.forEach((b) => ['x', 'y', 'w', 'l', 'rot'].forEach((k) => (b[k] = +b[k])));
    const s = SITES.find((x) => x.id === SITE); PLAN = JSON.parse(JSON.stringify((s && s.plan) || {}));
    PLAN.width_m = PLAN.width_m || 140; PLAN.height_m = PLAN.height_m || 90; PLAN.features = PLAN.features || []; PLAN.boundary = PLAN.boundary || [];
    PLAN.features = PLAN.features.map((f) => (f.pts ? f : f.type === 'gate' ? { type: 'gate', label: f.label, pts: [[f.x - 3, f.y], [f.x + 3, f.y]] } : { type: f.type, label: f.label, pts: [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]] }));
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
       ${PLAN.bg && PLAN.bg.url ? `<label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="pm_sat" ${SAT ? 'checked' : ''}> Satellite photo</label>` : ''}
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
       .pm-mapbox{position:relative;background:#0B2A66;border:1px solid #0B2A66;border-radius:10px;overflow:hidden}
       .pm-svg{width:100%;height:100%;display:block;touch-action:none;user-select:none}
       .pm-zoom{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:4px}.pm-zoom button{width:32px;height:32px;border:1px solid #24519E;background:#163C86;color:#fff;border-radius:6px;font-size:16px;cursor:pointer}
       .pm-legend{position:absolute;left:10px;bottom:8px;color:#fff;background:rgba(11,42,102,.9);border:1px solid #24519E;padding:5px 10px;border-radius:6px;font-size:11.5px;display:flex;gap:12px;flex-wrap:wrap}.pm-legend i{display:inline-block;width:12px;height:12px;border:2px solid;border-radius:2px;margin-right:4px;vertical-align:-2px}
       .pm-cust{border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px;margin:6px 0;cursor:grab;background:#fff}.pm-cust:hover{border-color:#164698;background:#F4F7FC}.pm-cust b{display:block}
       .pm-cust .bar{height:5px;background:#E2E8F0;border-radius:3px;margin-top:5px;overflow:hidden}.pm-cust .bar i{display:block;height:100%;background:#164698}
       .pm-side h4{margin:12px 0 6px;font-size:13px;color:#0B2A66}.pm-side label{display:block;margin:6px 0 2px;font-size:12px;color:#64748B}.pm-side input,.pm-side select{width:100%;box-sizing:border-box}
       .pm-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pm-tools button{padding:7px;border:1px solid #CBD5E1;border-radius:6px;background:#fff;cursor:pointer;font:inherit;font-size:12.5px}.pm-tools button.on{background:#164698;color:#fff;border-color:#164698}
       .pm-tip{background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px;padding:8px;font-size:12px;margin-top:8px}
      </style>`;
    $('pm_site').onchange = async (e) => { if (DIRTY && !confirm('Discard unsaved layout changes?')) { e.target.value = SITE; return; } SITE = +e.target.value; await load(); VB = null; draw(); };
    el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { MODE = b.dataset.mode; TOOL = 'select'; PEND = null; SEL.clear(); draw(); }));
    if ($('pm_sat')) $('pm_sat').onchange = (e) => { SAT = e.target.checked; side(); render(); };
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
    p.innerHTML = `<h4>Tools</h4><div class="pm-tools">${[['select', 'Select / move'], ['row', 'Draw a row of bays'], ['building', 'Building'], ['nogo', 'No-parking area'], ['road', 'Roadway'], ['area', 'Labelled area'], ['gate', 'Gate'], ['boundary', 'Redraw boundary'], ['scale', 'Measure / set scale']].map(([k, t]) => `<button data-tool="${k}" class="${TOOL === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${TOOL === 'row' ? `<div class="pm-tip">Click where the row starts, then where it ends. Bays fill the line at the width set below, facing to the left of the line (tick Flip for the other side).</div>
        <label>Bay type</label><select id="pe_kind">${Object.keys(KINDS).map((k) => `<option ${k === ROWOPT.kind ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Width (m)</label><input id="pe_w" type="number" step="0.1" value="${ROWOPT.w}"></div><div><label>Length (m)</label><input id="pe_l" type="number" step="0.1" value="${ROWOPT.l}"></div></div>
        <label>Number prefix (row)</label><input id="pe_px" value="${esc(ROWOPT.prefix || nextPrefix())}" placeholder="A">
        <label><input type="checkbox" id="pe_flip" ${ROWOPT.flip ? 'checked' : ''} style="width:auto"> Flip side</label>` : ''}
      ${['building', 'nogo', 'road', 'area'].includes(TOOL) ? `<div class="pm-tip"><b>Rectangle at any angle:</b> click one corner, click the next corner along a wall (this sets the angle), then move out to the depth and click again.<br><b>Any shape:</b> tick below, click each corner, double-click to finish.<br>Wall lengths show as you draw. Afterwards use Select to move, turn or reshape it.</div>
        <label><input type="checkbox" id="pe_free" ${ROWOPT.free ? 'checked' : ''} style="width:auto"> Any shape (click corners)</label>` : ''}
      ${TOOL === 'gate' ? '<div class="pm-tip">Click one gate post, then the other. The gate width shows as you draw.</div>' : ''}
      ${TOOL === 'boundary' ? '<div class="pm-tip">Click each corner of the site in turn. Double-click to finish. This replaces the old boundary. (To adjust the existing one, use Select and drag the numbered corners instead.)</div>' : ''}
      ${TOOL === 'scale' ? '<div class="pm-tip">Click one end of something you know the length of, then the other end. You\'ll see what the map measures it as, and can type the real distance to rescale the whole plan (image, boundary and everything on it).</div>' : ''}
      ${TOOL === 'select' && PLAN.boundary.length ? '<div class="small muted" style="margin-top:8px">Boundary: drag the numbered orange corners to move them. Double-click a corner to remove it; double-click the boundary line to add a corner there.</div>' : ''}
      ${TOOL === 'select' ? selPanel(sel) : ''}
      <h4>Site size</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Width (m)</label><input id="pe_sw" type="number" value="${PLAN.width_m}"></div><div><label>Depth (m)</label><input id="pe_sh" type="number" value="${PLAN.height_m}"></div></div>
      ${PLAN.bg && SAT ? `<h4>Satellite photo</h4><label>Strength <input type="range" id="pe_op" min="0" max="1" step="0.05" value="${PLAN.bg.opacity ?? 0.6}"></label>` : ''}
      <div class="small muted" style="margin-top:12px">Keys: Delete removes · R turns 90° · [ and ] turn 5° · arrow keys nudge 0.25 m (Shift = 1 m). Drag empty map to pan, scroll to zoom.</div>`;
    p.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => { TOOL = b.dataset.tool; PEND = null; if (TOOL !== 'select') SEL.clear(); side(); render(); }));
    if ($('pe_kind')) { $('pe_kind').onchange = (e) => { ROWOPT.kind = e.target.value; [ROWOPT.w, ROWOPT.l] = KINDS[ROWOPT.kind]; side(); };
      $('pe_w').onchange = (e) => (ROWOPT.w = +e.target.value || 4); $('pe_l').onchange = (e) => (ROWOPT.l = +e.target.value || 18.5);
      $('pe_px').onchange = (e) => (ROWOPT.prefix = e.target.value.trim()); $('pe_flip').onchange = (e) => { ROWOPT.flip = e.target.checked; render(); }; }
    if ($('pe_free')) $('pe_free').onchange = (e) => { ROWOPT.free = e.target.checked; PEND = null; render(); };
    $('pe_sw').onchange = (e) => { PLAN.width_m = +e.target.value || PLAN.width_m; dirty(); };
    $('pe_sh').onchange = (e) => { PLAN.height_m = +e.target.value || PLAN.height_m; dirty(); };
    if ($('pe_op')) $('pe_op').oninput = (e) => { PLAN.bg.opacity = +e.target.value; DIRTY = true; render(); };
    wireSelPanel(sel);
  }
  function selPanel(sel) {
    const f = PEND && PEND.feat;
    if (f) { const P = f.pts, gate = f.type === 'gate';
      return `<h4>${esc(gate ? 'Gate' : (FEAT[f.type] || FEAT.area)[2])}</h4><label>Label</label><input id="pf_lb" value="${esc(f.label || '')}">
      <label>Type</label><select id="pf_ty">${(gate ? [['gate', 'Gate']] : Object.entries(FEAT).map(([k, v]) => [k, v[2]])).map(([k, t]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="small" style="margin-top:8px">${gate ? 'Width <b>' + dist(P[0], P[1]).toFixed(1) + ' m</b>' : 'Sides: ' + P.map((p, i) => dist(p, P[(i + 1) % P.length]).toFixed(1)).join(' × ') + ' m<br>Area <b>' + Math.round(area(P)) + ' m²</b>'}</div>
      <label>Turn</label><div style="display:flex;gap:4px;flex-wrap:wrap">${[-90, -5, -1, 1, 5, 90].map((d) => `<button class="mini" data-rot="${d}">${d > 0 ? '+' : ''}${d}°</button>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Drag the shape to move it, drag its square corners to reshape it.${gate ? '' : ' Double-click a corner to remove it, double-click an edge to add one.'}</div>
      <div style="margin-top:8px;display:flex;gap:6px"><button id="pf_del">Delete</button><button id="pf_cl">Done</button></div>`; }
    if (!sel.length) return '<div class="small muted" style="margin-top:10px">Click a bay to edit it, Shift-click or drag a box to pick several. Drag to move.</div>';
    const one = sel.length === 1 ? sel[0] : null;
    return `<h4>${one ? 'Bay ' + esc(one.code) : sel.length + ' bays selected'}</h4>
      ${one ? `<label>Number</label><input id="ps_code" value="${esc(one.code)}">` : `<label>Renumber as</label><div style="display:flex;gap:6px"><input id="ps_px" placeholder="Prefix e.g. B" style="width:50%"><input id="ps_n0" type="number" value="1" style="width:50%"></div>`}
      <label>Type</label><select id="ps_kind"><option value="">${one ? '' : '(keep)'}</option>${Object.keys(KINDS).map((k) => `<option ${one && one.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><div><label>Width</label><input id="ps_w" type="number" step="0.1" value="${one ? one.w : ''}"></div><div><label>Length</label><input id="ps_l" type="number" step="0.1" value="${one ? one.l : ''}"></div><div><label>Angle°</label><input id="ps_r" type="number" step="5" value="${one ? one.rot : ''}"></div></div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button id="ps_ok" class="pri2">Apply</button><button id="ps_dup">Copy</button><button id="ps_del">Delete</button></div>`;
  }
  function wireSelPanel(sel) {
    if ($('pf_lb')) { const f = PEND.feat; $('pf_lb').oninput = (e) => { f.label = e.target.value; DIRTY = true; render(); };
      $('pf_ty').onchange = (e) => { f.type = e.target.value; dirty(); };
      document.querySelectorAll('[data-rot]').forEach((b) => (b.onclick = () => { f.pts = rotPts(f.pts, +b.dataset.rot); dirty(); }));
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
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cent = (P) => [P.reduce((t, p) => t + p[0], 0) / P.length, P.reduce((t, p) => t + p[1], 0) / P.length];
  const area = (P) => Math.abs(P.reduce((t, p, i) => { const q = P[(i + 1) % P.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const rotPts = (P, deg, c) => { c = c || cent(P); const a = deg * Math.PI / 180; return P.map(([x, y]) => [Math.round((c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a)) * 100) / 100, Math.round((c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a)) * 100) / 100]); };
  // length labels along each edge of a shape
  const edgeLabels = (P, closed, fs) => P.slice(0, closed ? P.length : P.length - 1).map((p, i) => { const q = P[(i + 1) % P.length], d = dist(p, q); if (d < 0.5) return '';
    let ang = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    return `<text transform="translate(${(p[0] + q[0]) / 2},${(p[1] + q[1]) / 2}) rotate(${ang})" y="${-fs * 0.5}" font-size="${fs}" text-anchor="middle" fill="${DIM}" font-weight="700" paint-order="stroke" stroke="${BG}" stroke-width="${fs / 3}" pointer-events="none">${d.toFixed(1)} m</text>`; }).join('');
  const msg = (t) => { const m = $('pm_msg'); if (m) m.textContent = t; };

  // ---------- drawing ----------
  function render() {
    const svg = $('pm_svg'); if (!svg) return;
    const W = PLAN.width_m, H = PLAN.height_m;
    if (!VB) { const r = svg.getBoundingClientRect(), asp = r.width / Math.max(1, r.height); let w = W + 10, h = H + 10; if (w / h < asp) w = h * asp; else h = w / asp; VB = { x: W / 2 - w / 2, y: H / 2 - h / 2, w, h }; }
    svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
    const q = HL.trim().toLowerCase(), hit = (b) => !q || b.code.toLowerCase() === q || ((agOf(b) || {}).customer || '').toLowerCase().includes(q) || (b.reserved_for || '').toLowerCase().includes(q);
    let s = `<defs><pattern id="pmgrid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#163C86" stroke-width="0.08"/></pattern>
      <pattern id="pmgrid2" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#24519E" stroke-width="0.18"/></pattern>
      <pattern id="pmhatch" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.5" stroke="#64748B" stroke-width="0.35"/></pattern>
      <pattern id="pmhatchR" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.5" stroke="#F87171" stroke-width="0.3"/></pattern>
      <pattern id="pmhatchW" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.2" stroke="#5B86D6" stroke-width="0.15"/></pattern></defs>
      <rect x="-500" y="-500" width="${W + 1000}" height="${H + 1000}" fill="${BG}" data-bg="1"/><rect x="-500" y="-500" width="${W + 1000}" height="${H + 1000}" fill="url(#pmgrid)" pointer-events="none"/><rect x="-500" y="-500" width="${W + 1000}" height="${H + 1000}" fill="url(#pmgrid2)" pointer-events="none"/>`;
    if (SAT && PLAN.bg && PLAN.bg.url) s += `<image href="${esc(PLAN.bg.url)}" x="${PLAN.bg.x || 0}" y="${PLAN.bg.y || 0}" width="${PLAN.bg.w || W}" height="${PLAN.bg.h || H}" opacity="${PLAN.bg.opacity ?? 0.6}" preserveAspectRatio="none" pointer-events="none"/>`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#1E4A9A" stroke-width="0.15" stroke-dasharray="1 1" pointer-events="none"/>`;
    if (PLAN.boundary.length > 2) s += `<polygon points="${PLAN.boundary.map((p) => p.join(',')).join(' ')}" fill="rgba(255,255,255,.035)" stroke="#E4611D" stroke-width="0.7" stroke-linejoin="round" pointer-events="none"/>`;
    if (MODE === 'edit' && PLAN.boundary.length > 1) {
      const B = PLAN.boundary, hs = Math.max(0.8, VB.w / 110);
      B.forEach((p, i) => { const q = B[(i + 1) % B.length]; s += `<line data-seg="${i}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="transparent" stroke-width="${hs * 1.6}" style="cursor:copy"/>`; });
      s += edgeLabels(PLAN.boundary, true, Math.max(0.9, VB.w / 75));
    }
    const fsE = Math.max(0.9, VB.w / 75);
    PLAN.features.forEach((f, i) => {
      const P = f.pts, on = PEND && PEND.feat === f, cur = MODE === 'edit' ? 'move' : 'default';
      if (f.type === 'gate') { const c = cent(P);
        s += `<g data-feat="${i}" style="cursor:${cur}"><line x1="${P[0][0]}" y1="${P[0][1]}" x2="${P[1][0]}" y2="${P[1][1]}" stroke="transparent" stroke-width="3"/><line x1="${P[0][0]}" y1="${P[0][1]}" x2="${P[1][0]}" y2="${P[1][1]}" stroke="#E4611D" stroke-width="${on ? 1.3 : 0.9}" stroke-linecap="round"/>
          ${P.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="0.7" fill="#fff"/>`).join('')}<text x="${c[0]}" y="${c[1]}" dy="${fsE * 1.4}" font-size="${fsE}" text-anchor="middle" fill="${DIM}" font-weight="700" paint-order="stroke" stroke="${BG}" stroke-width="${fsE / 3}" pointer-events="none">${esc(f.label || 'Gate')} · ${dist(P[0], P[1]).toFixed(1)} m</text></g>`;
      } else { const [fill, st] = FEAT[f.type] || FEAT.area, c = cent(P), pts = P.map((p) => p.join(',')).join(' ');
        s += `<g data-feat="${i}" style="cursor:${cur}"><polygon points="${pts}" fill="${fill}" stroke="${on ? HI : st}" stroke-width="${on ? 0.5 : 0.25}" stroke-dasharray="${f.type === 'road' ? '1.2 0.8' : ''}"/>${f.type === 'nogo' || f.type === 'building' ? `<polygon points="${pts}" fill="url(#${f.type === 'nogo' ? 'pmhatchR' : 'pmhatchW'})" pointer-events="none"/>` : ''}
          ${f.label ? (() => { // label fits inside the shape and runs along its longer side
            const e0 = dist(P[0], P[1]), e1 = dist(P[1], P[2] || P[0]), lg = e0 >= e1 ? [P[0], P[1]] : [P[1], P[2]], lo = Math.max(e0, e1), sh = Math.min(e0, e1) || lo, txt = String(f.label).toUpperCase();
            let ang = Math.atan2(lg[1][1] - lg[0][1], lg[1][0] - lg[0][0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
            const fz = Math.max(0.5, Math.min(fsE * 1.1, sh * 0.42, lo * 0.9 / (txt.length * 0.62)));
            return `<text transform="translate(${c[0]},${c[1]}) rotate(${ang})" font-size="${fz}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-weight="700" paint-order="stroke" stroke="${BG}" stroke-width="${fz / 3}" letter-spacing="${fz / 14}" pointer-events="none">${esc(txt)}</text>`; })() : ''}</g>`; }
      if (on && MODE === 'edit') { const hs = Math.max(0.6, VB.w / 160);
        s += edgeLabels(P, f.type !== 'gate', fsE) + P.map((p, k) => `<rect data-fv="${k}" x="${p[0] - hs}" y="${p[1] - hs}" width="${hs * 2}" height="${hs * 2}" fill="${BG}" stroke="${HI}" stroke-width="${hs / 3}" style="cursor:crosshair"/>`).join('')
          + (f.type !== 'gate' ? P.map((p, k) => { const q = P[(k + 1) % P.length]; return `<line data-fseg="${k}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="transparent" stroke-width="${hs * 1.5}" style="cursor:copy"/>`; }).join('') : ''); }
    });
    BAYS.forEach((b, i) => {
      const k = stateOf(b), [fill, st] = ST[k], a = agOf(b), on = SEL.has(b), dim = q && !hit(b);
      const fs = Math.max(0.8, Math.min(1.7, b.w * 0.4)), name = a ? a.customer : b.state === 'reserved' ? b.reserved_for || 'Reserved' : '';
      const tc = '#fff', vert = Math.abs(((b.rot % 180) + 180) % 180 - 90) > 45;   // text runs along the bay's length
      s += `<g data-bay="${i}" transform="translate(${b.x},${b.y}) rotate(${b.rot})" opacity="${dim ? 0.25 : 1}" style="cursor:pointer">
        <rect x="${-b.w / 2}" y="${-b.l / 2}" width="${b.w}" height="${b.l}" fill="${fill}" stroke="${on || (q && hit(b)) ? HI : st}" stroke-width="${on || (q && hit(b)) ? 0.5 : 0.18}"/>${k === 'out' ? `<rect x="${-b.w / 2}" y="${-b.l / 2}" width="${b.w}" height="${b.l}" fill="url(#pmhatch)" pointer-events="none"/>` : ''}
        <g transform="rotate(${vert ? -90 : 0})"><text y="${name ? -fs * 0.35 : 0}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="${tc}" font-weight="700" pointer-events="none">${esc(b.code)}</text>
        ${name ? `<text y="${fs * 0.75}" font-size="${fs * 0.62}" text-anchor="middle" dominant-baseline="middle" fill="${tc}" pointer-events="none">${esc(name.length > 18 ? name.slice(0, 17) + '…' : name)}</text>` : ''}</g></g>`;
    });
    if (PEND && PEND.row) s += rowPreview();
    if (PEND && PEND.shape) { const S = PEND.shape, P = shapePts(S); if (P.length) { s += (S.kind === 'gate' || P.length < 3 ? `<polyline points="${P.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#E4611D" stroke-width="0.6"/>` : `<polygon points="${P.map((p) => p.join(',')).join(' ')}" fill="rgba(228,97,29,.15)" stroke="#E4611D" stroke-width="0.4"/>`) + edgeLabels(P, S.kind !== 'gate' && P.length > 2 && !S.free, fsE) + P.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="0.5" fill="#E4611D"/>`).join(''); } }
    if (PEND && PEND.rect) { const r = PEND.rect; s += `<rect x="${Math.min(r.x0, r.x1)}" y="${Math.min(r.y0, r.y1)}" width="${Math.abs(r.x1 - r.x0)}" height="${Math.abs(r.y1 - r.y0)}" fill="rgba(228,97,29,.12)" stroke="#E4611D" stroke-width="0.3" stroke-dasharray="1 0.6" pointer-events="none"/>`; }
    if (PEND && PEND.poly) s += `<polyline points="${PEND.poly.concat(PEND.hover ? [PEND.hover] : []).map((p) => p.join(',')).join(' ')}" fill="none" stroke="#E4611D" stroke-width="0.4" pointer-events="none"/>`;
    if (MODE === 'edit' && PLAN.boundary.length > 1) { const hs = Math.max(0.8, VB.w / 110);
      s += PLAN.boundary.map((p, i) => `<g data-bv="${i}" style="cursor:move"><circle cx="${p[0]}" cy="${p[1]}" r="${hs}" fill="#E4611D" stroke="#fff" stroke-width="${hs / 5}"/><text x="${p[0]}" y="${p[1]}" font-size="${hs * 1.1}" fill="#fff" text-anchor="middle" dominant-baseline="central" font-weight="700" pointer-events="none">${i + 1}</text></g>`).join(''); }
    if (PEND && PEND.meas) { const M = PEND.meas, b = M.p1 || M.hover; if (b) { const d = Math.hypot(b[0] - M.p0[0], b[1] - M.p0[1]); s += `<line x1="${M.p0[0]}" y1="${M.p0[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${DIM}" stroke-width="${VB.w / 300}" stroke-dasharray="${VB.w / 120} ${VB.w / 200}"/><text x="${(M.p0[0] + b[0]) / 2}" y="${(M.p0[1] + b[1]) / 2 - VB.w / 100}" font-size="${VB.w / 55}" fill="${DIM}" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="${BG}" stroke-width="${VB.w / 300}">${d.toFixed(1)} m</text>`; }
      s += `<circle cx="${M.p0[0]}" cy="${M.p0[1]}" r="${VB.w / 250}" fill="#E4611D"/>`; }
    // scale bar
    const sb = VB.w > 120 ? 20 : VB.w > 50 ? 10 : 5, sx = VB.x + VB.w - sb - VB.w * 0.03, sy = VB.y + VB.h - VB.h * 0.04;
    s += `<g pointer-events="none"><line x1="${sx}" y1="${sy}" x2="${sx + sb}" y2="${sy}" stroke="#fff" stroke-width="${VB.w / 400}"/><line x1="${sx}" y1="${sy - VB.h * 0.008}" x2="${sx}" y2="${sy + VB.h * 0.008}" stroke="#fff" stroke-width="${VB.w / 600}"/><line x1="${sx + sb}" y1="${sy - VB.h * 0.008}" x2="${sx + sb}" y2="${sy + VB.h * 0.008}" stroke="#fff" stroke-width="${VB.w / 600}"/><text x="${sx + sb / 2}" y="${sy - VB.h * 0.014}" font-size="${VB.w / 70}" text-anchor="middle" fill="#fff">${sb} m</text></g>`;
    // north arrow and title block
    const na = VB.w / 40, nx = VB.x + VB.w * 0.04, ny = VB.y + VB.h * 0.07, site = (SITES.find((x) => x.id === SITE) || {}).name || '';
    s += `<g pointer-events="none"><path d="M${nx} ${ny - na} L${nx + na * 0.45} ${ny + na * 0.6} L${nx} ${ny + na * 0.25} L${nx - na * 0.45} ${ny + na * 0.6} Z" fill="#fff"/><text x="${nx}" y="${ny - na * 1.25}" font-size="${na * 0.8}" text-anchor="middle" fill="#fff" font-weight="700">N</text>
      <text x="${nx + na * 1.2}" y="${ny - na * 0.2}" font-size="${VB.w / 60}" fill="#fff" font-weight="700" letter-spacing="${VB.w / 900}">COMPTON TANKERS</text><text x="${nx + na * 1.2}" y="${ny + na * 0.7}" font-size="${VB.w / 85}" fill="${DIM}">${esc(site.toUpperCase())} · PARKING LAYOUT</text></g>`;
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
      `<text x="${R.p1[0]}" y="${R.p1[1] - 1.5}" font-size="2" fill="${DIM}" font-weight="700">${bs.length} bays · ${Math.round(Math.hypot(R.p1[0] - R.p0[0], R.p1[1] - R.p0[1]) * 10) / 10} m</text>`;
  }

  // ---------- mouse / keys ----------
  function pt(e) { const svg = $('pm_svg'), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = p.matrixTransform(svg.getScreenCTM().inverse()); return [m.x, m.y]; }
  function zoom(f, c) { c = c || [VB.x + VB.w / 2, VB.y + VB.h / 2]; VB = { x: c[0] - (c[0] - VB.x) * f, y: c[1] - (c[1] - VB.y) * f, w: VB.w * f, h: VB.h * f }; render(); }
  function wireSvg() {
    const svg = $('pm_svg'); let drag = null, LASTD = null;
    svg.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 0.87, pt(e)); };
    svg.ondragover = (e) => { if (MODE === 'view') e.preventDefault(); };
    svg.ondrop = (e) => { e.preventDefault(); const g = document.elementFromPoint(e.clientX, e.clientY); const bi = g && g.closest('[data-bay]'); if (!bi) { msg('Drop the customer onto a bay.'); return; }
      const b = BAYS[+bi.dataset.bay], ag = +e.dataTransfer.getData('text/plain'), list = SEL.has(b) ? BAYS.filter((x) => SEL.has(x)) : [b];
      const busy = list.filter((x) => x.agreement_id && x.agreement_id !== ag); if (busy.length && !confirm(busy.map((x) => x.code).join(', ') + ' already let to ' + [...new Set(busy.map((x) => agOf(x).customer))].join(', ') + '. Move to the new customer?')) return;
      patchBays(list, { agreement_id: ag, state: 'open' }); };
    svg.onpointerdown = (e) => {
      const p = pt(e), bg = e.target.closest('[data-bay]'), fg = e.target.closest('[data-feat]');
      const ga = (k) => { const n = e.target.closest('[data-' + k + ']'); return n ? n.getAttribute('data-' + k) : null; }, hit = { bv: ga('bv'), seg: ga('seg'), fv: ga('fv'), fseg: ga('fseg') }, now = Date.now();
      if (MODE === 'edit' && LASTD && now - LASTD.t < 450 && Math.hypot(e.clientX - LASTD.x, e.clientY - LASTD.y) < 8) { const h = LASTD.h; LASTD = null; if (dbl(h, p)) return; }
      LASTD = { t: now, x: e.clientX, y: e.clientY, h: hit };
      if (MODE === 'edit' && hit.fseg != null && PEND && PEND.feat) { drag = { kind: 'feat', p, f: PEND.feat, pts: PEND.feat.pts.map((q) => q.slice()) }; svg.setPointerCapture(e.pointerId); return; }
      const bv = e.target.closest('[data-bv]');
      if (MODE === 'edit' && bv && (TOOL === 'select' || TOOL === 'boundary') && !(PEND && PEND.poly)) { drag = { kind: 'bv', i: +bv.dataset.bv }; svg.setPointerCapture(e.pointerId); return; }
      if (MODE === 'edit' && TOOL === 'scale') { const q = [p[0], p[1]];
        if (!PEND || !PEND.meas) { PEND = { meas: { p0: q } }; render(); return; }
        const M = PEND.meas, cur = Math.hypot(q[0] - M.p0[0], q[1] - M.p0[1]); M.p1 = q; render();
        setTimeout(() => { const ans = prompt('The map measures this as ' + cur.toFixed(1) + ' m.\nType the real distance in metres to rescale the plan, or leave blank to just measure.', ''); const real = parseFloat(ans);
          if (real > 0 && cur > 0.1) rescale(real / cur, M.p0); PEND = null; render(); }, 30); return; }
      if (MODE === 'edit' && TOOL === 'row') { if (!PEND || !PEND.row) PEND = { row: { p0: [r1(p[0]), r1(p[1])] } }; else { addRow(PEND.row.p0, [r1(p[0]), r1(p[1])]); PEND = null; } render(); return; }
      if (MODE === 'edit' && (FEAT[TOOL] || TOOL === 'gate')) { const q = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
        if (!PEND || !PEND.shape) { PEND = { shape: { kind: TOOL, free: TOOL !== 'gate' && !!ROWOPT.free, pts: [q] } }; render(); return; }
        const S = PEND.shape; if (S.kind === 'gate') { if (dist(S.pts[0], q) > 0.3) finishShape([S.pts[0], q]); return; }
        if (S.free) { S.pts.push(q); render(); return; }
        if (S.pts.length === 1) { if (dist(S.pts[0], q) > 0.3) S.pts.push(q); render(); return; }
        S.hover = q; const P = shapePts(S); if (dist(P[1], P[2]) > 0.3) finishShape(P); return; }

      if (MODE === 'edit' && TOOL === 'boundary') { PEND = PEND && PEND.poly ? PEND : { poly: [] }; PEND.poly.push([r1(p[0]), r1(p[1])]); render(); return; }
      if (bg) { const b = BAYS[+bg.dataset.bay];
        if (e.shiftKey) { SEL.has(b) ? SEL.delete(b) : SEL.add(b); } else if (!SEL.has(b)) { SEL.clear(); SEL.add(b); }
        PEND = null; side(); render();
        if (MODE === 'edit') { drag = { kind: 'bays', p, start: BAYS.filter((x) => SEL.has(x)).map((x) => [x, x.x, x.y]) }; svg.setPointerCapture(e.pointerId); }
        return; }
      const fv = e.target.closest('[data-fv]');
      if (MODE === 'edit' && fv && PEND && PEND.feat) { drag = { kind: 'fv', f: PEND.feat, k: +fv.dataset.fv }; svg.setPointerCapture(e.pointerId); return; }
      if (MODE === 'edit' && fg) { const f = PLAN.features[+fg.dataset.feat]; SEL.clear(); PEND = { feat: f }; side(); render(); drag = { kind: 'feat', p, f, pts: f.pts.map((q) => q.slice()) }; svg.setPointerCapture(e.pointerId); return; }
      if (MODE === 'edit' && e.shiftKey) { PEND = { box: 1, rect: { x0: p[0], y0: p[1], x1: p[0], y1: p[1] } }; svg.setPointerCapture(e.pointerId); return; }
      if (!e.shiftKey && (SEL.size || PEND)) { SEL.clear(); PEND = null; side(); render(); }
      drag = { kind: 'pan', cx: e.clientX, cy: e.clientY, vb: Object.assign({}, VB) }; svg.setPointerCapture(e.pointerId);
    };
    svg.onpointermove = (e) => {
      const p = pt(e);
      if (PEND && PEND.row && !drag) { PEND.row.p1 = [r1(p[0]), r1(p[1])]; render(); return; }
      if (PEND && PEND.shape) { PEND.shape.hover = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; render(); return; }
      if (PEND && PEND.meas && !PEND.meas.p1) { PEND.meas.hover = [p[0], p[1]]; render(); return; }
      if (PEND && PEND.poly) { PEND.hover = [r1(p[0]), r1(p[1])]; render(); return; }
      if (PEND && PEND.rect) { PEND.rect.x1 = PEND.box ? p[0] : r1(p[0]); PEND.rect.y1 = PEND.box ? p[1] : r1(p[1]); render(); return; }
      if (!drag) return;
      if (drag.kind === 'fv') { drag.f.pts[drag.k] = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; drag.moved = 1; render(); return; }
      if (drag.kind === 'bv') { PLAN.boundary[drag.i] = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; drag.moved = 1; render(); return; }
      if (drag.kind === 'pan') { const r = svg.getBoundingClientRect(), k = VB.w / r.width; VB.x = drag.vb.x - (e.clientX - drag.cx) * k; VB.y = drag.vb.y - (e.clientY - drag.cy) * k; render(); return; }
      const dx = r1(p[0] - drag.p[0]), dy = r1(p[1] - drag.p[1]); if (!dx && !dy) return; drag.moved = 1;
      if (drag.kind === 'bays') drag.start.forEach(([b, x, y]) => { b.x = x + dx; b.y = y + dy; b._d = 1; });
      if (drag.kind === 'feat') drag.f.pts = drag.pts.map((q) => [q[0] + dx, q[1] + dy]);
      render();
    };
    svg.onpointerup = () => {
      if (PEND && PEND.rect) { const r = PEND.rect, x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1), w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
        if (PEND.box) { BAYS.forEach((b) => { if (b.x >= x && b.x <= x + w && b.y >= y && b.y <= y + h) SEL.add(b); }); PEND = null; side(); render(); }
        else { PEND = null; render(); } }
      if (drag && drag.moved && drag.kind !== 'pan') dirty(); drag = null;
    };
    const dbl = (h, p) => {
      if (PEND && PEND.shape && PEND.shape.free) { const P = PEND.shape.pts; while (P.length > 1 && dist(P[P.length - 1], P[P.length - 2]) < 0.5) P.pop(); if (P.length > 2) finishShape(P); return true; }
      if (MODE === 'edit' && PEND && PEND.feat && PEND.feat.type !== 'gate') { const f = PEND.feat, fv = h.fv, fs = h.fseg;
        if (fv && f.pts.length > 3) { f.pts.splice(+fv, 1); dirty(); return true; }
        if (fs) { f.pts.splice(+fs + 1, 0, [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]); dirty(); return true; } }
      if (MODE === 'edit' && !(PEND && PEND.poly)) { const bv = h.bv, sg = h.seg;
        if (bv && PLAN.boundary.length > 3) { PLAN.boundary.splice(+bv, 1); dirty(); return true; }
        if (sg) { PLAN.boundary.splice(+sg + 1, 0, [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]); dirty(); return true; } }
      if (PEND && PEND.poly) { const P = PEND.poly; while (P.length > 1 && dist(P[P.length - 1], P[P.length - 2]) < 0.5) P.pop(); if (P.length > 2) { PLAN.boundary = P; PEND = null; TOOL = 'select'; dirty(); } return true; } };
    document.onkeydown = (e) => {
      if (!$('pm_svg') || MODE !== 'edit' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const sel = BAYS.filter((b) => SEL.has(b));
      if (e.key === 'Escape') { PEND = null; SEL.clear(); side(); render(); return; }
      if (PEND && PEND.feat && (e.key === 'Delete' || e.key === 'Backspace')) { PLAN.features = PLAN.features.filter((x) => x !== PEND.feat); PEND = null; dirty(); return; }
      if (PEND && PEND.feat) { const f = PEND.feat, t = e.key === 'r' || e.key === 'R' ? 90 : e.key === ']' ? (e.shiftKey ? 1 : 5) : e.key === '[' ? (e.shiftKey ? -1 : -5) : 0;
        const st = e.shiftKey ? 1 : 0.25, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        if (t) { f.pts = rotPts(f.pts, t); dirty(); } else if (mv) { e.preventDefault(); f.pts = f.pts.map((q) => [q[0] + mv[0], q[1] + mv[1]]); dirty(false); } return; }
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
  // shape being drawn: rectangle at any angle (3 clicks), any polygon, or a gate line (2 clicks)
  function shapePts(S) {
    const P = S.pts.slice(), h = S.hover;
    if (S.kind === 'gate') return h && P.length === 1 ? [P[0], h] : P;
    if (S.free) return h ? P.concat([h]) : P;
    if (P.length === 1) return h ? [P[0], h] : P;
    if (P.length === 2 && h) { const [a, b] = P, L = dist(a, b) || 1, n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], d = (h[0] - b[0]) * n[0] + (h[1] - b[1]) * n[1];
      return [a, b, [b[0] + n[0] * d, b[1] + n[1] * d], [a[0] + n[0] * d, a[1] + n[1] * d]]; }
    return P;
  }
  function finishShape(P) {
    const S = PEND.shape, f = { type: S.kind, pts: P.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]), label: S.kind === 'gate' ? 'Gate' : S.kind === 'building' ? 'Building' : S.kind === 'nogo' ? 'No parking' : S.kind === 'road' ? '' : 'Area' };
    PLAN.features.push(f); PEND = { feat: f }; TOOL = 'select'; dirty();
  }
  // scale the whole plan about a point: image, boundary, features and bay positions (bay sizes stay real)
  function rescale(f, c) {
    const S = (p) => [Math.round((c[0] + (p[0] - c[0]) * f) * 100) / 100, Math.round((c[1] + (p[1] - c[1]) * f) * 100) / 100];
    if (PLAN.bg) { const [x, y] = S([PLAN.bg.x || 0, PLAN.bg.y || 0]); PLAN.bg.x = x; PLAN.bg.y = y; PLAN.bg.w = (PLAN.bg.w || PLAN.width_m) * f; PLAN.bg.h = (PLAN.bg.h || PLAN.height_m) * f; PLAN.bg.mpp = PLAN.bg.mpp ? PLAN.bg.mpp * f : null; }
    PLAN.boundary = PLAN.boundary.map(S);
    PLAN.features.forEach((ft) => { ft.pts = ft.pts.map(S); });
    BAYS.forEach((b) => { const [x, y] = S([b.x, b.y]); b.x = x; b.y = y; b._d = 1; });
    PLAN.width_m = Math.round(PLAN.width_m * f); PLAN.height_m = Math.round(PLAN.height_m * f); VB = null;
    dirty(); msg('Rescaled ×' + f.toFixed(3) + '. Check another known length with Measure, then Save layout.');
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
