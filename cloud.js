// Cooperstown Cash: accounts and saved progress.
// Play works without an account. Signing in (email link, no password) copies your drafts, leagues,
// wins and unlocks to your account and keeps them in sync across devices.
(function () {
  const SUPABASE_URL = 'https://yqungoehuurjxanobpsb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_OOOgHRHOes5EYOVnZGyPCw_4FG9Xkz6'; // publishable key: safe in the browser, rows are protected per player
  const SLOTS = ['gts-draft', 'gts-progress', 'gts-clock', 'gts-proj', 'cc-league-v1'];
  const META = 'cc-sync-meta'; // when each slot last changed on this device

  // Registration gate. Play pages ask for a free account (email link, no password) before anything runs.
  // Flip REQUIRE_SIGNIN to false to open play to everyone again.
  const REQUIRE_SIGNIN = false;
  const PAGE = location.pathname.split('/').pop().replace(/\.html$/, '');
  const GATED = REQUIRE_SIGNIN && ['play', 'draft', 'league'].includes(PAGE);

  const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch (e) { return {}; } };
  const writeMeta = m => { try { rawSet.call(localStorage, META, JSON.stringify(m)); } catch (e) {} };

  let client = null, user = null;
  const dirty = new Set(), removed = new Set();
  let timer = null;

  // watch the game's own saves so every change is queued for the cloud
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === localStorage && SLOTS.includes(k)) { const m = readMeta(); m[k] = new Date().toISOString(); writeMeta(m); dirty.add(k); removed.delete(k); schedule(); }
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === localStorage && SLOTS.includes(k)) { const m = readMeta(); delete m[k]; writeMeta(m); removed.add(k); dirty.delete(k); schedule(); }
  };
  function schedule() { if (!user) return; clearTimeout(timer); timer = setTimeout(push, 1500); }

  async function push() {
    if (!client || !user) return;
    const m = readMeta(), rows = [];
    for (const k of dirty) {
      const v = localStorage.getItem(k); if (v == null) continue;
      try { rows.push({ user_id: user.id, slot: k, data: JSON.parse(v), updated_at: m[k] || new Date().toISOString() }); } catch (e) {}
    }
    dirty.clear();
    if (rows.length) { const { error } = await client.from('saves').upsert(rows); if (error) { rows.forEach(r => dirty.add(r.slot)); setStatus('Could not save to your account. Will retry.'); } }
    for (const k of [...removed]) { await client.from('saves').delete().eq('slot', k); removed.delete(k); }
  }
  window.addEventListener('pagehide', () => { if (dirty.size || removed.size) push(); });

  // on sign-in: newest copy of each slot wins; local-only saves go up, newer cloud saves come down
  async function sync() {
    const { data, error } = await client.from('saves').select('slot, data, updated_at');
    if (error) { setStatus('Signed in, but saved progress could not be loaded.'); return; }
    const m = readMeta(), cloud = new Map(data.map(r => [r.slot, r]));
    let pulled = false;
    for (const k of SLOTS) {
      const c = cloud.get(k), local = localStorage.getItem(k);
      const localTime = m[k] ? Date.parse(m[k]) : 0, cloudTime = c ? Date.parse(c.updated_at) : 0;
      if (c && (local == null || cloudTime > localTime)) {
        const v = JSON.stringify(c.data);
        if (v !== local) { rawSet.call(localStorage, k, v); pulled = true; }
        m[k] = c.updated_at;
      } else if (local != null && (!c || localTime > cloudTime)) dirty.add(k);
    }
    writeMeta(m);
    await push();
    // reload once so the page shows the progress that just came down
    if (pulled && !sessionStorage.getItem('cc-pulled')) { sessionStorage.setItem('cc-pulled', '1'); location.reload(); return; }
    sessionStorage.removeItem('cc-pulled');
    render();
  }

  // ---------- the account bar ----------
  const css = `.acct { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 14px; }
    .acct button, .acct input { font: inherit; }
    .acct .lnk { background: none; border: 0; color: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 4px 2px; }
    .acct form { display: flex; gap: 6px; flex-wrap: wrap; }
    .acct input { padding: 7px 9px; border: 1px solid #9AA2A0; border-radius: 4px; min-width: 210px; background: #fff; color: #1B1F24; }
    .acct .go { background: #1F3F8F; color: #fff; border: 0; border-radius: 4px; padding: 7px 12px; font-weight: 600; cursor: pointer; }
    .acct .msg { width: 100%; font-size: 13px; opacity: .85; }
    .acctbar { display: flex; margin: 0 0 10px; }`;
  let host = null, mode = 'idle', status = '';
  function setStatus(s) { status = s; render(); }
  function mount() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    host = document.createElement('div'); host.className = 'acct'; host.setAttribute('aria-live', 'polite');
    const crumbs = document.querySelector('.crumbs');
    if (crumbs) crumbs.appendChild(host);
    else { const bar = document.createElement('nav'); bar.className = 'acctbar'; bar.appendChild(host); const w = document.querySelector('.wrap') || document.body; w.insertBefore(bar, w.firstChild); }
    render();
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    if (!host) return;
    if (!client) { host.innerHTML = ''; return; }
    if (user) {
      host.innerHTML = `<span>Progress saved to <b>${esc(user.email)}</b></span><button class="lnk" id="accOut">Sign out</button>${status ? `<span class="msg">${esc(status)}</span>` : ''}`;
      host.querySelector('#accOut').onclick = async () => { await push(); await client.auth.signOut(); };
    } else if (mode === 'form') {
      host.innerHTML = `<form id="accForm"><label class="msg" for="accEmail">We'll email you a sign-in link. No password.</label><input id="accEmail" type="email" required placeholder="you@example.com" autocomplete="email"><button class="go" type="submit">Email me a link</button><button class="lnk" type="button" id="accCancel">Cancel</button></form>${status ? `<span class="msg">${esc(status)}</span>` : ''}`;
      host.querySelector('#accCancel').onclick = () => { mode = 'idle'; status = ''; render(); };
      host.querySelector('#accForm').onsubmit = async e => {
        e.preventDefault();
        const email = host.querySelector('#accEmail').value.trim();
        setStatus('Sending…');
        const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) setStatus(/rate/i.test(error.message) ? 'Too many sign-in emails right now. Try again in a few minutes.' : 'Could not send the email. Check the address and try again.');
        else { mode = 'sent'; setStatus(''); }
      };
      host.querySelector('#accEmail').focus();
    } else if (mode === 'sent') {
      host.innerHTML = `<span>Check your email for the sign-in link. It opens this page and saves your progress.</span>`;
    } else {
      host.innerHTML = `<button class="lnk" id="accIn">Sign in or create a free account</button>`;
      host.querySelector('#accIn').onclick = () => { mode = 'form'; status = ''; render(); };
    }
  }


  // ---------- the registration gate ----------
  const gateCss = `.ccgate { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 20px; background: rgba(28, 32, 30, .94); overflow-y: auto; }
    .ccgate-card { background: #F7F8F6; color: #20262D; border-radius: 4px; box-shadow: inset 0 0 0 8px #B7BDC2; padding: 34px 38px 30px; width: min(480px, 100%); text-align: center; font: 16px/1.5 'IBM Plex Sans Condensed', 'Arial Narrow', Arial, sans-serif; }
    .ccgate-card img { width: 110px; height: 110px; }
    .ccgate-card h2 { font: 400 30px/1.1 'Permanent Marker', 'Comic Sans MS', cursive; color: #1F3F8F; margin: 8px 0 8px; }
    .ccgate-card p { margin: 0 0 14px; color: #3A434D; }
    .ccgate-card form { display: grid; gap: 10px; text-align: left; }
    .ccgate-card label { font-weight: 600; font-size: 14px; }
    .ccgate-card input { padding: 11px 12px; border: 1.5px solid #8C959E; border-radius: 4px; font: inherit; background: #fff; color: #1B1F24; }
    .ccgate-card button { background: #1F3F8F; color: #fff; border: 0; border-radius: 4px; padding: 12px 16px; font: 600 17px inherit; cursor: pointer; }
    .ccgate-card button:disabled { opacity: .55; cursor: default; }
    .ccgate-card .small { font-size: 13px; color: #5A6470; margin: 12px 0 0; }
    .ccgate-card .err { color: #C0392B; font-weight: 600; margin: 10px 0 0; }`;
  let gateEl = null, gateState = 'checking', gateMsg = '', forced = false, gateHead = null;
  function drawGate() {
    if (!GATED && !forced) return;
    if (!gateEl) {
      const st = document.createElement('style'); st.textContent = gateCss; document.head.appendChild(st);
      gateEl = document.createElement('div'); gateEl.className = 'ccgate'; gateEl.setAttribute('role', 'dialog'); gateEl.setAttribute('aria-modal', 'true'); gateEl.setAttribute('aria-labelledby', 'ccgT');
      document.body.appendChild(gateEl);
    }
    const wrap = document.querySelector('.wrap'); if (wrap) wrap.setAttribute('inert', '');
    const head = `<img src="logo.webp" alt="" width="110" height="110">`;
    let body;
    if (gateState === 'checking') body = `${head}<h2 id="ccgT">Cooperstown Cash</h2><p>One moment…</p>`;
    else if (gateState === 'offline') body = `${head}<h2 id="ccgT">We couldn't reach sign-in</h2><p>Check your connection and refresh the page. You need a free account to play.</p>`;
    else if (gateState === 'sent') body = `${head}<h2 id="ccgT">Check your email</h2><p>We sent you a sign-in link. Open it on this device and you'll land right back here, ready to play.</p><p class="small">Nothing there? Check your spam folder, or <button type="button" id="ccgAgain" style="all:unset;cursor:pointer;text-decoration:underline;font-weight:600">try a different email</button>.</p>`;
    else body = `${head}<h2 id="ccgT">${esc(gateHead || 'Create your free account to play')}</h2><p>Play for fun or learn strategy. Your drafts, wins and unlocks are saved to your account. Just your email, no password.</p>
      <form id="ccgForm"><label for="ccgEmail">Email</label><input id="ccgEmail" type="email" required autocomplete="email" placeholder="you@example.com"><button type="submit" id="ccgGo">Email me a sign-in link</button></form>
      ${gateMsg ? `<p class="err" role="alert">${esc(gateMsg)}</p>` : ''}<p class="small">Already have an account? Use the same email and we'll send you a fresh link.</p>${forced && !GATED ? '<p class="small"><button type="button" id="ccgClose" style="all:unset;cursor:pointer;text-decoration:underline;font-weight:600">Not now</button></p>' : ''}`;
    gateEl.innerHTML = `<div class="ccgate-card">${body}</div>`;
    const form = gateEl.querySelector('#ccgForm');
    if (form) {
      gateEl.querySelector('#ccgEmail').focus();
      form.onsubmit = async e => {
        e.preventDefault();
        const btn = gateEl.querySelector('#ccgGo'); btn.disabled = true; btn.textContent = 'Sending…';
        const { error } = await client.auth.signInWithOtp({ email: gateEl.querySelector('#ccgEmail').value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) { gateMsg = /rate|limit/i.test(error.message) ? 'Too many sign-in emails right now. Please try again in a few minutes.' : 'We could not send the email. Check the address and try again.'; gateState = 'form'; }
        else { gateMsg = ''; gateState = 'sent'; }
        drawGate();
      };
    }
    const closeBtn = gateEl.querySelector('#ccgClose'); if (closeBtn) closeBtn.onclick = () => { forced = false; openGate(); };
    const again = gateEl.querySelector('#ccgAgain'); if (again) again.onclick = () => { gateState = 'form'; gateMsg = ''; drawGate(); };
  }
  function openGate() { if (gateEl) { gateEl.remove(); gateEl = null; const w = document.querySelector('.wrap'); if (w) w.removeAttribute('inert'); } }
  function setGate(state) { gateState = state; gateMsg = ''; drawGate(); }

  // ---------- what other pages (like the lobby) can use ----------
  const readyCbs = []; let isReady = false;
  function markReady() { isReady = true; readyCbs.splice(0).forEach(f => { try { f(); } catch (e) {} }); }
  window.CC = {
    get client() { return client; },
    get user() { return user; },
    whenReady(fn) { isReady ? fn() : readyCbs.push(fn); },
    // returns true if signed in; otherwise raises a dismissible sign-in box and returns false
    requireSignIn(heading) { if (user) return true; forced = true; gateHead = heading || null; gateState = 'form'; gateMsg = ''; drawGate(); return false; },
  };

  function start() {
    mount();
    if (GATED) setGate('checking');
    if (!window.supabase || !window.supabase.createClient) { if (GATED) setGate('offline'); markReady(); return; } // offline or blocked: open play still works without accounts
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((event, session) => {
      const was = user && user.id;
      user = session ? session.user : null;
      if (user && user.id !== was) { mode = 'idle'; status = ''; setTimeout(sync, 0); }
      if (GATED) { if (user) openGate(); else if ((event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') && gateState !== 'sent') setGate('form'); }
      if (forced && user) { forced = false; openGate(); }
      render();
      window.dispatchEvent(new CustomEvent('cc-auth', { detail: { user } }));
    });
    markReady();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
