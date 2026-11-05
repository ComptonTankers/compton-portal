/* Small stand-alone runtime that provides the `dash` API the dashboard scripts use:
   data(), calc(), draw(), onData(), params(), setParams(), resetParams(), setLink().
   Data comes from window.DASH_DATA (data/data.js). To feed it from a database or API instead,
   load the rows into DASH_DATA (or replace loadSource) before calling dash.start(). */
(function () {
  const DEFAULT_PARAMS = { kind: 'month', period: null };
  const sources = {}, calcs = {}, calcCache = {}, draws = new Map(), onDataFns = [];
  let params = { ...DEFAULT_PARAMS }, started = false;
  const loadSource = (id) => (window.DASH_DATA && window.DASH_DATA[id]) || null;
  const columnsOf = (rows) => (Array.isArray(rows) && rows.length ? Object.keys(rows[0]) : []);
  function data(id) {
    if (calcs[id]) {
      if (!(id in calcCache)) {
        const ins = calcs[id].inputs.map((i) => data(i));
        if (ins.some((x) => x.status !== 'ok')) return { status: 'missing', data: [], columns: [], meta: [] };
        try { calcCache[id] = calcs[id].fn(...ins.map((x) => x.data)); }
        catch (e) { console.error('Calculation failed:', id, e); return { status: 'error', data: [], columns: [], message: String(e), meta: [] }; }
      }
      const d = calcCache[id];
      return { status: 'ok', data: d, columns: columnsOf(d), meta: [], rows: d };
    }
    if (!(id in sources)) sources[id] = loadSource(id);
    const d = sources[id];
    if (d == null) return { status: 'missing', data: [], columns: [], meta: [] };
    return { status: 'ok', data: d, columns: columnsOf(d), meta: [], rows: d };
  }
  function runDraw(name) {
    const fn = draws.get(name); if (!fn) return;
    document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => {
      if (el.closest('[hidden]')) return; // like the hosted version: hidden drawings wait until shown
      try { fn(el); } catch (e) { console.error('Drawing failed:', name, e); }
    });
  }
  function render() {
    if (!started) return;
    onDataFns.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    draws.forEach((_, name) => runDraw(name));
  }
  window.dash = {
    data,
    calc(id, o) { calcs[id] = o; },
    loader() {},
    draw(name, fn) {
      if (fn === undefined) return runDraw(name);
      draws.set(name, typeof fn === 'function' ? fn : (el) => fn.update ? fn.update(el, fn.mount && fn.mount(el)) : null);
      if (started) runDraw(name);
    },
    onData(fn) { onDataFns.push(fn); if (started) fn(); },
    params() { return { ...params }; },
    setParams(p) { params = { ...params, ...p }; render(); },
    resetParams() { params = { ...DEFAULT_PARAMS }; render(); },
    setLink(name) { history.replaceState(null, '', '#' + name); },
    refresh() { Object.keys(sources).forEach((k) => delete sources[k]); Object.keys(calcCache).forEach((k) => delete calcCache[k]); render(); },
    colors: ['#164698', '#E3641D', '#8FA9D6', '#2E7D6B', '#7A4FB3', '#B0882A', '#C2416B', '#5B6675'],
    start() { started = true; render(); },
  };
  // Re-draw when a tab is shown (the page toggles `hidden`) and when the window is resized.
  new MutationObserver((recs) => { if (started && recs.some((r) => r.target.matches && r.target.matches('.ct-page, .ct-col'))) draws.forEach((_, n) => runDraw(n)); })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 150); });
})();
