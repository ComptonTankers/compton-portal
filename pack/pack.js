/* Asset pack: fills the Tanker Rent UK 4-page pack from a stock record + its inspection. Text is editable on screen; Print / Save as PDF to finish. */
(function () {
  const SB = window.SUPABASE_CONFIG || {}; const $ = (i) => document.getElementById(i); const st = (m, bad) => { $('st').textContent = m || ''; $('st').style.color = bad ? '#ffb4a8' : '#cfe0ff'; };
  const sess = () => { try { return JSON.parse(localStorage.getItem('compton-dash-session') || 'null'); } catch (e) { return null; } };
  const H = () => ({ apikey: SB.anonKey, Authorization: 'Bearer ' + sess().access_token });
  const rest = async (p) => { const r = await fetch(SB.url + '/rest/v1/' + p, { headers: H() }); if (!r.ok) throw new Error('could not load (' + r.status + ')'); return r.json(); };
  const fileBlob = async (path) => { const r = await fetch(SB.url + '/storage/v1/object/authenticated/inspections/' + path, { headers: H() }); if (!r.ok) throw new Error('picture not available'); return r.blob(); };
  const SHORT = { artic_petroleum: 'Artic Petroleum Tanker', artic_bitumen: 'Artic Bitumen Tanker', artic_waste: 'Artic Waste Tanker', tractor_unit: 'Tractor Unit', rigid_fuel: 'Rigid Fuel Tanker', rigid_waste: 'Rigid Waste Tanker', rigid_combi: 'Rigid Combination Tanker' };
  const BAD = /^(|not available|skipped|expired|n\/a|none)$/i, SKIP = /inspector|inspection date|\bvin\b|chassis number|serial|tread|video|registration \/ id|vehicle type/i;
  const fmt = (n) => Number(n).toLocaleString('en-GB');
  const set = (k, v) => { document.querySelectorAll('[data-k="' + k + '"]').forEach((e) => { e.textContent = v || ''; }); };
  const fit = (k, max, min) => document.querySelectorAll('[data-k="' + k + '"]').forEach((e) => { const p = e.parentElement; e.style.whiteSpace = 'pre'; let f = parseFloat(getComputedStyle(p).fontSize); while (e.offsetWidth > max && f > min) { f -= 1; p.style.fontSize = f + 'px'; } });

  async function main() {
    if (!sess()) { st('Please sign in to the portal first, then open this again.', true); return; }
    const id = new URLSearchParams(location.hash.slice(1)).get('s'); if (!id) { st('Open this from a vehicle in Stock & inspections.', true); return; }
    st('Loading…'); const [s] = await rest('stock?id=eq.' + id); const [job] = await rest('jobs?stock_id=eq.' + id + '&order=created_at.desc&limit=1');
    if (!s) { st('Vehicle not found.', true); return; } const d = (job && job.data) || {};
    $('who').textContent = '– ' + s.reg; document.title = s.reg + ' – Tanker Rent UK asset pack'; $('unitname') && ($('unitname').textContent = s.reg);
    const rows = (d.rows || []).filter((r) => !BAD.test(String(r[2] || '').trim()) && !SKIP.test(r[1] || '') && !/^(Job|Walkaround video)$/.test(r[0]));
    const get = (re) => { const r = (d.rows || []).find((x) => re.test(x[1]) && !BAD.test(String(x[2] || '').trim())); return r ? String(r[2]).trim() : ''; };
    const year = get(/^year/i), make = get(/^make$/i), model = get(/^model$/i), cond = get(/^condition$/i), susp = get(/suspension/i), pump = get(/^pump make/i), mat = get(/tank material/i), mileage = get(/mileage|odometer/i), axle = get(/axle layout/i);
    const comps = get(/number of compartments/i), sizes = get(/compartment sizes/i); let litres = get(/total plated capacity/i).replace(/[^\d]/g, ''); if (!litres) { const m = sizes.match(/=\s*([\d,]+)\s*L/i); if (m) litres = m[1].replace(/,/g, ''); }
    const type = SHORT[s.vehicle_type] || 'Commercial Vehicle', name = [year, make && make.toUpperCase() === make ? make : make, model].filter(Boolean).join(' ');
    const TERMS = 'Short-term hire, long-term hire, rent to buy or outright purchase.';
    const lead = [year, type].filter(Boolean).join(' ').toUpperCase();
    set('COVER_BADGE', 'Available Now'); set('COVER_H1', lead); set('COVER_H2', litres ? fmt(litres) + ' LITRES' + (comps ? ' IN ' + comps + ' COMPARTMENTS' : '') : (make + ' ' + model).trim().toUpperCase());
    set('COVER_NOTE', 'For long or short-term hire, rent to buy or outright purchase');
    set('P2_HEADLINE', (type + ' capacity\nwithout the wait').toUpperCase()); set('P2_KICKER', 'FOR CONTRACT DEMAND, FLEET PRESSURE, DOWNTIME COVER OR SEASONAL PEAKS.');
    const desc = `${['This', year, make, model].filter(Boolean).join(' ')} ${type.toLowerCase()}${litres ? ` carries ${fmt(litres)} litres${comps ? ' across ' + comps + ' compartments' : ''}` : ''}${cond ? `. Condition: ${cond.toLowerCase()}` : ''}. It is available now for operators who need extra capacity without waiting for a build slot. ${TERMS}`;
    set('P2_BODY', desc);
    const T = []; if (litres) T.push([fmt(litres) + ' litre capacity', sizes ? 'Compartments front to rear: ' + sizes.replace(/\s*=.*$/, '') + '.' : 'Total plated capacity.']);
    if (comps) T.push([comps + ' compartments', sizes ? sizes.replace(/\s*=.*$/, '') + '.' : 'Separate compartments for different products.']);
    if (pump) T.push([pump, 'Pump fitted as inspected.']); if (susp) T.push([susp + ' suspension', 'Fitted to this unit.']); if (axle) T.push([axle + ' axle layout', 'As inspected.']);
    if (year) T.push([year + ' build', 'Year of registration.']); if (mileage) T.push([mileage + ' miles', 'Recorded at inspection.']); if (mat) T.push([mat + ' tank', 'Tank material as inspected.']);
    [['Inspected unit', 'Checked in our yard before it is offered.'], ['Available now', 'No build slot wait.'], ['Flexible terms', TERMS], ['One point of contact', 'Quick answers and straight advice.']].forEach((x) => { if (T.length < 4) T.push(x); });
    for (let i = 0; i < 4; i++) { set('TILE' + (i + 1) + '_TITLE', T[i][0].toUpperCase()); set('TILE' + (i + 1) + '_BODY', T[i][1]); }
    set('P3_INTRO', `Key build, capacity and operating details for the ${[year, make, model].filter(Boolean).join(' ') || type}.`);
    const GROUPS = [['VEHICLE', ['Vehicle'], 3], ['TANK & EQUIPMENT', ['Tank & equipment'], 3], ['CHASSIS & RUNNING GEAR', ['Chassis & driveline', 'Tyres'], 3], ['WEIGHTS & DIMENSIONS', ['Weights & dimensions'], 3], ['CERTIFICATES & PAPERWORK', ['Dates & certificates', 'Paperwork & keys'], 4]];
    const empties = [];
    GROUPS.forEach(([title, gs, max], i) => {
      const b = rows.filter((r) => gs.includes(r[0])).map((r) => `${r[1]}: ${String(r[2]).trim()}`).slice(0, max); if (title === 'TANK & EQUIPMENT' && sizes && !b.some((x) => /sizes/i.test(x))) { }
      set('SPEC' + (i + 1) + '_TITLE', title); for (let k = 1; k <= max; k++) { const el = document.querySelector('[data-k="SPEC' + (i + 1) + '_B' + k + '"]'); if (!el) continue; const li = el.parentElement; li.classList.remove('ph'); if (b[k - 1]) el.textContent = b[k - 1]; else if (k === 1) { el.textContent = 'Add detail'; li.classList.add('ph'); empties.push(title); } else { li.style.display = 'none'; } }
    });
    set('P3_CTA', 'Ready for long or short-term hire, rent to buy or outright purchase');
    set('P4_H1_LINE1', 'Available now.'); set('P4_H1_LINE2', 'Ready to go.');
    set('P4_BODY1', `This ${[year, make, model].filter(Boolean).join(' ')} ${type.toLowerCase()} is available now for operators who need extra capacity without waiting for a long build slot. It is available for short-term hire, long-term hire, rent to buy or outright purchase.`);
    set('P4_BODY2', 'Tanker Rent UK is built around straightforward hire: quick answers, clear options, fair terms and one experienced point of contact from enquiry through to return. That means less chasing, fewer surprises and a faster route to getting the right equipment working.');
    fit('COVER_H1', 640, 24); fit('COVER_H2', 640, 18); fit('P2_HEADLINE', 520, 16);
    /* ---- vehicle picture ---- */
    const photos = (d.photos || []).filter((p) => p.path && /front_driver|front_pass|rear_|side_|square_/.test(p.key));
    const orig = (p) => { const a = (d.archive || []).filter((x) => x.key === p.key && !x.enhanced).pop(); return p.enhanced && a ? a.path : p.path; };
    const sel = $('pick'); sel.innerHTML = photos.map((p, i) => `<option value="${i}">${(p.label || p.key).replace(/</g, '')}${p.enhanced ? ' ✨' : ''}</option>`).join(''); const fd = photos.findIndex((p) => p.key === 'front_driver'); if (fd > 0) sel.value = fd;
    const setHero = (u) => document.querySelectorAll('img.hero').forEach((i) => { i.src = u; });
    let busy = false; let BG = null;
    async function hero(doCut) {
      if (busy || !photos.length) { if (!photos.length) st('No walkaround photos on this inspection – add them first.', true); return; } busy = true;
      try { const p = photos[+sel.value]; st('Loading picture…'); const blob = await fileBlob(orig(p)); setHero(URL.createObjectURL(blob));
        if (doCut) { st('Cutting out the vehicle – first time takes a minute…'); if (!BG) BG = (await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm')).removeBackground; const cut = await BG(blob);
          const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(cut); }); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const dd = x.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0; for (let y = 0; y < c.height; y += 2) for (let xx = 0; xx < c.width; xx += 2) if (dd[(y * c.width + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          const o = document.createElement('canvas'); o.width = x1 - x0; o.height = y1 - y0; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); setHero(o.toDataURL('image/png')); }
        st(doCut ? 'Done. Check the cut-out looks right.' : 'Picture loaded (not cut out).'); } catch (e) { st('Could not prepare the picture: ' + (e.message || e), true); }
      busy = false;
    }
    sel.onchange = () => hero(false); $('cut').onclick = () => hero(true); $('prn').onclick = () => window.print();
    const lib = (u) => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = u; sc.onload = res; sc.onerror = () => rej(new Error('could not load ' + u)); document.head.appendChild(sc); });
    $('dlp').onclick = async () => { if (busy) { st('Wait for the picture to finish first.', true); return; } const b = $('dlp'); b.disabled = true;
      try { st('Building PDF…'); if (!window.html2canvas) await lib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'); if (!window.jspdf) await lib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        if (document.fonts && document.fonts.ready) await document.fonts.ready; document.body.classList.add('cap'); const sheets = [...document.querySelectorAll('.sheet')]; const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: [720, 540] });
        for (let i = 0; i < sheets.length; i++) { st('Building PDF… page ' + (i + 1) + ' of ' + sheets.length); const c = await window.html2canvas(sheets[i], { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false }); if (i) pdf.addPage([720, 540], 'landscape'); pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 720, 540); }
        document.body.classList.remove('cap'); pdf.save((s.reg || 'vehicle').replace(/[^A-Za-z0-9-]+/g, '_') + '_asset_pack.pdf'); st('PDF saved to your Downloads folder.'); } catch (e) { document.body.classList.remove('cap'); st('Could not build the PDF: ' + (e.message || e), true); }
      b.disabled = false; };
    if (empties.length) st('Boxes with no inspection data (fill in or leave): ' + empties.join(', '), false);
    await hero(true);
    if (empties.length) setTimeout(() => st('Boxes with no inspection data: ' + empties.join(', ') + ' – click any text to edit.'), 100);
  }
  main().catch((e) => st('Something went wrong: ' + (e.message || e), true));
})();
