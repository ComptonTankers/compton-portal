window.CT = window.CT || {};
const CT = window.CT;
CT.blue = '#164698'; CT.orange = '#E3641D'; CT.soft = '#8FA9D6';
CT.MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
CT.fmt = {
  gbp: (v) => v == null || isNaN(v) ? '—' : Math.abs(v) >= 1e6 ? '£' + (v / 1e6).toFixed(2) + 'm' : Math.abs(v) >= 1e4 ? '£' + (v / 1e3).toFixed(1) + 'k' : '£' + d3.format(',.0f')(v),
  gbp0: (v) => v == null || isNaN(v) ? '—' : '£' + d3.format(',.0f')(v),
  pct: (v) => v == null || isNaN(v) ? '—' : d3.format('.1%')(v),
  int: (v) => v == null || isNaN(v) ? '—' : d3.format(',')(v),
  text: (v) => v == null ? '—' : String(v),
};
CT.enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
CT.label = (p, long) => {
  if (!p) return '—';
  if (/^\d{4}-\d{2}$/.test(p)) return CT.MONTHS[+p.slice(5) - 1] + ' ' + p.slice(0, 4);
  const fy = 2000 + +p.slice(2, 4);
  const q = p.match(/Q(\d)$/);
  if (q) {
    const r = [['Oct', 'Dec', fy - 1], ['Jan', 'Mar', fy], ['Apr', 'Jun', fy], ['Jul', 'Sep', fy]][+q[1] - 1];
    return 'Q' + q[1] + ' FY' + p.slice(2, 4) + (long ? ' (' + r[0] + '–' + r[1] + ' ' + r[2] + ')' : '');
  }
  return 'FY' + p.slice(2, 4) + (long ? ' (Oct ' + (fy - 1) + ' – Sep ' + fy + ')' : '');
};
CT.current = () => {
  const ps = dash.data('periods');
  if (ps.status !== 'ok') return null;
  const kind = dash.params().kind || 'month';
  const list = ps.data.filter((r) => r.kind === kind).sort((a, b) => (a.first_month < b.first_month ? -1 : 1));
  if (!list.length) return null;
  const want = dash.params().period;
  return list.find((r) => r.period === want) || list[list.length - 1];
};
CT.rowsFor = (id) => {
  const d = dash.data(id), cur = CT.current();
  if (d.status !== 'ok' || !cur) return null;
  return d.data.filter((r) => r.period === cur.period);
};
CT.empty = (el, msg) => {
  el.replaceChildren();
  const p = document.createElement('p');
  p.className = 'note'; p.style.margin = '0'; p.textContent = msg;
  el.append(p);
};
CT.failed = (el, ids) => ids.some((id) => dash.data(id).status === 'error');
CT.failLine = (el) => {
  el.replaceChildren();
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;min-height:120px;font-size:var(--cds-font-size-caption);color:var(--color-fg-muted)';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:.375rem;height:.375rem;border-radius:50%;background:var(--color-bad)';
  const t = document.createElement('span'); t.textContent = 'Failed to load';
  box.append(dot, t); el.append(box);
};
CT.tip = (el) => {
  let t = el.querySelector(':scope > .ct-tip');
  if (!t) { t = document.createElement('div'); t.className = 'ct-tip'; t.hidden = true; el.append(t); }
  return {
    show(ev, title, lines) {
      t.replaceChildren();
      const h = document.createElement('div'); h.className = 'k'; h.textContent = title; t.append(h);
      for (const [color, name, val] of lines) {
        const l = document.createElement('div');
        if (color) { const s = document.createElement('span'); s.className = 'ct-sw'; s.style.background = color; l.append(s); }
        l.append(document.createTextNode((name ? name + ': ' : '') + val));
        t.append(l);
      }
      t.hidden = false;
      const b = el.getBoundingClientRect();
      let x = ev.clientX - b.left + 12, y = ev.clientY - b.top + 12;
      const w = t.offsetWidth, h2 = t.offsetHeight;
      if (x + w > b.width) x = Math.max(0, ev.clientX - b.left - w - 12);
      if (y + h2 > b.height) y = Math.max(0, b.height - h2);
      t.style.left = x + 'px'; t.style.top = y + 'px';
    },
    hide() { t.hidden = true; },
  };
};
// Horizontal bars. rows: [{label, values:[...], colors:[...], names:[...]}]
CT.hbar = (el, rows, o) => {
  el.replaceChildren();
  const W = Math.max(260, el.clientWidth || 600);
  const n = rows[0].values.length, barH = n > 1 ? 12 : 20, rowH = n > 1 ? 34 : 30;
  const H = rows.length * rowH + (o.axis ? 22 : 4);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', o.aria || 'Bar chart')
    .style('font-family', 'var(--font-anthropic-sans)').style('font-size', '12px');
  const meas = svg.append('g');
  const lab = meas.selectAll('text').data(rows).join('text').text((d) => d.label);
  const vt = meas.selectAll('text.v').data(rows.flatMap((d) => d.values)).join('text').attr('class', 'v').attr('font-weight', 600).text((v) => o.fmt(v));
  let lw = 0, vw = 0;
  lab.each(function () { lw = Math.max(lw, this.getComputedTextLength()); });
  vt.each(function () { vw = Math.max(vw, this.getComputedTextLength()); });
  meas.remove();
  lw = Math.min(lw + 10, W * 0.45); vw += 8;
  const max = o.max ?? (d3.max(rows.flatMap((d) => d.values)) || 1);
  const x = d3.scaleLinear([0, max], [0, Math.max(40, W - lw - vw)]);
  if (o.axis) {
    const g = svg.append('g');
    for (const t of x.ticks(4)) {
      g.append('line').attr('x1', lw + x(t)).attr('x2', lw + x(t)).attr('y1', 0).attr('y2', rows.length * rowH).attr('stroke', 'var(--cds-chart-grid)');
      g.append('text').attr('x', lw + x(t)).attr('y', H - 6).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').text(o.axis(t));
    }
  }
  const tip = CT.tip(el);
  const gr = svg.selectAll('g.r').data(rows).join('g').attr('class', 'r').attr('transform', (d, i) => `translate(0,${i * rowH})`);
  gr.append('text').attr('x', lw - 10).attr('y', rowH / 2 + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').text((d) => d.label);
  gr.each(function (d) {
    const g = d3.select(this), top = (rowH - (barH * n + 2 * (n - 1))) / 2;
    d.values.forEach((v, j) => {
      const y = top + j * (barH + 2);
      g.append('rect').attr('x', lw).attr('y', y).attr('height', barH).attr('width', Math.max(2, x(v || 0))).attr('rx', 3).attr('fill', d.colors[j]);
      g.append('text').attr('x', lw + Math.max(2, x(v || 0)) + 5).attr('y', y + barH / 2 + 4).attr('font-weight', 600).attr('fill', 'var(--color-fg)').text(o.fmt(v));
    });
    g.append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', rowH).attr('fill', 'transparent')
      .on('mousemove', (ev) => tip.show(ev, d.label, d.values.map((v, j) => [d.colors[j], d.names ? d.names[j] : '', o.fmt(v)])))
      .on('mouseleave', () => tip.hide());
  });
};
CT.statusOk = (el, ids) => {
  if (ids.some((id) => dash.data(id).status === 'error')) { CT.failLine(el); return false; }
  if (ids.some((id) => dash.data(id).status !== 'ok') || !CT.current()) { el.replaceChildren(); return false; }
  return true;
};

// ---------- controls ----------
CT.tab = CT.tab || 'overview';
CT.showTab = (name) => {
  CT.tab = name;
  document.querySelectorAll('.ct-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.ct-page').forEach((s) => { s.hidden = s.dataset.page !== name; });
};
document.querySelectorAll('.ct-tab').forEach((b) => b.addEventListener('click', () => { CT.showTab(b.dataset.tab); dash.setLink(b.dataset.tab); }));
const hash = location.hash.slice(1);
if (['overview', 'utilisation', 'revenue', 'units'].includes(hash)) CT.showTab(hash);
document.querySelectorAll('.ct-kind').forEach((b) => b.addEventListener('click', () => dash.setParams({ kind: b.dataset.kind, period: null })));
CT.sort = CT.sort || { col: 'revenue', dir: -1 };
document.querySelectorAll('.ct-sort').forEach((b) => b.addEventListener('click', () => {
  const c = b.dataset.col;
  CT.sort = { col: c, dir: CT.sort.col === c ? -CT.sort.dir : (c === 'unit' || c === 'type' || c === 'status' ? 1 : -1) };
  document.querySelectorAll('.ct-sort').forEach((x) => x.closest('th').setAttribute('aria-sort', x.dataset.col === c ? (CT.sort.dir > 0 ? 'ascending' : 'descending') : 'none'));
  dash.draw('unit-rows');
}));
document.querySelectorAll('.ct-search').forEach((s) => s.addEventListener('input', () => dash.draw('unit-rows')));
dash.onData(() => {
  const kind = dash.params().kind || 'month';
  document.querySelectorAll('.ct-kind').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  document.querySelectorAll('.ct-page').forEach((s) => { s.hidden = s.dataset.page !== CT.tab; });
});

// ---------- small drawings ----------
dash.draw('period-select', (sel) => {
  const ps = dash.data('periods'), kind = dash.params().kind || 'month';
  const list = ps.status === 'ok' ? ps.data.filter((r) => r.kind === kind).sort((a, b) => (a.first_month < b.first_month ? 1 : -1)) : [];
  sel.replaceChildren(...list.map((r) => new Option(CT.label(r.period, true), r.period)));
  const cur = CT.current();
  if (cur) sel.value = cur.period;
  sel.onchange = () => dash.setParams({ period: sel.value });
});
dash.draw('period-label', (el) => { const c = CT.current(); el.textContent = c ? CT.label(c.period, true) : '—'; });
dash.draw('period-name', (el) => { const c = CT.current(); el.textContent = c ? CT.label(c.period, true) : '—'; });
dash.draw('kpi', (el) => {
  const id = el.dataset.source, f = el.dataset.field, cur = CT.current(), d = dash.data(id);
  const row = cur && d.status === 'ok' ? d.data.find((r) => r.period === cur.period) : null;
  if (!row) { el.textContent = '—'; el.removeAttribute('data-where'); return; }
  el.setAttribute('data-where', 'period=' + CT.enc(cur.period));
  el.textContent = CT.fmt[el.dataset.fmt || 'text'](row[f]);
});
dash.draw('delta', (el) => {
  const f = el.dataset.field, cur = CT.current(), d = dash.data('summary');
  const row = cur && d.status === 'ok' ? d.data.find((r) => r.period === cur.period) : null;
  el.classList.remove('up', 'down');
  if (!row) { el.textContent = '—'; return; }
  el.setAttribute('data-where', 'period=' + CT.enc(cur.period));
  const v = row[f];
  if (v == null) { el.textContent = row.complete ? 'No earlier period loaded to compare' : 'Period not complete yet'; return; }
  el.classList.add(v >= 0 ? 'up' : 'down');
  const txt = f === 'utilisation_change' ? (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pts' : (v >= 0 ? '+' : '') + d3.format('.1%')(v);
  el.textContent = txt + ' vs ' + CT.label(row.previous_period);
});
dash.draw('coverage', (el) => {
  const cur = CT.current(), d = dash.data('summary');
  const row = cur && d.status === 'ok' ? d.data.find((r) => r.period === cur.period) : null;
  if (!row || row.kind === 'month') { el.textContent = ''; return; }
  const full = row.kind === 'quarter' ? 3 : 12;
  el.textContent = row.months_loaded < full ? 'Based on ' + row.months_loaded + ' of ' + full + ' months loaded so far.' : '';
});

// ---------- charts ----------
dash.draw('chart-turnover-type', (el) => {
  if (!CT.statusOk(el, ['types'])) return;
  const rows = CT.rowsFor('type_summary').filter((r) => r.turnover > 0).sort((a, b) => b.turnover - a.turnover);
  if (!rows.length) return CT.empty(el, 'No turnover in this period.');
  CT.hbar(el, rows.map((r, i) => ({ label: r.type, values: [r.turnover], colors: [i === 0 ? CT.orange : CT.blue] })), { fmt: CT.fmt.gbp, aria: 'Turnover by equipment type' });
});
dash.draw('chart-rpu', (el) => {
  if (!CT.statusOk(el, ['types'])) return;
  const rows = CT.rowsFor('type_summary').filter((r) => r.revenue_per_unit_month > 0).sort((a, b) => b.revenue_per_unit_month - a.revenue_per_unit_month);
  if (!rows.length) return CT.empty(el, 'No hire revenue in this period.');
  CT.hbar(el, rows.map((r, i) => ({ label: r.type + ' (' + r.units + ')', values: [r.revenue_per_unit_month], colors: [i === 0 ? CT.orange : CT.blue] })), { fmt: CT.fmt.gbp0, aria: 'Revenue per unit per month by type' });
});
dash.draw('chart-ytd-type', (el) => {
  if (!CT.statusOk(el, ['types'])) return;
  const rows = CT.rowsFor('type_summary').filter((r) => r.ytd_revenue > 0).sort((a, b) => b.ytd_revenue - a.ytd_revenue);
  if (!rows.length) return CT.empty(el, 'No year-to-date revenue.');
  CT.hbar(el, rows.map((r, i) => ({ label: r.type, values: [r.ytd_revenue], colors: [i === 0 ? CT.orange : CT.blue] })), { fmt: CT.fmt.gbp, aria: 'Year-to-date hire revenue by type' });
});
dash.draw('chart-customers', (el) => {
  if (!CT.statusOk(el, ['customers'])) return;
  const rows = CT.rowsFor('customer_summary').filter((r) => r.rank <= 10).sort((a, b) => a.rank - b.rank);
  if (!rows.length) return CT.empty(el, 'No customers in this period.');
  CT.hbar(el, rows.map((r, i) => ({ label: r.customer, values: [r.revenue], colors: [i === 0 ? CT.orange : CT.blue] })), { fmt: CT.fmt.gbp, aria: 'Top 10 customers' });
});
dash.draw('chart-util-type', (el) => {
  if (!CT.statusOk(el, ['types'])) return;
  const rows = CT.rowsFor('type_summary').filter((r) => r.units > 0).sort((a, b) => b.units - a.units || (b.utilisation || 0) - (a.utilisation || 0));
  if (!rows.length) return CT.empty(el, 'No units in this period.');
  CT.hbar(el, rows.map((r) => ({ label: r.type + ' (' + r.units + ')', values: [r.utilisation || 0, r.ytd_utilisation || 0], colors: [CT.orange, CT.blue], names: ['Selected period', 'FY to date'] })),
    { fmt: (v) => d3.format('.0%')(v), max: 1, axis: (t) => d3.format('.0%')(t), aria: 'Time utilisation by equipment type' });
});
dash.draw('fleet-stack', (el) => {
  const cur = CT.current(), d = dash.data('summary');
  const row = cur && d.status === 'ok' ? d.data.find((r) => r.period === cur.period) : null;
  el.replaceChildren();
  if (!row || !row.units) return;
  const tip = CT.tip(el.parentElement);
  for (const [v, c, name] of [[row.units_full, CT.blue, 'On hire all month'], [row.units_part, CT.soft, 'Part of the month'], [row.units_idle, CT.orange, 'Off hire all month']]) {
    if (!v) continue;
    const s = document.createElement('div');
    s.style.cssText = `flex:${v};background:${c}`;
    s.addEventListener('mousemove', (ev) => tip.show(ev, name, [[c, '', v + ' units (' + d3.format('.0%')(v / row.units) + ')']]));
    s.addEventListener('mouseleave', () => tip.hide());
    el.append(s);
  }
});
dash.draw('chart-trend', (el) => {
  const m = dash.data('months'), cur = CT.current();
  if (m.status === 'error') return CT.failLine(el);
  if (m.status !== 'ok' || !cur) { el.replaceChildren(); return; }
  el.replaceChildren();
  const rows = [...m.data].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-24);
  const W = Math.max(260, el.clientWidth || 600), H = 220, top = 22, bottom = 24, left = 8;
  const x = d3.scaleBand(rows.map((r) => r.month), [left, W - 8]).paddingInner(0.25).paddingOuter(0.1);
  const y = d3.scaleLinear([0, d3.max(rows, (r) => +r.turnover) || 1], [H - bottom, top]);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Monthly turnover')
    .style('font-family', 'var(--font-anthropic-sans)').style('font-size', '12px');
  const bw = Math.min(48, x.bandwidth());
  const tip = CT.tip(el);
  const inSel = (r) => r.month >= cur.first_month && r.month <= cur.last_month;
  const g = svg.selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(${x(r.month) + (x.bandwidth() - bw) / 2},0)`);
  g.append('rect').attr('y', (r) => y(+r.turnover)).attr('height', (r) => H - bottom - y(+r.turnover)).attr('width', bw).attr('rx', 3).attr('fill', (r) => (inSel(r) ? CT.orange : CT.blue));
  g.append('text').attr('x', bw / 2).attr('y', (r) => y(+r.turnover) - 6).attr('text-anchor', 'middle').attr('font-weight', 600).attr('fill', 'var(--color-fg)').text((r) => (rows.length <= 12 || inSel(r) ? CT.fmt.gbp(+r.turnover) : ''));
  g.append('text').attr('x', bw / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').text((r) => CT.MONTHS[+r.month.slice(5) - 1].slice(0, 3) + ' ' + r.month.slice(2, 4));
  g.append('rect').attr('x', -4).attr('width', bw + 8).attr('y', 0).attr('height', H).attr('fill', 'transparent')
    .on('mousemove', (ev, r) => tip.show(ev, CT.label(r.month), [['', 'Turnover', CT.fmt.gbp0(+r.turnover)], ['', 'Customers', r.customers]]))
    .on('mouseleave', () => tip.hide());
  svg.append('line').attr('x1', left).attr('x2', W - 8).attr('y1', H - bottom).attr('y2', H - bottom).attr('stroke', 'var(--cds-chart-axis)');
});
dash.draw('chart-trend-util', (el) => {
  const d = dash.data('summary');
  if (d.status === 'error') return CT.failLine(el);
  if (d.status !== 'ok') { el.replaceChildren(); return; }
  el.replaceChildren();
  const rows = d.data.filter((r) => r.kind === 'month').sort((a, b) => (a.period < b.period ? -1 : 1)).slice(-24);
  const W = Math.max(260, el.clientWidth || 600), H = 220, top = 22, bottom = 24, left = 40;
  const x = d3.scalePoint(rows.map((r) => r.period), [left + 24, W - 24]).padding(rows.length === 1 ? 0.5 : 0);
  const y = d3.scaleLinear([0, 1], [H - bottom, top]);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Monthly time utilisation')
    .style('font-family', 'var(--font-anthropic-sans)').style('font-size', '12px');
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append('line').attr('x1', left).attr('x2', W - 8).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('text').attr('x', left - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').text(d3.format('.0%')(t));
  }
  svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', CT.blue).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
    .attr('d', d3.line((r) => x(r.period), (r) => y(r.utilisation || 0)));
  const tip = CT.tip(el);
  const g = svg.selectAll('g.p').data(rows).join('g').attr('class', 'p');
  g.append('circle').attr('cx', (r) => x(r.period)).attr('cy', (r) => y(r.utilisation || 0)).attr('r', 5).attr('fill', CT.orange).attr('stroke', 'var(--color-panel)').attr('stroke-width', 2);
  const lastP = rows[rows.length - 1];
  if (lastP) svg.append('text').attr('x', x(lastP.period)).attr('y', y(lastP.utilisation || 0) - 10).attr('text-anchor', 'middle').attr('font-weight', 600).attr('fill', 'var(--color-fg)').text(CT.fmt.pct(lastP.utilisation));
  g.append('text').attr('x', (r) => x(r.period)).attr('y', H - 6).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').text((r) => CT.MONTHS[+r.period.slice(5) - 1].slice(0, 3) + ' ' + r.period.slice(2, 4));
  g.append('circle').attr('cx', (r) => x(r.period)).attr('cy', (r) => y(r.utilisation || 0)).attr('r', 14).attr('fill', 'transparent')
    .on('mousemove', (ev, r) => tip.show(ev, CT.label(r.period), [['', 'Utilisation', CT.fmt.pct(r.utilisation)], ['', 'Days on hire', d3.format(',')(r.on_hire_days) + ' of ' + d3.format(',')(r.chargeable_days)]]))
    .on('mouseleave', () => tip.hide());
});


// ---------- filters + group overviews (shared) ----------
CT.flt = CT.flt || { unit: { type: '', status: '' }, hp: { type: '', status: '', fin: '' } };
CT.mkFilters = (key, inputSel, defs, redraw) => {
  const inp = document.querySelector(inputSel); if (!inp || inp.dataset.flt) return; inp.dataset.flt = '1';
  const wrap = document.createElement('div'); wrap.className = 'ct-flt';
  defs.forEach((d) => { const s = document.createElement('select'); s.dataset.k = d.k; s.dataset.key = key; s.setAttribute('aria-label', d.label);
    s.addEventListener('change', () => { CT.flt[key][d.k] = s.value; redraw(); }); wrap.append(s); });
  const clr = document.createElement('button'); clr.type = 'button'; clr.className = 'ct-clr'; clr.textContent = 'Clear filters';
  clr.addEventListener('click', () => { for (const k in CT.flt[key]) CT.flt[key][k] = ''; inp.value = ''; redraw(); });
  const cnt = document.createElement('span'); cnt.className = 'ct-cnt'; cnt.id = 'cnt-' + key; wrap.append(clr, cnt);
  const grp = document.createElement('div'); grp.className = 'ct-grp ct-tablebox'; grp.id = 'grp-' + key;
  inp.after(wrap); wrap.after(grp);
  CT.fltDefs = CT.fltDefs || {}; CT.fltDefs[key] = defs;
};
CT.fillSel = (key, k, allLabel, values) => {
  const s = document.querySelector('select[data-key="' + key + '"][data-k="' + k + '"]'); if (!s) return;
  const cur = CT.flt[key][k], vals = [...new Set(values.filter(Boolean))].sort();
  s.replaceChildren(); const o0 = document.createElement('option'); o0.value = ''; o0.textContent = allLabel; s.append(o0);
  vals.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.append(o); });
  if (cur && !vals.includes(cur)) CT.flt[key][k] = ''; s.value = CT.flt[key][k];
};
// grouped overview table: groups = [{name, cells:[text,...], cls:[..]}], click a row to filter by it
CT.drawGroups = (key, heads, groups, active, onPick) => {
  const box = document.getElementById('grp-' + key); if (!box) return;
  const t = document.createElement('table'), th = document.createElement('thead'), hr = document.createElement('tr');
  heads.forEach((h, i) => { const c = document.createElement('th'); c.textContent = h; if (i) c.className = 'n'; hr.append(c); }); th.append(hr);
  const tb = document.createElement('tbody');
  groups.forEach((g) => { const tr = document.createElement('tr'); tr.className = 'ct-grow' + (g.name === active ? ' on' : ''); tr.tabIndex = 0;
    const pick = () => onPick(g.name === active ? '' : g.name); tr.addEventListener('click', pick); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
    CT.cell(tr, g.name); g.cells.forEach((x, i) => { const td = CT.cell(tr, x, 'n'); if (g.cls && g.cls[i]) td.classList.add(g.cls[i]); }); tb.append(tr); });
  t.append(th, tb); box.replaceChildren(t);
};

// ---------- tables ----------
CT.cell = (tr, text, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; tr.append(td); return td; };
CT.keyOf = (r) => encodeURIComponent(r.period) + ',' + encodeURIComponent(r.unit);
dash.draw('offhire-rows', (tb) => {
  tb.replaceChildren();
  const rows = CT.rowsFor('unit_summary');
  if (!rows) return;
  rows.filter((r) => r.status === 'Off hire').sort((a, b) => (a.ytd_utilisation ?? 0) - (b.ytd_utilisation ?? 0) || b.chargeable_days - a.chargeable_days).forEach((r) => {
    const tr = document.createElement('tr'); tr.dataset.key = CT.keyOf(r);
    CT.cell(tr, r.unit); CT.cell(tr, r.type); CT.cell(tr, CT.fmt.int(r.chargeable_days), 'n');
    CT.cell(tr, CT.fmt.pct(r.ytd_utilisation), 'n'); CT.cell(tr, CT.fmt.gbp0(r.ytd_revenue), 'n');
    tb.append(tr);
  });
});
dash.draw('unit-rows', (tb) => {
  tb.replaceChildren();
  const rows = CT.rowsFor('unit_summary');
  if (!rows) return;
  CT.mkFilters('unit', '.ct-search', [{ k: 'type', label: 'Type' }, { k: 'status', label: 'Status' }], () => dash.draw('unit-rows'));
  const q = (document.querySelector('.ct-search')?.value || '').trim().toLowerCase(), F = CT.flt.unit;
  CT.fillSel('unit', 'type', 'All types', rows.map((r) => r.type)); CT.fillSel('unit', 'status', 'All statuses', rows.map((r) => r.status));
  const { col, dir } = CT.sort;
  const base = rows.filter((r) => (!q || (r.unit + ' ' + r.type + ' ' + r.status).toLowerCase().includes(q)) && (!F.status || r.status === F.status));
  const list = base.filter((r) => !F.type || r.type === F.type)
    .sort((a, b) => { const x = a[col], y = b[col]; if (typeof x === 'string' || typeof y === 'string') return dir * String(x ?? '').localeCompare(String(y ?? '')); return dir * ((x ?? -1) - (y ?? -1)); });
  const gm = new Map(); base.forEach((r) => { if (!gm.has(r.type)) gm.set(r.type, { n: 0, off: 0, cd: 0, od: 0, rev: 0, ytd: 0 }); const g = gm.get(r.type); g.n++; if (r.status === 'Off hire') g.off++; g.cd += +r.chargeable_days || 0; g.od += +r.on_hire_days || 0; g.rev += +r.revenue || 0; g.ytd += +r.ytd_revenue || 0; });
  const groups = [...gm.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([name, g]) => ({ name, cells: [CT.fmt.int(g.n), CT.fmt.int(g.n - g.off), CT.fmt.int(g.off), CT.fmt.pct(g.cd ? g.od / g.cd : null), CT.fmt.gbp0(g.rev), CT.fmt.gbp0(g.n ? g.rev / g.n : 0), CT.fmt.gbp0(g.ytd)], cls: [0, 0, g.off ? 'down' : '', 0, 0, 0, 0] }));
  CT.drawGroups('unit', ['Type', 'Units', 'On hire', 'Off hire', 'Utilisation', 'Hire revenue', 'Per unit', 'FY revenue'], groups, F.type, (v) => { CT.flt.unit.type = v; dash.draw('unit-rows'); });
  const cnt = document.getElementById('cnt-unit'); if (cnt) cnt.textContent = 'Showing ' + list.length + ' of ' + rows.length + ' units · ' + CT.fmt.gbp0(list.reduce((s, r) => s + (+r.revenue || 0), 0)) + ' revenue';
  for (const r of list) {
    const tr = document.createElement('tr'); tr.dataset.key = CT.keyOf(r);
    CT.cell(tr, r.unit); CT.cell(tr, r.type);
    const st = CT.cell(tr, ''); const pill = document.createElement('span');
    pill.className = 'pill ' + (r.status === 'Off hire' ? 'off' : r.status === 'Part' ? 'part' : 'full'); pill.textContent = r.status; st.append(pill);
    CT.cell(tr, CT.fmt.int(r.chargeable_days), 'n'); CT.cell(tr, CT.fmt.int(r.on_hire_days), 'n');
    const u = CT.cell(tr, ''); const bar = document.createElement('span'); bar.className = 'bar';
    bar.style.width = Math.round(60 * (r.utilisation || 0)) + 'px';
    if (r.status === 'Off hire') bar.style.background = CT.orange;
    u.append(bar, document.createTextNode(CT.fmt.pct(r.utilisation)));
    CT.cell(tr, CT.fmt.gbp0(r.revenue), 'n'); CT.cell(tr, CT.fmt.pct(r.ytd_utilisation), 'n'); CT.cell(tr, CT.fmt.gbp0(r.ytd_revenue), 'n');
    tb.append(tr);
  }
});

// ---------- time utilisation by type: expandable groups with every unit ----------
CT.ug = CT.ug || { open: new Set(), q: '', status: '', wired: false };
dash.draw('util-groups', (box) => {
  const rows = CT.rowsFor('unit_summary'), types = CT.rowsFor('type_summary') || [];
  box.replaceChildren();
  if (!rows) return;
  const U = CT.ug, redraw = () => dash.draw('util-groups');
  if (!U.wired) {
    U.wired = true;
    const q = document.querySelector('.ct-search2'); if (q) q.addEventListener('input', () => { U.q = q.value.trim().toLowerCase(); redraw(); });
    const st = document.getElementById('ug-status'); if (st) st.addEventListener('change', () => { U.status = st.value; redraw(); });
    document.getElementById('ug-open')?.addEventListener('click', () => { document.querySelectorAll('#card-util-groups tr.ug-g').forEach((tr) => U.open.add(tr.dataset.t)); redraw(); });
    document.getElementById('ug-shut')?.addEventListener('click', () => { U.open.clear(); redraw(); });
  }
  const base = rows.filter((r) => (!U.status || r.status === U.status) && (!U.q || (r.unit + ' ' + r.type).toLowerCase().includes(U.q)));
  const gm = new Map();
  base.forEach((r) => { const k = r.type || 'Other'; if (!gm.has(k)) gm.set(k, { units: [], cd: 0, od: 0, rev: 0, ytd: 0, off: 0 }); const g = gm.get(k); g.units.push(r); g.cd += +r.chargeable_days || 0; g.od += +r.on_hire_days || 0; g.rev += +r.revenue || 0; g.ytd += +r.ytd_revenue || 0; if (r.status === 'Off hire') g.off++; });
  const fy = (name, g) => { const t = types.find((x) => x.type === name); if (t && t.ytd_utilisation != null && !U.q && !U.status) return t.ytd_utilisation; const v = g.units.map((u) => u.ytd_utilisation).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const t = document.createElement('table'), hr = document.createElement('tr');
  ['Type / unit', 'Status', 'Chargeable days', 'Days on hire', 'Utilisation', 'FY to date', 'Hire revenue', 'FY revenue'].forEach((h, i) => { const th = document.createElement('th'); th.textContent = h; if (i > 1) th.className = 'n'; hr.append(th); });
  const thd = document.createElement('thead'); thd.append(hr); const tb = document.createElement('tbody');
  const utilCell = (tr, v, off) => { const td = CT.cell(tr, '', 'n'); const bar = document.createElement('span'); bar.className = 'bar'; bar.style.width = Math.round(60 * (v || 0)) + 'px'; if (off) bar.style.background = CT.orange; td.append(bar, document.createTextNode(CT.fmt.pct(v))); };
  [...gm.entries()].sort((a, b) => b[1].rev - a[1].rev).forEach(([name, g]) => {
    const open = U.open.has(name) || (!!U.q && g.units.length > 0);
    const tr = document.createElement('tr'); tr.className = 'ug-g'; tr.dataset.t = name; tr.tabIndex = 0;
    const tog = () => { if (U.open.has(name)) U.open.delete(name); else U.open.add(name); redraw(); };
    tr.addEventListener('click', tog); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') tog(); });
    CT.cell(tr, (open ? '▾ ' : '▸ ') + name + ' (' + g.units.length + ')');
    CT.cell(tr, g.units.length - g.off + ' on hire' + (g.off ? ' · ' + g.off + ' off' : ''), g.off ? 'down' : '');
    CT.cell(tr, CT.fmt.int(g.cd), 'n'); CT.cell(tr, CT.fmt.int(g.od), 'n'); utilCell(tr, g.cd ? Math.min(1, g.od / g.cd) : null);
    CT.cell(tr, CT.fmt.pct(fy(name, g)), 'n'); CT.cell(tr, CT.fmt.gbp0(g.rev), 'n'); CT.cell(tr, CT.fmt.gbp0(g.ytd), 'n'); tb.append(tr);
    if (open) g.units.slice().sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || a.unit.localeCompare(b.unit)).forEach((r) => {
      const u = document.createElement('tr'); u.className = 'ug-u';
      CT.cell(u, r.unit);
      const st = CT.cell(u, ''); const pill = document.createElement('span'); pill.className = 'pill ' + (r.status === 'Off hire' ? 'off' : r.status === 'Part' ? 'part' : 'full'); pill.textContent = r.status; st.append(pill);
      CT.cell(u, CT.fmt.int(r.chargeable_days), 'n'); CT.cell(u, CT.fmt.int(r.on_hire_days), 'n'); utilCell(u, r.utilisation, r.status === 'Off hire');
      CT.cell(u, CT.fmt.pct(r.ytd_utilisation), 'n'); CT.cell(u, CT.fmt.gbp0(r.revenue), 'n'); CT.cell(u, CT.fmt.gbp0(r.ytd_revenue), 'n'); tb.append(u);
    });
  });
  if (!gm.size) { const tr = document.createElement('tr'); const td = CT.cell(tr, 'No units match.'); td.colSpan = 8; tb.append(tr); }
  t.append(thd, tb); box.append(t);
});
