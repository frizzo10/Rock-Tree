// Duel Dice engine: player cards built from era-adjusted stats, resolved with a d20 duel + percentile roll
(function (G) {
  const EV = ['BB', 'HBP', 'SO', 'S', '2B', '3B', 'HR'];
  const odds = p => p / (1 - p);
  const rnd = Math.random;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const OUT_SPLIT = { GB: 0.46, FB: 0.42, LD: 0.12 };
  const ERR = 0.016; // share of balls in play that become errors (lives on pitcher cards, i.e. the defense)

  const LABEL = { BB: 'Walk', HBP: 'Hit by pitch', SO: 'Strikeout', S: 'Single', '2B': 'Double', '3B': 'Triple',
    HR: 'Home run', GB: 'Groundout', FB: 'Flyout', LD: 'Lineout', E: 'Error' };
  const ORDER = ['HR', '3B', '2B', 'S', 'BB', 'HBP', 'E', 'SO', 'LD', 'FB', 'GB'];

  // distribute probabilities over 100 slots (largest remainder), then lay them out as ranges
  function toCard(pr) {
    const keys = ORDER.filter(k => pr[k] > 0);
    const raw = keys.map(k => pr[k] * 100);
    const n = raw.map(Math.floor);
    let left = 100 - n.reduce((a, b) => a + b, 0);
    const byRem = keys.map((k, i) => i).sort((a, b) => (raw[b] - n[b]) - (raw[a] - n[a]));
    for (let i = 0; left > 0; i = (i + 1) % byRem.length, left--) n[byRem[i]]++;
    const rows = []; let lo = 1;
    keys.forEach((k, i) => { if (n[i] > 0) { rows.push({ code: k, label: LABEL[k], lo, hi: lo + n[i] - 1 }); lo += n[i]; } });
    return rows;
  }

  function outcome(pr) { // one side's distribution vs a league-average opponent, in the neutral environment
    const o = {}; let sum = 0;
    for (const e of EV) { const x = odds(pr.N[e]) * pr.rel[e]; o[e] = x / (1 + x); sum += o[e]; }
    const out = 1 - sum;
    const err = pr.pitcher ? out * ERR : 0;
    for (const k in OUT_SPLIT) o[k] = (out - err) * OUT_SPLIT[k];
    if (err) o.E = err;
    return o;
  }

  // Half the at-bats are read from each card, so a card must carry twice the player's edge over an
  // average card: card = 2 x player - average. Averaged with a typical opponent it returns his real rates.
  const ONE = { BB: 1, HBP: 1, SO: 1, S: 1, '2B': 1, '3B': 1, HR: 1 };
  function doubled(o, avg) {
    const c = {}; let sum = 0;
    for (const k in o) { c[k] = Math.max(0, 2 * o[k] - (avg[k] || 0)); sum += c[k]; }
    for (const k in c) c[k] /= sum;
    return c;
  }
  function buildCards(team, N) {
    const avgB = outcome({ N, rel: ONE }), avgP = outcome({ N, rel: ONE, pitcher: true });
    for (const b of team.order) b.card = toCard(doubled(outcome({ N, rel: b.rel }), avgB));
    for (const p of [...team.rotation, ...team.bullpen]) p.card = toCard(doubled(outcome({ N, rel: p.rel, pitcher: true }), avgP));
    return team;
  }

  const readCard = (card, roll) => card.find(r => roll >= r.lo && roll <= r.hi);
  const d = n => 1 + Math.floor(rnd() * n);

  const FIELD = { S: ['to left', 'to center', 'to right', 'up the middle', 'through the left side', 'through the right side'],
    '2B': ['to left', 'to left-center', 'down the right-field line', 'to right-center', 'off the wall in center'],
    '3B': ['into the right-center gap', 'down the right-field line', 'to deep center'],
    HR: ['to left', 'to deep left-center', 'to right', 'into the upper deck in right', 'to straightaway center'],
    GB: ['to short', 'to second', 'to third', 'to first', 'back to the mound'],
    FB: ['to left', 'to center', 'to right', 'to shallow center', 'to deep right'],
    LD: ['to short', 'to center', 'to second', 'to left'] };

  class Game {
    constructor(away, home, opts) {
      this.opts = opts;
      this.teams = [away, home].map((t, i) => ({ t, idx: 0, runs: 0, hits: 0, errors: 0, line: [], used: new Set(), bat: new Map(), pit: [],
        pitcher: t.rotation[opts.starters[i]] || t.rotation[0] }));
      for (const s of this.teams) {
        s.used.add(s.pitcher.id); s.cur = this.newPit(s, s.pitcher, true);
        for (const b of s.t.order) s.bat.set(b.id, { b, AB: 0, R: 0, H: 0, RBI: 0, BB: 0, SO: 0, HR: 0, D: 0, T: 0, SB: 0 });
      }
      this.inning = 1; this.half = 0; this.outs = 0; this.bases = [null, null, null];
      this.lastLeader = 0; this.record = {}; this.over = false; this.pending = [];
      this.startHalf();
    }
    newPit(s, p, start) { const r = { p, outs: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, BF: 0, start, entryLead: 0 }; s.pit.push(r); return r; }
    get off() { return this.teams[this.half]; }
    get def() { return this.teams[1 - this.half]; }
    lead(i) { return this.teams[i].runs - this.teams[1 - i].runs; }
    batter() { return this.off.t.order[this.off.idx % 9]; }
    pitcher() { return this.def.pitcher; }
    change(def, p) {
      const old = def.pitcher; def.used.add(p.id); def.cur = this.newPit(def, p, false);
      def.cur.entryLead = this.lead(this.teams.indexOf(def)); def.pitcher = p;
      this.pending.push({ txt: `Pitching change: ${p.name} replaces ${old.name}.`, change: true });
    }
    avail(def, noCloser) { return def.t.bullpen.filter(p => !def.used.has(p.id) && !(noCloser && def.t.closer && p.id === def.t.closer.id)); }
    startHalf() {
      this.outs = 0; this.bases = [null, null, null]; this.off.line.push(0);
      const def = this.def, dl = this.lead(1 - this.half), cl = def.t.closer;
      if (this.inning >= 9 && dl >= 1 && dl <= 3 && cl && !def.used.has(cl.id) && def.pitcher.id !== cl.id) this.change(def, cl);
      else if (def.cur.BF >= def.pitcher.stamina * (0.9 + rnd() * 0.2) || def.cur.R >= 6) { const n = this.avail(def, this.inning < 9)[0]; if (n) this.change(def, n); }
    }
    score(runner, bRec, rbi = true) {
      const off = this.off; off.runs++; off.line[off.line.length - 1]++;
      off.bat.get(runner.b.id).R++; if (rbi && bRec) bRec.RBI++;
      runner.pr.R++; if (!runner.unearned) runner.pr.ER++;
      const ld = this.lead(this.half);
      if (ld === 1 && this.lastLeader !== this.half + 1) { this.lastLeader = this.half + 1; this.record = { W: off.cur, L: runner.pr }; }
      else if (ld === 0) this.lastLeader = 0;
    }
    // apply one card result; returns the play record
    resolve(code) {
      const off = this.off, def = this.def, b = this.batter(), bRec = off.bat.get(b.id), pr = def.cur, B = this.bases;
      off.idx++; pr.BF++;
      const runner = { b, pr, unearned: false }, before = off.runs, sp = r => (r.b.spd - 0.3) * 0.3;
      const hit = () => { bRec.AB++; bRec.H++; pr.H++; off.hits++; };
      let txt = '', err = false;
      switch (code) {
        case 'BB': case 'HBP':
          if (code === 'BB') { bRec.BB++; pr.BB++; }
          if (B[0]) { if (B[1]) { if (B[2]) this.score(B[2], bRec); B[2] = B[1]; } B[1] = B[0]; }
          B[0] = runner; txt = code === 'BB' ? `${b.short} walks.` : `${b.short} is hit by a pitch.`; break;
        case 'SO':
          bRec.AB++; bRec.SO++; pr.SO++; pr.outs++; this.outs++;
          txt = `${b.short} strikes out ${rnd() < 0.7 ? 'swinging' : 'looking'}.`; break;
        case 'S':
          hit();
          if (B[2]) { this.score(B[2], bRec); B[2] = null; }
          if (B[1]) { if (rnd() < (this.outs === 2 ? 0.82 : 0.58) + sp(B[1])) this.score(B[1], bRec); else B[2] = B[1]; B[1] = null; }
          if (B[0]) { if (!B[2] && rnd() < (this.outs === 2 ? 0.38 : 0.28) + sp(B[0])) B[2] = B[0]; else B[1] = B[0]; B[0] = null; }
          B[0] = runner; txt = `${b.short} singles ${pick(FIELD.S)}.`; break;
        case '2B':
          hit(); bRec.D++;
          if (B[2]) this.score(B[2], bRec); if (B[1]) this.score(B[1], bRec); B[2] = B[1] = null;
          if (B[0]) { if (rnd() < (this.outs === 2 ? 0.6 : 0.4) + sp(B[0])) this.score(B[0], bRec); else B[2] = B[0]; B[0] = null; }
          B[1] = runner; txt = `${b.short} doubles ${pick(FIELD['2B'])}.`; break;
        case '3B':
          hit(); bRec.T++;
          for (let i = 2; i >= 0; i--) if (B[i]) { this.score(B[i], bRec); B[i] = null; }
          B[2] = runner; txt = `${b.short} triples ${pick(FIELD['3B'])}.`; break;
        case 'HR': {
          hit(); bRec.HR++; pr.HR++;
          const n = B.filter(Boolean).length;
          for (let i = 2; i >= 0; i--) if (B[i]) { this.score(B[i], bRec); B[i] = null; }
          this.score(runner, bRec);
          txt = `${b.short} ${n === 3 ? 'hits a grand slam' : 'homers'} ${pick(FIELD.HR)}${n && n < 3 ? ` (${n + 1} runs)` : ''}.`; break;
        }
        case 'E':
          bRec.AB++; def.errors++; err = true;
          for (let i = 2; i >= 0; i--) if (B[i]) { if (i === 2) this.score(B[i], bRec, false); else B[i + 1] = B[i]; B[i] = null; }
          runner.unearned = true; B[0] = runner;
          txt = `${b.short} reaches on an error by the ${pick(['shortstop', 'third baseman', 'second baseman', 'left fielder'])}.`; break;
        default: { // GB / FB / LD
          if (code === 'GB' && B[0] && this.outs < 2 && rnd() < 0.42 - b.spd * 0.15) {
            bRec.AB++; this.outs += 2; pr.outs += 2; B[0] = null;
            if (this.outs < 3) { if (B[2]) { this.score(B[2], bRec, false); B[2] = null; } if (B[1]) { B[2] = B[1]; B[1] = null; } }
            txt = `${b.short} grounds into a double play.`; break;
          }
          this.outs++; pr.outs++; let sf = false;
          if (this.outs < 3) {
            if (code === 'GB') {
              if (B[0]) { if (B[1]) { if (B[2]) this.score(B[2], bRec); B[2] = B[1]; } B[1] = B[0]; B[0] = null; }
              else { if (B[2] && rnd() < 0.5) { this.score(B[2], bRec); B[2] = null; } if (B[1] && !B[2] && rnd() < 0.6) { B[2] = B[1]; B[1] = null; } }
            } else if (code === 'FB') {
              if (B[2] && rnd() < 0.62) { this.score(B[2], bRec); B[2] = null; sf = true; }
              if (B[1] && !B[2] && rnd() < 0.25) { B[2] = B[1]; B[1] = null; }
            }
          }
          if (!sf) bRec.AB++;
          txt = code === 'GB' ? `${b.short} grounds out ${pick(FIELD.GB)}.` : code === 'LD' ? `${b.short} lines out ${pick(FIELD.LD)}.` :
            sf ? `${b.short} hits a sacrifice fly ${pick(FIELD.FB)}.` : `${b.short} flies out ${pick(FIELD.FB)}.`;
        }
      }
      const play = { txt, code, scored: off.runs - before, err, runners: B.map(r => r ? r.b.short : null), outs: this.outs, inning: this.inning, half: this.half,
        score: [this.teams[0].runs, this.teams[1].runs], pre: this.pending.splice(0) };
      this.advance(pr);
      return play;
    }
    advance(pr) {
      const [a, h] = this.teams;
      if (this.inning >= 9 && this.half === 1 && h.runs > a.runs) return this.finish(); // walk-off
      if (this.outs >= 3) {
        if (this.half === 0) {
          if (this.inning >= 9 && h.runs > a.runs) { h.line.push('x'); return this.finish(); }
          this.half = 1;
        } else {
          if (this.inning >= 9 && a.runs !== h.runs) return this.finish();
          this.half = 0; this.inning++;
        }
        return this.startHalf();
      }
      // mid-inning hook
      const p = this.def.pitcher;
      if (pr.BF >= p.stamina * 1.2 || pr.R >= 7 || (pr.R >= 5 && pr.start && this.inning <= 5)) { const n = this.avail(this.def, this.inning < 9)[0]; if (n) this.change(this.def, n); }
    }
    finish() {
      this.over = true;
      const [a, h] = this.teams, wi = a.runs > h.runs ? 0 : 1, ws = this.teams[wi];
      let W = this.record.W;
      if (W && W.start && W.outs < 15) W = ws.pit.slice(1).sort((x, y) => y.outs - x.outs)[0] || W;
      if (W) W.dec = 'W'; if (this.record.L) this.record.L.dec = 'L';
      const fin = ws.pit[ws.pit.length - 1];
      if (fin !== W && !fin.start && fin.entryLead > 0 && fin.entryLead <= 3) fin.dec = 'S';
      this.winner = wi;
    }
  }

  // one full at-bat, rolled by the computer (used for auto-roll and testing)
  function duel() { let a, b; do { a = d(20); b = d(20); } while (a === b); return [a, b]; }
  function autoAtBat(g) {
    const [bat, pit] = duel(), roll = d(100);
    const owner = bat > pit ? g.batter() : g.pitcher();
    const row = readCard(owner.card, roll);
    return { bat, pit, roll, owner: bat > pit ? 'batter' : 'pitcher', row, play: g.resolve(row.code) };
  }

    function cardFor(pl, isPitcher, N) {
    const avg = outcome({ N, rel: ONE, pitcher: isPitcher });
    return toCard(doubled(outcome({ N, rel: pl.rel, pitcher: isPitcher }), avg));
  }
  G.DuelDice = { cardFor, buildCards, readCard, Game, autoAtBat, duel, d, LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
