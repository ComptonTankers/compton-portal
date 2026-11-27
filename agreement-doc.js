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
    return `<div class="hdr"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><div class="ad">Tanker Rent UK Ltd<br>Compton's Yard<br>Grovebury Road<br>Leighton Buzzard<br>Bedfordshire<br>LU7 4TS</div></div>
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
    const unitPage = (u) => { const S = sections(u);
      return `<div class="pg"><div class="ph"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><span>Hire agreement ${esc(a.ref || '')}</span></div>
        <div class="pt"><div class="eyb">Your equipment</div><h2>${esc(u.description || u.category || 'Equipment')}</h2><div class="sub">${esc(u.category || '')}${u.code ? ' · ' + esc(u.code) : ''}</div></div>
        <div class="prod">${u.photo_url ? `<div class="pic"><img src="${esc(u.photo_url)}" alt=""></div>` : ''}<div class="facts">
          ${[['Fleet number', u.unit || 'TBC'], ['Registration', u.reg && u.reg !== u.unit ? u.reg : ''], ['Year', u.year], ['Condition', u.condition], ['Chassis / VIN', u.chassis_no], ['Tank serial', u.tank_serial], ['Full replacement value', u.replacement_value ? gbp(u.replacement_value) : ''], ['Weekly rate (ex VAT)', gbp(u.weekly_rate)]].filter(([, v]) => v).map(([k, v]) => `<div class="fk"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
        ${S.length ? `<div class="boxes">${S.map((x) => `<div class="box"><h4>${esc(x.title)}</h4><ul>${(x.items || []).filter(Boolean).map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}</div>`; };
    return `<div class="pg"><div class="ph"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><span>Tanker hire · Sales · Specialist workshops</span></div>
      <div class="pt"><div class="eyb">Hire agreement ${esc(a.ref || '(draft)')}</div><h1>${esc(a.customer)}</h1><div class="sub">${U.length} unit${U.length === 1 ? '' : 's'} · ${esc(a.hire_type || '')} from ${fd(a.start_date)}</div></div>
      <table class="cd"><tr><th>Agreement Reference:</th><td>${esc(a.ref || 'Draft')}</td></tr>
        <tr><th>Hirer:</th><td>${esc(a.customer)}${a.company_no ? ' (No. ' + esc(a.company_no) + ')' : ''}</td></tr>
        <tr><th>Hirer's address:</th><td class="addr"><div>${nl(a.customer_address || '')}</div>${a.contact_email ? '<div class="em">Email: ' + esc(a.contact_email) + '</div>' : ''}</td></tr>
        <tr><th>Company:</th><td>TANKER RENT UK LIMITED (No. 04432719)</td></tr>
        <tr><th>Company's address:</th><td class="addr"><div>Compton’s Yard<br>Grovebury Road<br>Leighton Buzzard<br>Bedfordshire<br>LU7 4TS</div><div class="em">Email: info@comptontankers.com</div></td></tr>
        <tr><th>Contract Start Date:</th><td>${fd(a.start_date)}</td></tr></table>
      <div class="hdg">1. Equipment</div><table class="nt"><tr><th>Fleet no.</th><th>Description</th><th>Year / condition</th><th>Serial numbers</th><th class="r">Replacement value</th><th class="r">£ per week</th></tr>
        ${U.map((u) => `<tr><td><b>${esc(u.unit || 'TBC')}</b></td><td><b>${esc(u.description || u.category || '')}</b>${u.category && u.description ? '<br><span class="m">' + esc(u.category) + '</span>' : ''}</td><td>${esc([u.year, u.condition].filter(Boolean).join(' · ')) || '–'}</td><td class="m">${[u.chassis_no ? 'VIN ' + esc(u.chassis_no) : '', u.tank_serial ? 'Tank ' + esc(u.tank_serial) : ''].filter(Boolean).join('<br>') || '–'}</td><td class="r">${u.replacement_value ? gbp(u.replacement_value) : '–'}</td><td class="r"><b>${gbp(u.weekly_rate)}</b></td></tr>`).join('')}</table>
      <div class="two"><div><div class="hdg">2. Hire period</div><table class="nt kv2"><tr><th>Hire type</th><td>${esc(a.hire_type || '')}</td></tr><tr><th>Start date</th><td>${fd(a.start_date)}</td></tr><tr><th>Minimum term</th><td>${a.min_term_months ? a.min_term_months + ' months' : 'None'}</td></tr><tr><th>Initial term ends</th><td>${a.initial_term_end ? fd(a.initial_term_end) : 'N/A'}</td></tr><tr><th>After the initial term</th><td>${a.rolls === false ? 'The hire ends and the equipment is returned' : 'Continues until notice is given'}</td></tr><tr><th>Return notice</th><td>${a.notice_days ? a.notice_days + ' days in writing' : 'N/A'}</td></tr><tr><th>Delivery to</th><td>${esc(a.delivery_location || 'N/A')}</td></tr><tr><th>Return to</th><td>${esc(a.collection_location || YARD)}</td></tr></table></div>
        <div><div class="hdg">3. Rentals (ex VAT)</div><table class="nt kv2"><tr><th>Contract weekly rate</th><td><b>${gbp(w)}</b></td></tr><tr><th>Contract monthly rate</th><td>${spot(a) ? 'N/A' : '<b>' + gbp(w * 52 / 12) + '</b> <span class="m">(weekly × 52 ÷ 12)</span>'}</td></tr><tr><th>Deposit / security</th><td>${gbp(a.deposit || 0)}</td></tr><tr><th>Delivery charge</th><td>${gbp(a.delivery_charge || 0)}</td></tr><tr><th>Collection charge</th><td>${gbp(a.collection_charge || 0)}</td></tr><tr><th>Payment terms</th><td>${esc(a.payment_terms || '')}</td></tr></table></div></div>
      <div class="ftr">Compton Tankers is a trading name of Tanker Rent UK Limited · Registered in England and Wales No. 04432719 · Comptons Yard, Grovebury Road, Leighton Buzzard LU7 4TS</div></div>
      ${U.filter((u) => u.photo_url || sections(u).length).map(unitPage).join('')}
      <div class="pg"><div class="ph"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><span>Hire agreement ${esc(a.ref || '')}</span></div>
      <div class="two"><div><div class="hdg">4. Additional charges (ex VAT)</div><table class="nt">${rows(a.additional_charges)}</table></div><div><div class="hdg">5. Options and add-ons</div><table class="nt">${rows(a.options)}</table>
        <div class="hdg">6. Special terms</div><table class="nt"><tr><td>The equipment may only be used in</td><td class="c">${esc(a.countries || 'United Kingdom')}</td></tr>${(a.special_terms || []).filter((r) => r.item).map((r) => `<tr><td>${esc(r.item)}</td><td class="c">${esc(r.charge || '')}</td></tr>`).join('')}</table></div></div>
      <div class="hdg">7. Signatures</div>${signBlock(a, 'sgs')}
      <div class="cta">Questions about this agreement? Call 01525 371 707 or email info@comptontankers.com</div></div>`;
  }

  const CSS = {
    classic: `@page{size:A4;margin:14mm 14mm 16mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9.5pt;margin:0}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start}.hdr img{height:62px}.hdr .ad{text-align:right;color:#1F4E9C;line-height:1.35;font-size:9pt}
      .ct{text-align:center;color:#1F4E9C;font-weight:400;font-size:15pt;margin:6px 0 8px}h3{font-size:10.5pt;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse}.kv th,.kv td{border:1px solid #333;padding:4px 6px;text-align:left;vertical-align:top}.kv th{width:28%;font-weight:700}
      .bt th{background:#1F4E9C;color:#fff;font-weight:400;padding:6px;border:1px solid #1F4E9C;text-align:left}.bt td{border:1px solid #1F4E9C;padding:6px}.bt .c,.bt td.c{text-align:center}.eqt th{text-align:center}.eqt td{text-align:center}.eqt{margin-bottom:8px}
      tr{page-break-inside:avoid}.sgs{display:grid;grid-template-columns:1fr 1fr;gap:12px;page-break-inside:avoid}.sg{border:1.5px solid #1F4E9C;padding:8px 10px;background:#F5F8FD}.sgh{font-weight:700;margin-bottom:6px}
      .sgl{display:flex;gap:8px;align-items:flex-end;margin:6px 0}.sgl span{width:105px;color:#555;font-size:8.5pt}.sgv{flex:1;border-bottom:1px solid #777;min-height:20px}.sgv.sig{min-height:58px}
      .esig{font-size:8pt;color:#444;margin-top:8px}.pb{page-break-before:always}.th{color:#1F4E9C;font-size:14pt}.tc{column-count:2;column-gap:18px;font-size:7.4pt;line-height:1.35;text-align:justify}.tc h4{font-size:8.5pt;margin:8px 0 3px;break-after:avoid}.tc p{margin:0 0 4px}`,
    pack: `@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');@page{size:A4;margin:0}
      body{font-family:Poppins,Arial,sans-serif;color:#082956;font-size:9pt;margin:0}.pg{width:210mm;min-height:297mm;box-sizing:border-box;padding:12mm 14mm 14mm;position:relative;page-break-after:always}
      .ph{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #F15C16;padding-bottom:8px;margin-bottom:12px}.ph img{height:46px}.ph span{color:#82868C;font-size:8.5pt}
      .pt{margin:4px 0 14px}.eyb{color:#F15C16;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:8.5pt}.pt h1{font-size:22pt;margin:2px 0 0;line-height:1.15}.pt h2{font-size:18pt;margin:2px 0 0;line-height:1.2}.sub{color:#82868C;font-size:9.5pt}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:12px;page-break-inside:avoid}.cd{width:100%;border-collapse:collapse;border:1.5px solid #082956;margin:0 0 6px;page-break-inside:avoid}.cd th,.cd td{border:1px solid #C9D2E0;padding:6px 9px;vertical-align:top;text-align:left;font-size:9.5pt}.cd th{width:30%;background:#F3F6FB;color:#082956;font-weight:700;border-left:4px solid #F15C16}.cd td{color:#1f2937}.cd td.addr{height:34mm}.cd td.addr{position:relative}.cd .em{position:absolute;left:9px;bottom:6px}.box{border:1px solid #E6E9EE;border-radius:8px;padding:10px 12px;break-inside:avoid}.box h4{margin:0 0 6px;font-size:10.5pt;border-bottom:2px solid #F15C16;display:inline-block;padding-bottom:2px}
      dl{display:grid;grid-template-columns:90px 1fr;gap:3px 8px;margin:4px 0 0}dt{color:#82868C}dd{margin:0}
      .hdg{font-weight:700;font-size:11pt;margin:14px 0 6px;padding-left:8px;border-left:4px solid #F15C16}table{width:100%;border-collapse:collapse}.nt th{text-align:left;font-size:8pt;color:#82868C;font-weight:700;border-bottom:2px solid #082956;padding:5px 6px}.nt td{border-bottom:1px solid #E6E9EE;padding:6px;vertical-align:top}
      .kv2 th{border-bottom:1px solid #E6E9EE;color:#082956;width:42%;font-size:8.5pt}.r{text-align:right}.c{text-align:right}.m{color:#82868C;font-size:8pt}tr{page-break-inside:avoid}
      .prod{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;align-items:start;margin-bottom:12px}.pic img{width:100%;border-radius:8px;object-fit:cover;max-height:95mm}.prod:not(:has(.pic)){grid-template-columns:1fr}
      .facts{display:grid;gap:6px}.fk{display:flex;justify-content:space-between;border-bottom:1px solid #E6E9EE;padding:4px 0}.fk span{color:#82868C}
      .boxes{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.boxes ul{margin:4px 0 0;padding-left:16px;color:#4b5563}.boxes li{margin:2px 0}.boxes li::marker{color:#F15C16}
      .sgs{display:grid;grid-template-columns:1fr 1fr;gap:12px;page-break-inside:avoid}.sg{border:1.5px solid #082956;border-radius:8px;padding:10px 12px}.sgh{font-weight:700;margin-bottom:6px}.sgl{display:flex;gap:8px;align-items:flex-end;margin:7px 0}.sgl span{width:110px;color:#82868C;font-size:8pt}.sgv{flex:1;border-bottom:1px solid #82868C;min-height:20px}.sgv.sig{min-height:60px}
      .esig{font-size:7.8pt;color:#82868C;margin-top:8px}.cta{background:#F15C16;color:#fff;font-weight:700;text-align:center;padding:10px;border-radius:6px;margin-top:14px}
      .ftr{position:absolute;left:14mm;right:14mm;bottom:8mm;font-size:7pt;color:#82868C;border-top:1px solid #E6E9EE;padding-top:4px}.pb{page-break-before:always}
      .terms{padding:12mm 14mm}.th{font-size:14pt;border-bottom:3px solid #F15C16;padding-bottom:6px}.tc{column-count:2;column-gap:18px;font-size:7.2pt;line-height:1.35;color:#333;text-align:justify;font-family:Arial,sans-serif}.tc h4{font-family:Poppins,Arial;color:#082956;font-size:8.5pt;margin:8px 0 3px;break-after:avoid}.tc p{margin:0 0 4px}`,
  };

  // full HTML document; o = { base, style:'pack'|'classic', print:true|false }
  W.CT.agreementDoc = function (a, o) {
    o = Object.assign({ base: '', style: a.doc_style || 'pack', print: true }, o || {});
    const st = o.style === 'classic' ? 'classic' : 'pack';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Hire agreement ${esc(a.ref || '')} – ${esc(a.customer || '')}</title><style>${CSS[st]}@media screen{body{background:#eef1f5}.pg,.terms{background:#fff;margin:12px auto;max-width:210mm;box-shadow:0 2px 10px rgba(0,0,0,.08)}${st === 'classic' ? 'body{max-width:200mm;margin:14px auto;background:#fff;padding:14px}' : ''}}</style></head><body>
      ${st === 'classic' ? classic(a, o) : pack(a, o)}${terms()}${o.print ? '<script>window.onload=function(){setTimeout(function(){window.print()},500)}<\/script>' : ''}</body></html>`;
  };
  W.CT.agreementDocParts = { classic, pack, signBlock, terms, CSS, sections };
})();
