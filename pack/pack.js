/* Compton Tankers sales asset pack: built from a stock record + its inspection. Cut-outs (d.cutouts) are used here only. */
(function () {
  const SB = window.SUPABASE_CONFIG || {}; const $ = (i) => document.getElementById(i); const st = (m, bad) => { $('st').textContent = m || ''; $('st').style.color = bad ? '#ffb4a8' : '#cfe0ff'; };
  const sess = () => { try { return JSON.parse(localStorage.getItem('compton-dash-session') || 'null'); } catch (e) { return null; } };
  async function refresh() { const cur = sess(); if (!cur || !cur.refresh_token) return false; try { const r = await fetch(SB.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: SB.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: cur.refresh_token }) }); if (!r.ok) return false; const n = await r.json(); if (!n.access_token) return false; localStorage.setItem('compton-dash-session', JSON.stringify(Object.assign({}, cur, n))); return true; } catch (e) { return false; } }
  const H = () => ({ apikey: SB.anonKey, Authorization: 'Bearer ' + sess().access_token });
  const rest = async (p) => { let r = await fetch(SB.url + '/rest/v1/' + p, { headers: H() }); if (r.status === 401 && (await refresh())) r = await fetch(SB.url + '/rest/v1/' + p, { headers: H() }); if (!r.ok) throw new Error('could not load (' + r.status + ')'); return r.json(); };
  const fileBlob = async (path) => { let r = await fetch(SB.url + '/storage/v1/object/authenticated/inspections/' + path, { headers: H() }); if (r.status === 400 || r.status === 401) { if (await refresh()) r = await fetch(SB.url + '/storage/v1/object/authenticated/inspections/' + path, { headers: H() }); } if (!r.ok) throw new Error('picture not available'); return r.blob(); };
  const I = window.PACK_ICONS, esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('en-GB');
  const SHORT = { artic_petroleum: 'Artic Petroleum Tanker', artic_bitumen: 'Artic Bitumen Tanker', artic_waste: 'Artic Waste Tanker', tractor_unit: 'Tractor Unit', rigid_fuel: 'Rigid Fuel Tanker', rigid_waste: 'Rigid Waste Tanker', rigid_combi: 'Rigid Combination Tanker' };
  const BAD = /^(|not available|skipped|n\/a|none)$/i;
  const CONTACT = { phone: '01525 371 707', mail: 'info@comptontankers.com', web: 'www.comptontankers.com' };
  /* example shipping costs – edit here */
  const SHIP = [['Durban, South Africa', '£6,250'], ['Walvis Bay, Namibia', '£5,975'], ['Dar es Salaam, Tanzania', '£5,750'], ['Maputo, Mozambique', '£6,450'], ['Tema, Ghana', '£5,250'], ['Georgetown, Guyana', '£6,950'], ['Kingston, Jamaica', '£4,750'], ['Jebel Ali, UAE', '£3,850']];
  const UK = '<svg viewBox="0 0 60 40" width="22" height="15"><rect width="60" height="40" fill="#012169"/><path d="M0 0L60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0L60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/><path d="M30 0V40M0 20H60" stroke="#fff" stroke-width="13"/><path d="M30 0V40M0 20H60" stroke="#C8102E" stroke-width="7"/></svg>';
  const ZA = '<svg viewBox="0 0 60 40" width="22" height="15"><rect width="60" height="20" fill="#DE3831"/><rect y="20" width="60" height="20" fill="#002395"/><path d="M0 0L30 20H60M0 40L30 20" fill="none" stroke="#fff" stroke-width="13"/><path d="M0 0L30 20H60M0 40L30 20" fill="none" stroke="#007A4D" stroke-width="8"/><path d="M0 4L20 20 0 36z" fill="#FFB612"/><path d="M0 8L14 20 0 32z" fill="#000"/></svg>';

  const FOOT = `<div class="a" style="left:20px;top:648px;width:960px;height:1px;background:#E4E7EC"></div><div class="a" style="left:20px;top:712px;width:960px;height:1px;background:#E4E7EC"></div>` +
    [['phone', CONTACT.phone, 30], ['mail', CONTACT.mail, 222], ['web', CONTACT.web, 478]].map(([k, t, x]) => `<div class="a" style="left:${x}px;top:668px;width:28px;height:28px">${I[k].svg}</div><div class="a" style="left:${x + 38}px;top:672px;font-size:13px;color:var(--dk);font-weight:500;white-space:nowrap">${t}</div>`).join('') +
    `<div class="a" style="left:770px;top:654px;display:flex;flex-direction:column;gap:3px">${[[UK, 'Leighton Buzzard'], [UK, 'Ellesmere Port'], [ZA, 'Mpumalanga']].map(([f, t]) => `<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dk);white-space:nowrap">${f}${t}</div>`).join('')}</div>` +
    `<div class="a" style="left:0;top:716px;width:1000px;height:34px;background:#0F3A85;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:500;color:#FF8A4C;white-space:nowrap"><b style="font-weight:700;margin-right:8px">CONSIDERING TANKER HIRE?</b> Short or long term, we have you covered. Our hire fleet boasts over 250 waste, industrial and fuel tankers ready to support you.</div>`;
  const HDR = `<div class="rule"></div><img class="a" src="brand-kit/compton-logo.png" style="right:24px;top:10px;height:56px">`;

  /* white background -> transparent (flood from the edges), then crop. Transparent PNGs are only cropped. */
  async function cleanCut(blob) {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); });
    const sc = Math.min(1, 1800 / Math.max(im.width, im.height)); const w = Math.round(im.width * sc), h = Math.round(im.height * sc); const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
    const img = x.getImageData(0, 0, w, h), d = img.data; const clear = d[3] < 200; /* top-left already transparent */
    if (!clear) { const seen = new Uint8Array(w * h), stack = []; const wh = (p) => d[p * 4] > 240 && d[p * 4 + 1] > 240 && d[p * 4 + 2] > 240;
      const push = (p) => { if (!seen[p] && wh(p)) { seen[p] = 1; stack.push(p); } };
      for (let i = 0; i < w; i++) { push(i); push((h - 1) * w + i); } for (let j = 0; j < h; j++) { push(j * w); push(j * w + w - 1); }
      while (stack.length) { const p = stack.pop(), px = p % w, py = (p / w) | 0; if (px > 0) push(p - 1); if (px < w - 1) push(p + 1); if (py > 0) push(p - w); if (py < h - 1) push(p + w); }
      for (let p = 0; p < w * h; p++) if (seen[p]) d[p * 4 + 3] = 0;
      for (let p = 0; p < w * h; p++) if (!seen[p]) { const px = p % w, py = (p / w) | 0; if ((px > 0 && seen[p - 1]) || (px < w - 1 && seen[p + 1]) || (py > 0 && seen[p - w]) || (py < h - 1 && seen[p + w])) d[p * 4 + 3] = 170; }
      x.putImageData(img, 0, 0); }
    let x0 = w, y0 = h, x1 = 0, y1 = 0; for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2) if (d[(yy * w + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    if (x1 <= x0 || y1 <= y0) return c.toDataURL('image/png'); const o = document.createElement('canvas'); o.width = x1 - x0 + 2; o.height = y1 - y0 + 2; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o.toDataURL('image/png');
  }

  async function main() {
    if (!sess()) { st('Please sign in to the portal first, then open this again.', true); return; }
    const prm = new URLSearchParams(location.hash.slice(1)); const id = prm.get('s'); if (!id) { st('Open this from a vehicle in Stock & inspections.', true); return; }
    $('mode').onchange = () => { if ($('mode').value === 'hire') location.href = 'hire.html' + location.hash; };
    st('Loading…'); const [s] = await rest('stock?id=eq.' + id); const [job] = await rest('jobs?stock_id=eq.' + id + '&order=created_at.desc&limit=1');
    if (!s) { st('Vehicle not found.', true); return; } const d = (job && job.data) || {};
    $('who').textContent = '– ' + s.reg; document.title = s.reg + ' – Compton Tankers asset pack';
    const allRows = d.rows || [];
    const raw = (re) => { const r = allRows.find((x) => re.test(x[1])); return r ? String(r[2] == null ? '' : r[2]).trim() : ''; };
    const get = (re) => { const v = raw(re); return BAD.test(v) ? '' : v; };
    const year = get(/^year/i), make = get(/^make$/i), model = get(/^model$/i), cond = get(/^condition$/i), vin = get(/chassis number|vin/i), bodyT = get(/^body type/i);
    const comps = get(/number of compartments/i), sizes = get(/compartment sizes/i); let litres = get(/total plated capacity/i).replace(/[^\d]/g, ''); if (!litres) { const m = sizes.match(/=\s*([\d,]+)\s*L/i); if (m) litres = m[1].replace(/,/g, ''); }
    const split = sizes.replace(/\s*=.*$/, '');
    const type = SHORT[s.vehicle_type] || 'Commercial Vehicle'; const title = [make, model].filter(Boolean).join(' ').toUpperCase() || s.reg;
    const price = Number(s.asking_price) || 0; const what = [year, [make, model].filter(Boolean).join(' ')].filter(Boolean).join(' ');
    const kv = (rows) => { const r = rows.filter((x) => x[1]); return r.length ? r.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`).join('') : '<div class="kv"><span>Details on request</span></div>'; };
    const box = (k, t, rows, x, y, w, h) => `<div class="card" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;padding:14px 18px"><div class="hd"><div style="width:36px;height:36px">${I[k].svg}</div><h3>${t}</h3></div><div class="u" style="width:52px;height:4px;margin:0 0 4px"></div>${kv(rows)}</div>`;
    /* certificates */
    const parse = (v) => { const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
    const cert = (name, re) => { const v = raw(re); if (BAD.test(v)) return ''; const dt = parse(v); const exp = /expired/i.test(v) || (dt && dt < new Date()); const ok = !!dt && !exp; return `<div class="kv"><span>${name}</span><b>${/expired/i.test(v) ? 'Expired' : esc(dt ? 'Expires ' + v : v)}${exp ? '<i class="pill exp">EXPIRED</i>' : ok ? '<i class="pill ok">VALID</i>' : ''}</b></div>`; };
    const certs = [cert('MOT', /mot expiry|^mot/i), cert('Safe loading pass', /safe loading pass expiry|slp/i), cert('ADR', /adr expiry/i), cert('VTG plating', /vtg.*(expiry|date)/i), cert('Tank test', /tank test due|tank test date/i)].filter(Boolean);
    const tyres = [get(/^tyre make/i), get(/^tyre size/i)].filter(Boolean).join(', ');
    const cap = [['Total capacity', litres ? fmt(litres) + ' L' : ''], ['Compartments', comps], ['Split, front to rear', split]];
    const veh = [['Make', make], ['Model', model], ['Year', year], ['Chassis / VIN', vin], ['Condition', cond], ['Mileage', get(/^mileage/i)]];
    const tank = [['Material', get(/tank material/i)], ['Insulation', get(/insulation/i)], ['Test pressure', get(/test pressure/i)], ['ADR class / tank code', get(/adr class|tank code/i)], ['Body type', bodyT]];
    const gear = [['Axle layout', get(/axle layout/i)], ['Suspension', get(/suspension/i)], ['Axles', get(/axle (make|manufacturer)/i)], ['Brakes', get(/^brake/i)], ['Tyres', tyres], ['Landing legs', get(/landing legs/i)]];
    const disch = [['Pump', get(/^pump make/i)], ['Vac pump', get(/^vac pump make/i)], ['Jetting pump', get(/jetting pump make/i)], ['API couplers', get(/api coupler/i)], ['Vapour recovery', get(/vapour recovery/i)], ['Control box', get(/^control box/i)]];
    const dims = [['Length', get(/^length/i)], ['Width', get(/^width/i)], ['Height', get(/^height/i)], ['Unladen weight', get(/^unladen/i)], ['Plated weight', get(/^plated weight/i)]];

    const ben = (k, t, p, x, y) => `<div class="band" style="left:${x}px;top:${y}px;width:170px"><div style="width:40px;height:40px;flex:none">${I[k].svg}</div><div style="width:112px"><div class="bt">${t}</div><div class="bp">${p}</div></div></div>`;
    const BAND = (y) => `<div class="a" style="left:20px;top:${y - 14}px;width:960px;height:1px;background:#E4E7EC"></div><div class="a" style="left:20px;top:${y}px;width:250px;font-size:19px;font-weight:700;color:var(--dk);line-height:1.24">STRAIGHTFORWARD BUYING FROM <span style="color:var(--or)">COMPTON TANKERS</span></div>` + [283, 469, 645, 821].map((x) => `<div class="a" style="left:${x}px;top:${y - 6}px;width:1px;height:88px;background:#E3E7EE"></div>`).join('') +
      ben('contact', 'ONE POINT OF CONTACT', 'One experienced contact from enquiry to handover.', 296, y - 2) + ben('fast', 'FAST RESPONSE', 'Clear availability, quick action, straight answers.', 482, y - 2) + ben('terms', 'FLEXIBLE TERMS', 'Hire, rent to buy or outright purchase.', 658, y - 2) + ben('export', 'UK SHIPPING OR WORLDWIDE EXPORT', 'We help arrange shipping and documents.', 834, y - 2);
    /* picture slots: cut-outs (page 1, 2, 4) or a framed photo if no cut-out has been added */
    const cuts = {}; (d.cutouts || []).forEach((c) => { cuts[c.n] = c.path; });
    const hero = (n, boxCss, fallbackKeys) => { const key = fallbackKeys.map((k) => (d.photos || []).find((p) => p.key === k && p.path)).find(Boolean); if (cuts[n]) return `<img class="a" data-cut="${n}" style="${boxCss};object-fit:contain;object-position:center bottom">`; if (key) return `<img class="a pic" data-p="${esc(key.path)}" style="${boxCss}">`; return ''; };

    const showP = $('o_price').checked;
    const priceHtml = showP ? (price ? `£${fmt(price)}<span style="font-size:20px;color:var(--dk);font-weight:600;letter-spacing:0"> + VAT</span>` : '<span style="font-size:30px">Price on application</span>') : '';
    const p1 = `<div class="sheet"><img class="a" src="brand-kit/bg_swoosh.png" style="right:-118px;top:-236px;height:760px"><img class="a" src="brand-kit/compton-logo.png" style="right:36px;top:26px;width:250px">
<div class="a" style="left:48px;top:56px;width:250px;height:46px;background:var(--or);color:#fff;font-weight:700;font-size:28px;display:flex;align-items:center;padding-left:20px">For Sale</div>
<div class="a" style="left:52px;top:130px;font-size:45px;font-weight:700;color:var(--dk);letter-spacing:-.5px;white-space:nowrap" id="c_t">${esc(title)}</div>
<div class="a" style="left:52px;top:188px;font-size:25px;font-weight:700;color:var(--dk)">${esc([year, type].filter(Boolean).join(' ').toUpperCase())}</div>
<div class="a" style="left:52px;top:228px;font-size:25px;font-weight:700;color:var(--or)">${esc([litres ? fmt(litres) + ' LITRES' : '', comps ? comps + ' COMPARTMENTS' : ''].filter(Boolean).join(' · '))}</div>
<div class="a" style="left:52px;top:300px;font-size:50px;font-weight:700;color:var(--or);letter-spacing:-1px;line-height:1">${priceHtml}</div>
${hero(1, 'left:420px;top:225px;width:560px;height:375px', ['rear_pass', 'front_driver'])}${BAND(620)}</div>`;
    const p2 = `<div class="sheet">${HDR}
<div class="a" style="left:28px;top:88px;width:620px;font-size:27px;font-weight:700;color:var(--dk);line-height:1.15;letter-spacing:-.3px">${esc(title)}<br>${esc(type.toUpperCase())} FOR SALE</div>
<div class="a" style="left:28px;top:164px;font-size:10.5px;font-weight:700;color:var(--or);letter-spacing:.3px">FULLY INSPECTED. FULLY DOCUMENTED. READY TO WORK.</div>
<div class="a body" style="left:28px;top:188px;width:600px;font-size:11.5px">${esc(`This ${what} ${type.toLowerCase()}${litres ? ` carries ${fmt(litres)} litres${comps ? ' across ' + comps + ' compartments' : ''}` : ''}.${cond ? ' Condition: ' + cond.toLowerCase() + '.' : ''} Full specification and certificate expiry dates are below, with a complete photo record on the following pages.`)}</div>
${hero(2, 'left:650px;top:78px;width:325px;height:170px', ['rear_driver', 'front_pass'])}
${box('capacity', 'CAPACITY &amp; SPLIT', cap, 35, 262, 296, 176)}${box('condition', 'VEHICLE', veh, 352, 262, 296, 176)}${box('material', 'TANK', tank, 669, 262, 296, 176)}
${box('running', 'RUNNING GEAR', gear, 35, 450, 296, 186)}${box('pump', 'DISCHARGE &amp; EQUIPMENT', disch, 352, 450, 296, 186)}
<div class="card" style="left:669px;top:450px;width:296px;height:186px;padding:14px 18px"><div class="hd"><div style="width:36px;height:36px">${I.certs.svg}</div><h3>CERTIFICATES</h3></div><div class="u" style="width:52px;height:4px;margin:0 0 4px"></div>${certs.join('') || '<div class="kv"><span>Certificate details on request</span></div>'}</div>${FOOT}</div>`;
    const p4 = `<div class="sheet"><img class="a" src="brand-kit/bg_swoosh.png" style="right:-118px;top:-236px;height:760px"><img class="a" src="brand-kit/compton-logo.png" style="right:44px;top:30px;width:300px">
<div class="a" style="left:35px;top:60px;font-size:42px;font-weight:700;color:var(--dk);line-height:1.25;letter-spacing:-.6px">For sale.<br>Ready to go.</div><div class="a u" style="left:35px;top:178px;width:52px;height:5px"></div>
<div class="a body" style="left:35px;top:196px;width:500px;font-size:10.5px">${esc(`This ${what} ${type.toLowerCase()} is for sale now. It has been inspected, photographed and documented, so you know what you are buying before you visit.`)}<br><br>Compton Tankers deals straight: quick answers, clear options, fair terms and one experienced point of contact from enquiry to handover.</div>
${hero(3, 'left:640px;top:122px;width:340px;height:200px', ['front_pass', 'front_driver'])}
<div class="card" style="left:25px;top:350px;width:630px;height:276px;padding:14px 18px"><div style="display:flex;align-items:center;gap:12px"><div style="width:46px;height:46px">${I.export.svg}</div><div><div style="font-size:16px;font-weight:700;color:var(--dk)">UK SHIPPING OR WORLDWIDE EXPORT</div><div style="font-size:9.5px;color:var(--grey)">We support export to buyers worldwide – shipping, documents and loading.</div></div></div>
 <div style="display:flex;gap:24px;margin-top:10px"><div style="width:240px"><div style="font-size:10px;font-weight:700;color:var(--or);margin-bottom:2px">DIMENSIONS &amp; WEIGHT</div>${kv(dims).replace(/class="kv"/g, 'class="kv" style="padding:8px 0"')}</div>
 <div style="flex:1"><div style="font-size:10px;font-weight:700;color:var(--or);margin-bottom:2px">EXAMPLE SHIPPING COSTS</div>${SHIP.map(([a, b]) => `<div class="kv" style="padding:4px 0"><span>${a}</span><b>${b}</b></div>`).join('')}</div></div></div>
<div class="card" style="left:675px;top:350px;width:300px;height:276px;padding:14px 18px"><div style="display:flex;align-items:center;gap:12px"><div style="width:56px;height:56px;flex:none">${I.workshop.svg}</div><div><div style="font-size:17px;font-weight:700;color:var(--dk);line-height:1.15">NEEDS WORK DOING?</div><div style="font-size:9.5px;color:var(--or);font-weight:600;margin-top:2px">COMPTON SPECIALIST WORKSHOPS</div></div></div>
 <div style="font-size:11.5px;line-height:1.55;color:var(--grey);margin-top:12px">Our specialist tanker workshops can assist with:</div>
 <ul style="margin-top:8px">${['Testing and recertifying expired certificates', 'ADR inspections and compliance', 'Resprays and repaints', 'Repairs and general tanker work'].map((t) => `<li style="font-size:11.5px;color:var(--dk);padding:4px 0 4px 18px;position:relative;border-bottom:1px solid #EEF0F4"><span style="position:absolute;left:2px;top:11px;width:6px;height:6px;border-radius:50%;background:var(--or)"></span>${t}</li>`).join('')}</ul><div style="font-size:10.5px;color:var(--grey);margin-top:10px">Ask us for a quote when you enquire.</div></div>${FOOT}</div>`;
    /* gallery */
    function galleryList() {
      const ad = s.advert || {}; const all = [...(d.photos || []).filter((p) => p.path).map((p) => ({ path: p.path, cap: p.label || p.key, doc: /_cert$|_plate$/.test(p.key), key: p.key })), ...(d.defects || []).filter((p) => p.path).map((p, i) => ({ path: p.path, cap: 'Defect ' + (i + 1) + (p.note ? ' – ' + p.note : ''), def: true }))];
      const W = ['front_driver', 'front_pass', 'rear_pass', 'rear_driver', 'side_driver', 'side_pass', 'square_rear', 'square_front', 'pump', 'control_box', 'apis_compartments', 'axle_hub', 'brakes', 'additional_equipment', 'vtg_plate', 'mot_cert', 'adr_cert', 'slp_cert', 'tank_test_cert']; let list;
      if (ad.order && ad.order.length) { list = ad.order.map((p) => all.find((x) => x.path === p)).filter(Boolean).filter((x) => !(ad.off || []).includes(x.path)); all.filter((x) => !ad.order.includes(x.path) && !x.def).forEach((x) => list.push(x)); }
      else { const ky = (x) => { const i = W.indexOf(x.key); return i < 0 ? 98 : i; }; all.sort((a, b) => ky(a) - ky(b)); list = all.filter((x) => !x.def); }
      if ($('o_def').checked) all.filter((x) => x.def && !list.includes(x)).forEach((x) => list.push(x)); else list = list.filter((x) => !x.def); return list;
    }
    const gl = $('o_gal').checked ? galleryList() : []; const pages = Math.ceil(gl.length / 6); let gp = '';
    for (let p = 0; p < pages; p++) gp += `<div class="sheet">${HDR}<div class="a" style="left:35px;top:96px;font-size:28px;font-weight:700;color:var(--dk)">Photo gallery <span style="font-size:15px;color:var(--grey);font-weight:500">${esc(title)} · ${p + 1} of ${pages}</span></div><div class="a u" style="left:35px;top:136px;width:52px;height:5px"></div>${gl.slice(p * 6, p * 6 + 6).map((it, i) => `<div class="a" style="left:${20 + (i % 3) * 326}px;top:${150 + Math.floor(i / 3) * 250}px;width:308px"><div style="width:308px;height:231px;background:#eef1f5;border-radius:6px;overflow:hidden"><img data-p="${esc(it.path)}" style="width:100%;height:100%;object-fit:${it.doc ? 'contain' : 'cover'};display:block;${it.doc ? 'background:#fff;border:1px solid #e1e5ec' : ''}"></div><div style="font-size:11px;color:var(--grey);margin-top:5px">${esc(it.cap)}</div></div>`).join('')}${FOOT}</div>`;
    $('out').innerHTML = p1 + p2 + gp + p4;
    const t = $('c_t'); if (t) { let f = 45; while (t.offsetWidth > 560 && f > 22) { f--; t.style.fontSize = f + 'px'; } }
    /* fill pictures */
    const cache = {}; const url = async (path) => cache[path] || (cache[path] = URL.createObjectURL(await fileBlob(path)));
    st('Loading pictures…'); let miss = 0;
    for (const im of document.querySelectorAll('img[data-p]')) { try { im.src = await url(im.dataset.p); } catch (e) { im.alt = ''; miss++; } }
    for (const im of document.querySelectorAll('img[data-cut]')) { try { im.src = await cleanCut(await fileBlob(cuts[im.dataset.cut])); } catch (e) { miss++; } }
    const nc = Object.keys(cuts).length; const missing = [];
    [['Axle manufacturer', /axle (make|manufacturer)/i], ['Brake type', /^brake/i], ['Unladen weight', /^unladen/i], ['Length', /^length/i], ['Width', /^width/i], ['Height', /^height/i], ['MOT date', /mot expiry/i]].forEach(([n, re]) => { if (!get(re)) missing.push(n); });
    st((nc < 3 ? 'Cut-outs added: ' + nc + ' of 3 (framed photos used for the rest). ' : '') + (missing.length ? 'Not yet recorded: ' + missing.join(', ') + '.' : 'All key details recorded.') + (miss ? ' ' + miss + ' picture(s) could not load.' : ''), false);
    ['o_price', 'o_gal', 'o_def'].forEach((i) => { $(i).onchange = () => main().catch(() => { }); });
    $('prn').onclick = () => window.print();
    const lib = (u) => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = u; sc.onload = res; sc.onerror = () => rej(new Error('could not load ' + u)); document.head.appendChild(sc); });
    $('dlp').onclick = async () => { const b = $('dlp'); b.disabled = true; try { st('Building PDF…'); if (!window.html2canvas) await lib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'); if (!window.jspdf) await lib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        if (document.fonts && document.fonts.ready) await document.fonts.ready; document.body.classList.add('cap'); const sheets = [...document.querySelectorAll('.sheet')]; const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: [720, 540] });
        for (let i = 0; i < sheets.length; i++) { st('Building PDF… page ' + (i + 1) + ' of ' + sheets.length); const c = await window.html2canvas(sheets[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, width: 1000, height: 750 }); if (i) pdf.addPage([720, 540], 'landscape'); pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 720, 540); }
        document.body.classList.remove('cap'); pdf.save((s.reg || 'vehicle').replace(/[^A-Za-z0-9-]+/g, '_') + '_asset_pack.pdf'); st('PDF saved to your Downloads folder.'); } catch (e) { document.body.classList.remove('cap'); st('Could not build the PDF: ' + (e.message || e), true); }
      b.disabled = false; };
  }
  main().catch((e) => st('Something went wrong: ' + (e.message || e), true));
})();
