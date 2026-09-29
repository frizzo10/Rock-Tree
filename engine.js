// Diamond sim engine: era-neutral, batter-vs-pitcher odds-ratio model
(function (G) {
  const EV = ['BB', 'HBP', 'SO', 'S', '2B', '3B', 'HR'];
  const odds = p => p / (1 - p);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rnd = Math.random;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const KB = 80, KP = 120; // regression pseudo-samples
  // Dampen era translation: a hitter who towered over a low-homer league should not become a
  // 100-homer hitter in a neutral one. Rarer, more era-dependent events get more damping.
  const DAMP = { HR: 0.65, '3B': 0.7, H: 0.85, BB: 0.85, HBP: 0.85, SO: 0.85, S: 0.85, '2B': 0.85 };

  // Homers and triples swing wildly by era, so translate them by difference from the league
  // (a 12-homer dead-ball slugger was not a 50-homer hitter); everything else by damped odds ratio.
  function relOf(e, r, Le, Ne) {
    if (e === 'HR' || e === '3B') { const pn = Math.max(Ne * 0.15, Ne + (r - Le)); return odds(pn) / odds(Ne); }
    return (odds(r) / odds(Le)) ** DAMP[e];
  }
  let NEU = null; // neutral environment, set by prepTeam's caller
  function prepBatter(h, L) {
    const cnt = { BB: h.BB, HBP: h.HBP, SO: h.SO, S: h.S, '2B': h.D, '3B': h.T, HR: h.HR };
    const rel = {};
    for (const e of EV) {
      const r = (cnt[e] + KB * L[e]) / (h.PA + KB);
      rel[e] = relOf(e, r, L[e], NEU[e]);
    }
    const onFirst = Math.max(h.S + h.BB + h.HBP, 1);
    const att = (h.SB + h.CS) / onFirst;
    const succ = h.CS > 0 || h.SB === 0 ? (h.SB + 7) / (h.SB + h.CS + 10) : 0.68;
    const spd = clamp(att * 2.2 + (h.T / Math.max(h.S + h.D + h.T, 1)) * 6, 0, 1);
    const obp = (h.H + h.BB + h.HBP) / h.PA, slg = (h.S + 2 * h.D + 3 * h.T + 4 * h.HR) / Math.max(h.AB, 1);
    return { ...h, rel, stealAtt: clamp(att * 0.6, 0, 0.35), stealSucc: clamp(succ, 0.45, 0.9), spd, obp, slg,
             avg: h.H / Math.max(h.AB, 1), short: h.name.split(' ').slice(1).join(' ') || h.name };
  }

  function prepPitcher(p, L) {
    const hn = p.H - p.HR, bf = Math.max(p.BF, p.IPOuts + p.H + p.BB + p.HBP);
    const cnt = { BB: p.BB, HBP: p.HBP, SO: p.SO, HR: p.HR, H: hn };
    const rel = {};
    for (const e of ['BB', 'HBP', 'SO', 'HR', 'H']) {
      const r = (cnt[e] + KP * L[e]) / (bf + KP);
      rel[e] = e === 'H' ? (odds(r) / odds(L[e])) ** DAMP[e] : relOf(e, r, L[e], NEU[e]);
    }
    rel.S = rel['2B'] = rel['3B'] = rel.H;
    const perG = bf / Math.max(p.G, 1);
    const starterish = p.GS / Math.max(p.G, 1) >= 0.5;
    const stamina = starterish ? clamp(perG * 1.05, 20, 40) : clamp(perG, 4, 12);
    const era = p.ER * 27 / Math.max(p.IPOuts, 1);
    const fip = (13 * p.HR + 3 * (p.BB + p.HBP) - 2 * p.SO) / (p.IPOuts / 3) + 3.1;
    return { ...p, rel, stamina, era, fip, short: p.name.split(' ').slice(1).join(' ') || p.name };
  }

  function orderLineup(list) {
    const pool = [...list];
    const take = fn => { pool.sort(fn); return pool.shift(); };
    const ops = h => h.obp + h.slg;
    const slot = [];
    // keep the two best power bats out of the leadoff race
    const power = [...pool].sort((a, b) => b.slg - a.slg).slice(0, 2);
    const lead = [...pool].filter(h => !power.includes(h)).sort((a, b) => (b.obp + b.spd * 0.05) - (a.obp + a.spd * 0.05))[0];
    pool.splice(pool.indexOf(lead), 1); slot[0] = lead;
    slot[2] = take((a, b) => ops(b) - ops(a));
    slot[3] = take((a, b) => b.slg - a.slg);
    slot[1] = take((a, b) => b.obp - a.obp);
    pool.sort((a, b) => ops(b) - ops(a));
    for (let i = 4; i < 9; i++) slot[i] = pool.shift();
    return slot;
  }

  function prepTeam(t, neutral) {
    NEU = neutral || NEU;
    const L = t.league, lgOf = x => x.lgRates || L;
    const lineup = Object.entries(t.lineup).map(([pos, h]) => ({ ...prepBatter(h, lgOf(h)), fpos: pos }));
    const rotation = t.rotation.map(p => prepPitcher(p, lgOf(p)));
    const bullpen = t.bullpen.map(p => prepPitcher(p, lgOf(p))).sort((a, b) => a.fip - b.fip);
    let closer = [...bullpen].sort((a, b) => b.SV - a.SV)[0];
    if (!closer || closer.SV < 8) closer = bullpen.find(p => p.GS / Math.max(p.G, 1) < 0.5) || null;
    return { ...t, abbr: t.nick, order: orderLineup(lineup), rotation, bullpen, closer };
  }

  function probs(b, p, N) {
    const out = {}; let sum = 0;
    for (const e of EV) {
      const o = odds(N[e]) * b.rel[e] * p.rel[e] * (p.tired || 1) ** (e === 'SO' ? -1 : 1);
      out[e] = o / (1 + o); sum += out[e];
    }
    if (sum > 0.85) for (const e of EV) out[e] *= 0.85 / sum;
    return out;
  }

  const FIELD = { S: ['to left', 'to center', 'to right', 'up the middle', 'through the left side', 'through the right side'],
    '2B': ['to left', 'to left-center', 'down the right-field line', 'to right-center', 'off the wall in center'],
    '3B': ['into the right-center gap', 'down the right-field line', 'to deep center'],
    HR: ['to left', 'to deep left-center', 'to right', 'into the upper deck in right', 'to straightaway center'],
    GB: ['to short', 'to second', 'to third', 'to first', 'back to the mound'],
    FB: ['to left', 'to center', 'to right', 'to shallow center', 'to deep right'],
    LD: ['lines out to short', 'lines out to center', 'lines out to second', 'lines out to left'],
    PU: ['pops out to second', 'pops out to the catcher', 'pops out to third'] };

  function simGame(awayT, homeT, opts = {}) {
    const N = opts.neutral;
    const teams = [awayT, homeT].map((t, i) => ({
      t, idx: 0, runs: 0, hits: 0, errors: 0, line: [],
      pitcher: t.rotation[(opts.starters && opts.starters[i]) || 0] || t.rotation[0],
      used: new Set(), bat: new Map(), pit: [],
    }));
    for (const s of teams) {
      s.used.add(s.pitcher.id); s.cur = newPit(s, s.pitcher, true);
      for (const b of s.t.order) s.bat.set(b.id, { b, AB: 0, R: 0, H: 0, RBI: 0, BB: 0, SO: 0, HR: 0, D: 0, T: 0, SB: 0 });
    }
    function newPit(s, p, start) {
      const rec = { p, outs: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, BF: 0, start, entryLead: 0 };
      s.pit.push(rec); return rec;
    }
    const log = [];
    let inning = 1, lastLeader = 0, record = { W: null, L: null };

    function leadOf(i) { return teams[i].runs - teams[1 - i].runs; }
    function change(def, p, note) {
      def.used.add(p.id); def.cur = newPit(def, p, false);
      def.cur.entryLead = leadOf(teams.indexOf(def));
      note.push({ txt: `Pitching change: ${p.name} replaces ${def.pitcher.name}.`, change: true, score: [teams[0].runs, teams[1].runs] });
      def.pitcher = p;
    }
    function available(def, excludeCloser) {
      return def.t.bullpen.filter(p => !def.used.has(p.id) && !(opts.rest && opts.rest.has(p.id)) && !(excludeCloser && def.t.closer && p.id === def.t.closer.id));
    }

    while (true) {
      for (let half = 0; half < 2; half++) {
        const off = teams[half], def = teams[1 - half];
        if (inning >= 9 && half === 1 && teams[1].runs > teams[0].runs) { off.line.push('x'); continue; }
        const plays = [];
        // late-inning bullpen logic
        const dLead = leadOf(1 - half);
        const cl = def.t.closer;
        if (inning >= 9 && dLead >= 1 && dLead <= 3 && cl && !def.used.has(cl.id) && def.pitcher.id !== cl.id) change(def, cl, plays);
        else if (def.cur.BF >= def.pitcher.stamina * (0.9 + rnd() * 0.2) || def.cur.R >= 6) {
          const nxt = available(def, inning < 9)[0]; if (nxt) change(def, nxt, plays);
        }
        let outs = 0, runs = 0; const bases = [null, null, null];
        const score = (runner, bRec, rbi = true) => {
          runs++; off.runs++;
          off.bat.get(runner.b.id).R++;
          if (rbi && bRec) bRec.RBI++;
          const pr = runner.pr; pr.R++; if (!runner.unearned) pr.ER++;
          const ld = leadOf(half);
          if (ld === 1 && lastLeader !== half + 1) { lastLeader = half + 1; record = { W: off.cur, L: pr, Wteam: half }; }
          else if (ld === 0) lastLeader = 0;
        };
        while (outs < 3) {
          const b = off.t.order[off.idx % 9]; off.idx++;
          const bRec = off.bat.get(b.id), pr = def.cur, p = def.pitcher;
          // stolen base attempt by runner on first
          if (bases[0] && !bases[1] && outs < 2 && rnd() < bases[0].b.stealAtt) {
            const r = bases[0];
            if (rnd() < r.b.stealSucc) { bases[1] = r; bases[0] = null; off.bat.get(r.b.id).SB++; plays.push({ txt: `${r.b.short} steals second.`, bases: [false, true, !!bases[2]], outs, score: [teams[0].runs, teams[1].runs], ev: 'SB' }); }
            else { bases[0] = null; outs++; plays.push({ txt: `${r.b.short} is caught stealing.`, bases: [false, false, !!bases[2]], outs, score: [teams[0].runs, teams[1].runs], ev: 'CS' }); if (outs === 3) { off.idx--; break; } }
          }
          p.tired = pr.BF > p.stamina ? 1 + (pr.BF - p.stamina) * 0.03 : 1;
          const pr_ = probs(b, p, N);
          let x = rnd(), ev = 'OUT';
          for (const e of EV) { if (x < pr_[e]) { ev = e; break; } x -= pr_[e]; }
          pr.BF++;
          const runner = { b, pr, unearned: false };
          const before = off.runs;
          let txt = '', err = false;
          if (ev === 'BB' || ev === 'HBP') {
            bRec.BB += ev === 'BB' ? 1 : 0; ev === 'BB' ? pr.BB++ : 0;
            if (bases[0]) { if (bases[1]) { if (bases[2]) score(bases[2], bRec); bases[2] = bases[1]; } bases[1] = bases[0]; }
            bases[0] = runner;
            txt = ev === 'BB' ? `${b.short} walks.` : `${b.short} is hit by a pitch.`;
          } else if (ev === 'SO') {
            bRec.AB++; bRec.SO++; pr.SO++; pr.outs++; outs++;
            txt = `${b.short} strikes out ${rnd() < 0.7 ? 'swinging' : 'looking'}.`;
          } else if (ev === 'S') {
            bRec.AB++; bRec.H++; pr.H++; off.hits++;
            if (bases[2]) { score(bases[2], bRec); bases[2] = null; }
            if (bases[1]) { if (rnd() < (outs === 2 ? 0.82 : 0.58) + (bases[1].b.spd - 0.3) * 0.3) score(bases[1], bRec); else bases[2] = bases[1]; bases[1] = null; }
            if (bases[0]) { if (!bases[2] && rnd() < (outs === 2 ? 0.38 : 0.28) + (bases[0].b.spd - 0.3) * 0.3) bases[2] = bases[0]; else bases[1] = bases[0]; bases[0] = null; }
            bases[0] = runner; txt = `${b.short} singles ${pick(FIELD.S)}.`;
          } else if (ev === '2B') {
            bRec.AB++; bRec.H++; bRec.D++; pr.H++; off.hits++;
            if (bases[2]) score(bases[2], bRec); if (bases[1]) score(bases[1], bRec); bases[2] = bases[1] = null;
            if (bases[0]) { if (rnd() < (outs === 2 ? 0.6 : 0.4) + (bases[0].b.spd - 0.3) * 0.3) score(bases[0], bRec); else bases[2] = bases[0]; bases[0] = null; }
            bases[1] = runner; txt = `${b.short} doubles ${pick(FIELD['2B'])}.`;
          } else if (ev === '3B') {
            bRec.AB++; bRec.H++; bRec.T++; pr.H++; off.hits++;
            for (let i = 2; i >= 0; i--) if (bases[i]) { score(bases[i], bRec); bases[i] = null; }
            bases[2] = runner; txt = `${b.short} triples ${pick(FIELD['3B'])}.`;
          } else if (ev === 'HR') {
            bRec.AB++; bRec.H++; bRec.HR++; pr.H++; pr.HR++; off.hits++;
            const n = bases.filter(Boolean).length;
            for (let i = 2; i >= 0; i--) if (bases[i]) { score(bases[i], bRec); bases[i] = null; }
            score(runner, bRec);
            txt = `${b.short} ${n === 3 ? 'hits a grand slam' : 'homers'} ${pick(FIELD.HR)}${n && n < 3 ? ` (${n + 1} runs)` : ''}.`;
          } else if (rnd() < 0.016) { // reached on error
            bRec.AB++; def.errors++;
            for (let i = 2; i >= 0; i--) if (bases[i]) { if (i === 2) score(bases[i], bRec, false); else bases[i + 1] = bases[i]; bases[i] = null; }
            runner.unearned = true; bases[0] = runner; err = true;
            txt = `${b.short} reaches on an error by the ${pick(['shortstop', 'third baseman', 'second baseman', 'left fielder'])}.`;
          } else {
            const kind = rnd() < 0.46 ? 'GB' : rnd() < 0.78 ? 'FB' : 'LD';
            if (kind === 'GB' && bases[0] && outs < 2 && rnd() < 0.42 - b.spd * 0.15) {
              bRec.AB++; outs += 2; pr.outs += 2; bases[0] = null;
              if (outs < 3) { if (bases[2]) { score(bases[2], bRec, false); bases[2] = null; } if (bases[1]) { bases[2] = bases[1]; bases[1] = null; } }
              txt = `${b.short} grounds into a double play.`;
            } else {
              outs++; pr.outs++;
              let sf = false;
              if (outs < 3) {
                if (kind === 'GB') {
                  if (bases[0]) { if (bases[1]) { if (bases[2]) score(bases[2], bRec); bases[2] = bases[1]; } bases[1] = bases[0]; bases[0] = null; }
                  else {
                    if (bases[2] && rnd() < 0.5) { score(bases[2], bRec); bases[2] = null; }
                    if (bases[1] && !bases[2] && rnd() < 0.6) { bases[2] = bases[1]; bases[1] = null; }
                  }
                } else if (kind === 'FB') {
                  if (bases[2] && rnd() < 0.62) { score(bases[2], bRec); bases[2] = null; sf = true; }
                  if (bases[1] && !bases[2] && rnd() < 0.25) { bases[2] = bases[1]; bases[1] = null; }
                }
              }
              if (!sf) bRec.AB++;
              txt = kind === 'GB' ? `${b.short} grounds out ${pick(FIELD.GB)}.` : kind === 'LD' ? `${b.short} ${pick(FIELD.LD)}.` :
                sf ? `${b.short} hits a sacrifice fly ${pick(FIELD.FB)}.` : rnd() < 0.15 ? `${b.short} ${pick(FIELD.PU)}.` : `${b.short} flies out ${pick(FIELD.FB)}.`;
            }
          }
          const scored = off.runs - before;
          plays.push({ txt, scored, err, batter: b.name, outs, bases: bases.map(Boolean), score: [teams[0].runs, teams[1].runs], ev });
          // walk-off
          if (inning >= 9 && half === 1 && teams[1].runs > teams[0].runs) break;
          // mid-inning hook
          if (outs < 3 && (pr.BF >= p.stamina * 1.2 || pr.R >= 7 || (pr.R >= 5 && pr.start && inning <= 5))) {
            const nxt = available(def, inning < 9)[0]; if (nxt) change(def, nxt, plays);
          }
        }
        off.line.push(runs);
        log.push({ inning, half, team: off.t, plays });
      }
      if (inning >= 9 && teams[0].runs !== teams[1].runs) break;
      if (inning >= 25) break;
      inning++;
    }
    // decisions
    const winner = teams[0].runs > teams[1].runs ? 0 : teams[1].runs > teams[0].runs ? 1 : -1;
    if (winner >= 0) {
      const ws = teams[winner];
      let W = record.W;
      if (W && W.start && W.outs < 15) W = ws.pit.slice(1).sort((a, b) => b.outs - a.outs)[0] || W;
      if (W) W.dec = 'W';
      if (record.L) record.L.dec = 'L';
      const fin = ws.pit[ws.pit.length - 1];
      if (fin !== W && !fin.start && fin.entryLead > 0 && fin.entryLead <= 3) fin.dec = 'S';
    }
    return { teams, log, innings: inning, winner };
  }

  G.Diamond = { prepTeam, simGame, probs, prepBatter, prepPitcher, orderLineup, setNeutral: n => { NEU = n; } };
})(typeof window !== 'undefined' ? window : globalThis);
