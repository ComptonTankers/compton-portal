
dash.calc('hp_units', {
  inputs: ['units', 'hp'],
  title: 'HP cost against each unit',
  description: 'Each unit\'s hire revenue set against its HP payments for each month, quarter and financial year. A month counts an HP payment when it falls between the agreement\'s start and end dates.',
  fn: (units, hp) => {
    const keys = (m) => {
      const y = +m.slice(0, 4), mo = +m.slice(5, 7), fy = mo >= 10 ? y + 1 : y;
      const q = mo >= 10 ? 1 : mo <= 3 ? 2 : mo <= 6 ? 3 : 4, f = 'FY' + String(fy).slice(2);
      return [['month', m], ['quarter', f + ' Q' + q], ['year', f]];
    };
    const H = new Map(hp.filter((h) => h.unit).map((h) => [String(h.unit).trim().toUpperCase(), h]));
    const g = new Map();
    for (const r of [...units].sort((a, b) => (a.month < b.month ? -1 : 1))) {
      const h = H.get(String(r.unit).trim().toUpperCase());
      const onHp = h && String(h.status).toUpperCase() === 'HP';
      const start = h && h.start_date ? String(h.start_date).slice(0, 7) : null;
      const end = h && h.end_date ? String(h.end_date).slice(0, 7) : null;
      const active = onHp && (!start || r.month >= start) && (!end || r.month <= end);
      const cost = active ? +h.monthly_payment || 0 : 0;
      for (const [, period] of keys(r.month)) {
        const k = period + '|' + r.unit;
        if (!g.has(k)) g.set(k, { period, unit: r.unit, type: r.type, h, revenue: 0, hp_cost: 0, chargeable_days: 0, on_hire_days: 0 });
        const a = g.get(k);
        a.revenue += +r.revenue || 0; a.hp_cost += cost;
        a.chargeable_days += +r.chargeable_days || 0; a.on_hire_days += +r.on_hire_days || 0;
      }
    }
    return [...g.values()].map((a) => {
      const h = a.h, util = a.chargeable_days ? a.on_hire_days / a.chargeable_days : null;
      const st = !h ? 'Not in HP schedule' : String(h.status).toUpperCase() === 'HP' ? 'HP' : String(h.status).toUpperCase() === 'OWNED' ? 'Owned' : 'Other';
      return {
        period: a.period, unit: a.unit, type: a.type, status: st,
        finance_company: h ? h.finance_company || '' : '', agreement_ref: h ? h.agreement_ref || '' : '',
        end_date: h && h.end_date ? String(h.end_date).slice(0, 10) : '',
        monthly_payment: st === 'HP' ? +h.monthly_payment || 0 : 0,
        balance_outstanding: st === 'HP' ? +h.balance_outstanding || 0 : 0,
        hp_cost: a.hp_cost, revenue: a.revenue, revenue_after_hp: a.revenue - a.hp_cost,
        cover: a.hp_cost ? a.revenue / a.hp_cost : null,
        chargeable_days: a.chargeable_days, on_hire_days: a.on_hire_days, utilisation: util,
        breakeven_utilisation: a.hp_cost && a.revenue && util != null ? Math.min(9.99, util * a.hp_cost / a.revenue) : null,
      };
    });
  },
});

dash.calc('hp_summary', {
  inputs: ['hp_units'],
  title: 'HP totals by period',
  description: 'Total HP cost against total hire revenue for each period, with the number of financed units not covering their payments.',
  fn: (hp_units) => {
    const by = new Map();
    for (const r of hp_units) { if (!by.has(r.period)) by.set(r.period, []); by.get(r.period).push(r); }
    return [...by.entries()].map(([period, list]) => {
      const s = (rows, k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
      const fin = list.filter((r) => r.status === 'HP');
      const hp_cost = s(list, 'hp_cost'), revenue = s(list, 'revenue');
      return {
        period, units_hp: fin.length, units_owned: list.filter((r) => r.status === 'Owned').length,
        units_not_listed: list.filter((r) => r.status === 'Not in HP schedule').length,
        hp_cost, revenue, revenue_after_hp: revenue - hp_cost, hp_share: revenue ? hp_cost / revenue : null,
        revenue_hp_units: s(fin, 'revenue'),
        units_not_covering: fin.filter((r) => r.hp_cost > 0 && r.revenue < r.hp_cost).length,
        units_idle_on_hp: fin.filter((r) => r.hp_cost > 0 && r.on_hire_days === 0).length,
        monthly_commitment: s(fin, 'monthly_payment'), balance_outstanding: s(fin, 'balance_outstanding'),
      };
    });
  },
});

dash.calc('hp_type', {
  inputs: ['hp_units'],
  title: 'HP cost and revenue by type',
  description: 'Hire revenue and HP cost added up per equipment type for each period.',
  fn: (hp_units) => {
    const g = new Map();
    for (const r of hp_units) {
      const k = r.period + '|' + r.type;
      if (!g.has(k)) g.set(k, { period: r.period, type: r.type, revenue: 0, hp_cost: 0, units_hp: 0 });
      const a = g.get(k); a.revenue += r.revenue; a.hp_cost += r.hp_cost; if (r.status === 'HP') a.units_hp += 1;
    }
    return [...g.values()].map((a) => ({ ...a, revenue_after_hp: a.revenue - a.hp_cost }));
  },
});

dash.calc('hp_ending', {
  inputs: ['hp', 'months'],
  title: 'HP agreements ending',
  description: 'HP units grouped by how many months remain from the latest month loaded to the agreement end date, with the monthly payments that stop.',
  fn: (hp, months) => {
    const ref = months.map((m) => m.month).sort().pop();
    const bands = [['0–3 months', 0, 3], ['4–6 months', 4, 6], ['7–12 months', 7, 12], ['Over 12 months', 13, 1e9]];
    const out = bands.map(([band]) => ({ band, units: 0, monthly_payment: 0, balance_outstanding: 0 }));
    if (!ref) return out;
    const [ry, rm] = ref.split('-').map(Number);
    for (const h of hp) {
      if (String(h.status).toUpperCase() !== 'HP' || !h.end_date) continue;
      const [ey, em] = String(h.end_date).slice(0, 7).split('-').map(Number);
      const left = (ey - ry) * 12 + (em - rm);
      if (left < 0) continue;
      const i = bands.findIndex(([, lo, hi]) => left >= lo && left <= hi);
      out[i].units += 1; out[i].monthly_payment += +h.monthly_payment || 0; out[i].balance_outstanding += +h.balance_outstanding || 0;
    }
    return out;
  },
});

// ---------- HP & finance ----------
CT.hpSort = CT.hpSort || { col: 'revenue_after_hp', dir: 1 };
document.querySelectorAll('.ct-hpsort').forEach((b) => b.addEventListener('click', () => {
  const c = b.dataset.col, txt = ['unit', 'type', 'status', 'finance_company', 'end_date'].includes(c);
  CT.hpSort = { col: c, dir: CT.hpSort.col === c ? -CT.hpSort.dir : (txt ? 1 : -1) };
  document.querySelectorAll('.ct-hpsort').forEach((x) => x.closest('th').setAttribute('aria-sort', x.dataset.col === c ? (CT.hpSort.dir > 0 ? 'ascending' : 'descending') : 'none'));
  dash.draw('hp-unit-rows');
}));
document.querySelectorAll('.ct-hpsearch').forEach((s) => s.addEventListener('input', () => dash.draw('hp-unit-rows')));
if (location.hash.slice(1) === 'hp') CT.showTab('hp');
dash.onData(() => {
  const h = dash.data('hp');
  const none = h.status === 'ok' && !h.data.length;
  document.querySelectorAll('#hp-empty').forEach((e) => { e.hidden = !none; });
  document.querySelectorAll('#hp-body').forEach((e) => { e.hidden = none; });
});
CT.fmt.cover = (v) => (v == null || isNaN(v) ? '—' : d3.format('.2f')(v) + '×');
dash.draw('chart-hp-type', (el) => {
  if (!CT.statusOk(el, ['units', 'hp'])) return;
  const rows = CT.rowsFor('hp_type').filter((r) => r.revenue > 0 || r.hp_cost > 0).sort((a, b) => b.revenue - a.revenue);
  if (!rows.length) return CT.empty(el, 'No hire revenue or HP cost in this period.');
  CT.hbar(el, rows.map((r) => ({ label: r.type, values: [r.revenue, r.hp_cost], colors: [CT.blue, CT.orange], names: ['Hire revenue', 'HP cost'] })), { fmt: CT.fmt.gbp, aria: 'Hire revenue against HP cost by type' });
});
dash.draw('hp-ending-rows', (tb) => {
  tb.replaceChildren();
  const d = dash.data('hp_ending');
  if (d.status !== 'ok') return;
  for (const r of d.data) {
    const tr = document.createElement('tr'); tr.dataset.key = encodeURIComponent(r.band);
    CT.cell(tr, r.band); CT.cell(tr, CT.fmt.int(r.units), 'n'); CT.cell(tr, CT.fmt.gbp0(r.monthly_payment), 'n'); CT.cell(tr, CT.fmt.gbp0(r.balance_outstanding), 'n');
    tb.append(tr);
  }
});
dash.draw('hp-unit-rows', (tb) => {
  tb.replaceChildren();
  const rows = CT.rowsFor('hp_units');
  if (!rows) return;
  const q = (document.querySelector('.ct-hpsearch')?.value || '').trim().toLowerCase();
  const { col, dir } = CT.hpSort;
  const list = rows.filter((r) => !q || (r.unit + ' ' + r.type + ' ' + r.finance_company + ' ' + r.status).toLowerCase().includes(q))
    .sort((a, b) => { const x = a[col], y = b[col]; if (typeof x === 'string' || typeof y === 'string') return dir * String(x ?? '').localeCompare(String(y ?? '')); return dir * ((x ?? -1e12) - (y ?? -1e12)); });
  for (const r of list) {
    const tr = document.createElement('tr'); tr.dataset.key = CT.keyOf(r);
    CT.cell(tr, r.unit); CT.cell(tr, r.type);
    const st = CT.cell(tr, ''); const pill = document.createElement('span');
    pill.className = 'pill ' + (r.status === 'HP' ? 'part' : r.status === 'Owned' ? 'full' : 'off'); pill.textContent = r.status; st.append(pill);
    CT.cell(tr, r.finance_company || '');
    CT.cell(tr, r.status === 'HP' ? CT.fmt.gbp0(r.monthly_payment) : '', 'n');
    CT.cell(tr, CT.fmt.gbp0(r.hp_cost), 'n'); CT.cell(tr, CT.fmt.gbp0(r.revenue), 'n');
    const net = CT.cell(tr, CT.fmt.gbp0(r.revenue_after_hp), 'n'); if (r.revenue_after_hp < 0) net.classList.add('down');
    const cv = CT.cell(tr, CT.fmt.cover(r.cover), 'n'); if (r.cover != null && r.cover < 1) cv.classList.add('down');
    CT.cell(tr, CT.fmt.pct(r.utilisation), 'n');
    const be = CT.cell(tr, r.breakeven_utilisation == null ? (r.hp_cost > 0 ? 'Not earning' : '') : CT.fmt.pct(r.breakeven_utilisation), 'n');
    if (r.hp_cost > 0 && (r.breakeven_utilisation == null || r.breakeven_utilisation > 1)) be.classList.add('down');
    CT.cell(tr, r.end_date ? r.end_date.split('-').reverse().join('/') : '');
    tb.append(tr);
  }
});
