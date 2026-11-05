dash.calc('periods', {
  inputs: ['months'],
  title: 'Reporting periods',
  description: 'Each month, financial quarter and financial year (October to September) with at least one month loaded.',
  fn: (months) => {
    const keys = (m) => {
      const y = +m.slice(0, 4), mo = +m.slice(5, 7), fy = mo >= 10 ? y + 1 : y;
      const q = mo >= 10 ? 1 : mo <= 3 ? 2 : mo <= 6 ? 3 : 4, f = 'FY' + String(fy).slice(2);
      return [['month', m], ['quarter', f + ' Q' + q], ['year', f]];
    };
    const out = new Map();
    for (const r of [...months].sort((a, b) => (a.month < b.month ? -1 : 1)))
      for (const [kind, period] of keys(r.month)) {
        if (!out.has(period)) out.set(period, { period, kind, first_month: r.month, last_month: r.month, months_loaded: 0 });
        const p = out.get(period); p.last_month = r.month; p.months_loaded += 1;
      }
    return [...out.values()];
  },
});

dash.calc('summary', {
  inputs: ['months'],
  title: 'Fleet totals by period',
  description: 'Monthly totals added up for each month, quarter and financial year; unit counts are from the latest month in the period.',
  fn: (months) => {
    const keys = (m) => {
      const y = +m.slice(0, 4), mo = +m.slice(5, 7), fy = mo >= 10 ? y + 1 : y;
      const q = mo >= 10 ? 1 : mo <= 3 ? 2 : mo <= 6 ? 3 : 4, f = 'FY' + String(fy).slice(2);
      return [['month', m], ['quarter', f + ' Q' + q], ['year', f]];
    };
    const groups = new Map();
    for (const r of [...months].sort((a, b) => (a.month < b.month ? -1 : 1)))
      for (const [kind, period] of keys(r.month)) {
        if (!groups.has(period)) groups.set(period, { kind, period, rows: [] });
        groups.get(period).rows.push(r);
      }
    const out = [];
    for (const { kind, period, rows } of groups.values()) {
      const s = (k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
      const last = rows[rows.length - 1];
      const full = kind === 'month' ? 1 : kind === 'quarter' ? 3 : 12;
      out.push({
        period, kind, first_month: rows[0].month, last_month: last.month,
        months_loaded: rows.length, complete: rows.length === full,
        turnover: s('turnover'), hire_turnover: s('hire_turnover'), sales_turnover: s('sales_turnover'),
        hire_revenue: s('hire_revenue'),
        chargeable_days: s('chargeable_days'), on_hire_days: s('on_hire_days'),
        utilisation: s('chargeable_days') ? s('on_hire_days') / s('chargeable_days') : null,
        units: +last.units, units_on_hire: +last.units_on_hire, units_idle: +last.units_idle,
        units_part: +last.units_part, units_full: +last.units_on_hire - +last.units_part,
        revenue_per_unit_month: +last.units ? s('hire_revenue') / rows.length / +last.units : null,
        mcs_ytd_revenue: +last.ytd_revenue,
        mcs_ytd_utilisation: +last.ytd_chargeable_days ? +last.ytd_on_hire_days / +last.ytd_chargeable_days : null,
      });
    }
    for (const kind of ['month', 'quarter', 'year']) {
      const list = out.filter((r) => r.kind === kind).sort((a, b) => (a.first_month < b.first_month ? -1 : 1));
      list.forEach((r, i) => {
        const p = list[i - 1];
        const ok = p && r.complete && p.complete;
        r.previous_period = ok ? p.period : null;
        r.turnover_change = ok && p.turnover ? r.turnover / p.turnover - 1 : null;
        r.utilisation_change = ok && p.utilisation != null ? r.utilisation - p.utilisation : null;
      });
    }
    return out;
  },
});

dash.calc('type_summary', {
  inputs: ['types'],
  title: 'Equipment types by period',
  description: 'Turnover, revenue and days on hire per equipment type for each month, quarter and financial year.',
  fn: (types) => {
    const keys = (m) => {
      const y = +m.slice(0, 4), mo = +m.slice(5, 7), fy = mo >= 10 ? y + 1 : y;
      const q = mo >= 10 ? 1 : mo <= 3 ? 2 : mo <= 6 ? 3 : 4, f = 'FY' + String(fy).slice(2);
      return [['month', m], ['quarter', f + ' Q' + q], ['year', f]];
    };
    const g = new Map();
    for (const r of [...types].sort((a, b) => (a.month < b.month ? -1 : 1)))
      for (const [, period] of keys(r.month)) {
        const k = period + '|' + r.type;
        if (!g.has(k)) g.set(k, { period, type: r.type, months: new Set(), turnover: 0, revenue: 0, chargeable_days: 0, on_hire_days: 0, last: r });
        const a = g.get(k);
        a.months.add(r.month); a.last = r;
        a.turnover += +r.turnover || 0; a.revenue += +r.revenue || 0;
        a.chargeable_days += +r.chargeable_days || 0; a.on_hire_days += +r.on_hire_days || 0;
      }
    return [...g.values()].map((a) => ({
      period: a.period, type: a.type, units: +a.last.units, units_idle: +a.last.units_idle,
      turnover: a.turnover, revenue: a.revenue, chargeable_days: a.chargeable_days, on_hire_days: a.on_hire_days,
      utilisation: a.chargeable_days ? a.on_hire_days / a.chargeable_days : null,
      revenue_per_unit_month: +a.last.units ? a.revenue / a.months.size / +a.last.units : null,
      ytd_revenue: +a.last.ytd_revenue,
      ytd_utilisation: +a.last.ytd_chargeable_days ? +a.last.ytd_on_hire_days / +a.last.ytd_chargeable_days : null,
    }));
  },
});

dash.calc('unit_summary', {
  inputs: ['units'],
  title: 'Units by period',
  description: 'Chargeable days, days on hire and hire revenue per unit for each month, quarter and financial year.',
  fn: (units) => {
    const keys = (m) => {
      const y = +m.slice(0, 4), mo = +m.slice(5, 7), fy = mo >= 10 ? y + 1 : y;
      const q = mo >= 10 ? 1 : mo <= 3 ? 2 : mo <= 6 ? 3 : 4, f = 'FY' + String(fy).slice(2);
      return [['month', m], ['quarter', f + ' Q' + q], ['year', f]];
    };
    const g = new Map();
    for (const r of [...units].sort((a, b) => (a.month < b.month ? -1 : 1)))
      for (const [, period] of keys(r.month)) {
        const k = period + '|' + r.unit;
        if (!g.has(k)) g.set(k, { period, unit: r.unit, chargeable_days: 0, on_hire_days: 0, revenue: 0, last: r });
        const a = g.get(k);
        a.last = r; a.chargeable_days += +r.chargeable_days || 0; a.on_hire_days += +r.on_hire_days || 0; a.revenue += +r.revenue || 0;
      }
    return [...g.values()].map((a) => ({
      period: a.period, unit: a.unit, type: a.last.type,
      status: a.last.note ? 'Revenue only' : a.on_hire_days === 0 ? 'Off hire' : a.on_hire_days < a.chargeable_days ? 'Part' : 'On hire',
      chargeable_days: a.chargeable_days, on_hire_days: a.on_hire_days,
      utilisation: a.chargeable_days ? a.on_hire_days / a.chargeable_days : null, revenue: a.revenue,
      ytd_utilisation: +a.last.ytd_chargeable_days ? +a.last.ytd_on_hire_days / +a.last.ytd_chargeable_days : null,
      ytd_revenue: +a.last.ytd_revenue,
    }));
  },
});

dash.calc('customer_summary', {
  inputs: ['customers'],
  title: 'Customers by period',
  description: 'Turnover per customer for each month, quarter and financial year, with its share and rank.',
  fn: (customers) => {
    const keys = (m) => {
      const y = +m.slice(0, 4), mo = +m.slice(5, 7), fy = mo >= 10 ? y + 1 : y;
      const q = mo >= 10 ? 1 : mo <= 3 ? 2 : mo <= 6 ? 3 : 4, f = 'FY' + String(fy).slice(2);
      return [['month', m], ['quarter', f + ' Q' + q], ['year', f]];
    };
    const g = new Map();
    for (const r of customers)
      for (const [, period] of keys(r.month)) {
        const k = period + '|' + r.customer;
        g.set(k, { period, customer: r.customer, revenue: (g.get(k)?.revenue || 0) + (+r.revenue || 0) });
      }
    const rows = [...g.values()];
    const totals = new Map();
    for (const r of rows) totals.set(r.period, (totals.get(r.period) || 0) + r.revenue);
    const byPeriod = new Map();
    for (const r of rows) { if (!byPeriod.has(r.period)) byPeriod.set(r.period, []); byPeriod.get(r.period).push(r); }
    const out = [];
    for (const list of byPeriod.values()) {
      list.sort((a, b) => b.revenue - a.revenue);
      list.forEach((r, i) => out.push({ ...r, rank: i + 1, share: r.revenue / totals.get(r.period) }));
    }
    return out;
  },
});

dash.calc('customer_stats', {
  inputs: ['customer_summary'],
  title: 'Customer concentration',
  description: 'Number of customers billed and the share of turnover from the top 1, 3 and 10 in each period.',
  fn: (customer_summary) => {
    const by = new Map();
    for (const r of customer_summary) { if (!by.has(r.period)) by.set(r.period, []); by.get(r.period).push(r); }
    return [...by.entries()].map(([period, list]) => {
      list.sort((a, b) => a.rank - b.rank);
      const share = (n) => list.slice(0, n).reduce((a, r) => a + r.share, 0);
      return { period, customers: list.length, top1_name: list[0].customer, top1_share: share(1), top3_share: share(3), top10_share: share(10) };
    });
  },
});
