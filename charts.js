// Four charts of a player's record, shared by the My page and the My record page.
// CCCharts.html(career, stats) returns the markup; CCCharts.wire(element) turns on the hover/tap tooltips.
// Plain SVG, no library. Colors: slot 1 blue and slot 2 orange of the validated palette.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = x => (Number.isFinite(+x) ? Math.max(0, Math.floor(+x)) : 0);
  const W = 340;   // every chart is drawn 340 wide and scales to the screen
  const CSS = `
.ccv { --s1:#2a78d6; --s2:#eb6834; --grid:#d6d8d2; --axis:#7d8288; --tx:#19231E; --tx2:#4A5560; position:relative; color:var(--tx); }
:root[data-theme="dark"] .ccv { --s1:#3987e5; --s2:#d95926; --grid:#3b3f3d; --axis:#8b9490; --tx:#E4E8E0; --tx2:#A9B4AD; }
.ccv .cv { margin:0 0 26px; } .ccv .cv:last-of-type { margin-bottom:6px; }
.ccv h3 { margin:0 0 2px; font-size:18px; } .ccv .sub { margin:0 0 8px; color:var(--tx2); font-size:15px; }
.ccv svg { display:block; width:100%; height:auto; overflow:visible; } .ccv svg text { fill:var(--tx); font:12px system-ui,-apple-system,sans-serif; } .ccv svg text.t2 { fill:var(--tx2); }
.ccv .gridl { stroke:var(--grid); stroke-width:1; } .ccv .mk { cursor:pointer; }
.ccv .key { display:flex; gap:16px; flex-wrap:wrap; margin:0 0 6px; font-size:14px; color:var(--tx2); } .ccv .key i { display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:6px; vertical-align:-1px; }
.ccv .none { color:var(--tx2); margin:4px 0 0; }
.ccv details { margin-top:6px; font-size:14px; } .ccv summary { cursor:pointer; color:var(--tx2); min-height:32px; display:flex; align-items:center; }
.ccv table.cvt { border-collapse:collapse; width:100%; margin-top:4px; } .ccv .cvt th, .ccv .cvt td { text-align:left; padding:4px 8px 4px 0; border-bottom:1px solid var(--grid); font-weight:400; } .ccv .cvt th { font-weight:700; }
.ccv .tip { position:absolute; z-index:5; pointer-events:none; background:#1c1f1d; color:#fff; padding:6px 10px; border-radius:6px; font:14px/1.3 system-ui,sans-serif; max-width:230px; box-shadow:0 2px 8px rgba(0,0,0,.35); display:none; }
`;
  let cssDone = false;
  function ensureCss() { if (cssDone || typeof document === 'undefined') return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

  const pct3 = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '');
  const nice = max => { if (max <= 40) return Math.max(4, Math.ceil(max / 4) * 4); const step = Math.pow(10, Math.floor(Math.log10(max / 4))), m = max / 4 / step, s = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * step; return Math.ceil(max / s) * s; };
  const table = (head, rows) => `<details><summary>Show the numbers</summary><table class="cvt"><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></details>`;
  const card = (title, sub, body, tbl) => `<div class="cv"><h3>${esc(title)}</h3><p class="sub">${esc(sub)}</p>${body}${tbl || ''}</div>`;
  const key = items => `<div class="key">${items.map(([c, t]) => `<span><i style="background:var(${c})"></i>${esc(t)}</span>`).join('')}</div>`;
  const rbar = (x, y, w, h, fill, tip) => {   // a bar with its far end rounded (the base stays square), 4px
    if (w <= 0) return ''; const r = Math.min(4, w, h / 2);
    return `<path class="mk" data-tip="${esc(tip)}" fill="var(${fill})" d="M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z"/>`;
  };
  const cbar = (x, y, w, h, fill, tip) => {   // a column with its top rounded, the base square
    if (h <= 0) return ''; const r = Math.min(4, w / 2, h);
    return `<path class="mk" data-tip="${esc(tip)}" fill="var(${fill})" d="M${x},${y + h} v-${h - r} a${r},${r} 0 0 1 ${r},-${r} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z"/>`;
  };

  // 1. your last quick games: runs you scored and runs you allowed, side by side
  function lastGames(c) {
    const rec = (c.quick && Array.isArray(c.quick.recent) ? c.quick.recent : []).slice(0, 10).reverse();
    if (!rec.length) return card('Your last games', 'Runs you scored and runs you allowed in your quick games.', '<p class="none">Finish a quick game while signed in and it will show up here.</p>');
    const L = 28, B = 22, T = 8, H = 190, ph = H - B - T, pw = W - L, max = nice(Math.max(...rec.map(r => Math.max(n(r.for), n(r.against))), 1)), slot = pw / rec.length, bw = Math.min(12, slot / 2 - 2);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = max / 4 * i, y = T + ph - ph * v / max; g += `<line class="gridl" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text class="t2" x="${L - 6}" y="${y + 4}" text-anchor="end">${Math.round(v * 10) / 10}</text>`; }
    const bars = rec.map((r, i) => {
      const cx = L + slot * i + slot / 2, f = n(r.for), a = n(r.against), hf = ph * f / max, ha = ph * a / max, tip = `${r.won ? 'Won' : 'Lost'} ${f}–${a}${r.opp ? ' vs ' + r.opp : ''}`;
      return cbar(cx - bw - 1, T + ph - hf, bw, hf, '--s1', tip + ': you scored ' + f) + cbar(cx + 1, T + ph - ha, bw, ha, '--s2', tip + ': you allowed ' + a) + `<text x="${cx}" y="${H - 6}" text-anchor="middle" style="font-weight:700">${r.won ? 'W' : 'L'}</text>`;
    }).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Runs scored and allowed in your last ${rec.length} quick games, oldest on the left. ${rec.map(r => (r.won ? 'Won ' : 'Lost ') + n(r.for) + ' to ' + n(r.against)).join('; ')}.">${g}${bars}</svg>`;
    return card('Your last games', `Runs you scored and allowed in your last ${rec.length} quick ${rec.length === 1 ? 'game' : 'games'}, oldest on the left.`, key([['--s1', 'You scored'], ['--s2', 'You allowed']]) + svg,
      table(['Game', 'Result', 'Scored', 'Allowed', 'Opponent'], rec.map((r, i) => [String(i + 1), r.won ? 'Won' : 'Lost', String(n(r.for)), String(n(r.against)), r.opp || ''])));
  }

  // 2. wins and losses: quick games, league regular seasons and playoffs
  function records(c) {
    const q = c.quick || {}, l = c.leagues || {};
    const rows = [['Quick games', n(q.wins), n(q.losses)], ['League regular season', n(l.reg_w), n(l.reg_l)], ['Playoffs', n(l.po_w), n(l.po_l)]].filter(r => r[1] + r[2] > 0);
    if (!rows.length) return card('Wins and losses', 'Your record in quick games, league seasons and playoffs.', '<p class="none">Play a game and your record will show here.</p>');
    const RH = 52, H = rows.length * RH, bh = 16;
    const body = rows.map(([name, w, lo], i) => {
      const y = i * RH, tot = w + lo, ww = Math.max(0, (W - 4) * w / tot), lw = Math.max(0, (W - 4) * lo / tot), by = y + 24;
      const sw = ww > 0 && lw > 0 ? 2 : 0;
      return `<text x="0" y="${y + 14}" style="font-weight:700">${esc(name)}</text><text class="t2" x="${W}" y="${y + 14}" text-anchor="end">${w}–${lo}${pct3(w, lo) ? ' (' + pct3(w, lo) + ')' : ''}</text>` +
        (ww > 0 ? `<rect class="mk" data-tip="${esc(name)}: ${w} ${w === 1 ? 'win' : 'wins'}" x="0" y="${by}" width="${Math.max(0, ww - sw / 2)}" height="${bh}" rx="3" fill="var(--s1)"/>` : '') +
        (lw > 0 ? `<rect class="mk" data-tip="${esc(name)}: ${lo} ${lo === 1 ? 'loss' : 'losses'}" x="${ww + sw / 2}" y="${by}" width="${Math.max(0, lw - sw / 2)}" height="${bh}" rx="3" fill="var(--s2)"/>` : '');
    }).join('');
    return card('Wins and losses', 'Each bar is all the games of that kind: wins in blue, losses in orange.', key([['--s1', 'Wins'], ['--s2', 'Losses']]) + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Win-loss record. ${rows.map(r => r[0] + ' ' + r[1] + ' wins, ' + r[2] + ' losses').join('; ')}.">${body}</svg>`,
      table(['', 'Wins', 'Losses', 'Win rate'], rows.map(([name, w, lo]) => [name, String(w), String(lo), pct3(w, lo) || '–'])));
  }

  // 3. how your plate appearances ended
  function atBats(st) {
    const sums = ['h', 'd2', 'd3', 'hr', 'bb', 'so'].reduce((o, k) => (o[k] = ((st && st.quick && st.quick.sums && +st.quick.sums[k]) || 0) + ((st && st.leagues && st.leagues.sums && +st.leagues.sums[k]) || 0), o), {});
    const h = n(sums.h), d2 = n(sums.d2), d3 = n(sums.d3), hr = n(sums.hr), singles = Math.max(0, h - d2 - d3 - hr);
    const rows = [['Singles', singles], ['Doubles', d2], ['Triples', d3], ['Home runs', hr], ['Walks', n(sums.bb)], ['Strikeouts', n(sums.so)]];
    const total = rows.reduce((a, r) => a + r[1], 0);
    if (!total) return card('How your at-bats ended', 'Hits, walks and strikeouts across your games with a stat line.', '<p class="none">Your hits, walks and strikeouts will chart here once a game with a stat line is on your record.</p>');
    const LW = 86, RH = 32, H = rows.length * RH, max = Math.max(...rows.map(r => r[1]), 1), bh = 16, pw = W - LW - 40;
    const body = rows.map(([name, v], i) => {
      const y = i * RH + 8, w = Math.max(v ? 4 : 0, pw * v / max);
      return `<text x="0" y="${y + 12}">${esc(name)}</text>${rbar(LW, y, w, bh, '--s1', `${name}: ${v}`)}<text x="${LW + w + 6}" y="${y + 12}" style="font-weight:700">${v}</text>`;
    }).join('');
    return card('How your at-bats ended', 'Hits, walks and strikeouts by your hitters, from every game with a stat line.', `<svg viewBox="0 0 ${W} ${H + 8}" role="img" aria-label="How your at-bats ended. ${rows.map(r => r[0] + ' ' + r[1]).join('; ')}.">${body}</svg>`, table(['Result', 'Count'], rows.map(r => [r[0], String(r[1])])));
  }

  // 4. your drafts by grade
  function grades(st) {
    const G = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'], gr = (st && st.drafts && st.drafts.grades) || {}, vals = G.map(g => n(gr[g]));
    if (!vals.some(Boolean)) return card('Your drafts by grade', 'How many of your mock drafts earned each grade.', '<p class="none">Grade a mock draft while signed in and it will chart here.</p>');
    const L = 24, B = 22, T = 14, H = 170, ph = H - B - T, pw = W - L, max = nice(Math.max(...vals, 1)), slot = pw / G.length, bw = Math.min(16, slot - 4);
    let g = ''; for (let i = 0; i <= 4; i++) { const v = max / 4 * i, y = T + ph - ph * v / max; g += `<line class="gridl" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text class="t2" x="${L - 6}" y="${y + 4}" text-anchor="end">${Math.round(v * 10) / 10}</text>`; }
    const bars = G.map((name, i) => {
      const cx = L + slot * i + slot / 2, v = vals[i], hh = ph * v / max;
      return cbar(cx - bw / 2, T + ph - hh, bw, hh, '--s1', `${name}: ${v} ${v === 1 ? 'draft' : 'drafts'}`) + (v ? `<text x="${cx}" y="${T + ph - hh - 4}" text-anchor="middle" style="font-weight:700">${v}</text>` : '') + `<text class="t2" x="${cx}" y="${H - 6}" text-anchor="middle" style="font-size:11px">${esc(name)}</text>`;
    }).join('');
    return card('Your drafts by grade', 'How many of your mock drafts earned each grade.', `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mock drafts by grade. ${G.map((x, i) => vals[i] ? x + ' ' + vals[i] : '').filter(Boolean).join('; ')}.">${g}${bars}</svg>`, table(['Grade', 'Drafts'], G.map((x, i) => [x, String(vals[i])]).filter(r => +r[1])));
  }

  function html(career, stats) {
    ensureCss(); const c = career || {};
    return `<div class="ccv">${lastGames(c)}${records(c)}${atBats(stats)}${grades(stats)}<div class="tip" role="presentation"></div></div>`;
  }
  function wire(root) {
    if (!root) return; const box = root.querySelector('.ccv'); if (!box || box.dataset.wired) return; box.dataset.wired = '1';
    const tip = box.querySelector('.tip');
    const show = e => {
      const m = e.target.closest && e.target.closest('[data-tip]'); if (!m) { tip.style.display = 'none'; return; }
      tip.textContent = m.getAttribute('data-tip'); tip.style.display = 'block';
      const b = box.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      tip.style.left = Math.max(0, Math.min(b.width - tip.offsetWidth, x - tip.offsetWidth / 2)) + 'px'; tip.style.top = Math.max(0, y - tip.offsetHeight - 14) + 'px';
    };
    box.addEventListener('pointerover', show); box.addEventListener('pointermove', show); box.addEventListener('pointerdown', show);
    box.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
    document.addEventListener('pointerdown', e => { if (!box.contains(e.target)) tip.style.display = 'none'; });
  }
  window.CCCharts = { html, wire };
})();
