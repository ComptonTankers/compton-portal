/* GROUPS, SUBGROUPS AND LOCATIONS – one shared list for hire fleet, sales stock and procurement.
   Division → Group (asset_categories) → Subgroup (asset_subgroups), using the MCS codes.
   Also the Admin page "Lists & prices": locations and charge items. */
(function () {
  const X = window.CT; if (!X || !X.routes) return;
  const { api, all, gbp, esc } = X;
  const DIVS = ['Waste & industrial', 'Energy', 'Other assets'];
  let G = [], S = [], L = [], t0 = 0;
  async function load(force) {
    if (!force && Date.now() - t0 < 30000 && G.length) return;
    [G, S, L] = await Promise.all([all('asset_categories', 'sort.asc,name.asc'), all('asset_subgroups', 'sort.asc,name.asc').catch(() => []), all('locations', 'sort.asc,name.asc').catch(() => [])]);
    t0 = Date.now();
  }
  const group = (id) => G.find((g) => g.id === id) || null;
  const sub = (id) => S.find((s) => s.id === id) || null;
  const loc = (id) => L.find((l) => l.id === id) || null;
  const subsOf = (gid) => S.filter((s) => s.category_id === gid && s.active !== false);
  // "Petroleum – artic trailer › 6 compartment, pumped"
  const label = (catId, subId) => { const g = group(catId), s = sub(subId); return g ? g.name + (s ? ' › ' + s.name : '') : s ? s.name : ''; };
  // one dropdown for group + subgroup: value "g:ID" (group only) or "s:ID"
  function pickHtml(id, catId, subId, opts) {
    const o = opts || {}, val = subId ? 's:' + subId : catId ? 'g:' + catId : '';
    return `<select id="${id}" ${o.attrs || ''}>${o.blank !== false ? `<option value="">${esc(o.blankLabel || '– choose group / subgroup –')}</option>` : ''}${DIVS.map((d) => `<optgroup label="${d}">` +
      G.filter((g) => (g.division || 'Other assets') === d && (g.active !== false || g.id === catId)).map((g) =>
        `<option value="g:${g.id}" ${val === 'g:' + g.id ? 'selected' : ''}>${esc(g.name)}${subsOf(g.id).length ? ' (subgroup not set)' : ''}</option>` +
        subsOf(g.id).map((s) => `<option value="s:${s.id}" ${val === 's:' + s.id ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;${esc(g.name)} › ${esc(s.name)}</option>`).join('')).join('') + '</optgroup>').join('')}</select>`;
  }
  const parse = (v) => { v = String(v || ''); if (v.startsWith('s:')) { const s = sub(+v.slice(2)); return { category_id: s ? s.category_id : null, subgroup_id: s ? s.id : null }; } if (v.startsWith('g:')) return { category_id: +v.slice(2), subgroup_id: null }; return { category_id: null, subgroup_id: null }; };
  const locHtml = (id, locId, attrs) => `<select id="${id}" ${attrs || ''}><option value="">–</option>${L.filter((l) => l.active !== false || l.id === locId).map((l) => `<option value="${l.id}" ${l.id === locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
  X.tax = { load, DIVS, groups: () => G, subs: () => S, locs: () => L, group, sub, loc, subsOf, label, pickHtml, parse, locHtml };

  // ---------------- Admin → Lists & prices ----------------
  const KINDS = ['Our yard', 'Partner yard / workshop', 'Customer site', 'Other site'];
  const CKINDS = ['Transport', 'Damage waiver', 'Deposit', 'Fee', 'Service', 'Accessory', 'Repair', 'Contract term', 'Charge'];
  const patch = (t, id, b) => api(t + '?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b) });
  X.routes['p-setup'] = async function (el) {
    el.innerHTML = X.head('Lists & prices', '') + '<div class="empty">Loading…</div>';
    let CH = [], AS = [], ST = [];
    try { await load(true); [CH, AS, ST] = await Promise.all([all('charge_items', 'sort.asc,name.asc'), api('assets?select=id,location_id&active=is.true'), api('stock?select=id,location_id,status')]); }
    catch (e) { el.innerHTML = X.head('Lists & prices', '') + `<div class="card"><div class="hint">Could not load: ${esc(e.message)}</div></div>`; return; }
    const openStock = ST.filter((s) => !['sold', 'written_off', 'moved_to_hire'].includes(s.status));
    el.innerHTML = X.head('Lists & prices', 'The lists everything else picks from: where kit is kept, the standard charges, and the groups and subgroups.') +
      `<div class="card"><h3>Locations</h3><div class="hint">Where kit is kept or worked on. Every hire unit and every sales stock unit can be given a location.</div>
      <table><thead><tr><th>Name</th><th>Short name</th><th>Type</th><th>Address</th><th>MCS depot</th><th class="n">Hire units</th><th class="n">Sales stock</th><th>In use</th></tr></thead><tbody>
      ${L.map((l) => `<tr><td><input data-l="${l.id}" data-k="name" value="${esc(l.name)}"></td><td><input data-l="${l.id}" data-k="short" value="${esc(l.short || '')}" style="width:100px"></td>
        <td><select data-l="${l.id}" data-k="kind">${KINDS.map((k) => `<option ${k === l.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></td><td><input data-l="${l.id}" data-k="address" value="${esc(l.address || '')}"></td>
        <td class="small muted">${esc(l.mcs_depot || '')}</td><td class="n">${AS.filter((a) => a.location_id === l.id).length}</td><td class="n">${openStock.filter((s) => s.location_id === l.id).length}</td>
        <td><input type="checkbox" data-l="${l.id}" data-k="active" ${l.active !== false ? 'checked' : ''} style="width:auto"></td></tr>`).join('')}
      <tr><td><input id="nl_name" placeholder="New location"></td><td><input id="nl_short" style="width:100px"></td><td><select id="nl_kind">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></td><td><input id="nl_addr"></td><td colspan="4"><button class="pri2 mini" id="nl_add">+ Add location</button> <span id="nl_msg" class="small"></span></td></tr></tbody></table></div>

      <div class="card"><h3>Charge items</h3><div class="hint">Delivery, collection, damage waiver, fees and other extras that go on quotes, hire agreements and invoices. Set the standard price here; it can still be changed on each quote. Prices are ex VAT.</div>
      <table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Charged</th><th class="n">Standard price £</th><th class="n">VAT %</th><th>Notes</th><th>In use</th></tr></thead><tbody>
      ${CH.map((c) => `<tr><td><b>${esc(c.code || '')}</b></td><td><input data-c="${c.id}" data-k="name" value="${esc(c.name)}"></td><td><select data-c="${c.id}" data-k="kind">${CKINDS.map((k) => `<option ${k === c.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
        <td><select data-c="${c.id}" data-k="unit">${['each', 'per week', 'per month', 'per day', 'per hour', 'per litre', 'per mile', 'note'].map((k) => `<option ${k === c.unit ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
        <td class="n"><input data-c="${c.id}" data-k="standard_price" type="number" step="0.01" value="${c.standard_price ?? ''}" placeholder="not set" style="width:100px;text-align:right"></td>
        <td class="n"><input data-c="${c.id}" data-k="vat_rate" type="number" step="1" value="${c.vat_rate ?? 20}" style="width:60px;text-align:right"></td><td><input data-c="${c.id}" data-k="notes" value="${esc(c.notes || '')}"></td>
        <td><input type="checkbox" data-c="${c.id}" data-k="active" ${c.active !== false ? 'checked' : ''} style="width:auto"></td></tr>`).join('')}
      <tr><td><input id="nc_code" placeholder="Code" style="width:90px"></td><td><input id="nc_name" placeholder="New charge item"></td><td><select id="nc_kind">${CKINDS.map((k) => `<option>${k}</option>`).join('')}</select></td><td></td><td class="n"><input id="nc_price" type="number" step="0.01" style="width:100px"></td><td colspan="3"><button class="pri2 mini" id="nc_add">+ Add charge item</button> <span id="nc_msg" class="small"></span></td></tr></tbody></table><span id="ch_msg" class="small"></span></div>

      <div class="card"><h3>Groups and subgroups</h3><div class="hint">${G.length} groups and ${S.length} subgroups, taken from MCS – including the empty ones ready for new kit. Edit names, codes and standard rates, or add subgroups, on <a href="#/p-register">Fleet register → Groups &amp; subgroups</a>. Sales stock uses the same list.</div></div>`;
    const val = (i) => (i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? null : +i.value) : i.value.trim() || null);
    el.querySelectorAll('[data-l]').forEach((i) => (i.onchange = async () => { try { await patch('locations', i.dataset.l, { [i.dataset.k]: val(i) }); i.style.background = '#ECFDF3'; } catch (e) { alert('Could not save: ' + e.message); } }));
    el.querySelectorAll('[data-c]').forEach((i) => (i.onchange = async () => { try { await patch('charge_items', i.dataset.c, { [i.dataset.k]: val(i), updated_at: new Date().toISOString() }); i.style.background = '#ECFDF3'; } catch (e) { const m = el.querySelector('#ch_msg'); m.style.color = '#b3261e'; m.textContent = 'Could not save: ' + e.message; } }));
    const q = (id) => el.querySelector('#' + id);
    q('nl_add').onclick = async () => { const name = q('nl_name').value.trim(); if (!name) { q('nl_msg').textContent = 'Give it a name'; return; }
      try { await api('locations', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name, short: q('nl_short').value.trim() || name, kind: q('nl_kind').value, address: q('nl_addr').value.trim() || null, sort: 100 + L.length }) }); X.routes['p-setup'](el); } catch (e) { q('nl_msg').textContent = 'Could not add: ' + e.message; } };
    q('nc_add').onclick = async () => { const name = q('nc_name').value.trim(); if (!name) { q('nc_msg').textContent = 'Give it a name'; return; }
      try { await api('charge_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ code: q('nc_code').value.trim().toUpperCase() || null, name, kind: q('nc_kind').value, standard_price: q('nc_price').value === '' ? null : +q('nc_price').value, sort: 200 + CH.length }) }); X.routes['p-setup'](el); } catch (e) { q('nc_msg').textContent = 'Could not add: ' + e.message; } };
  };
})();
