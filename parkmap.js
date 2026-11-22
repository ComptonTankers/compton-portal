/* PARKING MAP – a scaled plan of each parking site (in metres) with numbered bays.
   View mode: drag customers from the list onto bays, click a bay for its details, see what's free.
   Edit mode: draw rows of bays, move/rotate/renumber them, draw buildings, no-go areas, gates and the boundary. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const $ = (id) => document.getElementById(id);
  const KINDS = { 'HGV': [4, 18], 'Small bay': [4, 7], 'Artic / trailer': [3.8, 15], 'Rigid': [3.5, 12], 'Van': [3, 7], 'Car': [2.5, 5], 'Container / storage': [3, 12.5], 'Other': [3.5, 10] };
  const ST = { free: ['rgba(74,222,128,.16)', '#FFFFFF', 'Free'], let: ['#2F6BD8', '#FFFFFF', 'Let'], notice: ['#E4611D', '#FFD3BC', 'On notice / ending'], held: ['#D97706', '#FDE68A', 'Held for enquiry'], reserved: ['#6D4BC2', '#C4B5FD', 'Reserved'], out: ['#334155', '#64748B', 'Out of use'] };
  const FEAT = { building: ['#164698', '#FFFFFF', 'Building'], nogo: ['rgba(248,113,113,.25)', '#F87171', 'No parking'], road: ['rgba(255,255,255,.07)', '#5B7FC4', 'Roadway'], area: ['rgba(250,204,21,.10)', '#FACC15', 'Area'] };
  const BG = '#0B2A66', DIM = '#FFB27A', HI = '#FACC15';   // drawing colours: navy sheet, orange dimensions, yellow selection
  let SAT = false;
  const today = () => new Date().toISOString().slice(0, 10);
  const in60 = () => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); };
  const r1 = (v) => Math.round(v * 4) / 4;
  let SITES = [], SITE = null, BAYS = [], AG = [], CAP = [], DEL = [], DIRTY = false, MODE = 'view', TOOL = 'select', SEL = new Set(), HL = '', VB = null, PLAN = null, PEND = null, ROWOPT = { kind: 'HGV', w: 4, l: 18, prefix: '', flip: false };
  let EL = null, PLANRAW = '', BAYSIG = '';
  let TEST = false, SCNS = [], SCN = null, LIVE = null, CHK = true, AIS = { full: 16, small: 10 };   // test layouts (sandbox)
  const sig = (bs) => bs.length + '|' + bs.reduce((m, b) => (b.updated_at > m ? b.updated_at : m), '');

  async function load() {
    [SITES, AG, CAP] = await Promise.all([all('park_sites', 'id.asc'), all('park_agreements', 'customer.asc'), all('park_capacity', 'id.asc')]);
    if (!SITE || !SITES.find((s) => s.id === SITE)) SITE = (SITES.find((s) => s.status === 'Open') || SITES[0] || {}).id;
    BAYS = SITE ? await api('park_bays?select=*&site_id=eq.' + SITE + '&order=code.asc') : [];
    BAYS.forEach((b) => ['x', 'y', 'w', 'l', 'rot'].forEach((k) => (b[k] = +b[k])));
    BAYSIG = sig(BAYS); const s = SITES.find((x) => x.id === SITE); PLANRAW = JSON.stringify((s && s.plan) || {}); PLAN = JSON.parse(JSON.stringify((s && s.plan) || {}));
    PLAN.width_m = PLAN.width_m || 140; PLAN.height_m = PLAN.height_m || 90; PLAN.features = PLAN.features || []; PLAN.boundary = PLAN.boundary || [];
    PLAN.features = PLAN.features.map((f) => (f.pts ? f : f.type === 'gate' ? { type: 'gate', label: f.label, pts: [[f.x - 3, f.y], [f.x + 3, f.y]] } : { type: f.type, label: f.label, pts: [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]] }));
    DEL = []; DIRTY = false; SEL.clear();
    if (TEST) {
      LIVE = { bays: BAYS, plan: PLAN };
      SCNS = await api('park_scenarios?select=*&site_id=eq.' + SITE + '&order=updated_at.desc');
      if (!SCNS.length) { await newScenario('Test layout 1'); return; }
      SCN = SCNS.find((x) => SCN && x.id === SCN.id) || SCNS[0];
      PLAN = JSON.parse(JSON.stringify(SCN.plan || {})); PLAN.features = PLAN.features || []; PLAN.boundary = PLAN.boundary || [];
      BAYS = (SCN.bays || []).map((b, i) => Object.assign({}, b, { id: 't' + i, x: +b.x, y: +b.y, w: +b.w, l: +b.l, rot: +b.rot }));
      if (!PLAN.width_m) { PLAN.width_m = LIVE.plan.width_m; PLAN.height_m = LIVE.plan.height_m; }
    }
  }
  const cleanBays = (list) => list.map((b) => ({ code: b.code, kind: b.kind, x: +b.x, y: +b.y, w: +b.w, l: +b.l, rot: +b.rot, state: b.state || 'open', reserved_for: b.reserved_for || null, agreement_id: b.agreement_id || null }));
  async function newScenario(name, from) {   // from = a scenario to copy; otherwise a copy of the live yard
    const src = from ? { plan: from.plan, bays: from.bays } : { plan: LIVE.plan, bays: cleanBays(LIVE.bays) };
    const r = await api('park_scenarios', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: SITE, name, plan: src.plan, bays: src.bays }) });
    SCN = r[0]; await load();
  }
  const agOf = (b) => (b.agreement_id ? AG.find((a) => a.id === b.agreement_id) : null);
  function stateOf(b) {
    if (b.state === 'out') return 'out'; const a = agOf(b);
    if (a && (a.status === 'Enquiry' || a.status === 'Waiting list')) return 'held';
    if (a && a.status !== 'Ended') return a.status === 'On notice' || (a.end_date && a.end_date <= in60()) ? 'notice' : 'let';
    return b.state === 'reserved' ? 'reserved' : 'free';
  }
  X.parkMap = { stateOf };

  X.routes['p-parktest'] = async function (el) {
    TEST = true; MODE = 'edit'; EL = el; el.innerHTML = X.head('Test layouts', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Test layouts', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    VB = null; draw();
  };
  X.routes['p-parkmap'] = async function (el) {
    if (TEST) { TEST = false; MODE = 'view'; SCN = null; }
    EL = el; el.innerHTML = X.head('Parking map', '') + '<div class="empty">Loading…</div>';
    try { await load(); } catch (e) { el.innerHTML = X.head('Parking map', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    VB = null; draw();
  };
  window.addEventListener('beforeunload', (e) => { if (DIRTY) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- turning-space check: every bay needs a clear aisle in front of it ----------
  const pip = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); };
  const fenceD = (p) => { const B = PLAN.boundary; let m = 1e9; for (let i = 0; i < B.length; i++) m = Math.min(m, segD(p, B[i], B[(i + 1) % B.length])); return m; };
  function turning() {
    const solid = PLAN.features.filter((f) => f.pts.length > 2 && f.type !== 'road').map((f) => f.pts), bodies = BAYS.map(bayPts), out = [];
    BAYS.forEach((b, i) => {
      const A = b.kind === 'Small bay' ? AIS.small : AIS.full, a = b.rot * Math.PI / 180, ax = [-Math.sin(a), Math.cos(a)], bx = [Math.cos(a), Math.sin(a)];
      const ends = [1, -1].map((sg) => { const e = [b.x + ax[0] * sg * b.l / 2, b.y + ax[1] * sg * b.l / 2], d = [ax[0] * sg, ax[1] * sg], w = (b.w - 0.4) / 2;
        const Z = [[e[0] + bx[0] * w, e[1] + bx[1] * w], [e[0] - bx[0] * w, e[1] - bx[1] * w], [e[0] - bx[0] * w + d[0] * A, e[1] - bx[1] * w + d[1] * A], [e[0] + bx[0] * w + d[0] * A, e[1] + bx[1] * w + d[1] * A]];
        const hit = (PLAN.boundary.length > 2 && ![0.4, 0.95].every((t) => pip([e[0] + d[0] * A * t, e[1] + d[1] * A * t], PLAN.boundary))) || bodies.some((o, j) => j !== i && sat(Z, o)) || solid.some((o) => sat(Z, o));
        return { Z, hit, f: fenceD(e) }; });
      const front = Math.abs(ends[0].f - ends[1].f) > 3 ? (ends[0].f > ends[1].f ? ends[0] : ends[1]) : (ends[0].hit ? ends[1] : ends[0]);
      out.push({ b, Z: front.Z, ok: !front.hit });
    });
    return out;
  }
  const summary = (bays) => { const rate = (k) => +((CAP.find((c) => c.site_id === SITE && c.kind === k) || {}).list_rate || 0), f = bays.filter((b) => b.kind !== 'Small bay').length, sm = bays.length - f;
    return { f, sm, t: bays.length, val: bays.reduce((t, b) => t + rate(b.kind), 0) }; };

  // ---------- page ----------
  function draw() {
    const el = EL, site = SITES.find((s) => s.id === SITE) || {};
    const cnt = (k) => BAYS.filter((b) => stateOf(b) === k).length, kinds = [...new Set(BAYS.map((b) => b.kind))];
    const rate = (k) => +((CAP.find((c) => c.site_id === SITE && c.kind === k) || {}).list_rate || 0);
    const freeVal = BAYS.filter((b) => stateOf(b) === 'free').reduce((t, b) => t + rate(b.kind), 0);
    const ags = AG.filter((a) => a.site_id === SITE && a.status !== 'Ended');
    let testBar = '';
    if (TEST) { const T = summary(BAYS), L = summary(LIVE.bays), tc = turning(), bad = tc.filter((x) => !x.ok).length, dd = (a, b) => (a - b > 0 ? '+' : a - b < 0 ? '−' : '±') + Math.abs(a - b);
      testBar = `<div class="pm-test"><label>Test layout <select id="pt_scn">${SCNS.map((x) => `<option value="${x.id}" ${SCN && x.id === SCN.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <button class="mini" id="pt_new">+ New from live yard</button><button class="mini" id="pt_dup">Duplicate</button><button class="mini" id="pt_ren">Rename</button><button class="mini" id="pt_del">Delete</button>
        <span class="pt-sep"></span>
        <span class="pt-cmp"><b>This test:</b> ${T.f} full + ${T.sm} small = <b>${T.t}</b> bays · ${gbp(T.val)}/wk at list rate</span>
        <span class="pt-cmp muted">Live yard: ${L.f} + ${L.sm} = ${L.t} · ${gbp(L.val)}/wk</span>
        <span class="pt-cmp" style="color:${T.val >= L.val ? '#16A34A' : '#DC2626'};font-weight:700">${dd(T.t, L.t)} bays · ${T.val - L.val >= 0 ? '+' : '−'}${gbp(Math.abs(T.val - L.val))}/wk</span>
        <span class="pt-cmp" style="color:${bad ? '#DC2626' : '#16A34A'};font-weight:700">${bad ? bad + ' bay' + (bad > 1 ? 's' : '') + ' without enough turning space' : 'All bays have turning space'}</span>
        <label class="small"><input type="checkbox" id="pt_chk" ${CHK ? 'checked' : ''}> Show turning space</label>
        <label class="small">Aisle: full <input id="pt_af" type="number" step="0.5" value="${AIS.full}" style="width:52px"> m · small <input id="pt_as" type="number" step="0.5" value="${AIS.small}" style="width:52px"> m</label>
        <button class="mini" id="pt_apply" style="margin-left:auto;border-color:#E4611D;color:#B4470F">Use this layout for the live yard…</button></div>`; }
    el.innerHTML = (TEST ? X.head('Test layouts', 'A sandbox copy of the yard – try anything here; the live parking map is not touched until you choose “Use this layout for the live yard”.') : X.head('Parking map', 'Drag a customer onto a bay to let it. Click a bay for details. Shift-click to pick several bays, then drop a customer on any of them.')) + testBar +
      `<div class="pm-top"><label>Site <select id="pm_site">${SITES.map((s) => `<option value="${s.id}" ${s.id === SITE ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
       <div class="pm-seg">${['view', 'edit'].map((m) => `<button data-mode="${m}" class="${MODE === m ? 'on' : ''}">${m === 'view' ? 'Manage bays' : 'Edit layout'}</button>`).join('')}</div>
       ${PLAN.bg && PLAN.bg.url ? `<label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="pm_sat" ${SAT ? 'checked' : ''}> Satellite photo</label>` : ''}
       <input id="pm_hl" placeholder="Find customer or bay…" value="${esc(HL)}" style="width:200px">
       <span class="pm-stat">${BAYS.length} bays · <b style="color:#16A34A">${cnt('free')} free</b> · ${cnt('let')} let · ${cnt('notice')} on notice · ${cnt('held')} held for enquiries · ${cnt('reserved')} reserved · ${cnt('out')} out of use${freeVal ? ' · free bays worth ' + gbp(freeVal) + '/week at list rate' : ''}</span>
       ${DIRTY ? `<button class="pri2" id="pm_save">${TEST ? 'Save test layout' : 'Save layout'}</button><button id="pm_undo">Discard changes</button>` : ''}<span id="pm_msg" class="small muted"></span></div>
      <div class="pm-wrap"><div class="pm-side" id="pm_side"></div>
       <div class="pm-mapbox"><svg id="pm_svg" class="pm-svg"></svg>
        <div class="pm-pop" id="pm_pop"></div><div class="pm-zoom"><button id="pm_zi">+</button><button id="pm_zo">−</button><button id="pm_fit" title="Fit">⤢</button></div>
        <div class="pm-legend">${Object.entries(ST).map(([k, [f, s, t]]) => `<span><i style="background:${f};border-color:${s}"></i>${t}</span>`).join('')}<span><i style="background:#22C55E;border-color:#22C55E;height:4px;width:16px;vertical-align:2px"></i>Gate</span></div></div></div>
      <style>
       .pm-test{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:13px}.pt-sep{width:1px;height:22px;background:#FED7AA}.pt-cmp{white-space:nowrap}
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
       .pm-pop{position:absolute;display:none;pointer-events:none;background:#fff;color:#0B2A66;border:1px solid #CBD5E1;border-left:4px solid #E4611D;border-radius:6px;padding:6px 10px;font-size:12.5px;line-height:1.45;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:5;max-width:260px}
       .pm-tip{background:#FFF7ED;border:1px solid #FED7AA;border-radius:6px;padding:8px;font-size:12px;margin-top:8px}
      </style>`;
    $('pm_site').onchange = async (e) => { if (DIRTY && !confirm('Discard unsaved layout changes?')) { e.target.value = SITE; return; } SITE = +e.target.value; await load(); VB = null; draw(); };
    el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { MODE = b.dataset.mode; TOOL = 'select'; PEND = null; SEL.clear(); draw(); }));
    if (TEST) {
      const guard = () => !DIRTY || confirm('You have unsaved changes to this test layout. Discard them?');
      $('pt_scn').onchange = async (e) => { if (!guard()) { e.target.value = SCN.id; return; } SCN = SCNS.find((x) => x.id === +e.target.value); await load(); VB = null; draw(); };
      $('pt_new').onclick = async () => { if (!guard()) return; const n = prompt('Name for the new test layout (starts as a copy of the live yard):', 'Test layout ' + (SCNS.length + 1)); if (n) { await newScenario(n.trim()); VB = null; draw(); } };
      $('pt_dup').onclick = async () => { if (!guard()) return; const n = prompt('Name for the copy:', SCN.name + ' (copy)'); if (n) { await newScenario(n.trim(), { plan: PLAN, bays: cleanBays(BAYS) }); draw(); } };
      $('pt_ren').onclick = async () => { const n = prompt('Rename test layout:', SCN.name); if (n && n.trim()) { await api('park_scenarios?id=eq.' + SCN.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name: n.trim() }) }); SCN.name = n.trim(); draw(); } };
      $('pt_del').onclick = async () => { if (!confirm('Delete the test layout “' + SCN.name + '”? The live yard is not affected.')) return; await api('park_scenarios?id=eq.' + SCN.id, { method: 'DELETE' }); SCN = null; await load(); VB = null; draw(); };
      $('pt_chk').onchange = (e) => { CHK = e.target.checked; render(); };
      $('pt_af').onchange = (e) => { AIS.full = +e.target.value || 16; draw(); }; $('pt_as').onchange = (e) => { AIS.small = +e.target.value || 10; draw(); };
      $('pt_apply').onclick = applyLive;
    }
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
      const ags = AG.filter((a) => a.site_id === SITE && ['Enquiry', 'Active', 'On notice', 'Waiting list'].includes(a.status)).sort((x, y) => (x.status === 'Enquiry' ? 0 : 1) - (y.status === 'Enquiry' ? 0 : 1) || String(x.customer).localeCompare(y.customer));
      const one = sel.length === 1 ? sel[0] : null, a = one && agOf(one);
      p.innerHTML = (sel.length ? `<h4>${sel.length === 1 ? (one.kind === 'Small bay' ? 'Small bay ' : 'Full bay ') + esc(one.code) : sel.length + ' bays selected'}</h4>
        ${one ? `<div class="small muted">${esc(one.kind)} · ${one.w} × ${one.l} m</div>${a ? `<div style="margin:8px 0"><b>${esc(a.customer)}</b><div class="small">${gbp(a.weekly_rate)}/space/week · ${esc(a.status)}${a.end_date ? ' · ends ' + new Date(a.end_date).toLocaleDateString('en-GB') : ''}</div>${a.contact_name ? `<div class="small">${esc(a.contact_name)} ${esc(a.contact_phone || '')}</div>` : ''}</div>` : '<div style="margin:8px 0;color:#16A34A"><b>Free</b></div>'}` : `<div class="small muted">${sel.map((b) => esc(b.code)).join(', ')}</div>`}
        <label>Let to</label><select id="pv_ag"><option value="">– free –</option>${AG.filter((x) => x.site_id === SITE && x.status !== 'Ended').map((x) => `<option value="${x.id}" ${one && one.agreement_id === x.id ? 'selected' : ''}>${esc(x.customer)} (${x.spaces} × ${esc(x.kind)})</option>`).join('')}</select>
        <label>Bay status</label><select id="pv_st">${[['open', 'Available'], ['reserved', 'Reserved'], ['out', 'Out of use']].map(([k, t]) => `<option value="${k}" ${one && one.state === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label>Reserved for / note</label><input id="pv_rf" value="${esc(one ? one.reserved_for || one.notes || '' : '')}" placeholder="e.g. Compton hire fleet, sales stock">
        <div style="margin-top:10px;display:flex;gap:6px"><button class="pri2" id="pv_ok">Save</button><button id="pv_cl">Close</button></div><hr style="margin:14px 0;border:0;border-top:1px solid #E2E8F0">` : '') +
        (!TEST && one && a && a.status === 'Enquiry' ? `<div class="pm-tip" style="margin-top:0"><b>${esc(a.customer)}</b> – enquiry holding ${BAYS.filter((b) => b.agreement_id === a.id).length} bay(s).<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button class="pri2 mini" id="pq_yes">Confirm – make active</button><button class="mini" id="pq_rel">Release the bays</button></div></div>` : '') +
        `<div style="display:flex;justify-content:space-between;align-items:center"><h4>Customers – drag onto a bay</h4>${TEST ? '' : '<button class="mini" id="pq_new">+ New enquiry</button>'}</div><div id="pq_form"></div><div class="small muted">Drag a name onto a bay (Shift-click several bays first to drop onto all of them). Drag a let bay onto another bay to move that customer. Bars show bays placed against spaces agreed.</div>
        ${ags.length ? ags.map((x) => { const n = BAYS.filter((b) => b.agreement_id === x.id).length, full = n >= x.spaces;
          return `<div class="pm-cust" draggable="true" data-ag="${x.id}"><b>${esc(x.customer)}</b><span class="small">${x.status === 'Enquiry' ? '<span style="color:#D97706;font-weight:700">Enquiry</span> · ' : x.status === 'Waiting list' ? '<span style="color:#E4611D">Waiting list</span> · ' : ''}${n} of ${x.spaces} × ${esc(x.kind)} placed${n > x.spaces ? ' <span style="color:#DC2626">– more bays than agreed</span>' : ''}</span><div class="bar"><i style="width:${Math.min(100, n / Math.max(1, x.spaces) * 100)}%;background:${full ? '#16A34A' : '#164698'}"></i></div></div>`; }).join('') : '<div class="small muted">No agreements at this site yet – add them on the <a href="#/p-parking">Parking</a> page.</div>'}
        <h4>Free bays by type</h4>${Object.keys(KINDS).map((k) => { const t = BAYS.filter((b) => b.kind === k), f = t.filter((b) => stateOf(b) === 'free').length; return t.length ? `<div class="small">${esc(k)}: <b>${f}</b> free of ${t.length}</div>` : ''; }).join('') || '<div class="small muted">No bays yet – use Edit layout.</div>'}
        ${TEST ? '' : '<div style="margin-top:10px"><button class="mini" id="pv_cap">Update Parking page space counts from the map</button></div>'}`;
      p.querySelectorAll('[data-ag]').forEach((d) => (d.ondragstart = (e) => { e.dataTransfer.setData('text/plain', d.dataset.ag); e.dataTransfer.effectAllowed = 'move'; }));
      if ($('pv_ok')) $('pv_ok').onclick = async () => {
        const ag = $('pv_ag').value ? +$('pv_ag').value : null, st = $('pv_st').value, rf = $('pv_rf').value.trim() || null;
        await patchBays(sel, { agreement_id: ag, state: ag ? 'open' : st, reserved_for: rf }); };
      if ($('pv_cl')) $('pv_cl').onclick = () => { SEL.clear(); side(); render(); };
      if ($('pv_cap')) $('pv_cap').onclick = syncCap;
      if ($('pq_new')) $('pq_new').onclick = enquiryForm;
      if ($('pq_yes')) $('pq_yes').onclick = async () => { try { await api('park_agreements?id=eq.' + a.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'Active', start_date: a.start_date || today(), updated_at: new Date().toISOString() }) }); a.status = 'Active'; a.start_date = a.start_date || today(); draw(); msg(a.customer + ' is now active – add the rate and contact on the Parking page if missing.'); } catch (e) { msg('Could not save: ' + e.message); } };
      if ($('pq_rel')) $('pq_rel').onclick = () => patchBays(BAYS.filter((b) => b.agreement_id === a.id), { agreement_id: null });
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
      <div style="margin-top:10px"><button class="mini" id="pe_renum">Renumber all bays</button> <span class="small muted">Full bays 1, 2, 3… and small bays S1, S2… clockwise from the gate.</span></div>
      <h4>Site size</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Width (m)</label><input id="pe_sw" type="number" value="${PLAN.width_m}"></div><div><label>Depth (m)</label><input id="pe_sh" type="number" value="${PLAN.height_m}"></div></div>
      ${PLAN.bg && SAT ? `<h4>Satellite photo</h4><label>Strength <input type="range" id="pe_op" min="0" max="1" step="0.05" value="${PLAN.bg.opacity ?? 0.6}"></label>` : ''}
      <div class="small muted" style="margin-top:12px">Keys: Delete removes · R turns 90° · [ and ] turn 5° · arrow keys nudge 0.25 m (Shift = 1 m). Drag empty map to pan, scroll to zoom.</div>`;
    p.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => { TOOL = b.dataset.tool; PEND = null; if (TOOL !== 'select') SEL.clear(); side(); render(); }));
    if ($('pe_kind')) { $('pe_kind').onchange = (e) => { ROWOPT.kind = e.target.value; [ROWOPT.w, ROWOPT.l] = KINDS[ROWOPT.kind]; side(); };
      $('pe_w').onchange = (e) => (ROWOPT.w = +e.target.value || 4); $('pe_l').onchange = (e) => (ROWOPT.l = +e.target.value || 18.5);
      $('pe_px').onchange = (e) => (ROWOPT.prefix = e.target.value.trim()); $('pe_flip').onchange = (e) => { ROWOPT.flip = e.target.checked; render(); }; }
    if ($('pe_free')) $('pe_free').onchange = (e) => { ROWOPT.free = e.target.checked; PEND = null; render(); };
    $('pe_renum').onclick = () => { if (!confirm('Renumber every bay at this site? Full bays become 1, 2, 3… and small bays S1, S2…, going clockwise from the gate. Press Save layout afterwards to keep it.')) return; renumberAll(); };
    $('pe_sw').onchange = (e) => { PLAN.width_m = +e.target.value || PLAN.width_m; dirty(); };
    $('pe_sh').onchange = (e) => { PLAN.height_m = +e.target.value || PLAN.height_m; dirty(); };
    if ($('pe_op')) $('pe_op').oninput = (e) => { PLAN.bg.opacity = +e.target.value; DIRTY = true; render(); };
    wireSelPanel(sel);
  }
  function enquiryForm() {
    const f = $('pq_form'); if (!f) return;
    f.innerHTML = `<div class="pm-tip" style="background:#FFFBEB;border-color:#FDE68A"><label>Customer</label><input id="pq_c">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Bay type</label><select id="pq_k"><option>HGV</option><option>Small bay</option></select></div><div><label>Spaces</label><input id="pq_n" type="number" min="1" value="1"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>£/space/week</label><input id="pq_r" type="number" step="0.01"></div><div><label>Phone</label><input id="pq_p"></div></div>
      <label>Contact</label><input id="pq_ct"><label>Notes</label><input id="pq_nt" placeholder="e.g. wants to start January">
      <div style="margin-top:8px;display:flex;gap:6px"><button class="pri2" id="pq_ok">Add – then drag onto bays</button><button id="pq_x">Cancel</button></div></div>`;
    $('pq_x').onclick = () => (f.innerHTML = ''); $('pq_c').focus();
    $('pq_ok').onclick = async () => {
      const c = $('pq_c').value.trim(); if (!c) { $('pq_c').focus(); return; }
      try { const r = await api('park_agreements', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: SITE, customer: c, kind: $('pq_k').value, spaces: +$('pq_n').value || 1, weekly_rate: +$('pq_r').value || 0, contact_name: $('pq_ct').value.trim() || null, contact_phone: $('pq_p').value.trim() || null, notes: $('pq_nt').value.trim() || null, status: 'Enquiry', start_date: null }) });
        AG.push(r[0]); side(); msg(c + ' added as an enquiry – drag it onto the bays to hold them.'); } catch (e) { msg('Could not add: ' + e.message); } };
  }
  // hover pop-up for bays and shapes
  function pop(e, drag) {
    const el = $('pm_pop'); if (!el) return;
    const g = document.elementFromPoint(e.clientX, e.clientY), t = g && g.closest && g.closest('[data-bay],[data-feat]');
    if (!t || (PEND && (PEND.shape || PEND.row || PEND.meas || PEND.poly))) { el.style.display = 'none'; return; }
    let h = '';
    if (t.dataset.bay != null) { const b = BAYS[+t.dataset.bay]; if (!b) return; const a = agOf(b), k = stateOf(b);
      h = `<b>${b.kind === 'Small bay' ? 'Small bay ' : 'Full bay '}${esc(b.code)}</b> <span style="color:#64748B">${b.w} × ${b.l} m</span><br>` +
        (a ? `<b>${esc(a.customer)}</b><br><span style="color:#64748B">${a.status === 'Enquiry' ? 'Enquiry – bay held' : esc(a.status)} · ${+a.weekly_rate ? gbp(a.weekly_rate) + '/week' : 'rate not set'}${a.end_date ? ' · ends ' + new Date(a.end_date).toLocaleDateString('en-GB') : ''}</span>`
          : k === 'reserved' ? 'Reserved' + (b.reserved_for ? ': ' + esc(b.reserved_for) : '') : k === 'out' ? 'Out of use' : '<b style="color:#16A34A">Free</b>');
    } else { const f = PLAN.features[+t.dataset.feat]; if (!f) return; const P = f.pts;
      h = `<b>${esc(f.label || (f.type === 'gate' ? 'Gate' : (FEAT[f.type] || FEAT.area)[2]))}</b><br><span style="color:#64748B">` + (f.type === 'gate' ? 'Width ' + dist(P[0], P[1]).toFixed(1) + ' m' : P.map((p, i) => dist(p, P[(i + 1) % P.length]).toFixed(1)).slice(0, 2).join(' × ') + ' m · ' + Math.round(area(P)) + ' m²') + '</span>'; }
    if (drag && drag.kind === 'mv' && drag.moved && t.dataset.bay != null) { const b = BAYS[+t.dataset.bay]; h = b === drag.from ? h : `Move <b>${esc((agOf(drag.from) || {}).customer || '')}</b> to bay <b>${esc(b.code)}</b>` + (b.agreement_id && b.agreement_id !== drag.from.agreement_id ? '<br><span style="color:#B45309">swaps with ' + esc(agOf(b).customer) + '</span>' : ''); }
    const r = el.parentElement.getBoundingClientRect(); el.innerHTML = h; el.style.display = 'block';
    el.style.left = Math.min(r.width - 270, e.clientX - r.left + 14) + 'px'; el.style.top = Math.min(r.height - 70, e.clientY - r.top + 14) + 'px';
  }
  async function moveCustomer(from, to) {
    const a = agOf(from), b = agOf(to); if (!a || from === to) return;
    if (b && b !== a && !confirm('Bay ' + to.code + ' is let to ' + b.customer + '. Swap ' + a.customer + ' and ' + b.customer + '?')) return;
    const ups = [[to, a.id], [from, b && b !== a ? b.id : null]];
    if (DIRTY || TEST) { ups.forEach(([x, id]) => { x.agreement_id = id; x._d = 1; }); DIRTY = true; draw(); msg('Moved – press Save to keep it.'); return; }
    try { for (const [x, id] of ups) await api('park_bays?id=eq.' + x.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ agreement_id: id, state: 'open', updated_at: new Date().toISOString() }) });
      ups.forEach(([x, id]) => { x.agreement_id = id; x.updated_at = new Date().toISOString(); }); BAYSIG = sig(BAYS); SEL.clear(); draw(); msg(a.customer + ' moved from ' + from.code + ' to ' + to.code + (b && b !== a ? ' (swapped with ' + b.customer + ')' : '') + '.');
    } catch (e) { msg('Could not move: ' + e.message); }
  }
  function selPanel(sel) {
    const f = PEND && PEND.feat;
    if (f) { const P = f.pts, gate = f.type === 'gate';
      if ((PEND.more || []).length) return `<h4>${PEND.more.length + 1} shapes selected</h4><div class="small muted">${[f].concat(PEND.more).map((x) => esc(x.label || x.type)).join(', ')}</div><div class="small muted" style="margin-top:6px">Drag any of them to move them together, or turn them together below.</div>
        <label>Turn</label><div style="display:flex;gap:4px;flex-wrap:wrap">${[-90, -5, -1, 1, 5, 90].map((d) => `<button class="mini" data-rot="${d}">${d > 0 ? '+' : ''}${d}°</button>`).join('')}</div>
        <div style="margin-top:8px;display:flex;gap:6px"><button id="pf_del">Delete all</button><button id="pf_cl">Done</button></div><input type="hidden" id="pf_lb"><select id="pf_ty" style="display:none"></select>`;
      return `<h4>${esc(gate ? 'Gate' : (FEAT[f.type] || FEAT.area)[2])}</h4><label>Label</label><input id="pf_lb" value="${esc(f.label || '')}">
      <label>Type</label><select id="pf_ty">${(gate ? [['gate', 'Gate']] : Object.entries(FEAT).map(([k, v]) => [k, v[2]])).map(([k, t]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="small" style="margin-top:8px">${gate ? 'Width <b>' + dist(P[0], P[1]).toFixed(1) + ' m</b>' : 'Sides: ' + P.map((p, i) => dist(p, P[(i + 1) % P.length]).toFixed(1)).join(' × ') + ' m<br>Area <b>' + Math.round(area(P)) + ' m²</b>'}</div>
      ${gate ? `<label>Width (m)</label><input id="pf_gw" type="number" step="0.1" value="${dist(P[0], P[1]).toFixed(1)}">` : P.length === 4 ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>Side 1 (m)</label><input id="pf_L" type="number" step="0.1" value="${dist(P[0], P[1]).toFixed(1)}"></div><div><label>Side 2 (m)</label><input id="pf_W" type="number" step="0.1" value="${dist(P[1], P[2]).toFixed(1)}"></div></div>` : ''}
      <label>Turn</label><div style="display:flex;gap:4px;flex-wrap:wrap">${[-90, -5, -1, 1, 5, 90].map((d) => `<button class="mini" data-rot="${d}">${d > 0 ? '+' : ''}${d}°</button>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Drag the shape to move it, drag its square corners to reshape it. Shift-click other shapes to move or turn them together.${gate ? '' : ' Double-click a corner to remove it, double-click an edge to add one.'}</div>
      <div style="margin-top:8px;display:flex;gap:6px"><button id="pf_del">Delete</button><button id="pf_cl">Done</button></div>`; }
    if (!sel.length) return '<div class="small muted" style="margin-top:10px">Click a bay to edit it, Shift-click or drag a box to pick several. Drag to move.</div>';
    const one = sel.length === 1 ? sel[0] : null;
    return `<h4>${one ? 'Bay ' + esc(one.code) : sel.length + ' bays selected'}</h4>
      ${one ? `<label>Number</label><input id="ps_code" value="${esc(one.code)}">` : `<label>Renumber as</label><div style="display:flex;gap:6px"><input id="ps_px" placeholder="Prefix e.g. B" style="width:50%"><input id="ps_n0" type="number" value="1" style="width:50%"></div>`}
      <label>Type</label><select id="ps_kind"><option value="">${one ? '' : '(keep)'}</option>${Object.keys(KINDS).map((k) => `<option ${one && one.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><div><label>Width</label><input id="ps_w" type="number" step="0.1" value="${one ? one.w : ''}"></div><div><label>Length</label><input id="ps_l" type="number" step="0.1" value="${one ? one.l : ''}"></div><div><label>Angle°</label><input id="ps_r" type="number" step="5" value="${one ? one.rot : ''}"></div></div>
      <label>Turn ${sel.length > 1 ? 'these bays together' : 'this bay'}</label><div style="display:flex;gap:4px;flex-wrap:wrap">${[-90, -5, -1, 1, 5, 90].map((d) => `<button class="mini" data-brot="${d}">${d > 0 ? '+' : ''}${d}°</button>`).join('')}</div>
      <div class="small muted" style="margin-top:4px">Bays in a row touch each other, so to turn a row select the whole row first (Shift-drag a box round it).</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button id="ps_ok" class="pri2">Apply</button><button id="ps_dup">Copy</button><button id="ps_del">Delete</button></div>`;
  }
  function wireSelPanel(sel) {
    if ($('pf_lb')) { const f = PEND.feat; $('pf_lb').oninput = (e) => { f.label = e.target.value; DIRTY = true; render(); };
      $('pf_ty').onchange = (e) => { if (e.target.value) { f.type = e.target.value; dirty(); } };
      document.querySelectorAll('[data-rot]').forEach((b) => (b.onclick = () => { turnGroup(+b.dataset.rot); }));
      const resize = () => { const P = f.pts, c = cent(P), u0 = [P[1][0] - P[0][0], P[1][1] - P[0][1]], lu = Math.hypot(...u0) || 1, u = [u0[0] / lu, u0[1] / lu], v0 = [P[2][0] - P[1][0], P[2][1] - P[1][1]], lv = Math.hypot(...v0) || 1, v = [v0[0] / lv, v0[1] / lv];
        const L = +$('pf_L').value || lu, W = +$('pf_W').value || lv, R = (k) => Math.round(k * 100) / 100;
        f.pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [R(c[0] + u[0] * a * L / 2 + v[0] * b * W / 2), R(c[1] + u[1] * a * L / 2 + v[1] * b * W / 2)]); dirty(); };
      if ($('pf_L')) { $('pf_L').onchange = resize; $('pf_W').onchange = resize; }
      if ($('pf_gw')) $('pf_gw').onchange = (e) => { const P = f.pts, c = cent(P), d = dist(P[0], P[1]) || 1, k = (+e.target.value || d) / d; f.pts = P.map((p) => [Math.round((c[0] + (p[0] - c[0]) * k) * 100) / 100, Math.round((c[1] + (p[1] - c[1]) * k) * 100) / 100]); dirty(); };
      $('pf_del').onclick = () => { const g = [f].concat(PEND.more || []); PLAN.features = PLAN.features.filter((x) => !g.includes(x)); PEND = null; dirty(); }; $('pf_cl').onclick = () => { PEND = null; side(); render(); }; return; }
    if (!$('ps_ok')) return;
    $('ps_ok').onclick = () => {
      const k = $('ps_kind').value, w = $('ps_w').value, l = $('ps_l').value, r = $('ps_r').value;
      if (!tryBays(sel, () => sel.forEach((b) => { if (w !== '') b.w = +w; if (l !== '') b.l = +l; if (r !== '') b.rot = +r; }))) { side(); return; }
      sel.forEach((b) => { if (k) b.kind = k; b._d = 1; });
      if (sel.length === 1) { const c = $('ps_code').value.trim(); if (c && c !== sel[0].code) { if (BAYS.some((b) => b !== sel[0] && b.code === c)) { msg('Bay ' + c + ' already exists.'); return; } sel[0].code = c; } }
      else { const px = $('ps_px').value.trim(); if (px) renumber(sel, px, +$('ps_n0').value || 1); }
      dirty();
    };
    $('ps_dup').onclick = () => { // copy beside the selection, flush, in the first space that's clear
      const a = sel[0].rot * Math.PI / 180, bx = [Math.cos(a), Math.sin(a)], span = sel.length > 1 ? Math.max(...sel.map((b) => (b.x - sel[0].x) * bx[0] + (b.y - sel[0].y) * bx[1])) - Math.min(...sel.map((b) => (b.x - sel[0].x) * bx[0] + (b.y - sel[0].y) * bx[1])) + sel[0].w : sel[0].w;
      const nb = sel.map((b) => Object.assign({}, b, { id: null, agreement_id: null, state: 'open', code: uniqueCode(b.code), _d: 1 })); BAYS.push(...nb);
      for (const k of [1, -1, 2, -2, 3, -3]) { nb.forEach((c, i) => { c.x = sel[i].x + bx[0] * span * k; c.y = sel[i].y + bx[1] * span * k; }); if (!clash(nb)) { SEL = new Set(nb); dirty(); return; } }
      BAYS = BAYS.filter((b) => !nb.includes(b)); msg('No clear space right beside these bays to copy into – drag them first.'); };
    $('ps_del').onclick = delSel;
    document.querySelectorAll('[data-brot]').forEach((x) => (x.onclick = () => turnBays(sel, +x.dataset.brot)));
  }
  function renumber(list, px, n0) {
    // order along the row: by position projected on the row direction
    const o = list.slice().sort((a, b) => (Math.abs(a.y - b.y) > a.l / 2 ? a.y - b.y : a.x - b.x)); const taken = new Set(BAYS.filter((b) => !list.includes(b)).map((b) => b.code));
    o.forEach((b, i) => { let c = px + (n0 + i); while (taken.has(c)) c += "'"; b.code = c; b._d = 1; });
  }
  const nextPrefix = () => { const used = new Set(BAYS.map((b) => (b.code.match(/^[A-Z]+/i) || [''])[0].toUpperCase())); for (const c of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!used.has(c)) return c; return 'Z'; };
  const uniqueCode = (c) => { let n = c + "'"; while (BAYS.some((b) => b.code === n)) n += "'"; return n; };
  function delSel() { const sel = BAYS.filter((b) => SEL.has(b)); if (sel.some((b) => b.agreement_id) && !confirm('Some of these bays are let. Delete them anyway?')) return; sel.forEach((b) => b.id && DEL.push(b.id)); BAYS = BAYS.filter((b) => !SEL.has(b)); SEL.clear(); dirty(); }
  function dirty(redraw = true) { const was = DIRTY; DIRTY = true; if (!was || (TEST && redraw)) draw(); else { if (redraw) side(); render(); } }
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
      s += edgeLabels(PLAN.boundary, true, Math.max(0.7, VB.w / 110));
    }
    const fsE = Math.max(0.7, VB.w / 95);
    PLAN.features.forEach((f, i) => {
      const P = f.pts, on = PEND && (PEND.feat === f || (PEND.more || []).includes(f)), cur = MODE === 'edit' ? 'move' : 'default';
      if (f.type === 'gate') { const c = cent(P), GR = '#22C55E', gl = dist(P[0], P[1]) || 1, gd = [(P[1][0] - P[0][0]) / gl, (P[1][1] - P[0][1]) / gl], all = PLAN.boundary.length > 2 ? cent(PLAN.boundary) : c;
        let nn = [-gd[1], gd[0]]; if ((all[0] - c[0]) * nn[0] + (all[1] - c[1]) * nn[1] < 0) nn = [-nn[0], -nn[1]];   // arrow points into the yard
        const al = Math.max(3, Math.min(6, gl * 0.6)), ah = al * 0.35, tip = [c[0] + nn[0] * (al + 1), c[1] + nn[1] * (al + 1)], bs = [c[0] + nn[0] * 1, c[1] + nn[1] * 1];
        s += `<g data-feat="${i}" style="cursor:${cur}"><line x1="${P[0][0]}" y1="${P[0][1]}" x2="${P[1][0]}" y2="${P[1][1]}" stroke="transparent" stroke-width="4"/><line x1="${P[0][0]}" y1="${P[0][1]}" x2="${P[1][0]}" y2="${P[1][1]}" stroke="${BG}" stroke-width="${on ? 2.6 : 2.2}" stroke-linecap="round"/><line x1="${P[0][0]}" y1="${P[0][1]}" x2="${P[1][0]}" y2="${P[1][1]}" stroke="${on ? HI : GR}" stroke-width="${on ? 1.8 : 1.5}" stroke-linecap="round"/>
          <path d="M${bs[0]} ${bs[1]} L${tip[0] - nn[0] * ah} ${tip[1] - nn[1] * ah}" stroke="${GR}" stroke-width="0.7" fill="none"/><path d="M${tip[0]} ${tip[1]} L${tip[0] - nn[0] * ah + gd[0] * ah * 0.8} ${tip[1] - nn[1] * ah + gd[1] * ah * 0.8} L${tip[0] - nn[0] * ah - gd[0] * ah * 0.8} ${tip[1] - nn[1] * ah - gd[1] * ah * 0.8} Z" fill="${GR}"/>
          ${P.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="0.9" fill="#fff" stroke="${GR}" stroke-width="0.35"/>`).join('')}<text x="${c[0] - nn[0] * 2.2}" y="${c[1] - nn[1] * 2.2}" font-size="${Math.max(1.2, fsE * 0.75)}" text-anchor="middle" dominant-baseline="middle" fill="${GR}" font-weight="800" letter-spacing="0.1" paint-order="stroke" stroke="${BG}" stroke-width="${fsE / 2.5}" pointer-events="none">${esc(String(f.label || 'Gate').toUpperCase())} · ${dist(P[0], P[1]).toFixed(1)} m</text></g>`;
      } else { const [fill, st] = FEAT[f.type] || FEAT.area, c = cent(P), pts = P.map((p) => p.join(',')).join(' ');
        s += `<g data-feat="${i}" style="cursor:${cur}"><polygon points="${pts}" fill="${fill}" stroke="${on ? HI : st}" stroke-width="${on ? 0.5 : 0.25}" stroke-dasharray="${f.type === 'road' ? '1.2 0.8' : ''}"/>${f.type === 'nogo' || f.type === 'building' ? `<polygon points="${pts}" fill="url(#${f.type === 'nogo' ? 'pmhatchR' : 'pmhatchW'})" pointer-events="none"/>` : ''}
          ${f.label ? (() => { // label fits inside the shape and runs along its longer side
            const e0 = dist(P[0], P[1]), e1 = dist(P[1], P[2] || P[0]), lg = e0 >= e1 ? [P[0], P[1]] : [P[1], P[2]], lo = Math.max(e0, e1), sh = Math.min(e0, e1) || lo, txt = String(f.label).toUpperCase();
            let ang = Math.atan2(lg[1][1] - lg[0][1], lg[1][0] - lg[0][0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
            const fz = Math.min(VB.w / 95, sh * 0.35, lo * 0.85 / (txt.length * 0.62)); if (fz < VB.w / 380) return '';   // sized to the screen, hidden only if too small to read
            return `<text transform="translate(${c[0]},${c[1]}) rotate(${ang})" font-size="${fz}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-weight="700" paint-order="stroke" stroke="${BG}" stroke-width="${fz / 3}" letter-spacing="${fz / 14}" pointer-events="none">${esc(txt)}</text>`; })() : ''}</g>`; }
      if (on && MODE === 'edit' && PEND.feat === f && !(PEND.more || []).length) { const hs = Math.max(0.6, VB.w / 160);
        s += edgeLabels(P, f.type !== 'gate', fsE) + P.map((p, k) => `<rect data-fv="${k}" x="${p[0] - hs}" y="${p[1] - hs}" width="${hs * 2}" height="${hs * 2}" fill="${BG}" stroke="${HI}" stroke-width="${hs / 3}" style="cursor:crosshair"/>`).join('')
          + (f.type !== 'gate' ? P.map((p, k) => { const q = P[(k + 1) % P.length]; return `<line data-fseg="${k}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="transparent" stroke-width="${hs * 1.5}" style="cursor:copy"/>`; }).join('') : ''); }
    });
    BAYS.forEach((b, i) => {
      const k = stateOf(b), [fill, st] = ST[k], a = agOf(b), on = SEL.has(b), dim = q && !hit(b);
      const fs = Math.max(0.6, Math.min(1.3, b.w * 0.32)), nm = a ? a.customer : b.state === 'reserved' ? b.reserved_for || 'Reserved' : '', nfs = Math.max(0.5, Math.min(fs * 0.68, b.l * 0.88 / (Math.max(1, nm.length) * 0.58))), mx = Math.max(3, Math.floor(b.l * 0.9 / (nfs * 0.58))), name = nm.length > mx ? nm.slice(0, mx - 1) + '…' : nm;
      const nrm = (d) => ((d + 180) % 360 + 360) % 360 - 180, tr = Math.abs(nrm(b.rot + 90)) <= 90 ? 90 : -90;   // run along the bay and stay the right way up
      const tc = '#fff', vert = Math.abs(((b.rot % 180) + 180) % 180 - 90) > 45;   // text runs along the bay's length
      s += `<g data-bay="${i}" transform="translate(${b.x},${b.y}) rotate(${b.rot})" opacity="${dim ? 0.25 : 1}" style="cursor:pointer">
        <rect x="${-b.w / 2}" y="${-b.l / 2}" width="${b.w}" height="${b.l}" fill="${fill}" stroke="${on || (q && hit(b)) ? HI : st}" stroke-width="${on || (q && hit(b)) ? 0.5 : 0.18}"/>${k === 'out' ? `<rect x="${-b.w / 2}" y="${-b.l / 2}" width="${b.w}" height="${b.l}" fill="url(#pmhatch)" pointer-events="none"/>` : ''}
        <g transform="rotate(${tr})"><text y="${name ? -nfs * 0.55 : 0}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="${tc}" font-weight="800" pointer-events="none">${esc(b.code)}</text>
        ${name ? `<text y="${fs * 0.62}" font-size="${nfs}" text-anchor="middle" dominant-baseline="middle" fill="${tc}" opacity="0.92" pointer-events="none">${esc(name)}</text>` : ''}</g></g>`;
    });
    if (TEST && CHK) { const tc = turning();
      s += '<g pointer-events="none">' + tc.map((x) => `<polygon points="${x.Z.map((p) => p.join(',')).join(' ')}" fill="${x.ok ? 'rgba(250,204,21,.10)' : 'rgba(239,68,68,.28)'}" stroke="${x.ok ? 'rgba(250,204,21,.35)' : '#EF4444'}" stroke-width="0.15"/>`).join('') +
        tc.filter((x) => !x.ok).map((x) => `<polygon points="${bayPts(x.b).map((p) => p.join(',')).join(' ')}" fill="none" stroke="#EF4444" stroke-width="0.6"/>`).join('') + '</g>'; }
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
      if (MODE === 'edit' && hit.fseg != null && PEND && PEND.feat) { drag = { kind: 'feat', p, grp: [PEND.feat].concat(PEND.more || []).map((g) => [g, g.pts.map((q) => q.slice())]) }; svg.setPointerCapture(e.pointerId); return; }
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
        else if (b.agreement_id) { drag = { kind: 'mv', from: b, cx: e.clientX, cy: e.clientY }; svg.setPointerCapture(e.pointerId); }
        return; }
      const fv = e.target.closest('[data-fv]');
      if (MODE === 'edit' && fv && PEND && PEND.feat) { drag = { kind: 'fv', f: PEND.feat, k: +fv.dataset.fv }; svg.setPointerCapture(e.pointerId); return; }
      if (MODE === 'edit' && fg) { const f = PLAN.features[+fg.dataset.feat]; SEL.clear();
        if (e.shiftKey && PEND && PEND.feat && PEND.feat !== f) { PEND.more = (PEND.more || []).filter((x) => x !== f).concat([f]); } else if (!(PEND && PEND.feat && (PEND.feat === f || (PEND.more || []).includes(f)))) PEND = { feat: f };
        side(); render(); const grp = [PEND.feat].concat(PEND.more || []); drag = { kind: 'feat', p, grp: grp.map((g) => [g, g.pts.map((q) => q.slice())]) }; svg.setPointerCapture(e.pointerId); return; }
      if (MODE === 'edit' && e.shiftKey) { PEND = { box: 1, rect: { x0: p[0], y0: p[1], x1: p[0], y1: p[1] } }; svg.setPointerCapture(e.pointerId); return; }
      if (!e.shiftKey && (SEL.size || PEND)) { SEL.clear(); PEND = null; side(); render(); }
      drag = { kind: 'pan', cx: e.clientX, cy: e.clientY, vb: Object.assign({}, VB) }; svg.setPointerCapture(e.pointerId);
    };
    svg.onpointermove = (e) => {
      const p = pt(e); pop(e, drag);
      if (drag && drag.kind === 'mv') { if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) > 6) { drag.moved = 1; svg.style.cursor = 'grabbing'; } return; }
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
      if (drag.kind === 'bays') { const list = drag.start.map(([b]) => b); tryBays(list, () => drag.start.forEach(([b, x, y]) => { b.x = x + dx; b.y = y + dy; }), true); }
      if (drag.kind === 'feat') drag.grp.forEach(([g, pts]) => (g.pts = pts.map((q) => [q[0] + dx, q[1] + dy])));
      render();
    };
    svg.onpointerleave = () => { const el = $('pm_pop'); if (el) el.style.display = 'none'; };
    svg.onpointerup = (e) => {
      if (drag && drag.kind === 'mv') { svg.style.cursor = ''; const d = drag; drag = null; if (d.moved) { const g = document.elementFromPoint(e.clientX, e.clientY), t = g && g.closest('[data-bay]'); if (t) moveCustomer(d.from, BAYS[+t.dataset.bay]); else msg('Drop onto another bay to move the customer.'); } return; }
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
      if (PEND && PEND.feat && (e.key === 'Delete' || e.key === 'Backspace')) { const g = [PEND.feat].concat(PEND.more || []); PLAN.features = PLAN.features.filter((x) => !g.includes(x)); PEND = null; dirty(); return; }
      if (PEND && PEND.feat) { const f = PEND.feat, t = e.key === 'r' || e.key === 'R' ? 90 : e.key === ']' ? (e.shiftKey ? 1 : 5) : e.key === '[' ? (e.shiftKey ? -1 : -5) : 0;
        const st = e.shiftKey ? 1 : 0.25, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        if (t) turnGroup(t); else if (mv) { e.preventDefault(); [f].concat(PEND.more || []).forEach((x) => (x.pts = x.pts.map((q) => [q[0] + mv[0], q[1] + mv[1]]))); dirty(false); } return; }
      if (!sel.length) return; const st = e.shiftKey ? 1 : 0.25;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (mv) { e.preventDefault(); if (tryBays(sel, () => sel.forEach((b) => { b.x += mv[0]; b.y += mv[1]; }))) dirty(false); else render(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); return; }
      const turn = e.key === 'r' || e.key === 'R' ? 90 : e.key === ']' ? 5 : e.key === '[' ? -5 : 0;
      if (turn) turnBays(sel, turn);
    };
  }
  function renumberAll() {
    const all = BAYS.reduce((a, b) => a.concat([[b.x, b.y]]), []), c = all.length ? cent(all) : [0, 0], g = PLAN.features.find((f) => f.type === 'gate'), g0 = g ? cent(g.pts) : [c[0], c[1] - 1];
    const a0 = Math.atan2(g0[1] - c[1], g0[0] - c[0]), ang = (b) => ((Math.atan2(b.y - c[1], b.x - c[0]) - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const ord = BAYS.slice().sort((p, q) => ang(p) - ang(q)); let nf = 1, ns = 1;
    ord.forEach((b) => { b.code = '~' + (b.id || Math.random()); });
    ord.forEach((b) => { b.code = b.kind === 'Small bay' ? 'S' + ns++ : String(nf++); b._d = 1; }); dirty();
  }
  // bays are solid: they may touch but not overlap each other or a building
  const bayPts = (b) => { const a = b.rot * Math.PI / 180, ax = [-Math.sin(a), Math.cos(a)], bx = [Math.cos(a), Math.sin(a)];
    return [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([s, t]) => [b.x + ax[0] * s * b.l / 2 + bx[0] * t * b.w / 2, b.y + ax[1] * s * b.l / 2 + bx[1] * t * b.w / 2]); };
  function sat(A, B) { const ax = (P) => P.map((p, i) => { const q = P[(i + 1) % P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [-(q[1] - p[1]) / L, (q[0] - p[0]) / L]; });
    for (const n of ax(A).concat(ax(B))) { const pa = A.map((p) => p[0] * n[0] + p[1] * n[1]), pb = B.map((p) => p[0] * n[0] + p[1] * n[1]);
      if (Math.max(...pa) - 0.05 <= Math.min(...pb) || Math.max(...pb) - 0.05 <= Math.min(...pa)) return false; } return true; }
  function clash(list) {
    const others = BAYS.filter((b) => !list.includes(b)).map(bayPts).concat(PLAN.features.filter((f) => f.type === 'building' && f.pts.length > 2).map((f) => f.pts));
    for (const b of list) { const P = bayPts(b), near = others.filter((o) => Math.hypot(o[0][0] - b.x, o[0][1] - b.y) < 45); if (near.some((o) => sat(P, o))) return b; } return null;
  }
  // pull a moved group flush against a neighbouring bay at the same angle when it's within 1.5 m
  function snap(list) {
    const lead = list[0]; let best = null;
    BAYS.forEach((n) => { if (list.includes(n)) return; const dr = Math.abs((((lead.rot - n.rot) % 180) + 180) % 180); if (dr > 1 && dr < 179) return;
      if (Math.hypot(n.x - lead.x, n.y - lead.y) > 25) return;
      const a = n.rot * Math.PI / 180, ax = [-Math.sin(a), Math.cos(a)], bx = [Math.cos(a), Math.sin(a)], d = [lead.x - n.x, lead.y - n.y], sv = d[0] * bx[0] + d[1] * bx[1], tv = d[0] * ax[0] + d[1] * ax[1];
      const cands = [[Math.sign(sv || 1) * (n.w + lead.w) / 2, Math.abs(tv) < 1.5 ? 0 : tv], [Math.abs(sv) < 1.5 ? 0 : sv, Math.sign(tv || 1) * (n.l + lead.l) / 2]];
      cands.forEach(([s2, t2]) => { const nx = n.x + bx[0] * s2 + ax[0] * t2, ny = n.y + bx[1] * s2 + ax[1] * t2, dd = Math.hypot(nx - lead.x, ny - lead.y); if (dd < 1.5 && (!best || dd < best.d)) best = { d: dd, dx: nx - lead.x, dy: ny - lead.y }; }); });
    if (best) list.forEach((b) => { b.x = Math.round((b.x + best.dx) * 100) / 100; b.y = Math.round((b.y + best.dy) * 100) / 100; });
  }
  // try a change to some bays; undo it if they would overlap anything
  function tryBays(list, change, quiet) {
    const was = list.map((b) => [b, b.x, b.y, b.w, b.l, b.rot]); change(); snap(list);
    if (clash(list)) { was.forEach(([b, x, y, w, l, r]) => Object.assign(b, { x, y, w, l, rot: r })); if (!quiet) msg('Bays can’t overlap each other or a building – they can only sit flush.'); return false; }
    list.forEach((b) => (b._d = 1)); return true;
  }
  function turnBays(sel, turn) {
    const cx = sel.reduce((t, b) => t + b.x, 0) / sel.length, cy = sel.reduce((t, b) => t + b.y, 0) / sel.length, a = turn * Math.PI / 180;
    const ok = tryBays(sel, () => sel.forEach((b) => { const x = b.x - cx, y = b.y - cy; b.x = Math.round((cx + x * Math.cos(a) - y * Math.sin(a)) * 100) / 100; b.y = Math.round((cy + x * Math.sin(a) + y * Math.cos(a)) * 100) / 100; b.rot = Math.round((((b.rot + turn) % 360 + 360) % 360) * 100) / 100; }), true);
    if (ok) dirty(); else { msg(sel.length === 1 ? 'Can’t turn this bay – it would hit the bays next to it. To turn a whole row, Shift-drag a box round the row first, then turn it.' : 'Can’t turn these bays – they would hit something. Move them clear first.'); render(); }
  }
  function turnGroup(deg) { const g = [PEND.feat].concat(PEND.more || []), c = cent(g.reduce((a, x) => a.concat(x.pts), [])); g.forEach((x) => (x.pts = rotPts(x.pts, deg, c))); dirty(); }
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
    const small = ROWOPT.kind === 'Small bay', nums = BAYS.filter((b) => (small ? /^S\d+$/.test(b.code) : /^\d+$/.test(b.code))).map((b) => +b.code.replace('S', '')); let n = nums.length ? Math.max(...nums) + 1 : 1;
    const nb = []; let skipped = 0;
    bs.forEach((b) => { Object.assign(b, { id: null, site_id: SITE, kind: ROWOPT.kind, state: 'open', agreement_id: null, _d: 1 }); if (clash([b].concat(nb).slice(0, 1))) { skipped++; return; } b.code = (small ? 'S' : '') + n++; nb.push(b); BAYS.push(b); });
    ROWOPT.prefix = ''; SEL = new Set(nb); TOOL = 'select'; dirty(); if (skipped) msg(skipped + ' bay(s) left out of the row because they would overlap existing bays or a building.');
  }


  // ---------- saving ----------
  async function save() {
    if (TEST) { const codes = BAYS.map((b) => b.code), dup = codes.find((c, i) => codes.indexOf(c) !== i); if (dup) { msg('Two bays are numbered ' + dup + ' – renumber one first.'); return; }
      try { await api('park_scenarios?id=eq.' + SCN.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ plan: PLAN, bays: cleanBays(BAYS), updated_at: new Date().toISOString() }) });
        SCN.plan = JSON.parse(JSON.stringify(PLAN)); SCN.bays = cleanBays(BAYS); DIRTY = false; draw(); msg('Test layout saved.'); } catch (e) { msg('Could not save: ' + e.message); } return; }
    try { const [cur] = await api('park_sites?select=plan&id=eq.' + SITE), cb = await api('park_bays?select=id,updated_at&site_id=eq.' + SITE);
      if ((JSON.stringify(cur.plan) !== PLANRAW || sig(cb) !== BAYSIG) && !confirm('Someone has changed this layout since you opened it (maybe in another tab).\n\nOK = overwrite their changes with yours.\nCancel = keep theirs; then use Discard changes to reload.')) { msg('Not saved.'); return; } } catch (e) { /* carry on */ }
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
    if (DIRTY || TEST) { list.forEach((b) => Object.assign(b, body, { _d: 1 })); DIRTY = true; draw(); msg('Changed – press Save to keep it.'); return; }
    try { const ids = list.filter((b) => b.id).map((b) => b.id); if (!ids.length) return;
      await api('park_bays?id=in.(' + ids.join(',') + ')', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, body)) });
      list.forEach((b) => Object.assign(b, body, { updated_at: new Date().toISOString() })); BAYSIG = sig(BAYS); const a = body.agreement_id && AG.find((x) => x.id === body.agreement_id);
      draw(); msg(a ? list.map((b) => b.code).join(', ') + (a.status === 'Enquiry' ? ' held for ' : ' let to ') + a.customer + '.' : 'Saved.');
    } catch (e) { msg('Could not save: ' + e.message); }
  }
  async function applyLive() {
    if (DIRTY) { msg('Save the test layout first.'); return; }
    const T = summary(BAYS), L = summary(LIVE.bays), moved = BAYS.filter((b) => b.agreement_id).length, bad = turning().filter((x) => !x.ok).length;
    if (!confirm('Replace the LIVE yard with “' + SCN.name + '”?\n\nLive now: ' + L.t + ' bays. This layout: ' + T.t + ' bays (' + T.f + ' full, ' + T.sm + ' small).\n' + moved + ' bays keep their customers as placed in this test.' + (bad ? '\n\nWarning: ' + bad + ' bays don\u2019t have enough turning space.' : '') + '\n\nThis changes the real parking map.')) return;
    if (prompt('Type LIVE to confirm') !== 'LIVE') { msg('Not applied.'); return; }
    try { msg('Applying…');
      await api('park_bays?site_id=eq.' + SITE, { method: 'DELETE' });
      if (BAYS.length) await api('park_bays', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cleanBays(BAYS).map((b) => Object.assign(b, { site_id: SITE, agreement_id: b.agreement_id && AG.some((a) => a.id === b.agreement_id) ? b.agreement_id : null, updated_at: new Date().toISOString() }))) });
      await api('park_sites?id=eq.' + SITE, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ plan: PLAN }) });
      await api('park_scenarios?id=eq.' + SCN.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ applied_at: new Date().toISOString() }) });
      const by = {}; BAYS.filter((b) => b.state !== 'out').forEach((b) => (by[b.kind] = (by[b.kind] || 0) + 1));
      for (const [kind, n] of Object.entries(by)) await api('park_capacity?on_conflict=site_id,kind', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ site_id: SITE, kind, spaces: n }) });
      await load(); draw(); msg('Applied – the live parking map now uses “' + SCN.name + '”.');
    } catch (e) { msg('Could not apply: ' + e.message); }
  }
  async function syncCap() {
    const by = {}; BAYS.filter((b) => b.state !== 'out').forEach((b) => (by[b.kind] = (by[b.kind] || 0) + 1));
    try { for (const [kind, n] of Object.entries(by)) await api('park_capacity?on_conflict=site_id,kind', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ site_id: SITE, kind, spaces: n }) });
      CAP = await all('park_capacity', 'id.asc'); msg('Parking page now shows ' + Object.entries(by).map(([k, n]) => n + ' ' + k).join(', ') + '.'); } catch (e) { msg('Could not update: ' + e.message); }
  }
})();
