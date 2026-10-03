// The manager's notebook, shared by every page: your shortlist, your pick plan and your notes belong to you, not to one draft.
// They are kept on this device and, once you are signed in, follow you to your account (cloud.js syncs the 'gts-notebook' save).
(function () {
  const KEY = 'gts-notebook', MAX = 60, WHEN = ['early', 'mid', 'late'];
  const blank = () => ({ v: 2, targets: [], notes: '', mode: 'mock', plan: { mock: {}, league: {} } });
  const fire = () => window.dispatchEvent(new CustomEvent('nb-change'));
  const clean = (m) => {   // a plan is { slot: { when, picks: [first choice, second, third] } }
    const out = {}; if (!m || typeof m !== 'object') return out;
    Object.keys(m).slice(0, 30).forEach(slot => {
      const e = m[slot]; if (!/^[a-z0-9]{1,6}$/.test(slot) || !e || typeof e !== 'object') return;
      const seen = new Set(), picks = (Array.isArray(e.picks) ? e.picks : []).slice(0, 3).map(k => (typeof k === 'string' && k && !seen.has(k) && seen.add(k)) ? k : null); while (picks.length < 3) picks.push(null);
      if (picks.some(Boolean)) out[slot] = { when: WHIN(e.when), picks };
    });
    return out;
  };
  const WHIN = w => WHEN.includes(w) ? w : 'mid';
  function read() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY));
      if (o && (o.v === 1 || o.v === 2) && Array.isArray(o.targets)) return { ...blank(), notes: typeof o.notes === 'string' ? o.notes : '', targets: [...new Set(o.targets.filter(k => typeof k === 'string'))].slice(0, MAX), mode: o.mode === 'league' ? 'league' : 'mock', plan: { mock: clean(o.plan && o.plan.mock), league: clean(o.plan && o.plan.league) } };
    } catch (e) {}
    return blank();
  }
  function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} fire(); }
  const mm = m => m === 'league' ? 'league' : 'mock';
  window.NB = {
    KEY, MAX, WHEN, read, write,
    targets: () => read().targets,
    has: k => read().targets.includes(k),
    // true: added, false: removed, null: the notebook is full
    toggle(k) { const o = read(); if (o.targets.includes(k)) { o.targets = o.targets.filter(x => x !== k); write(o); return false; } if (o.targets.length >= MAX) return null; o.targets.push(k); write(o); return true; },
    remove(k) { const o = read(); o.targets = o.targets.filter(x => x !== k); write(o); },
    setNotes(s) { const o = read(); o.notes = String(s).slice(0, 5000); write(o); },
    setMode(m) { const o = read(); o.mode = mm(m); write(o); },
    plan: m => read().plan[mm(m)],
    planKeys: m => { const s = new Set(); Object.values(read().plan[mm(m)]).forEach(e => e.picks.forEach(k => k && s.add(k))); return s; },
    // put a player in a choice (0 = first, 1 = second, 2 = third) for a spot, or clear it with null. A player can only be one choice at a spot.
    setPick(m, slot, i, key) {
      const o = read(), p = o.plan[mm(m)], e = p[slot] || { when: 'mid', picks: [null, null, null] }; if (i < 0 || i > 2) return;
      if (key) e.picks = e.picks.map(k => k === key ? null : k); e.picks[i] = key || null;
      if (e.picks.some(Boolean)) p[slot] = e; else delete p[slot]; write(o);
    },
    setWhen(m, slot, w) { const o = read(), p = o.plan[mm(m)]; if (p[slot]) { p[slot].when = WHIN(w); write(o); } },
    clearPlan(m) { const o = read(); o.plan[mm(m)] = {}; write(o); }
  };
  window.addEventListener('storage', e => { if (e.key === KEY) fire(); });   // another tab changed it
})();
