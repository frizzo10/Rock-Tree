// Plays one league game from two rosters, with the server's dice, and records every at-bat.
import './rng.js';        // must come first: the engine captures Math.random when it loads
import './engine.js';
import './dice-engine.js';
const G = globalThis.Diamond ? globalThis : (typeof window !== 'undefined' ? window : globalThis);
const { Diamond, DuelDice } = G;
const LINEUP = ['c', '1b', '2b', '3b', 'ss', 'lf', 'cf', 'rf', 'dh'];

// A roster (slot -> player key) becomes a team the engine can play, with its dice cards built from real stats.
export function buildClub(name, slots, data) {
  const rec = k => {
    const p = data.players[k]; if (!p) throw new Error('Unknown player ' + k);
    return { ...p, lgRates: data.leagues[p.lg] };
  };
  const lineup = {}; for (const pos of LINEUP) lineup[pos] = rec(slots[pos]);
  const rotation = [1, 2, 3, 4, 5].map(i => rec(slots['sp' + i]));
  const bullpen = [1, 2, 3, 4, 5, 6, 7].map(i => rec(slots['rp' + i]));
  const team = Diamond.prepTeam({ nick: name, league: data.neutral, lineup, rotation, bullpen }, data.neutral);
  return DuelDice.buildCards(team, data.neutral);
}

const ip = outs => Math.floor(outs / 3) + '.' + (outs % 3);
// Both clubs' starters follow their rotation: game day 1 is SP1, day 2 is SP2, and so on around.
export function playGame({ away, home, day, data }) {
  const A = buildClub(away.name, away.slots, data), H = buildClub(home.name, home.slots, data);
  const s = (day - 1) % 5, g = new DuelDice.Game(A, H, { starters: [s, s] });
  const starters = [g.teams[0].pitcher.name, g.teams[1].pitcher.name], log = [];
  while (!g.over && log.length < 600) {
    const batter = g.batter(), pitcher = g.pitcher(), [bat, pit] = DuelDice.duel(), roll = DuelDice.d(100);
    const owner = bat > pit ? batter : pitcher, row = DuelDice.readCard(owner.card, roll), play = g.resolve(row.code);
    log.push({ n: log.length + 1, inning: play.inning, half: play.half, batter: batter.name, pitcher: pitcher.name, bat, pit, roll, owner: bat > pit ? 'batter' : 'pitcher',
      code: row.code, label: row.label, lo: row.lo, hi: row.hi, txt: play.txt, scored: play.scored, outs: play.outs, runners: play.runners, score: play.score, pre: play.pre });
  }
  if (!g.over) throw new Error('The game did not finish.');
  const last = log[log.length - 1]; last.final = true; last.walkOff = g.inning >= 9 && last.half === 1 && last.scored > 0;
  const [a, h] = g.teams;
  const bats = t => [...t.bat.values()].map(r => ({ name: r.b.name, pos: r.b.fpos, AB: r.AB, R: r.R, H: r.H, RBI: r.RBI, BB: r.BB, SO: r.SO, HR: r.HR }));
  const pits = t => t.pit.map(r => ({ name: r.p.name, IP: ip(r.outs), H: r.H, R: r.R, ER: r.ER, BB: r.BB, SO: r.SO, HR: r.HR, dec: r.dec || null }));
  return { log, result: { away_runs: a.runs, home_runs: h.runs, winner: g.winner, names: [away.name, home.name], starters, line: [a.line, h.line], hits: [a.hits, h.hits], errors: [a.errors, h.errors],
    batting: [bats(a), bats(h)], pitching: [pits(a), pits(h)] } };
}
