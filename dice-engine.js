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

  // ---- the manager's choices: steals, sacrifice bunts and intentional walks. Everything defaults to off, so a game without them plays exactly as it always did. ----
  const STEALS = ['off', 'selective', 'aggressive'], BUNTS = ['off', 'situational'], WALKS = ['off', 'situational'];
  const INF = ['normal', 'corners', 'in', 'dp'], OUTF = ['normal', 'in', 'deep'], DKEYS = ['infield_in', 'dp_depth', 'corners_in', 'outfield_in', 'outfield_deep', 'hold'];
  // infield / outfield / hold are the defense set right now (by the manager live, or by the policy below); defense is the saved league policy: each call 'off' or 'situational'
  function cleanStrategy(s) {
    s = s || {}; const dp = s.defense && typeof s.defense === 'object' ? s.defense : {}, defense = {}; DKEYS.forEach(k => { defense[k] = dp[k] === 'situational' ? 'situational' : 'off'; });
    return { steals: STEALS.includes(s.steals) ? s.steals : 'off', bunts: BUNTS.includes(s.bunts) ? s.bunts : 'off', walks: WALKS.includes(s.walks) ? s.walks : 'off', infield: INF.includes(s.infield) ? s.infield : 'normal', outfield: OUTF.includes(s.outfield) ? s.outfield : 'normal', hold: s.hold === true, defense };
  }
  const opsOf = b => (b.obp || 0) + (b.slg || 0);
  function opsRank(order) { const m = new Map(); [...order].sort((a, b) => opsOf(b) - opsOf(a)).forEach((b, i) => m.set(b.id, i + 1)); return m; }   // 1 = the best bat in the lineup
  const BUNT = { dp: 0.02, fc: 0.10, fail: 0.04 }, BUNT_CORNERS = { dp: 0.04, fc: 0.27, fail: 0.13 };   // corners in: a bunt works about 1 time in 2 instead of 3 in 4
  // what each defensive call does, in its own situation (a call helps there and costs a little elsewhere)
  const DEFN = { inGbScore: 0.15, inSingle: 0.06, dpTurn: 0.60, dpSingle: 0.04, corSingle: 0.05, ofInSf: 0.35, ofInSecond: 0.10, ofInDouble: 0.08, ofDeepHeld: 0.45, ofDeepFall: 0.05, ofDeepSecond: 0.03, ofDeepFirst: 0.03, holdSteal: 0.12, holdThird: 0.08, holdSingle: 0.05 };   // when a bunt is ordered: a double play (runner on first only), the lead runner thrown out, a popped-up bunt; bunt hits take 6% (more for fast hitters); the rest are sacrifices

  class Game {
    constructor(away, home, opts) {
      this.opts = opts;
      this.teams = [away, home].map((t, i) => ({ t, idx: 0, runs: 0, hits: 0, errors: 0, line: [], used: new Set(), bat: new Map(), pit: [],
        pitcher: t.rotation[opts.starters[i]] || t.rotation[0], strat: cleanStrategy(opts.strategy && opts.strategy[i]), rank: opsRank(t.order) }));
      for (const s of this.teams) {
        s.used.add(s.pitcher.id); s.cur = this.newPit(s, s.pitcher, true);
        for (const b of s.t.order) s.bat.set(b.id, { b, AB: 0, R: 0, H: 0, RBI: 0, BB: 0, SO: 0, HR: 0, D: 0, T: 0, SB: 0, CS: 0 });
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
    // ---- the defense: which of the set calls are in effect for this batter (each only works in its own situation) ----
    dfx() {
      const s = this.def.strat, B = this.bases, o = this.outs;
      return { inIn: s.infield === 'in' && !!B[2] && o < 2, dp: s.infield === 'dp' && !!B[0] && o < 2, cor: s.infield === 'corners' && !!(B[0] || B[1]) && !B[2] && o < 2, ofIn: s.outfield === 'in' && !!B[2] && o < 2, ofDeep: s.outfield === 'deep', hold: s.hold === true && !!B[0] };
    }
    setDef(team, key, val) {   // the manager sets his team's defense live: key is infield, outfield or hold
      const s = this.teams[team] && this.teams[team].strat; if (!s || this.over) return false;
      if (key === 'infield' && INF.includes(val)) s.infield = val; else if (key === 'outfield' && OUTF.includes(val)) s.outfield = val; else if (key === 'hold' && typeof val === 'boolean') s.hold = val; else return false;
      return true;
    }
    // ---- what the manager can choose right now ----
    stealChance(r, third) { const s = typeof r.b.stealSucc === 'number' ? r.b.stealSucc : 0.7, held = !third && this.def.strat.hold === true; return Math.min(0.92, Math.max(held ? 0.3 : 0.4, s + (third ? 0.03 : 0) - (held ? DEFN.holdSteal : 0))); }
    decisions() {
      const B = this.bases, offense = [], defense = [];
      if (this.over) return { offense, defense };
      if (B[0] && !B[1]) offense.push({ id: 'steal2', label: 'Steal second', who: B[0].b.name, chance: this.stealChance(B[0], false) });
      if (B[1] && !B[2]) offense.push({ id: 'steal3', label: 'Steal third', who: B[1].b.name, chance: this.stealChance(B[1], true) });
      if ((B[0] || B[1]) && !B[2] && this.outs < 2) offense.push({ id: 'bunt', label: 'Sacrifice bunt', who: this.batter().name });
      if (!B[0] && (B[1] || B[2])) defense.push({ id: 'ibb', label: 'Intentional walk', who: this.batter().name });
      return { offense, defense };
    }
    do(id) {
      if (this.over) return null;
      const d = this.decisions(); if (![...d.offense, ...d.defense].some(x => x.id === id)) return null;
      return id === 'steal2' ? this.steal(false) : id === 'steal3' ? this.steal(true) : id === 'bunt' ? this.bunt() : this.intentionalWalk();
    }
    action(code, label, txt, pr) {
      const play = { txt, code, label, manager: true, scored: 0, err: false, runners: this.bases.map(r => r ? r.b.short : null), outs: this.outs, inning: this.inning, half: this.half, score: [this.teams[0].runs, this.teams[1].runs], pre: this.pending.splice(0) };
      this.advance(pr); return play;
    }
    steal(third) {
      const off = this.off, B = this.bases, pr = this.def.cur, from = third ? 1 : 0, r = B[from], bRec = off.bat.get(r.b.id), base = third ? 'third' : 'second';
      if (rnd() < this.stealChance(r, third)) { B[from + 1] = r; B[from] = null; bRec.SB++; return this.action('SB', 'Stolen base', `${r.b.short} steals ${base}.`, pr); }
      B[from] = null; bRec.CS++; this.outs++; pr.outs++;
      return this.action('CS', 'Caught stealing', `${r.b.short} is caught stealing ${base}.`, pr);
    }
    bunt() {
      const off = this.off, B = this.bases, pr = this.def.cur, b = this.batter(), bRec = off.bat.get(b.id), spd = typeof b.spd === 'number' ? b.spd : 0.3;
      off.idx++; pr.BF++;
      const K = this.dfx().cor ? BUNT_CORNERS : BUNT;
      const hit = Math.min(0.15, Math.max(0.02, 0.06 + (spd - 0.3) * 0.12)), dp = B[0] && !B[1] ? K.dp : 0, x = rnd(), runner = { b, pr, unearned: false };
      const kind = x < dp ? 'dp' : x < dp + K.fc ? 'fc' : x < dp + K.fc + K.fail ? 'fail' : x < dp + K.fc + K.fail + hit ? 'hit' : 'sac';
      const advance = () => { if (B[1]) { B[2] = B[1]; B[1] = null; } if (B[0]) { B[1] = B[0]; B[0] = null; } };
      if (kind === 'sac') { this.outs++; pr.outs++; advance(); return this.action('SAC', 'Sacrifice bunt', `${b.short} lays down a sacrifice bunt.`, pr); }
      if (kind === 'hit') { bRec.AB++; bRec.H++; pr.H++; off.hits++; advance(); B[0] = runner; return this.action('BH', 'Bunt single', `${b.short} beats out a bunt for a single.`, pr); }
      if (kind === 'fc') { bRec.AB++; const lead = B[1] ? 1 : 0; B[lead] = null; if (lead === 1 && B[0]) { B[1] = B[0]; B[0] = null; } B[0] = runner; this.outs++; pr.outs++; return this.action('FC', 'Bunt, lead runner out', `${b.short} bunts, and the lead runner is thrown out at ${lead ? 'third' : 'second'}.`, pr); }
      if (kind === 'fail') { bRec.AB++; this.outs++; pr.outs++; return this.action('BO', 'Bunt out', `${b.short} pops up the bunt.`, pr); }
      bRec.AB++; this.outs += 2; pr.outs += 2; B[0] = null; return this.action('BDP', 'Bunt double play', `${b.short} bunts into a double play.`, pr);
    }
    intentionalWalk() { const b = this.batter(), play = this.resolve('BB'); play.txt = `${b.short} is intentionally walked.`; play.code = 'IBB'; play.label = 'Intentional walk'; play.manager = true; return play; }
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
      const fx = this.dfx(); let dnote = '';
      if (code === 'GB') { for (const [on, p, note] of [[fx.inIn, DEFN.inSingle, 'through the drawn-in infield'], [fx.dp, DEFN.dpSingle, 'with the infield back at double-play depth'], [fx.cor, DEFN.corSingle, 'past the charging corners'], [fx.hold, DEFN.holdSingle, 'past the first baseman holding the runner']]) if (on && rnd() < p) { code = 'S'; dnote = note; break; } }
      else if (code === 'FB') { if (fx.ofIn && rnd() < DEFN.ofInDouble) { code = '2B'; dnote = 'over the drawn-in outfield'; } else if (fx.ofDeep && rnd() < DEFN.ofDeepFall) { code = 'S'; dnote = 'in front of the deep outfield'; } }
      else if ((code === '2B' || code === '3B') && fx.ofDeep && rnd() < DEFN.ofDeepHeld) { code = 'S'; dnote = 'held to a single by the deep outfield'; }
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
          if (B[1]) { if (rnd() < (this.outs === 2 ? 0.82 : 0.58) + sp(B[1]) + (fx.ofDeep ? DEFN.ofDeepSecond : 0) - (fx.ofIn ? DEFN.ofInSecond : 0)) this.score(B[1], bRec); else B[2] = B[1]; B[1] = null; }
          if (B[0]) { if (!B[2] && rnd() < (this.outs === 2 ? 0.38 : 0.28) + sp(B[0]) + (fx.ofDeep ? DEFN.ofDeepFirst : 0) - (fx.hold ? DEFN.holdThird : 0)) B[2] = B[0]; else B[1] = B[0]; B[0] = null; }
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
          if (code === 'GB' && B[0] && this.outs < 2 && rnd() < (fx.dp ? DEFN.dpTurn : 0.42) - b.spd * 0.15) {
            bRec.AB++; this.outs += 2; pr.outs += 2; B[0] = null;
            if (this.outs < 3) { if (B[2]) { this.score(B[2], bRec, false); B[2] = null; } if (B[1]) { B[2] = B[1]; B[1] = null; } }
            txt = `${b.short} grounds into a double play.`; break;
          }
          this.outs++; pr.outs++; let sf = false;
          if (this.outs < 3) {
            if (code === 'GB') {
              if (fx.dp && B[2] && !B[1]) { this.score(B[2], bRec); B[2] = null; }   // double-play depth gives up the run from third
              if (B[0]) { if (B[1]) { if (B[2]) this.score(B[2], bRec); B[2] = B[1]; } B[1] = B[0]; B[0] = null; }
              else { if (B[2] && rnd() < (fx.inIn ? DEFN.inGbScore : 0.5)) { this.score(B[2], bRec); B[2] = null; } if (B[1] && !B[2] && rnd() < 0.6) { B[2] = B[1]; B[1] = null; } }
            } else if (code === 'FB') {
              if (B[2] && rnd() < (fx.ofIn ? DEFN.ofInSf : 0.62)) { this.score(B[2], bRec); B[2] = null; sf = true; }
              if (B[1] && !B[2] && rnd() < 0.25) { B[2] = B[1]; B[1] = null; }
            }
          }
          if (!sf) bRec.AB++;
          txt = code === 'GB' ? `${b.short} grounds out ${pick(FIELD.GB)}.` : code === 'LD' ? `${b.short} lines out ${pick(FIELD.LD)}.` :
            sf ? `${b.short} hits a sacrifice fly ${pick(FIELD.FB)}.` : `${b.short} flies out ${pick(FIELD.FB)}.`;
        }
      }
      if (dnote) txt = txt.replace(/\.$/, '') + ' ' + dnote + '.';
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

  // Applies the two managers' saved settings before an at-bat. Returns the play it made, or null when nobody wants to do anything.
  // a club's saved defensive calls become the defense for this batter. A club with none leaves the defense alone (a manager setting it live keeps his own settings).
  function autoDefense(g) {
    const sd = g.def.strat, P = sd.defense; if (!P || !DKEYS.some(k => P[k] === 'situational')) return;
    const B = g.bases, o = g.outs, inn = g.inning, dd = -g.lead(g.half), b = g.batter(), rank = g.off.rank.get(b.id) || 5;
    let inf = 'normal', out = 'normal';
    if (P.infield_in === 'situational' && B[2] && o < 2 && inn >= 7 && Math.abs(dd) <= 1) inf = 'in';                                   // late and close, a run 90 feet away
    else if (P.corners_in === 'situational' && (B[0] || B[1]) && !B[2] && o === 0 && rank >= 7 && Math.abs(dd) <= 2) inf = 'corners';     // where a weak bat would bunt
    else if (P.dp_depth === 'situational' && B[0] && !B[2] && o < 2) inf = 'dp';
    if (P.outfield_in === 'situational' && B[2] && o < 2 && inn >= 9 && dd <= 0 && dd >= -1) out = 'in';                                // the winning run on third in extras
    else if (P.outfield_deep === 'situational' && inn >= 8 && dd >= 1 && dd <= 3) out = 'deep';                                          // protecting a late lead
    sd.infield = inf; sd.outfield = out; sd.hold = P.hold === 'situational' && !!B[0] && !B[1] && (B[0].b.stealAtt || 0) >= 0.10;
  }
  function autoStrategy(g) {
    if (g.over) return null;
    autoDefense(g);
    const off = g.off, def = g.def, so = off.strat, sd = def.strat, d = g.decisions(), B = g.bases, diff = g.lead(g.half), has = id => d.offense.some(x => x.id === id) || d.defense.some(x => x.id === id);
    if (g.autoAt !== off.idx + ':' + g.inning + ':' + g.half) { g.autoAt = off.idx + ':' + g.inning + ':' + g.half; g.autoN = 0; }
    if (g.autoN >= 2) return null;
    const b = g.batter(), rank = off.rank.get(b.id) || 5, next = off.t.order[(off.idx + 1) % 9], late = g.inning >= 7;   // 'late' limits steals in lopsided games
    // the defense decides before the pitch: walk a dangerous bat to get to a weaker one, late and close, with first base open
    if (sd.walks === 'situational' && has('ibb') && g.inning >= 6 && -diff >= 0 && -diff <= 2 && rank <= 4 && (B[2] || (B[1] && g.outs < 2)) && opsOf(b) - opsOf(next) >= 0.04) { g.autoN++; return g.do('ibb'); }
    if (so.steals !== 'off' && (late ? Math.abs(diff) <= 4 : true)) {
      const agg = so.steals === 'aggressive';
      if (has('steal2')) { const r = B[0], att = r.b.stealAtt || 0, ok = (r.b.stealSucc || 0) >= (agg ? 0.66 : 0.5), p = agg ? Math.min(0.55, Math.max(att * 3.2, 0.10)) : Math.min(0.5, att * 2.0); if (ok && rnd() < p) { g.autoN++; return g.do('steal2'); } }
      if (has('steal3') && g.outs < 2) { const r = B[1], att = r.b.stealAtt || 0, ok = (r.b.stealSucc || 0) >= (agg ? 0.70 : 0.75), p = agg ? Math.max(att * 1.2, 0.05) : att * 1.4; if (ok && rnd() < p) { g.autoN++; return g.do('steal3'); } }
    }
    // the offense: a weak bat bunts a runner over with nobody out, in a close game
    if (so.bunts === 'situational' && has('bunt') && g.outs === 0 && B[0] && rank >= 7 && Math.abs(diff) <= 2) { g.autoN++; return g.do('bunt'); }
    return null;
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
  G.DuelDice = { cardFor, buildCards, readCard, Game, autoAtBat, autoStrategy, duel, d, LABEL, cleanStrategy };
})(typeof window !== 'undefined' ? window : globalThis);
