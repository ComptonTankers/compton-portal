/* NEW LAYOUT PREVIEW – visual-first pages on live data. Existing pages are untouched. */
(function () {
  const X = window.CT; if (!X) return;
  const { all, gbp, esc, C, NOW, mon } = X;
  const T = X.T;
  const K0 = { blue: C.blue || '#164698', orange: C.orange || '#E3641D', soft: '#8FA9D6', good: '#2f8f5b', bad: '#b3261e', amber: '#e0a526', mut: '#6b7587', line: '#e3e7ef', purple: '#7d5ba6' };
  const lab = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const labL = (m) => new Date(Math.floor(m / 12), m % 12, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const mi = (k) => mon(k + '-01');
  const norm = (u) => String(u || '').replace(/\s+/g, '').toUpperCase();
  const pc = (v, d = 0) => (v == null || isNaN(v) ? '–' : (v * 100).toFixed(d) + '%');
  const kf = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + '£' + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'm' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a)); };
  const css = document.createElement('style');
  css.textContent = `
  .pv-banner{background:linear-gradient(90deg,#fff3e9,#fff);border:1px solid #f3d3bb;border-radius:10px;padding:8px 14px;margin:0 0 14px;font-size:13px;color:#7a4a22}
  .pv-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:12px;margin-bottom:14px}
  .pv-tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px 8px;cursor:pointer;position:relative;transition:box-shadow .15s,transform .15s}
  .pv-tile:hover{box-shadow:0 4px 14px rgba(22,70,152,.12);transform:translateY(-1px)}
  .pv-tile .l{font-size:12px;color:var(--mut,#6b7587);text-transform:uppercase;letter-spacing:.03em}
  .pv-tile .v{font:700 26px/1.2 'Barlow Condensed',inherit;margin:2px 0}
  .pv-tile .s{font-size:12px;color:var(--mut,#6b7587);min-height:16px}
  .pv-tile svg{display:block;margin-top:4px}
  .pv-tile.r .v{color:${K0.bad}}.pv-tile.g .v{color:${K0.good}}.pv-tile.o .v{color:${K0.orange}}
  .pv-grid{display:grid;gap:14px;margin-bottom:14px}.pv-g2{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}.pv-g21{grid-template-columns:2fr 1fr}.pv-g3{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
  @media(max-width:900px){.pv-g21{grid-template-columns:1fr}}
  .pv-tabs{display:flex;gap:4px;border-bottom:2px solid var(--line);margin:0 0 14px;flex-wrap:wrap}
  .pv-tabs button{background:none;border:0;padding:9px 16px;font:600 14px inherit;color:var(--mut,#6b7587);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px}
  .pv-tabs button.on{color:${K0.blue};border-bottom-color:${K0.orange}}
  .pv-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .pv-card h3{margin:0 0 2px;font-size:16px}.pv-card .hint{margin-bottom:8px}
  .pv-list .it{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer}
  .pv-list .it:last-child{border-bottom:0}.pv-list .it:hover{background:#f6f8fc}
  .pv-list .dot{width:10px;height:10px;border-radius:50%;margin-top:5px;flex:none}
  .pv-list .amt{margin-left:auto;font-weight:700;white-space:nowrap}
  .pv-drawer{position:fixed;top:0;right:0;bottom:0;width:min(560px,96vw);background:#fff;box-shadow:-8px 0 30px rgba(0,0,0,.18);z-index:60;transform:translateX(105%);transition:transform .2s;display:flex;flex-direction:column}
  .pv-drawer.on{transform:none}.pv-drawer header{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line)}
  .pv-drawer header h3{margin:0;flex:1}.pv-drawer .body{padding:14px 18px;overflow:auto;flex:1}.pv-drawer .x{border:0;background:none;font-size:22px;cursor:pointer}
  .pv-tbl{border-collapse:collapse;width:100%;font-size:13px}.pv-tbl th{text-align:left;color:var(--mut,#6b7587);font-weight:600;border-bottom:1px solid var(--line);padding:6px 8px;position:sticky;top:0;background:#fff}
  .pv-tbl td{padding:6px 8px;border-bottom:1px solid var(--line)}.pv-tbl .n{text-align:right}
  .pv-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--mut,#6b7587);margin:2px 0 6px}.pv-leg i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  .pv-wf text{font-size:11px}
  `;
  document.head.appendChild(css);

  /* ---------- small helpers ---------- */
  const legend = (a) => '<div class="pv-leg">' + a.map(([c, t, dash]) => `<span><i style="background:${dash ? 'transparent;border-top:3px dashed ' + c : c};${dash ? 'height:0' : ''}"></i>${esc(t)}</span>`).join('') + '</div>';
  const card = (t, h, body, extra) => `<div class="pv-card" ${extra || ''}><h3>${t}</h3>${h ? `<div class="hint">${h}</div>` : ''}${body}</div>`;
  const tbl = (heads, rows) => `<table class="pv-tbl"><thead><tr>${heads.map((h, i) => `<th class="${i ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  let drawerEl;
  function drill(title, html, link) {
    if (!drawerEl) { drawerEl = document.createElement('div'); drawerEl.className = 'pv-drawer'; document.body.appendChild(drawerEl); }
    drawerEl.innerHTML = `<header><h3>${title}</h3>${link ? `<a href="#/${link[0]}" style="color:${K0.blue};font-weight:600">${esc(link[1])} →</a>` : ''}<button class="x" aria-label="Close">×</button></header><div class="body">${html}</div>`;
    drawerEl.querySelector('.x').onclick = () => drawerEl.classList.remove('on');
    requestAnimationFrame(() => drawerEl.classList.add('on'));
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerEl) drawerEl.classList.remove('on'); });
  const sparkSvg = (vals, color, w = 120, h = 30) => {
    const v = vals.filter((x) => x != null); if (v.length < 2) return '';
    const mn = Math.min(...v), mx = Math.max(...v), sx = (i) => (i / (vals.length - 1)) * (w - 4) + 2, sy = (x) => h - 3 - ((x - mn) / ((mx - mn) || 1)) * (h - 8);
    let d = '', pen = false; vals.forEach((x, i) => { if (x == null) { pen = false; return; } d += (pen ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(x).toFixed(1); pen = true; });
    const li = vals.length - 1 - [...vals].reverse().findIndex((x) => x != null);
    return `<svg width="${w}" height="${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/><circle cx="${sx(li)}" cy="${sy(vals[li])}" r="3" fill="${color}"/></svg>`;
  };
  function tiles(a) { return '<div class="pv-tiles">' + a.map((t, i) => `<div class="pv-tile ${t.c || ''}" data-i="${i}"><div class="l">${t.l}</div><div class="v">${t.v}</div><div class="s">${t.s || ''}</div>${t.spark ? sparkSvg(t.spark, t.sc || K0.blue) : ''}</div>`).join('') + '</div>'; }
  function wireTiles(root, a) { root.querySelectorAll('.pv-tile').forEach((el) => { el.onclick = () => { const t = a[+el.dataset.i]; if (t.drill) drill(t.l, t.drill(), t.link); else if (t.link) location.hash = '#/' + t.link[0]; }; }); }
  function tabs(root, defs, start) {
    root.innerHTML = '<div class="pv-tabs"></div><div class="pv-pane"></div>';
    const bar = root.querySelector('.pv-tabs'), pane = root.querySelector('.pv-pane'); let cur = start || defs[0].id;
    const show = (id) => { cur = id; bar.innerHTML = defs.map((d) => `<button data-t="${d.id}" class="${d.id === id ? 'on' : ''}">${d.label}</button>`).join(''); bar.querySelectorAll('button').forEach((b) => (b.onclick = () => show(b.dataset.t))); pane.innerHTML = ''; try { defs.find((d) => d.id === id).render(pane); } catch (e) { pane.innerHTML = '<div class="hint">Could not draw this tab: ' + esc(e.message) + '</div>'; } };
    show(cur);
  }

  /* ---------- charts (d3) ---------- */
  const svgBox = (box, h, M) => { box.innerHTML = ''; const W = box.clientWidth || 700; return { W, svg: d3.select(box).append('svg').attr('width', W).attr('height', h), M }; };
  const axisY = (svg, y, W, M, fmt) => svg.append('g').attr('transform', `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fmt || kf).tickSize(-(W - M.l - M.r))).call((g) => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', K0.line); g.selectAll('text').attr('fill', K0.mut).attr('font-size', 11); });
  const axisX = (svg, x, labels, W, H, M) => { const step = Math.ceil(labels.length / Math.max(2, Math.floor((W - M.l) / 62))); svg.append('g').attr('transform', `translate(0,${H - M.b})`).call(d3.axisBottom(x).tickValues(d3.range(labels.length).filter((i) => i % step === 0)).tickFormat((i) => labels[i]).tickSize(0)).call((g) => { g.select('.domain').attr('stroke', K0.line); g.selectAll('text').attr('fill', K0.mut).attr('font-size', 11).attr('dy', '1.2em'); }); };
  const hover = (svg, x, n, W, H, M, o) => {
    const g = svg.append('line').attr('y1', M.t).attr('y2', H - M.b).attr('stroke', '#9aa6bd').attr('stroke-dasharray', '3 3').style('display', 'none');
    const step = n > 1 ? x(1) - x(0) : 40;
    svg.append('rect').attr('x', M.l).attr('y', M.t).attr('width', W - M.l - M.r).attr('height', H - M.t - M.b).attr('fill', 'transparent').style('cursor', o.onClick ? 'pointer' : 'default')
      .on('mousemove', (e) => { const px = d3.pointer(e)[0]; const i = Math.max(0, Math.min(n - 1, Math.round((px - x(0)) / step))); g.style('display', null).attr('x1', x(i)).attr('x2', x(i)); if (T && o.tip) T.show(e, o.tip(i)); })
      .on('mouseleave', () => { g.style('display', 'none'); if (T) T.hide(); }).on('click', (e) => { const px = d3.pointer(e)[0]; const i = Math.max(0, Math.min(n - 1, Math.round((px - x(0)) / step))); o.onClick && o.onClick(i); });
  };
  function lineChart(box, o) {
    const H = o.h || 280, M = { t: 14, r: 16, b: 30, l: 52 }, { W, svg } = svgBox(box, H, M), n = o.labels.length, fmt = o.fmt || kf;
    const x = d3.scalePoint().domain(d3.range(n)).range([M.l + 12, W - M.r - 12]);
    const vals = o.series.flatMap((s) => s.vals).filter((v) => v != null).concat(o.hline != null ? [o.hline.v] : []);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), (d3.max(vals) || 1) * 1.08]).nice().range([H - M.b, M.t]);
    axisY(svg, y, W, M, fmt); axisX(svg, x, o.labels, W, H, M);
    if (o.band) svg.append('rect').attr('x', M.l).attr('width', W - M.l - M.r).attr('y', y(o.band[1])).attr('height', Math.max(0, y(o.band[0]) - y(o.band[1]))).attr('fill', '#fdeaea').attr('opacity', .6);
    if (o.hline) { svg.append('line').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y(o.hline.v)).attr('y2', y(o.hline.v)).attr('stroke', K0.bad).attr('stroke-width', 2).attr('stroke-dasharray', '2 4'); svg.append('text').attr('x', W - M.r - 2).attr('y', y(o.hline.v) - 5).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', K0.bad).text(o.hline.t); }
    o.series.forEach((s) => {
      if (s.area) svg.append('path').datum(s.vals.map((v, i) => [i, v])).attr('fill', s.color).attr('opacity', .12).attr('d', d3.area().defined((d) => d[1] != null).x((d) => x(d[0])).y0(y(0)).y1((d) => y(d[1])));
      svg.append('path').datum(s.vals.map((v, i) => [i, v])).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.w || 2.6).attr('stroke-dasharray', s.dash ? '7 5' : null).attr('d', d3.line().defined((d) => d[1] != null).x((d) => x(d[0])).y((d) => y(d[1])));
      if (s.dots !== false) svg.selectAll(null).data(s.vals.map((v, i) => [i, v]).filter((d) => d[1] != null)).join('circle').attr('cx', (d) => x(d[0])).attr('cy', (d) => y(d[1])).attr('r', s.dash ? 4 : 4.5).attr('fill', s.dash ? '#fff' : s.color).attr('stroke', (d) => (o.flag && o.flag(d[0], d[1], s) ? K0.bad : s.color)).attr('stroke-width', 2.3);
    });
    hover(svg, x, n, W, H, M, o);
  }
  function barChart(box, o) {   // stacked or single bars, optional line, signed
    const H = o.h || 260, M = { t: 14, r: 16, b: 30, l: 52 }, { W, svg } = svgBox(box, H, M), n = o.labels.length, fmt = o.fmt || kf;
    const x = d3.scaleBand().domain(d3.range(n)).range([M.l, W - M.r]).padding(.28);
    const stacks = o.labels.map((_, i) => { let p = 0, q = 0; return o.series.map((s) => { const v = s.vals[i] || 0; if (v >= 0) { const r = [p, p + v]; p += v; return r; } const r = [q + v, q]; q += v; return r; }); });
    const all2 = stacks.flat().flat().concat(o.line ? o.line.vals.filter((v) => v != null) : []);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(all2)), (d3.max(all2) || 1) * 1.08]).nice().range([H - M.b, M.t]);
    axisY(svg, y, W, M, fmt);
    const xc = d3.scalePoint().domain(d3.range(n)).range([x(0) + x.bandwidth() / 2, x(n - 1) + x.bandwidth() / 2]);
    axisX(svg, n > 1 ? xc : d3.scalePoint().domain([0]).range([W / 2, W / 2]), o.labels, W, H, M);
    svg.append('line').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', '#b9c2d3');
    o.series.forEach((s, si) => svg.selectAll(null).data(o.labels.map((_, i) => i)).join('rect').attr('x', (i) => x(i)).attr('width', x.bandwidth()).attr('y', (i) => y(stacks[i][si][1])).attr('height', (i) => Math.max(0, y(stacks[i][si][0]) - y(stacks[i][si][1]))).attr('fill', (i) => (s.cf ? s.cf(i) : s.color)).attr('rx', 2).attr('opacity', (i) => (s.op ? s.op(i) : 1)));
    if (o.line) { svg.append('path').datum(o.line.vals.map((v, i) => [i, v])).attr('fill', 'none').attr('stroke', o.line.color).attr('stroke-width', 2.5).attr('stroke-dasharray', o.line.dash ? '6 4' : null).attr('d', d3.line().defined((d) => d[1] != null).x((d) => xc(d[0])).y((d) => y(d[1]))); svg.selectAll(null).data(o.line.vals.map((v, i) => [i, v]).filter((d) => d[1] != null)).join('circle').attr('cx', (d) => xc(d[0])).attr('cy', (d) => y(d[1])).attr('r', 3.5).attr('fill', '#fff').attr('stroke', o.line.color).attr('stroke-width', 2); }
    hover(svg, n > 1 ? xc : d3.scalePoint().domain([0]).range([W / 2, W / 2]), n, W, H, M, o);
  }
  function hbar(box, rows, o) {   // rows [{l,v,v2,c,tip}]
    o = o || {}; const fmt = o.fmt || kf, rh = o.pair ? 48 : (o.rh || 26), L = o.left || 150, W = box.clientWidth || 500, H = rows.length * rh + 6; box.innerHTML = '';
    const mx = Math.max(1, ...rows.map((r) => Math.abs(r.v)), ...rows.map((r) => Math.abs(r.v2 || 0))), neg = rows.some((r) => r.v < 0), x0 = neg ? L + (W - L - 70) / 2 : L, sc = (neg ? (W - L - 70) / 2 : (W - L - 70)) / mx;
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H);
    rows.forEach((r, i) => { const y = i * rh + 3, w = Math.abs(r.v) * sc, g = svg.append('g').style('cursor', o.onClick ? 'pointer' : 'default');
      g.append('text').attr('x', L - 8).attr('y', y + rh * .62).attr('text-anchor', 'end').attr('font-size', 12).attr('fill', '#33405a').text(r.l.length > 24 ? r.l.slice(0, 23) + '…' : r.l);
      g.append('rect').attr('x', r.v < 0 ? x0 - w : x0).attr('y', y + 3).attr('width', w).attr('height', o.pair ? (rh - 9) / 2 : rh - 9).attr('rx', 3).attr('fill', r.c || K0.blue);
      if (o.pair && r.v2 != null) { g.append('rect').attr('x', x0).attr('y', y + 3 + (rh - 9) / 2).attr('width', Math.abs(r.v2) * sc).attr('height', (rh - 9) / 2).attr('rx', 3).attr('fill', K0.orange); g.append('text').attr('x', x0 + Math.abs(r.v2) * sc + 5).attr('y', y + rh * .8).attr('font-size', 11).attr('fill', '#33405a').text(fmt(r.v2)); }
      else if (r.v2 != null) g.append('rect').attr('x', x0).attr('y', y + rh / 2 - 6).attr('width', Math.abs(r.v2) * sc).attr('height', 3).attr('fill', '#222').attr('opacity', .55);
      g.append('text').attr('x', (r.v < 0 ? x0 - w - 5 : x0 + w + 5)).attr('y', y + (o.pair ? rh * .45 : rh * .62)).attr('text-anchor', r.v < 0 ? 'end' : 'start').attr('font-size', 11).attr('fill', '#33405a').text(fmt(r.v));
      g.append('rect').attr('x', 0).attr('y', y).attr('width', W).attr('height', rh).attr('fill', 'transparent').on('mousemove', (e) => { if (T && r.tip) T.show(e, r.tip); }).on('mouseleave', () => T && T.hide()).on('click', () => o.onClick && o.onClick(r, i)); });
  }
  function donut(box, parts, o) {
    o = o || {}; box.innerHTML = ''; const tot = parts.reduce((t, p) => t + p.v, 0) || 1, S = 170;
    box.innerHTML = `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div class="dn"></div><div class="dl" style="flex:1;min-width:150px;font-size:13px"></div></div>`;
    const svg = d3.select(box.querySelector('.dn')).append('svg').attr('width', S).attr('height', S), g = svg.append('g').attr('transform', `translate(${S / 2},${S / 2})`);
    const arc = d3.arc().innerRadius(S / 2 - 30).outerRadius(S / 2 - 3).padAngle(.015).cornerRadius(3);
    g.selectAll('path').data(d3.pie().sort(null).value((p) => p.v)(parts)).join('path').attr('d', arc).attr('fill', (d) => d.data.c).style('cursor', o.onClick ? 'pointer' : 'default')
      .on('mousemove', (e, d) => T && T.show(e, `<b>${esc(d.data.l)}</b><br>${(o.fmt || gbp)(d.data.v)} · ${pc(d.data.v / tot, 1)}`)).on('mouseleave', () => T && T.hide()).on('click', (e, d) => o.onClick && o.onClick(d.data));
    if (o.center) { g.append('text').attr('text-anchor', 'middle').attr('y', 2).attr('font-size', 22).attr('font-weight', 700).text(o.center[0]); g.append('text').attr('text-anchor', 'middle').attr('y', 20).attr('font-size', 11).attr('fill', K0.mut).text(o.center[1]); }
    box.querySelector('.dl').innerHTML = parts.slice(0, 8).map((p) => `<div style="display:flex;gap:8px;align-items:center;padding:2px 0"><i style="width:11px;height:11px;border-radius:3px;background:${p.c};flex:none"></i><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.l)}</span><b>${pc(p.v / tot)}</b></div>`).join('');
  }
  function waffle(box, units, o) {
    box.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:3px">' + units.map((u, i) => `<div data-i="${i}" style="width:16px;height:16px;border-radius:3px;background:${u.c};cursor:pointer"></div>`).join('') + '</div>';
    box.querySelectorAll('[data-i]').forEach((el) => { const u = units[+el.dataset.i]; el.onmousemove = (e) => T && T.show(e, u.tip); el.onmouseleave = () => T && T.hide(); el.onclick = () => o && o.onClick && o.onClick(u); });
  }
  function waffleGroups(box, groups, o) {   // groups [{title,color,items[{c,tip,...}],summary:[[label,value]]}]
    box.innerHTML = groups.map((g, gi) => `<div style="margin-bottom:16px"><div style="font-weight:700;color:#1d2a44;margin-bottom:6px"><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${g.color};margin-right:6px"></i>${esc(g.title)} <span style="font-weight:400;color:#6b7587">· ${g.items.length}</span></div><div style="display:flex;flex-wrap:wrap;gap:3px" data-g="${gi}">${g.items.map((u, i) => `<div data-i="${i}" style="width:16px;height:16px;border-radius:3px;background:${u.c};cursor:pointer"></div>`).join('')}</div><div style="display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:8px;font-size:12px;color:#33405a">${g.summary.map(([l, v]) => `<span><span style="color:#6b7587">${esc(l)}</span> <b>${v}</b></span>`).join('')}</div></div>`).join('');
    box.querySelectorAll('[data-g]').forEach((row) => { const g = groups[+row.dataset.g]; row.querySelectorAll('[data-i]').forEach((el) => { const u = g.items[+el.dataset.i]; el.onmousemove = (e) => T && T.show(e, u.tip); el.onmouseleave = () => T && T.hide(); el.onclick = () => o && o.onClick && o.onClick(u); }); });
  }
  function waterfall(box, steps, o) {   // steps [{l,v,total}]
    const H = (o && o.h) || 280, M = { t: 16, r: 12, b: 64, l: 52 }, { W, svg } = svgBox(box, H, M), n = steps.length;
    let run = 0; const raw = steps.map((s) => { if (s.total) { run = s.v; return { s, a: null, b: s.v }; } const a = run; run += s.v; return { s, a, b: run }; });
    const lv = raw.flatMap((b) => [b.a, b.b]).filter((v) => v != null), hi = Math.max(...lv), lo0 = Math.min(...lv), lo = lo0 >= 0 ? Math.max(0, lo0 - (hi - lo0) * 0.6) : lo0;
    const bars = raw.map((b) => (b.a == null ? Object.assign({}, b, { a: lo }) : b));
    const x = d3.scaleBand().domain(d3.range(n)).range([M.l, W - M.r]).padding(.25), vals = bars.flatMap((b) => [b.a, b.b]);
    const y = d3.scaleLinear().domain([Math.min(lo, d3.min(vals)), d3.max(vals) * 1.05]).nice().range([H - M.b, M.t]); axisY(svg, y, W, M);
    bars.forEach((b, i) => { const up = b.b >= b.a, col = b.s.total ? K0.blue : (b.s.v >= 0 ? K0.good : K0.bad);
      svg.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('y', y(Math.max(b.a, b.b))).attr('height', Math.max(1, Math.abs(y(b.a) - y(b.b)))).attr('fill', col).attr('rx', 2).on('mousemove', (e) => T && T.show(e, `<b>${esc(b.s.l)}</b><br>${b.s.total ? gbp(b.s.v) : (b.s.v >= 0 ? '+' : '') + gbp(b.s.v)}`)).on('mouseleave', () => T && T.hide());
      svg.append('text').attr('x', x(i) + x.bandwidth() / 2).attr('y', y(Math.max(b.a, b.b)) - 4).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#33405a').text(b.s.total ? kf(b.s.v) : (b.s.v >= 0 ? '+' : '') + kf(b.s.v));
      svg.append('text').attr('transform', `translate(${x(i) + x.bandwidth() / 2},${H - M.b + 10}) rotate(35)`).attr('font-size', 11).attr('fill', K0.mut).text(b.s.l.length > 22 ? b.s.l.slice(0, 21) + '…' : b.s.l); });
  }
  function scatter(box, pts, o) {
    const H = o.h || 320, M = { t: 14, r: 24, b: 40, l: 56 }, { W, svg } = svgBox(box, H, M);
    const x = d3.scaleLinear().domain([0, d3.max(pts, (p) => p.x) * 1.1 || 1]).nice().range([M.l, W - M.r]), y = d3.scaleLinear().domain([0, d3.max(pts, (p) => p.y) * 1.15 || 1]).nice().range([H - M.b, M.t]), r = d3.scaleSqrt().domain([0, d3.max(pts, (p) => p.r) || 1]).range([6, 26]);
    axisY(svg, y, W, M, o.fy); svg.append('g').attr('transform', `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(o.fx || kf)).call((g) => g.selectAll('text').attr('fill', K0.mut).attr('font-size', 11));
    svg.append('text').attr('x', W - M.r).attr('y', H - 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', K0.mut).text(o.xl); svg.append('text').attr('x', M.l + 4).attr('y', M.t + 8).attr('font-size', 11).attr('fill', K0.mut).text(o.yl);
    svg.selectAll(null).data(pts).join('circle').attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', (p) => r(p.r)).attr('fill', (p) => p.c || K0.blue).attr('opacity', .55).attr('stroke', '#fff').style('cursor', 'pointer')
      .on('mousemove', (e, p) => T && T.show(e, p.tip)).on('mouseleave', () => T && T.hide()).on('click', (e, p) => o.onClick && o.onClick(p));
    svg.selectAll(null).data(pts.filter((p) => p.label)).join('text').attr('x', (p) => x(p.x)).attr('y', (p) => y(p.y) - r(p.r) - 4).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#33405a').text((p) => p.label);
  }
  window.CT.pv = { K0, lab, labL, mi, norm, pc, kf, legend, card, tbl, drill, tiles, wireTiles, tabs, lineChart, barChart, hbar, donut, waffle, waffleGroups, waterfall, scatter, sparkSvg };
})();
