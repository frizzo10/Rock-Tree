// Play invites: while a signed-in person is "open to play", this page checks every few seconds for invites,
// keeps them on the who's-online list, and shows invites and answers in a small bar at the bottom of the screen.
// It does nothing at all unless the person has switched Open to play on.
(() => {
  if (window.PlayInvite) return;
  const KEY = 'cc_play_open', SEEN = 'cc_play_seen', STAY_MS = 3 * 60 * 60 * 1000, EVERY_MS = 5000;
  const CLUBS = [["1906CHN",1906,"Cubs",116,36],["1927NYA",1927,"Yankees",110,44],["1929PHA",1929,"Athletics",104,46],["1939NYA",1939,"Yankees",106,45],["1954CLE",1954,"Indians",111,43],["1955BRO",1955,"Dodgers",98,55],["1961NYA",1961,"Yankees",109,53],["1970BAL",1970,"Orioles",108,54],["1975CIN",1975,"Reds",108,54],["1984DET",1984,"Tigers",104,58],["1986NYN",1986,"Mets",108,54],["1998NYA",1998,"Yankees",114,48],["2001SEA",2001,"Mariners",116,46],["2004BOS",2004,"Red Sox",98,64],["2016CHN",2016,"Cubs",103,58],["2022LAN",2022,"Dodgers",111,51]];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  const isOpen = () => Number(ls.get(KEY) || 0) > Date.now();
  const client = () => window.CC && window.CC.client;
  const onLobby = /play-lobby\.html$/.test(location.pathname);
  let timer = null, bar = null, last = null, busy = false, dismissed = {};
  const listeners = [];

  const css = document.createElement('style');
  css.textContent = `#cc-play-bar{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;padding:0 12px calc(12px + env(safe-area-inset-bottom,0px));pointer-events:none;font:16px/1.4 'IBM Plex Sans Condensed','Arial Narrow',Arial,sans-serif}
#cc-play-bar .pi{pointer-events:auto;width:100%;max-width:520px;background:#F7F8F6;color:#20262D;border-radius:6px;box-shadow:0 0 0 3px #1F3F8F,0 8px 24px rgba(0,0,0,.35);padding:12px 14px}
#cc-play-bar .pi b{color:#1F3F8F}
#cc-play-bar .pi .who{display:flex;align-items:center;gap:10px;margin-bottom:8px}
#cc-play-bar .pi .av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:20px;flex:none}
#cc-play-bar .pi p{margin:0 0 8px}
#cc-play-bar .pi select{width:100%;padding:9px 10px;border:1.5px solid #8C959E;border-radius:4px;background:#fff;color:#1B1F24;font:inherit;margin:0 0 8px}
#cc-play-bar .row{display:flex;gap:8px;flex-wrap:wrap}
#cc-play-bar button,#cc-play-bar a.pb{border:0;border-radius:4px;padding:9px 16px;font:600 16px/1.3 inherit;font-family:inherit;cursor:pointer;text-decoration:none;display:inline-block}
#cc-play-bar .go{background:#1F3F8F;color:#fff}
#cc-play-bar .no{background:transparent;color:#20262D;border:1.5px solid #8C959E}
#cc-play-bar :focus-visible{outline:3px solid #F2B33D;outline-offset:2px}
#cc-play-bar .err{color:#C0392B;font-weight:600;margin:0 0 6px}`;
  document.head.appendChild(css);

  function ensureBar() { if (bar) return bar; bar = document.createElement('div'); bar.id = 'cc-play-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Game invites'); bar.setAttribute('aria-live', 'polite'); document.body.appendChild(bar); return bar; }
  const who = (n, e, c) => `<div class="who"><span class="av" style="background:${esc(/^#[0-9A-Fa-f]{3,8}$/.test(c || '') ? c : '#8C959E')}">${esc(e || '⚾')}</span><span><b>${esc(n)}</b></span></div>`;
  const modeText = m => m === 'draft' ? 'draft teams together' : 'a game with great clubs';
  const options = () => CLUBS.map(c => `<option value="${c[0]}"${c[0] === '1927NYA' ? ' selected' : ''}>${c[1]} ${esc(c[2])} (${c[3]}-${c[4]})</option>`).join('');

  function paint(d) {
    const root = ensureBar(), focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : '';
    const keep = {}; root.querySelectorAll('select[data-club]').forEach(s => { keep[s.dataset.club] = s.value; });
    const parts = [];
    for (const i of d.incoming || []) {
      if (dismissed[i.id]) continue;
      parts.push(`<div class="pi" data-in="${esc(i.id)}">${who(i.name, i.emoji, i.color)}<p>wants to play you: ${modeText(i.mode)}.</p>
        ${i.mode === 'clubs' ? `<label for="pc-${esc(i.id)}" style="font-weight:600;font-size:14px;display:block;margin-bottom:4px">Pick your club</label><select id="pc-${esc(i.id)}" data-club="${esc(i.id)}">${options()}</select>` : ''}
        <p class="err" data-err="${esc(i.id)}" role="alert" hidden></p>
        <div class="row"><button class="go" data-accept="${esc(i.id)}" type="button">Accept</button><button class="no" data-decline="${esc(i.id)}" type="button">Not now</button></div></div>`);
    }
    const o = d.outgoing;
    if (o && !dismissed[o.id]) {
      if (o.status === 'pending') parts.push(`<div class="pi"><p>Invite sent. Waiting for <b>${esc(o.name)}</b> to answer…</p><div class="row"><button class="no" data-cancel="${esc(o.id)}" type="button">Cancel the invite</button></div></div>`);
      else if (o.status === 'accepted' && o.game_id) {
        if (onLobby && !ss.get(SEEN + o.id)) { ss.set(SEEN + o.id, '1'); location.href = 'friend.html?g=' + encodeURIComponent(o.game_id); return; }
        if (!ss.get(SEEN + o.id)) parts.push(`<div class="pi"><p><b>${esc(o.name)}</b> said yes.</p><div class="row"><a class="pb go" href="friend.html?g=${encodeURIComponent(o.game_id)}" data-seen="${esc(o.id)}">Open your game</a><button class="no" data-dismiss="${esc(o.id)}" type="button">Later</button></div></div>`);
      } else if ((o.status === 'declined' || o.status === 'expired') && !ss.get(SEEN + o.id)) {
        parts.push(`<div class="pi"><p>${o.status === 'declined' ? `<b>${esc(o.name)}</b> can't play right now.` : `<b>${esc(o.name)}</b> didn't answer in time.`}</p><div class="row"><button class="no" data-dismiss="${esc(o.id)}" type="button">OK</button></div></div>`);
      }
    }
    root.innerHTML = parts.join('');
    root.querySelectorAll('select[data-club]').forEach(s => { if (keep[s.dataset.club]) s.value = keep[s.dataset.club]; });
    if (focusId) { const f = document.getElementById(focusId); if (f) f.focus(); }
  }

  async function tick() {
    if (busy || !isOpen() || !window.CC || !window.CC.user || !client()) return;
    busy = true;
    try {
      const r = await client().rpc('my_play_invites');
      if (r.error || !r.data) return;
      if (!r.data.open) { ls.del(KEY); paint({}); emit(false); return; }
      ls.set(KEY, String(Date.now() + STAY_MS));
      last = r.data; paint(last); emit(true);
    } catch (e) { /* try again next time */ } finally { busy = false; }
  }
  const emit = on => listeners.forEach(f => { try { f(on, last); } catch (e) {} });
  function start() { if (timer || !isOpen()) return; tick(); timer = setInterval(() => { if (!document.hidden) tick(); }, EVERY_MS); }
  function stop() { clearInterval(timer); timer = null; if (bar) bar.innerHTML = ''; }

  document.addEventListener('click', async ev => {
    const t = ev.target.closest && ev.target.closest('#cc-play-bar [data-accept],#cc-play-bar [data-decline],#cc-play-bar [data-cancel],#cc-play-bar [data-dismiss],#cc-play-bar [data-seen]');
    if (!t) return;
    const c = client();
    if (t.dataset.seen) { ss.set(SEEN + t.dataset.seen, '1'); return; }   // the link goes on to the game
    if (t.dataset.dismiss) { ss.set(SEEN + t.dataset.dismiss, '1'); dismissed[t.dataset.dismiss] = 1; if (last) paint(last); return; }
    if (!c) return;
    t.disabled = true;
    if (t.dataset.cancel) { await c.rpc('cancel_play_invite', { p_id: t.dataset.cancel }); tick(); return; }
    if (t.dataset.decline) { await c.rpc('respond_play_invite', { p_id: t.dataset.decline, p_accept: false, p_team: null }); dismissed[t.dataset.decline] = 1; if (last) paint(last); tick(); return; }
    const id = t.dataset.accept, sel = document.getElementById('pc-' + id);
    const r = await c.rpc('respond_play_invite', { p_id: id, p_accept: true, p_team: sel ? sel.value : null });
    if (r.error) { t.disabled = false; const e = document.querySelector(`[data-err="${id}"]`); if (e) { e.hidden = false; e.textContent = r.error.message; } return; }
    location.href = 'friend.html?g=' + encodeURIComponent(r.data.id);
  });

  window.PlayInvite = {
    CLUBS, isOpen,
    onChange(f) { listeners.push(f); },
    refresh: tick,
    async setOpen(on) {
      const c = client(); if (!c) return { error: { message: 'We could not reach the server.' } };
      const r = await c.rpc('set_play_open', { p_open: !!on });
      if (r.error) return r;
      if (on) { ls.set(KEY, String(Date.now() + STAY_MS)); start(); tick(); } else { ls.del(KEY); stop(); }
      return r;
    }
  };
  const boot = () => { if (isOpen()) start(); window.addEventListener('cc-auth', () => { if (isOpen()) start(); }); };
  if (window.CC && window.CC.whenReady) window.CC.whenReady(boot);
})();
