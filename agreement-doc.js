/* The hire agreement document – one renderer used by the portal (print / PDF) and by the customer's e-signature page.
   Two looks: 'classic' follows the MCS contract layout section for section; 'pack' is the same content in the
   sales-pack style (Poppins, navy and orange, a product page with photo and specification boxes).
   Both end with the signature block and the Master Hire Agreement terms (terms.js). */
(function () {
  const W = window; W.CT = W.CT || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gbp = (n) => (n == null || n === '' || isNaN(+n) ? '–' : '£' + (+n).toLocaleString('en-GB', { minimumFractionDigits: +n % 1 ? 2 : 0, maximumFractionDigits: 2 }));
  const fd = (s) => (s ? new Date(s).toLocaleDateString('en-GB') : 'N/A');
  const fdt = (s) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const YARD = 'Tanker Rent UK Ltd, Compton’s Yard, Grovebury Road, Leighton Buzzard, Bedfordshire, LU7 4TS';
  const nl = (s) => esc(s).replace(/\n/g, '<br>');

  function sections(u) {   // product specification: boxes from the product record, else the key-spec line split into bullets
    const s = Array.isArray(u.spec_sections) ? u.spec_sections.filter((x) => x && (x.items || []).some(Boolean)) : [];
    if (s.length) return s;
    const items = String(u.spec || '').split(/\s*[·;\n]\s*/).filter(Boolean);
    return items.length ? [{ title: 'Key specification', items }] : [];
  }
  const longDesc = (u) => (u.long_description && String(u.long_description).trim()) || [u.description, u.spec].filter(Boolean).join('. ');
  const weekly = (a) => (a.units || []).reduce((t, u) => t + (+u.weekly_rate || 0), 0);

  function signBlock(a, cls) {
    const sig = a.signature ? `<img src="${a.signature}" alt="Signature" style="max-height:70px;max-width:100%">` : '';
    return `<div class="${cls}"><div class="sg"><div class="sgh">Signed for and on behalf of the Hirer – ${esc(a.customer)}</div>
        <div class="sgl"><span>Signature</span><div class="sgv sig">${sig}</div></div><div class="sgl"><span>Printed name</span><div class="sgv">${esc(a.signed_name || '')}</div></div>
        <div class="sgl"><span>Position</span><div class="sgv">${esc(a.signed_position || '')}</div></div><div class="sgl"><span>Date and time</span><div class="sgv">${a.signed_at ? fdt(a.signed_at) : ''}</div></div>
        <div class="sgl"><span>Purchase order no.</span><div class="sgv">${esc(a.signed_po || '')}</div></div></div>
      <div class="sg"><div class="sgh">Signed for and on behalf of Tanker Rent UK Ltd</div><div class="sgl"><span>Signature</span><div class="sgv sig"></div></div><div class="sgl"><span>Printed name</span><div class="sgv"></div></div><div class="sgl"><span>Position</span><div class="sgv"></div></div><div class="sgl"><span>Date</span><div class="sgv"></div></div></div></div>
      ${a.signed_at ? `<div class="esig">Signed electronically by <b>${esc(a.signed_name)}</b>${a.signed_position ? ' (' + esc(a.signed_position) + ')' : ''} on ${fdt(a.signed_at)} using the Compton Tankers e-signature link for agreement ${esc(a.ref || '')}. By signing, the Hirer agreed to this agreement and the Master Hire Agreement terms below.</div>` : `<div class="esig">By signing this agreement the Hirer agrees to it and to the Tanker Rent UK Ltd Master Hire Agreement terms set out below.</div>`}`;
  }
  function terms() {
    const T = W.CT_TERMS; if (!T) return '';
    return `<div class="pb"></div><div class="terms"><h2 class="th">Tanker Rent UK Ltd – ${esc(T.title)}</h2><div class="tc">${T.blocks.map((b) => (b.h ? `<h4>${esc(b.h)}</h4>` : `<p>${esc(b.p)}</p>`)).join('')}</div></div>`;
  }
  const rows = (L, empty) => (L || []).filter((r) => r.item).map((r) => `<tr><td>${esc(r.item)}</td><td class="c">${esc(r.charge || '')}</td></tr>`).join('') || `<tr><td>${empty || 'N/A'}</td><td class="c">N/A</td></tr>`;
  const spot = (a) => /spot/i.test(a.hire_type || '');

  /* ---------- classic: the MCS contract, section for section ---------- */
  function classic(a, o) {
    const w = weekly(a);
    return `<div class="hdr"><span style="display:flex;align-items:center;gap:14px"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><img src="${o.base}assets/tanker-rent-logo.png" alt="Tanker Rent UK" style="height:36px;width:auto;padding-left:14px;border-left:1px solid #D5DBE5"></span><div class="ad">Tanker Rent UK Ltd<br>Compton's Yard<br>Grovebury Road<br>Leighton Buzzard<br>Bedfordshire<br>LU7 4TS</div></div>
      <h1 class="ct">Contract Details</h1>
      <table class="kv"><tr><th>Agreement Reference:</th><td>${esc(a.ref || 'Draft')}</td></tr><tr><th>Hirer:</th><td>${esc(a.customer)}${a.company_no ? ' (No. ' + esc(a.company_no) + ')' : ''}</td></tr>
        <tr><th>Hirer's address:</th><td>${nl(a.customer_address || '')}${a.contact_email ? '<br><br>Email: ' + esc(a.contact_email) : ''}</td></tr><tr><th>Company:</th><td>TANKER RENT UK LIMITED (No. 04432719)</td></tr>
        <tr><th>Company's address:</th><td>Compton’s Yard<br>Grovebury Road<br>Leighton Buzzard<br>Bedfordshire<br>LU7 4TS<br><br>Email: info@comptontankers.com</td></tr><tr><th>Contract Start Date:</th><td>${fd(a.start_date)}</td></tr></table>
      <h3>1. Equipment Details</h3>${(a.units || []).map((u) => `<table class="bt eqt"><tr><th>Asset Type</th><th>Fleet Number</th><th>Serial No</th><th>Condition / Year of Manufacturing</th><th>Full replacement value</th></tr>
        <tr><td>${esc([u.code, u.category].filter(Boolean).join(' - ') || u.description || '')}</td><td>${esc(u.unit || 'TBC')}${u.reg && u.reg !== u.unit ? '<br>' + esc(u.reg) : ''}</td><td>${u.chassis_no ? 'VIN: ' + esc(u.chassis_no) : ''}${u.tank_serial ? '<br>Tank: ' + esc(u.tank_serial) : ''}</td><td>${esc([u.condition, u.year].filter(Boolean).join(' / '))}</td><td>${u.replacement_value ? gbp(u.replacement_value) : ''}</td></tr>
        <tr><th colspan="5">Key Specifications (Compartments, Volume, Axles etc)</th></tr><tr><td colspan="5" class="c">${esc(u.description || '')}${u.spec ? '. ' + esc(u.spec) : ''}</td></tr>
        <tr><th colspan="2">Weekly Rate (ex VAT)</th><td colspan="3" class="c">${gbp(u.weekly_rate)}</td></tr></table>`).join('')}
      <h3>2. Hire Period</h3><table class="bt"><tr><th>Hire Type</th><td class="c">${esc(a.hire_type || '')}</td></tr><tr><th>Estimated Start Date</th><td class="c">${fd(a.start_date)}</td></tr><tr><th>Initial Term End Date</th><td class="c">${a.initial_term_end ? fd(a.initial_term_end) : 'N/A'}</td></tr>
        <tr><th>Delivery Location</th><td class="c">${esc(a.delivery_location || 'N/A')}</td></tr><tr><th>Collection/Return Location</th><td class="c">${esc(a.collection_location || YARD)}</td></tr><tr><th>Minimum Return Notice (days)</th><td class="c">${a.notice_days ? a.notice_days + ' days notice in writing' : 'N/A'}</td></tr></table>
      <h3>3. Rentals</h3><table class="bt"><tr><th>Contract Weekly Rate (ex VAT)</th><td class="c">${gbp(w)}</td></tr><tr><th>Contract Monthly Rate (ex VAT)</th><td class="c">${spot(a) ? 'N/A' : gbp(w * 52 / 12)}</td></tr><tr><th>Deposit/Security</th><td class="c">${gbp(a.deposit || 0)}</td></tr>
        <tr><th>Delivery Charge (ex VAT)</th><td class="c">${gbp(a.delivery_charge || 0)}</td></tr><tr><th>Collection Charge (ex VAT)</th><td class="c">${gbp(a.collection_charge || 0)}</td></tr><tr><th>Payment Terms</th><td class="c">${esc(a.payment_terms || '')}</td></tr></table>
      <h3>4. Additional Charges</h3><table class="bt"><tr><th>Item</th><th>Charge (ex VAT)</th></tr>${rows(a.additional_charges)}</table>
      <h3>5. Options add-ons (if required)</h3><table class="bt"><tr><th>Item</th><th>Charge (ex VAT)</th></tr>${rows(a.options)}</table>
      <h3>6. Special Terms</h3><table class="bt"><tr><th>Item</th><th>Charge (ex VAT)</th></tr><tr><td>The Equipment may only be used in the following countries:</td><td class="c">${esc(a.countries || 'United Kingdom')}</td></tr>${(a.special_terms || []).filter((r) => r.item).map((r) => `<tr><td>${esc(r.item)}</td><td class="c">${esc(r.charge || '')}</td></tr>`).join('') || '<tr><td>Other applicable terms</td><td class="c">N/A</td></tr>'}</table>
      <h3>7. Signature</h3>${signBlock(a, 'sgs')}`;
  }

  /* ---------- pack: the sales-pack look ---------- */
  function pack(a, o) {
    const w = weekly(a), U = a.units || [];
    const kv = (L) => `<table class="nt kv2">${L.filter(Boolean).map(([k, v]) => `<tr><th>${k}</th><td>${v || '–'}</td></tr>`).join('')}</table>`;
    const unitPage = (u) => { const S = sections(u);
      return `<div class="pb"></div><div class="eyb">Your equipment</div><h2 class="h2">${esc(u.description || u.category || 'Equipment')}</h2><div class="sub">${esc(u.unit || '')}${u.category ? ' · ' + esc(u.category) : ''}</div>
        <div class="pic"><img src="${esc(u.photo_url)}" alt=""></div>${S.length ? `<div class="boxes">${S.map((x) => `<div class="box"><h4>${esc(x.title)}</h4><ul>${(x.items || []).filter(Boolean).map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}`; };
    return `<div class="ph"><span style="display:flex;align-items:center;gap:14px"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><img src="${o.base}assets/tanker-rent-logo.png" alt="Tanker Rent UK" style="height:36px;width:auto;padding-left:14px;border-left:1px solid #D5DBE5"></span><span><b style="color:#082956">Tanker Rent UK Ltd</b>, trading as Compton Tankers<br>01525 371 707 · info@comptontankers.com</span></div>
      <div class="pt"><div class="eyb">Hire agreement ${esc(a.ref || '(draft)')}</div><h1>${esc(a.customer)}</h1><div class="sub">${U.length} unit${U.length === 1 ? '' : 's'} · ${esc(a.hire_type || '')} · contract start ${fd(a.start_date)}</div></div>
      <div class="box"><h4>Hirer</h4><dl><dt>Company</dt><dd><b>${esc(a.customer)}</b>${a.company_no ? ' (No. ' + esc(a.company_no) + ')' : ''}</dd><dt>Address</dt><dd>${nl(a.customer_address || '')}</dd><dt>Contact</dt><dd>${esc([a.contact_name, a.contact_phone].filter(Boolean).join(' · ')) || '–'}</dd><dt>Email</dt><dd>${esc(a.contact_email || '–')}</dd><dt>Invoices to</dt><dd>${esc(a.invoice_email || a.contact_email || '–')}</dd></dl></div>
      <div class="box"><h4>Owner</h4><dl><dt>Company</dt><dd><b>Tanker Rent UK Ltd</b> (No. 04432719), trading as Compton Tankers</dd><dt>Address</dt><dd>Compton’s Yard, Grovebury Road, Leighton Buzzard, Bedfordshire LU7 4TS</dd><dt>Phone</dt><dd>01525 371 707</dd><dt>Email</dt><dd>info@comptontankers.com</dd></dl></div>
      <div class="box"><h4>1. Equipment details</h4>${U.map((u) => `<div class="eqw"><table class="eq"><tr><th>Asset type</th><th>Fleet number</th><th>Serial no.</th><th>Condition / year of manufacture</th><th>Full replacement value</th></tr>
        <tr><td>${esc([u.code, u.category].filter(Boolean).join(' – ') || '–')}</td><td><b>${esc(u.unit || 'TBC')}</b>${u.reg && u.reg !== u.unit ? '<br><span class="m">' + esc(u.reg) + '</span>' : ''}</td><td>${[u.chassis_no ? 'VIN: ' + esc(u.chassis_no) : '', u.tank_serial ? 'Tank: ' + esc(u.tank_serial) : ''].filter(Boolean).join('<br>') || '–'}</td><td>${esc([u.condition, u.year].filter(Boolean).join(' / ')) || '–'}</td><td>${u.replacement_value ? gbp(u.replacement_value) : '–'}</td></tr>
        <tr><td colspan="5" class="ks"><div class="ksh">Key specifications (compartments, volume, axles etc)</div><div class="kd">${nl(longDesc(u))}</div></td></tr>
        <tr class="wr"><th colspan="2">Weekly rate (ex VAT)</th><td colspan="3">${gbp(u.weekly_rate)}</td></tr></table></div>`).join('')}</div>
      <div class="box"><h4>2. Hire period</h4>${kv([['Hire type', esc(a.hire_type)], ['Start date', fd(a.start_date)], ['Minimum term', a.min_term_months ? a.min_term_months + ' months' : 'None'], ['Initial term ends', a.initial_term_end ? fd(a.initial_term_end) : 'N/A'], ['After the initial term', a.rolls === false ? 'The hire ends and the equipment is returned' : 'Continues until notice is given'], ['Minimum return notice', a.notice_days ? a.notice_days + ' days in writing' : 'N/A'], ['Delivery to', esc(a.delivery_location || 'N/A')], ['Collection / return location', esc(a.collection_location || YARD)]])}
      </div>
      <div class="box"><h4>3. Rentals (ex VAT)</h4>${kv([['Contract weekly rate', '<b>' + gbp(w) + '</b>'], ['Contract monthly rate', spot(a) ? 'N/A' : '<b>' + gbp(w * 52 / 12) + '</b> <span class="m">(weekly × 52 ÷ 12)</span>'], ['Deposit / security', gbp(a.deposit || 0)], ['Delivery charge', gbp(a.delivery_charge || 0)], ['Collection charge', gbp(a.collection_charge || 0)], ['Payment terms', esc(a.payment_terms || '')]])}
      </div>
      <div class="box"><h4>4. Additional charges (ex VAT)</h4><table class="nt li">${rows(a.additional_charges)}</table>
      </div>
      <div class="box"><h4>5. Options and add-ons</h4><table class="nt li">${rows(a.options)}</table>
      </div>
      <div class="box"><h4>6. Special terms</h4><table class="nt li"><tr><td>The equipment may only be used in</td><td class="c">${esc(a.countries || 'United Kingdom')}</td></tr>${(a.special_terms || []).filter((r) => r.item).map((r) => `<tr><td>${esc(r.item)}</td><td class="c">${esc(r.charge || '')}</td></tr>`).join('')}</table>
      </div>
      <div class="box"><h4>7. Signatures</h4>${signBlock(a, 'sgs')}</div>
      <div class="cta">Questions about this agreement? Call 01525 371 707 or email info@comptontankers.com</div>
      <div class="ftr">Compton Tankers is a trading name of Tanker Rent UK Limited · Registered in England and Wales No. 04432719 · Comptons Yard, Grovebury Road, Leighton Buzzard LU7 4TS · ${esc(a.ref || '')}</div>
      ${U.filter((u) => u.photo_url).map(unitPage).join('')}`;
  }

  /* ---------- standard: the original Compton look, everything stacked full width ---------- */
  function standard(a, o) {
    const w = weekly(a), row = (k, v) => `<tr><th>${k}</th><td>${v || '–'}</td></tr>`;
    return `<div class="hd"><span style="display:flex;align-items:center;gap:14px"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><img src="${o.base}assets/tanker-rent-logo.png" alt="Tanker Rent UK" style="height:36px;width:auto;padding-left:14px;border-left:1px solid #D5DBE5"></span><div class="r"><b class="tag">Tanker Rent UK Ltd, trading as Compton Tankers</b><br>Compton’s Yard, Grovebury Road, Leighton Buzzard LU7 4TS<br>T 01525 371 707 · E info@comptontankers.com · W www.comptontankers.com</div></div>
      <h1>Hire agreement</h1><div class="sub">Agreement ${esc(a.ref || '(draft)')} · contract start ${fd(a.start_date)}</div>
      <h2>Hirer</h2><table class="kv">${row('Company', '<b>' + esc(a.customer) + '</b>' + (a.company_no ? ' (No. ' + esc(a.company_no) + ')' : ''))}${row('Address', nl(a.customer_address || ''))}${row('Contact', esc([a.contact_name, a.contact_phone].filter(Boolean).join(' · ')))}${row('Email', esc(a.contact_email || ''))}${row('Invoices to', esc(a.invoice_email || a.contact_email || ''))}</table>
      <h2>Owner</h2><table class="kv">${row('Company', '<b>Tanker Rent UK Ltd</b> (No. 04432719), trading as Compton Tankers')}${row('Address', 'Compton’s Yard, Grovebury Road, Leighton Buzzard, Bedfordshire LU7 4TS')}${row('Phone', '01525 371 707')}${row('Email', 'info@comptontankers.com')}</table>
      <h2>1. Equipment details</h2>${(a.units || []).map((u) => `<table class="eq"><thead><tr><th>Asset type</th><th>Fleet number</th><th>Serial no.</th><th>Condition / year of manufacture</th><th>Full replacement value</th></tr></thead>
        <tbody><tr><td>${esc([u.code, u.category].filter(Boolean).join(' – ') || '–')}</td><td><b>${esc(u.unit || 'TBC')}</b>${u.reg && u.reg !== u.unit ? '<br><span class="sm">' + esc(u.reg) + '</span>' : ''}</td><td>${[u.chassis_no ? 'VIN: ' + esc(u.chassis_no) : '', u.tank_serial ? 'Tank: ' + esc(u.tank_serial) : ''].filter(Boolean).join('<br>') || '–'}</td><td>${esc([u.condition, u.year].filter(Boolean).join(' / ')) || '–'}</td><td>${u.replacement_value ? gbp(u.replacement_value) : '–'}</td></tr>
        <tr><td colspan="5" class="ks"><div class="ksh">Key specifications (compartments, volume, axles etc)</div>${nl(longDesc(u))}</td></tr>
        <tr class="wr"><th colspan="2">Weekly rate (ex VAT)</th><td colspan="3"><b>${gbp(u.weekly_rate)}</b></td></tr></tbody></table>`).join('')}
      <h2>2. Hire period</h2><table class="kv">${row('Hire type', esc(a.hire_type))}${row('Start date', fd(a.start_date))}${row('Minimum term', a.min_term_months ? a.min_term_months + ' months' : 'None')}${row('Initial term ends', a.initial_term_end ? fd(a.initial_term_end) : 'N/A')}${row('After the initial term', a.rolls === false ? 'The hire ends and the equipment is returned' : 'Continues until notice is given')}${row('Minimum return notice', a.notice_days ? a.notice_days + ' days in writing' : 'N/A')}${row('Delivery to', esc(a.delivery_location || 'N/A'))}${row('Collection / return location', esc(a.collection_location || YARD))}</table>
      <h2>3. Rentals (ex VAT)</h2><table class="kv">${row('Contract weekly rate', '<b>' + gbp(w) + '</b>')}${row('Contract monthly rate', spot(a) ? 'N/A' : '<b>' + gbp(w * 52 / 12) + '</b> <span class="sm">(weekly × 52 ÷ 12)</span>')}${row('Deposit / security', gbp(a.deposit || 0))}${row('Delivery charge', gbp(a.delivery_charge || 0))}${row('Collection charge', gbp(a.collection_charge || 0))}${row('Payment terms', esc(a.payment_terms || ''))}</table>
      <h2>4. Additional charges (ex VAT)</h2><table class="kv li">${rows(a.additional_charges)}</table>
      <h2>5. Options and add-ons</h2><table class="kv li">${rows(a.options)}</table>
      <h2>6. Special terms</h2><table class="kv li"><tr><td>The equipment may only be used in</td><td class="c">${esc(a.countries || 'United Kingdom')}</td></tr>${(a.special_terms || []).filter((r) => r.item).map((r) => `<tr><td>${esc(r.item)}</td><td class="c">${esc(r.charge || '')}</td></tr>`).join('')}</table>
      <h2>7. Signatures</h2>${signBlock(a, 'sgs')}
      <div class="ft">Compton Tankers is a trading name of Tanker Rent UK Limited. Registered in England and Wales, company number 04432719. Registered office: Comptons Yard, Grovebury Road, Leighton Buzzard, Bedfordshire LU7 4TS · ${esc(a.ref || '')}</div>`;
  }

  const CSS = {
    standard: `@page{size:A4;margin:14mm 16mm 16mm}body{font-family:Arial,Helvetica,sans-serif;color:#0B2A66;font-size:9.8pt;margin:0}
      .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E4611D;padding-bottom:8px}.hd img{height:58px}.hd .r{text-align:right;font-size:8.6pt;line-height:1.45}.tag{color:#E4611D}
      h1{font-size:18pt;color:#164698;margin:14px 0 2px}.sub{color:#6B7280;font-size:9pt;margin-bottom:4px}
      h2{font-size:10.5pt;background:#164698;color:#fff;padding:6px 9px;margin:14px 0 0;border-radius:3px 3px 0 0;break-after:avoid;page-break-after:avoid}
      table{width:100%;border-collapse:collapse}tr{page-break-inside:avoid}.kv th,.kv td{padding:6px 9px;border-bottom:1px solid #E3E7EE;vertical-align:top;text-align:left}.kv th{width:32%;color:#164698;font-weight:700}.kv.li td.c{text-align:right;width:30%}.sm{color:#6B7280;font-size:8.4pt}
      .eq{border:1px solid #C9D2E0;page-break-inside:avoid;margin-bottom:8px}.eq thead th{background:#EEF3FB;color:#164698;font-size:8.6pt;padding:7px 6px;text-align:center;border:1px solid #C9D2E0}.eq td{padding:8px 6px;text-align:center;border:1px solid #C9D2E0;vertical-align:middle}
      .eq td.ks{text-align:left;padding:10px 12px;line-height:1.5}.ksh{text-align:center;font-weight:700;color:#164698;margin-bottom:5px}.kb{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;margin-top:8px}.kb ul{margin:2px 0 0;padding-left:16px}.kb li::marker{color:#E4611D}
      .eq tr.wr th{background:#164698;color:#fff;text-align:center;padding:8px}.eq tr.wr td{font-size:11pt}.ho td{height:30px}
      .sgs{display:grid;grid-template-columns:1fr;gap:10px;margin-top:8px;page-break-inside:avoid}.sg{border:1.5px solid #164698;border-radius:6px;padding:8px 12px}.sgh{font-weight:700;margin-bottom:4px}.sgl{display:flex;gap:10px;align-items:flex-end;margin:7px 0}.sgl span{width:130px;color:#6B7280;font-size:8.5pt}.sgv{flex:1;border-bottom:1px solid #94A3B8;min-height:20px}.sgv.sig{min-height:56px}
      .esig{font-size:8pt;color:#475569;margin-top:8px}.ft{margin-top:14px;font-size:7.5pt;color:#6B7280;border-top:1px solid #164698;padding-top:4px}.pb{page-break-before:always}
      .th{color:#164698;font-size:14pt;border-bottom:3px solid #E4611D;padding-bottom:6px}.tc{column-count:2;column-gap:18px;font-size:7.3pt;line-height:1.35;text-align:justify;color:#333}.tc h4{color:#164698;font-size:8.5pt;margin:8px 0 3px;break-after:avoid}.tc p{margin:0 0 4px}`,
    classic: `@page{size:A4;margin:14mm 14mm 16mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9.5pt;margin:0}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start}.hdr img{height:62px}.hdr .ad{text-align:right;color:#1F4E9C;line-height:1.35;font-size:9pt}
      .ct{text-align:center;color:#1F4E9C;font-weight:400;font-size:15pt;margin:6px 0 8px}h3{font-size:10.5pt;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse}.kv th,.kv td{border:1px solid #333;padding:4px 6px;text-align:left;vertical-align:top}.kv th{width:28%;font-weight:700}
      .bt th{background:#1F4E9C;color:#fff;font-weight:400;padding:6px;border:1px solid #1F4E9C;text-align:left}.bt td{border:1px solid #1F4E9C;padding:6px}.bt .c,.bt td.c{text-align:center}.eqt th{text-align:center}.eqt td{text-align:center}.eqt{margin-bottom:8px}
      tr{page-break-inside:avoid}.sgs{display:grid;grid-template-columns:1fr 1fr;gap:12px;page-break-inside:avoid}.sg{border:1.5px solid #1F4E9C;padding:8px 10px;background:#F5F8FD}.sgh{font-weight:700;margin-bottom:6px}
      .sgl{display:flex;gap:8px;align-items:flex-end;margin:6px 0}.sgl span{width:105px;color:#555;font-size:8.5pt}.sgv{flex:1;border-bottom:1px solid #777;min-height:20px}.sgv.sig{min-height:58px}
      .esig{font-size:8pt;color:#444;margin-top:8px}.pb{page-break-before:always}.th{color:#1F4E9C;font-size:14pt}.tc{column-count:2;column-gap:18px;font-size:7.4pt;line-height:1.35;text-align:justify}.tc h4{font-size:8.5pt;margin:8px 0 3px;break-after:avoid}.tc p{margin:0 0 4px}`,
    pack: `@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');@page{size:A4;margin:12mm 14mm 14mm}
      body{font-family:Poppins,Arial,sans-serif;color:#082956;font-size:9pt;margin:0}
      .ph{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #F15C16;padding-bottom:8px;margin-bottom:12px}.ph img{height:50px}.ph span{color:#82868C;font-size:8.5pt;text-align:right;line-height:1.5}
      .pt{margin:4px 0 12px}.eyb{color:#F15C16;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:8.5pt}.pt h1{font-size:21pt;margin:2px 0 0;line-height:1.15}.h2{font-size:17pt;margin:2px 0 0}.sub{color:#82868C;font-size:9.5pt}
      .box{border:1px solid #E6E9EE;border-radius:8px;padding:10px 14px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}.box .nt tr:last-child td,.box .nt tr:last-child th{border-bottom:0}.box h4{margin:0 0 6px;font-size:11pt;border-bottom:2px solid #F15C16;display:inline-block;padding-bottom:2px}
      dl{display:grid;grid-template-columns:120px 1fr;gap:4px 10px;margin:4px 0 0}dt{color:#82868C}dd{margin:0}
      .hdg{font-weight:700;font-size:11.5pt;margin:16px 0 6px;padding-left:9px;border-left:4px solid #F15C16;break-after:avoid;page-break-after:avoid}table{width:100%;border-collapse:collapse}tr{page-break-inside:avoid}
      .nt td,.nt th{border-bottom:1px solid #E6E9EE;padding:6px 8px;vertical-align:top;text-align:left}.kv2 th{color:#082956;width:34%;font-weight:600}.li td.c{text-align:right;width:32%}.m{color:#82868C;font-size:8pt}
      .eqw{border:1px solid #D5DBE5;border-radius:8px;overflow:hidden;margin:6px 0 4px;page-break-inside:avoid}.eqw+.eqw{margin-top:10px}.eq{border:0;margin:0}.eqw .eq tr:first-child th{border-top:0}.eqw .eq th:first-child,.eqw .eq td:first-child{border-left:0}.eqw .eq th:last-child,.eqw .eq td:last-child{border-right:0}.eqw .eq tr:last-child th,.eqw .eq tr:last-child td{border-bottom:0}.eq th{background:#082956;color:#fff;font-weight:600;font-size:8.5pt;padding:8px 6px;text-align:center;border:1px solid #082956}.eq td{border:1px solid #D5DBE5;padding:9px 6px;text-align:center;vertical-align:middle}
      .eq td.ks{text-align:left;padding:10px 14px;line-height:1.55}.ksh{text-align:center;font-weight:700;margin-bottom:6px}.kd{text-align:center;color:#1f2937;font-size:9.5pt}.kb{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 16px;margin-top:10px}.kb b{border-bottom:2px solid #F15C16}.kb ul{margin:4px 0 0;padding-left:16px;color:#4b5563}.kb li::marker{color:#F15C16}
      .eq tr.wr th{background:#082956;padding:9px}.eq tr.wr td{font-weight:700;font-size:11pt}.ho td{height:30px}.ho{margin-top:4px}
      .sgs{display:grid;grid-template-columns:1fr;gap:10px;page-break-inside:avoid}.sg{border:1.5px solid #082956;border-radius:8px;padding:10px 14px}.sgh{font-weight:700;margin-bottom:6px}.sgl{display:flex;gap:10px;align-items:flex-end;margin:7px 0}.sgl span{width:130px;color:#82868C;font-size:8pt}.sgv{flex:1;border-bottom:1px solid #82868C;min-height:20px}.sgv.sig{min-height:58px}
      .esig{font-size:7.8pt;color:#82868C;margin-top:8px}.cta{background:#F15C16;color:#fff;font-weight:700;text-align:center;padding:10px;border-radius:6px;margin-top:16px;page-break-inside:avoid}
      .ftr{margin-top:10px;font-size:7pt;color:#82868C;border-top:1px solid #E6E9EE;padding-top:4px}.pb{page-break-before:always}
      .pic img{width:100%;max-height:105mm;object-fit:contain;margin:10px 0}.boxes{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.boxes ul{margin:4px 0 0;padding-left:16px;color:#4b5563}.boxes li::marker{color:#F15C16}
      .th{font-size:14pt;border-bottom:3px solid #F15C16;padding-bottom:6px}.tc{column-count:2;column-gap:18px;font-size:7.2pt;line-height:1.35;color:#333;text-align:justify;font-family:Arial,sans-serif}.tc h4{font-family:Poppins,Arial;color:#082956;font-size:8.5pt;margin:8px 0 3px;break-after:avoid}.tc p{margin:0 0 4px}`,

  };

  // full HTML document; o = { base, style:'pack'|'classic', print:true|false }
  W.CT.agreementDoc = function (a, o) {
    o = Object.assign({ base: '', style: a.doc_style || 'pack', print: true }, o || {});
    const st = ['classic', 'pack', 'standard'].includes(o.style) ? o.style : 'pack';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Hire agreement ${esc(a.ref || '')} – ${esc(a.customer || '')}</title><style>${CSS[st]}@media screen{body{background:#eef1f5}.pg,.terms{background:#fff;margin:12px auto;max-width:210mm;box-shadow:0 2px 10px rgba(0,0,0,.08)}body{max-width:200mm;margin:14px auto;background:#fff;padding:14px}}</style></head><body>
      ${st === 'classic' ? classic(a, o) : st === 'pack' ? pack(a, o) : standard(a, o)}${terms()}${o.print ? '<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script>' : ''}</body></html>`;
  };
  W.CT.agreementDocParts = { standard, classic, pack, signBlock, terms, CSS, sections };
})();
