/* COMPTON INVOICE – the house-style sales invoice (Poppins, navy and orange, thin rounded boxes), matching the hire agreement.
   W.CT.invoiceDoc(inv, { base, print }) returns a full HTML document. The Xero .docx branding theme copies this layout. */
(function (W) {
  W.CT = W.CT || {};
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nl = (s) => esc(s).replace(/\n/g, '<br>');
  const money = (n) => '£' + (+n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fd = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const CO = { name: 'Tanker Rent UK Ltd', trading: 'Compton Tankers', addr: 'Compton’s Yard, Grovebury Road, Leighton Buzzard, Bedfordshire LU7 4TS', crn: '04432719', vat: '801534565', phone: '01525 371 707', email: 'info@comptontankers.com', web: 'www.comptontankers.com' };
  const BANK = [['Bank', 'NatWest'], ['Account name', 'Tanker Rent UK Ltd'], ['Sort code', '53-70-11'], ['Account no.', '80103006'], ['IBAN', 'GB79NWBK53701180103006'], ['BIC', 'NWBKGB2L']];
  const TERMS = [['Sold as seen', 'All vehicles and trailers are sold “as seen” with no warranty unless stated on this invoice. Buyers are advised to inspect items thoroughly before purchase.'],
    ['Ownership', 'Title remains with Tanker Rent UK Ltd until full payment has been received and cleared.'],
    ['Deposit', 'The first £1,000 of payment is a non-refundable deposit if the order is cancelled, at our discretion.'],
    ['Storage', 'Vehicles and trailers are stored free of charge for up to 14 days after purchase. After that storage is charged at £60 per week for tractor units and £120 per week for trailers and rigid vehicles, at the customer’s risk.']];
  const TITLE = { deposit: 'Deposit invoice', final: 'Tax invoice', sale: 'Tax invoice', hire: 'Tax invoice', other: 'Tax invoice' };
  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');@page{size:A4;margin:9mm 13mm 8mm}
    body{font-family:Poppins,Arial,sans-serif;color:#082956;font-size:8.6pt;margin:0}
    .ph{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #F15C16;padding-bottom:6px;margin-bottom:8px}.ph img{height:44px}.ph span{color:#82868C;font-size:8.5pt;text-align:right;line-height:1.5}
    .pt{display:flex;justify-content:space-between;align-items:flex-end;margin:2px 0 8px}.eyb{color:#F15C16;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:8.5pt}.pt h1{font-size:22pt;margin:2px 0 0;line-height:1.1}
    .facts{display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:9pt;text-align:right}.facts dt{color:#82868C}.facts dd{margin:0;font-weight:600}
    .box{border:1px solid #E6E9EE;border-radius:8px;padding:8px 13px;margin-bottom:8px;break-inside:avoid;page-break-inside:avoid}.box h4{margin:0 0 6px;font-size:11pt;border-bottom:2px solid #F15C16;display:inline-block;padding-bottom:2px}
    dl.kv{display:grid;grid-template-columns:120px 1fr;gap:2px 10px;margin:4px 0 0}dl.kv dt{color:#82868C}dl.kv dd{margin:0}
    .lw{border:1px solid #D5DBE5;border-radius:8px;overflow:hidden;margin:6px 0 0}table{width:100%;border-collapse:collapse}tr{page-break-inside:avoid}
    .li th{background:#082956;color:#fff;font-weight:600;font-size:8.5pt;padding:6px 8px;text-align:left}.li th.n,.li td.n{text-align:right;white-space:nowrap}
    .li td{border-top:1px solid #D5DBE5;padding:6px 8px;vertical-align:top}.li td.d{white-space:pre-line}.neg{color:#B8470F}
    .tot{width:300px;margin:6px 0 0 auto}.tot td{padding:2px 8px}.tot td.n{text-align:right;font-weight:600}.tot tr.g td{border-top:1px solid #D5DBE5;font-size:10.5pt;font-weight:700}
    .due{display:flex;justify-content:space-between;align-items:center;background:#082956;color:#fff;border-radius:8px;padding:8px 14px;margin:6px 0 2px}.due b{font-size:15pt;color:#fff}.due span{color:#FDBA8C;font-size:8.5pt;text-transform:uppercase;letter-spacing:1px;font-weight:700}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.two .box{margin-bottom:8px}.two dl.kv{grid-template-columns:72px 1fr}.pay{display:grid;grid-template-columns:1.1fr 1fr;gap:14px}.pay dl.bk{grid-template-columns:88px 1fr;font-size:8.3pt}.pay dl.bk dd{white-space:nowrap}.pay{grid-template-columns:1.35fr 1.45fr 1fr;gap:10px}.btn{display:inline-block;background:#F15C16;color:#fff;border-radius:6px;padding:7px 14px;text-decoration:none;font-weight:600;margin-top:6px}
    .terms dl{display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;margin:2px 0 0;font-size:7.5pt}.terms dt{font-weight:600;display:inline}.terms dd{margin:0;color:#334155;display:inline}.terms div{margin:0}.m{color:#82868C;font-size:8pt}
    .ft{margin-top:8px;border-top:1px solid #E6E9EE;padding-top:6px;color:#82868C;font-size:7.5pt;text-align:center}
    .draft{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:90pt;color:rgba(241,92,22,.10);transform:rotate(-24deg);font-weight:700;pointer-events:none}`;
  function body(v, o) {
    const L = v.lines || [], net = L.reduce((t, l) => t + (+l.qty || 0) * (+l.rate || 0), 0), vatRate = v.vat_rate ?? 20;
    const vat = v.vat != null ? +v.vat : Math.round(net * vatRate) / 100, total = v.total != null ? +v.total : net + vat, paid = +v.amount_paid || 0, due = v.amount_due != null ? +v.amount_due : total - paid;
    return `${!v.number || v.status === 'DRAFT' ? '<div class="draft">DRAFT</div>' : ''}
      <div class="ph"><img src="${o.base}assets/compton-logo.png" alt="Compton Tankers"><span>Tanker hire · Sales · Specialist workshops<br>${CO.phone} · ${CO.email}</span></div>
      <div class="pt"><div><div class="eyb">${TITLE[v.kind] || 'Tax invoice'}</div><h1>${esc(v.number || 'Draft')}</h1></div>
        <dl class="facts"><dt>Invoice date</dt><dd>${fd(v.issue_date)}</dd><dt>Payment due</dt><dd>${fd(v.due_date)}</dd>${v.reference ? `<dt>Reference</dt><dd>${esc(v.reference)}</dd>` : ''}</dl></div>
      <div class="two"><div class="box"><h4>Invoice to</h4><dl class="kv"><dt>Customer</dt><dd><b>${esc(v.customer)}</b></dd>${v.customer_address ? `<dt>Address</dt><dd>${nl(v.customer_address)}</dd>` : ''}${v.contact_email ? `<dt>Email</dt><dd>${esc(v.contact_email)}</dd>` : ''}</dl></div>
      <div class="box"><h4>From</h4><dl class="kv"><dt>Company</dt><dd><b>${CO.name}</b> t/a ${CO.trading}</dd><dt>Address</dt><dd>${CO.addr}</dd><dt>VAT No.</dt><dd>GB ${CO.vat}</dd></dl></div></div>
      <div class="box"><h4>${v.kind === 'deposit' ? 'Deposit' : 'Details'}</h4><div class="lw"><table class="li"><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">VAT</th><th class="n">Amount</th></tr>
        ${L.map((l) => { const a = (+l.qty || 0) * (+l.rate || 0); return `<tr><td class="d">${esc(l.desc)}</td><td class="n">${+l.qty || 1}</td><td class="n${+l.rate < 0 ? ' neg' : ''}">${money(l.rate)}</td><td class="n">${l.tax === 'NONE' ? '–' : l.tax === 'ZERORATEDOUTPUT' ? '0%' : vatRate + '%'}</td><td class="n${a < 0 ? ' neg' : ''}">${money(a)}</td></tr>`; }).join('')}</table></div>
        <table class="tot"><tr><td>Subtotal</td><td class="n">${money(v.net != null ? v.net : net)}</td></tr><tr><td>VAT ${vatRate}%</td><td class="n">${money(vat)}</td></tr><tr class="g"><td>Total</td><td class="n">${money(total)}</td></tr>${paid ? `<tr><td>Less paid</td><td class="n">${money(-paid)}</td></tr>` : ''}</table>
        <div class="due"><span>Amount due${v.due_date ? ' by ' + fd(v.due_date) : ''}</span><b>${money(due)}</b></div></div>
      <div class="box"><h4>How to pay</h4><div class="pay"><dl class="kv bk">${BANK.slice(0, 4).map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl><dl class="kv bk">${BANK.slice(4).map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}<dt>Reference</dt><dd><b>${esc(v.number || 'the invoice number')}</b></dd></dl>
        <div>${v.online_url ? `Pay online by card or bank transfer:<br><a class="btn" href="${esc(v.online_url)}">View and pay online</a>` : 'Please quote the invoice number as the payment reference.'}<p class="m">Questions about this invoice: ${CO.phone} · accounts via ${CO.email}</p></div></div></div>
      ${v.kind === 'hire' ? '' : `<div class="box terms"><h4>Terms of sale</h4><dl>${TERMS.map(([k, x]) => `<div><dt>${k}.</dt> <dd>${x}</dd></div>`).join('')}</dl></div>`}
      <div class="ft">${CO.name} · trading as ${CO.trading} · Registered in England No. ${CO.crn} · VAT No. GB ${CO.vat} · ${CO.web}</div>`;
  }
  W.CT.invoiceDoc = function (v, o) {
    o = Object.assign({ base: '', print: true }, o || {});
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(v.number || 'Invoice')} – ${esc(v.customer || '')}</title><style>${CSS}</style></head><body>${body(v, o)}${o.print ? '<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>' : ''}</body></html>`;
  };
  W.CT.invoiceDocParts = { CSS, body, CO, BANK, TERMS };
})(window);
