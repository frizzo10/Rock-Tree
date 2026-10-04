// Turns a game's play-by-play into the facts the GM talks about. Every number here is counted from the plays, never guessed.
// log: the plays, each { inning, half (0 = visitors batting, 1 = home), batter, pitcher, code, scored, outs, score: [away, home], txt, pre }.
// o: { youHalf (the half your club bats in: 1 if you are the home team), yourClub, opponentClub, mode }.
(function (G) {
  'use strict';
  const HIT = new Set(['S', '2B', '3B', 'HR', 'BH']), NOT_A_PLATE_APPEARANCE = new Set(['SB', 'CS']), CALLS = new Set(['SB', 'CS', 'SAC', 'BH', 'FC', 'BO', 'BDP', 'IBB']);
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 80);
  const ip = outs => Math.floor(outs / 3) + '.' + (outs % 3);
  const halfName = h => (h === 0 ? 'top' : 'bottom');
  function build(log, o) {
    const L = (Array.isArray(log) ? log : []).filter(p => p && typeof p === 'object'), youHalf = o && o.youHalf === 0 ? 0 : 1;
    const youBats = p => p.half === youHalf, pitcherSide = p => (youBats(p) ? 'opponent' : 'you'), batSide = p => (youBats(p) ? 'you' : 'opponent');
    const pit = new Map(), order = [], lastBySide = { you: null, opponent: null }, changes = [], calls = { you: { stolenBases: 0, caughtStealing: 0, sacrificeBunts: 0, buntHits: 0, buntsThatFailed: 0, intentionalWalks: 0 }, opponent: { stolenBases: 0, caughtStealing: 0, sacrificeBunts: 0, buntHits: 0, buntsThatFailed: 0, intentionalWalks: 0 } };
    const hits = { you: 0, opponent: 0 }, hitters = new Map(), moments = [], biggest = { you: 0, opponent: 0 };
    let prev = null, prevScore = [0, 0], lastLeader = 0, leadChanges = 0, innings = 1;
    L.forEach((p, i) => {
      const same = prev && prev.inning === p.inning && prev.half === p.half, outsBefore = same ? (prev.outs || 0) : 0, made = Math.max(0, (p.outs || 0) - outsBefore), score = Array.isArray(p.score) ? p.score : prevScore;
      const you = score[youHalf] || 0, opp = score[1 - youHalf] || 0, side = pitcherSide(p), name = clean(p.pitcher);
      innings = Math.max(innings, p.inning || 1);
      // the pitcher on the mound for this play
      if (name) {
        const key = side + ':' + name; let s = pit.get(key);
        if (!s) { s = { side, name, outs: 0, bf: 0, h: 0, bb: 0, hbp: 0, so: 0, hr: 0, r: 0, inning: p.inning, half: halfName(p.half), outsBefore, youRuns: prevScore[youHalf] || 0, opponentRuns: prevScore[1 - youHalf] || 0, first: order.length }; pit.set(key, s); order.push(s); }
        if (lastBySide[side] && lastBySide[side] !== s) changes.push({ side, from: lastBySide[side], to: s, inning: p.inning, half: halfName(p.half), outs: outsBefore, youRuns: prevScore[youHalf] || 0, opponentRuns: prevScore[1 - youHalf] || 0 });
        lastBySide[side] = s;
        s.outs += made; s.r += p.scored || 0;
        if (!NOT_A_PLATE_APPEARANCE.has(p.code)) s.bf++;
        if (HIT.has(p.code)) s.h++; if (p.code === 'BB' || p.code === 'IBB') s.bb++; if (p.code === 'HBP') s.hbp++; if (p.code === 'SO') s.so++; if (p.code === 'HR') s.hr++;
      }
      // the club that is batting
      const bs = batSide(p);
      if (HIT.has(p.code)) hits[bs]++;
      if (CALLS.has(p.code)) {
        const c = calls[p.code === 'IBB' ? side : bs];
        if (p.code === 'SB') c.stolenBases++; else if (p.code === 'CS') c.caughtStealing++; else if (p.code === 'SAC') c.sacrificeBunts++; else if (p.code === 'BH') c.buntHits++; else if (p.code === 'IBB') c.intentionalWalks++; else c.buntsThatFailed++;
      }
      if (bs === 'you' && p.batter) {
        const n = clean(p.batter); let h = hitters.get(n); if (!h) { h = { name: n, hits: 0, homeRuns: 0, walks: 0, strikeouts: 0, plateAppearances: 0 }; hitters.set(n, h); }
        if (!NOT_A_PLATE_APPEARANCE.has(p.code)) h.plateAppearances++; if (HIT.has(p.code)) h.hits++; if (p.code === 'HR') h.homeRuns++; if (p.code === 'BB' || p.code === 'IBB') h.walks++; if (p.code === 'SO') h.strikeouts++;
      }
      // leads and the swing of the game
      const lead = you - opp, leader = Math.sign(lead); let leadChanged = false;
      if (leader !== 0 && lastLeader !== 0 && leader !== lastLeader) { leadChanges++; leadChanged = true; } else if (leader !== 0 && lastLeader === 0 && (prevScore[0] !== prevScore[1] || false)) { /* first lead is not a change */ }
      if (leader !== 0) lastLeader = leader;
      biggest.you = Math.max(biggest.you, lead); biggest.opponent = Math.max(biggest.opponent, -lead);
      const tied = lead === 0 && (prevScore[0] !== prevScore[1]), walkOff = i === L.length - 1 && p.half === 1 && (p.inning || 0) >= 9 && (p.scored || 0) > 0;
      const takesLead = leader !== 0 && (Math.sign((prevScore[youHalf] || 0) - (prevScore[1 - youHalf] || 0)) !== leader);
      const imp = (p.scored || 0) * 2 + (takesLead ? 4 : 0) + (leadChanged ? 2 : 0) + (tied ? 3 : 0) + ((p.inning || 0) >= 7 ? 2 : 0) + ((p.inning || 0) >= 9 ? 2 : 0) + (p.code === 'HR' ? 2 : 0) + (walkOff ? 6 : 0) + (((p.code === 'CS' || p.code === 'BDP') && (p.inning || 0) >= 7) ? 2 : 0);
      if (imp >= 5 && p.txt) moments.push({ imp, i, inning: p.inning, half: halfName(p.half), text: clean(p.txt, 140), youRuns: you, opponentRuns: opp, batter: clean(p.batter), pitcher: clean(p.pitcher), walkOff });
      prev = p; prevScore = [score[0] || 0, score[1] || 0];
    });
    const last = L[L.length - 1], fin = last && Array.isArray(last.score) ? last.score : [0, 0], finalScore = { you: fin[youHalf] || 0, opponent: fin[1 - youHalf] || 0 };
    const line = s => ({ side: s.side, name: s.name, ip: ip(s.outs), bf: s.bf, hits: s.h, runs: s.r, walks: s.bb, hitBatters: s.hbp, strikeouts: s.so, homeRuns: s.hr, cameInInning: s.inning, cameInHalf: s.half });
    // all of your pitchers and changes are kept; the opponent's are trimmed first, and what was left out is said
    const mine = order.filter(s => s.side === 'you'), theirs = order.filter(s => s.side === 'opponent');
    let keepOpp = 6, keepChangeOpp = 4;
    const make = () => {
      const pitchers = [...mine.slice(0, 10), ...theirs.slice(0, keepOpp)];
      const yours = changes.filter(c => c.side === 'you').slice(0, 8), theirsC = changes.filter(c => c.side === 'opponent').slice(0, keepChangeOpp);
      const chosen = [...yours, ...theirsC].sort((a, b) => changes.indexOf(a) - changes.indexOf(b));
      return { pitching: pitchers.map(line), omitted: { you: Math.max(0, mine.length - 10), opponent: Math.max(0, theirs.length - keepOpp) }, changes: chosen.map((c, k) => ({ n: k + 1, side: c.side, inning: c.inning, half: c.half, outs: c.outs, youRuns: c.youRuns, opponentRuns: c.opponentRuns, leaving: { name: c.from.name, ip: ip(c.from.outs), bf: c.from.bf, runs: c.from.r }, entering: { name: c.to.name, ip: ip(c.to.outs), bf: c.to.bf, runs: c.to.r, hits: c.to.h, walks: c.to.bb, strikeouts: c.to.so } })), changesOmitted: Math.max(0, changes.length - chosen.length) };
    };
    let pick = make();
    const top = moments.sort((a, b) => b.imp - a.imp || a.i - b.i).slice(0, 4).sort((a, b) => a.i - b.i).map((m, k) => ({ n: k + 1, inning: m.inning, half: m.half, text: m.text, youRuns: m.youRuns, opponentRuns: m.opponentRuns, walkOff: m.walkOff || undefined }));
    const stars = [...hitters.values()].map(h => ({ h, v: h.hits + h.homeRuns * 2 + h.walks * 0.5 - h.strikeouts * 0.25 })).sort((a, b) => b.v - a.v).slice(0, 3).map(x => x.h);
    const build2 = () => ({ mode: o && o.mode === 'league' ? 'league' : 'quick', youWon: finalScore.you > finalScore.opponent, yourClub: clean(o && o.yourClub, 60), opponentClub: clean(o && o.opponentClub, 60), finalScore, innings, youAreTheHomeTeam: youHalf === 1, leadChanges, biggestLead: { you: biggest.you, opponent: biggest.opponent }, hits, pitching: pick.pitching, pitchersLeftOut: pick.omitted.you || pick.omitted.opponent ? pick.omitted : undefined, changes: pick.changes, changesLeftOut: pick.changesOmitted || undefined, moments: top, calls, hitters: stars });
    let facts = build2();
    if (JSON.stringify(facts).length > 8500) { keepOpp = 3; keepChangeOpp = 0; pick = make(); facts = build2(); }
    if (JSON.stringify(facts).length > 8500) { facts.moments = top.slice(0, 2); facts.hitters = stars.slice(0, 2); }
    return facts;
  }
  G.GMFacts = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = G.GMFacts;
})(typeof window !== 'undefined' ? window : globalThis);
