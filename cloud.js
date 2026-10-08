// Cooperstown Cash: accounts and saved progress.
// Play works without an account. Signing in (email link, no password) copies your drafts, leagues,
// wins and unlocks to your account and keeps them in sync across devices.
(function () {
  const SUPABASE_URL = 'https://yqungoehuurjxanobpsb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_OOOgHRHOes5EYOVnZGyPCw_4FG9Xkz6'; // publishable key: safe in the browser, rows are protected per player
  const SLOTS = ['gts-draft', 'gts-progress', 'gts-clock', 'gts-proj', 'cc-league-v1', 'gts-notebook'];
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

  // before progress goes up, fold in what the account already has, so a device that is behind can never upload a smaller total over a bigger one
  async function foldCloudProgress() {
    try {
      const { data } = await client.from('saves').select('slot, data'), row = (data || []).find(r => r.slot === 'gts-progress'), local = localStorage.getItem('gts-progress');
      if (!row || local == null) return;
      const merged = JSON.stringify(mergeProgress(JSON.parse(local), row.data));
      if (merged !== local) rawSet.call(localStorage, 'gts-progress', merged);
    } catch (e) { /* if the account can't be read, upload as before */ }
  }

  async function push() {
    if (!client || !user) return;
    if (dirty.has('gts-progress')) await foldCloudProgress();
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

  // Progress is merged, never replaced: your wins, games and cleared modes only ever go up, so a legend unlock can't be lost to a newer-but-smaller copy
  function mergeProgress(a, b) {
    const A = a || {}, B = b || {}, n = x => (Number.isFinite(+x) && +x > 0 ? Math.floor(+x) : 0);
    return Object.assign({}, B, A, { wins: Math.max(n(A.wins), n(B.wins)), games: Math.max(n(A.games), n(B.games)), cleared: Object.assign({}, B.cleared || {}, A.cleared || {}) });
  }
  // on sign-in: newest copy of each slot wins (except progress, which is merged); local-only saves go up, newer cloud saves come down
  async function sync() {
    const { data, error } = await client.from('saves').select('slot, data, updated_at');
    if (error) { setStatus('Signed in, but saved progress could not be loaded.'); return; }
    const m = readMeta(), cloud = new Map(data.map(r => [r.slot, r]));
    let pulled = false;
    for (const k of SLOTS) {
      const c = cloud.get(k), local = localStorage.getItem(k);
      const localTime = m[k] ? Date.parse(m[k]) : 0, cloudTime = c ? Date.parse(c.updated_at) : 0;
      if (k === 'gts-progress' && c && local != null) {
        try {
          const merged = JSON.stringify(mergeProgress(JSON.parse(local), c.data));
          if (merged !== local) { rawSet.call(localStorage, k, merged); pulled = true; }
          if (merged !== JSON.stringify(c.data)) { dirty.add(k); m[k] = new Date().toISOString(); } else m[k] = c.updated_at;
          continue;
        } catch (e) { /* a damaged local copy falls through to the usual newest-wins rule */ }
      }
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
    .acct .acclink { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; color: inherit; font-weight: 600; text-decoration: underline; }
    .av { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; font-size: 19px; line-height: 1; color: #fff; font-weight: 700; border: 2px solid rgba(255,255,255,.75); box-shadow: 0 1px 3px rgba(0,0,0,.35); flex: none; text-decoration: none; }
    .acct form { display: flex; gap: 6px; flex-wrap: wrap; }
    .acct input { padding: 7px 9px; border: 1px solid #9AA2A0; border-radius: 4px; min-width: 210px; background: #fff; color: #1B1F24; }
    .acct .go { background: #1F3F8F; color: #fff; border: 0; border-radius: 4px; padding: 7px 12px; font-weight: 600; cursor: pointer; }
    .acct .msg { width: 100%; font-size: 13px; opacity: .85; }
    .acctbar { display: flex; margin: 0 0 10px; }
    .acct .acc-solo { min-width: 44px; justify-content: center; text-decoration: none; }
    .acc-solo .av { width: 40px; height: 40px; font-size: 22px; }
    .acct.solo { background: none; padding: 0; border-radius: 0; }
    .crumbs { flex-wrap: wrap; row-gap: 6px; }`;
  // the avatar: an emoji on a colored circle, picked on the account page. It is remembered on this device so the bar draws it at once, then checked against the account.
  let avatar = null;
  const avKey = () => 'gts-avatar:' + (user && user.id);
  const avOk = a => a && typeof a.emoji === 'string' && a.emoji.length <= 8 && /^#[0-9A-Fa-f]{6}$/.test(a.color || '');
  function avatarHtml() {
    const a = avOk(avatar) ? avatar : null, ini = String((user && user.email) || '?').trim().charAt(0).toUpperCase() || '?';
    return `<span class="av" aria-hidden="true" style="background:${a ? a.color : '#1F3F8F'}">${esc(a ? a.emoji : ini)}</span>`;
  }
  async function loadAvatar() {
    if (!user || !client) return; const id = user.id;
    try { const raw = localStorage.getItem(avKey()); if (raw) { const a = JSON.parse(raw); if (avOk(a)) { avatar = a; render(); } } } catch (e) {}
    try {
      const { data, error } = await client.from('profiles').select('avatar_emoji,avatar_color').eq('id', id);
      if (error || !user || user.id !== id) return; const row = data && data[0], a = row && row.avatar_emoji ? { emoji: row.avatar_emoji, color: row.avatar_color } : null;
      avatar = avOk(a) ? a : null;
      try { if (avatar) localStorage.setItem(avKey(), JSON.stringify(avatar)); else localStorage.removeItem(avKey()); } catch (e) {}
      render();
    } catch (e) {}
  }
  window.addEventListener('cc-avatar', e => { const a = e && e.detail; avatar = avOk(a) ? a : null; render(); });   // the account page tells the bar the moment it is saved
  // an app on the home screen has its own storage: the email's link opens the browser instead, so inside the app the code is the way to sign in
  const nativeApp = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());   // the phone app; Google blocks sign-in inside an app's built-in browser, so it gets its own route later
  const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
  const inApp = (() => { try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { return false; } })();
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
  let pendingEmail = '', sentOwn = false;
  // Our own sender emails a code and a link on our own address. Until it is set up (or if it is down) the default email goes out instead, so signing in never stops working.
  async function requestLoginEmail(email) {
    const next = (location.pathname.split('/').pop() || 'index.html') + location.search;   // the link brings you back to this page
    try {
      const r = await fetch(SUPABASE_URL + '/functions/v1/send-login', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ email, next }) });
      if (r.ok) return { error: null, own: true };
      let j = {}; try { j = await r.json(); } catch (e) {}
      if (r.status === 429 || j.error === 'rate_limited') return { error: { message: 'rate limit' }, own: false };   // a refusal is a refusal: do not get round it with the default email
      if (j.error === 'bad_email') return { error: { message: 'bad email' }, own: false };
    } catch (e) { /* offline or blocked: use the default email */ }
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    return { error, own: false };
  }
  // the link in our email lands here with a one-time token in the address: use it, then take it out of the address bar and the history
  async function finishEmailLink() {
    const q = new URLSearchParams(location.search), th = q.get('token_hash');
    if (!th) return;
    q.delete('token_hash'); q.delete('type');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash);
    const { error } = await client.auth.verifyOtp({ token_hash: th, type: 'email' });
    if (error) { forced = true; gateHead = 'Sign in'; gateState = 'form'; gateMsg = 'That sign-in link was already used or has expired. Ask for a new email, or use the code in it.'; drawGate(); }
  }
  // sign in with the code from the email: it works even if the email's link goes somewhere unexpected, and it keeps you on this page
  async function verifyCode(email, raw) {
    const token = String(raw || '').replace(/\D/g, '');
    if (!/^\d{6,10}$/.test(token)) return 'Type the code exactly as it appears in the email.';
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (!error) return '';
    return /expired|invalid/i.test(error.message) ? "That code didn't work. Check it, or ask for a new email." : 'We could not check the code. Try again in a moment.';
  }
  // The email link signs you in on Supabase's side, then sends your browser to the site address saved in the project settings. If that address is wrong the page
  // cannot be reached, but your sign-in is still in that page's address bar. Paste it here and we finish the job.
  async function rescueFromAddress(raw) {
    const s = String(raw || ''), pick = k => { const m = s.match(new RegExp('(?:^|[#?&\\s])' + k + '=([^&\\s#]+)')); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; };
    const at = pick('access_token'), rt = pick('refresh_token');
    if (!at || !rt) { const why = pick('error_description'); return why ? `That link says: ${why}. Ask for a new email.` : "That address doesn't have a sign-in in it. Copy the whole address from the top of the page that opened when you clicked the link."; }
    const { error } = await client.auth.setSession({ access_token: at, refresh_token: rt });
    return error ? 'That sign-in link has expired. Ask for a new email.' : '';
  }
  const rescueCss = `.acct details.rescue { width: 100%; } .acct details.rescue summary, .ccgate-card details.rescue summary { cursor: pointer; font-weight: 600; min-height: 44px; display: flex; align-items: center; }
    .ccgate-card details.rescue { margin-top: 14px; text-align: left; } .ccgate-card details.rescue input, .acct details.rescue input { width: 100%; box-sizing: border-box; margin: 6px 0; }`;
  { const st = document.createElement('style'); st.textContent = rescueCss; document.head.appendChild(st); }
  const esc = s => String(s).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    if (!host) return;
    if (!client) { host.innerHTML = ''; return; }
    host.classList.toggle('solo', !!user);
    if (user) {
      // signed in: just the avatar, linking to the account page (Sign out lives there; the hidden button stays because account.html clicks it to save progress first)
      host.innerHTML = `<a class="acclink acc-solo" href="account.html" aria-label="Your account">${avatarHtml()}</a><button class="lnk" id="accOut" hidden>Sign out</button>${status ? `<span class="msg">${esc(status)}</span>` : ''}`;
      host.querySelector('#accOut').onclick = async () => { await push(); await client.auth.signOut(); };
    } else if (mode === 'form') {
      host.innerHTML = `<form id="accForm"><label class="msg" for="accEmail">We'll email you a sign-in link. No password.</label><input id="accEmail" type="email" required placeholder="you@example.com" autocomplete="email"><button class="go" type="submit">Email me a link</button><button class="lnk" type="button" id="accCancel">Cancel</button></form>${status ? `<span class="msg">${esc(status)}</span>` : ''}`;
      host.querySelector('#accCancel').onclick = () => { mode = 'idle'; status = ''; render(); };
      host.querySelector('#accForm').onsubmit = async e => {
        e.preventDefault();
        const email = host.querySelector('#accEmail').value.trim(); pendingEmail = email;
        setStatus('Sending…');
        const { error, own } = await requestLoginEmail(email); sentOwn = own;
        if (error) setStatus(/rate/i.test(error.message) ? 'Too many sign-in emails right now. Try again in a few minutes.' : 'Could not send the email. Check the address and try again.');
        else { mode = 'sent'; setStatus(''); }
      };
      host.querySelector('#accEmail').focus();
    } else if (mode === 'sent') {
      host.innerHTML = `<span>${sentOwn ? (inApp ? 'We emailed you a sign-in code. Type it here. Skip the link: in this app it opens your browser instead.' : 'We emailed you a sign-in code and link. Type the code here, or tap the link.') : 'Check your email for the sign-in link. It opens this page and saves your progress.'}</span> <form id="accCodeForm"><label class="msg" for="accCode">${sentOwn ? 'Code from the email:' : 'Or, if the email has a code, type it here:'}</label><input id="accCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="12345678"><button class="go" type="submit">Sign in</button></form><span class="msg" id="accCodeMsg" role="alert"></span>
        <details class="rescue"><summary>The link opened a page that can't be reached?</summary><p class="msg">Your sign-in is in that page's address. Copy the whole address from the top of your browser, paste it here, and you're signed in.</p><form id="accRescueForm"><input id="accAddr" placeholder="Paste the address here" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="go" type="submit">Sign in</button></form><span class="msg" id="accRescueMsg" role="alert"></span></details>`;
      host.querySelector('#accRescueForm').onsubmit = async e => { e.preventDefault(); const m = host.querySelector('#accRescueMsg'); m.textContent = 'Checking…'; m.textContent = await rescueFromAddress(host.querySelector('#accAddr').value); };
      host.querySelector('#accCodeForm').onsubmit = async e => { e.preventDefault(); const m = host.querySelector('#accCodeMsg'); m.textContent = 'Checking…'; m.textContent = await verifyCode(pendingEmail, host.querySelector('#accCode').value); };
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
    .ccgate-card .err { color: #C0392B; font-weight: 600; margin: 10px 0 0; }
    .ccgate-card .ccg-google { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; background: #fff; color: #1F1F1F; border: 1.5px solid #8C959E; font-weight: 600; }
    .ccgate-card .ccg-google svg { width: 20px; height: 20px; flex: none; }
    .ccgate-card .ccg-or { display: flex; align-items: center; gap: 10px; margin: 14px 0; color: #5A6470; font-size: 14px; } .ccgate-card .ccg-or::before, .ccgate-card .ccg-or::after { content: ''; flex: 1; height: 1px; background: #B7BDC2; }`;
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
    else if (gateState === 'sent') body = `${head}<h2 id="ccgT">Check your email</h2><p>${sentOwn ? (inApp ? "We emailed you a sign-in code. Type it below. Skip the link in the email: in an installed app it opens your browser, not this app, and you would be signed in there instead." : "We emailed you a sign-in code and a link. Type the code below, or open the link on this device and you'll land right back here, ready to play.") : "We sent you a sign-in link. Open it on this device and you'll land right back here, ready to play."}</p><form id="ccgCodeForm"><label for="ccgCode">${sentOwn ? 'Code from the email' : 'Or, if the email has a code, type it here'}</label><input id="ccgCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="12345678"><button type="submit" id="ccgCodeGo">Sign in with the code</button></form>${gateMsg ? `<p class="err" role="alert">${esc(gateMsg)}</p>` : ''}<p class="small">Nothing there? Check your spam folder, or <button type="button" id="ccgAgain" style="all:unset;cursor:pointer;text-decoration:underline;font-weight:600;display:inline-block;padding:13px 4px">try a different email</button>.</p>
      <details class="rescue"${gateMsg ? ' open' : ''}><summary>The link opened a page that can't be reached?</summary><p class="small">Your sign-in is in that page's address. Copy the whole address from the top of your browser, paste it here, and you're signed in.</p><form id="ccgRescueForm"><input id="ccgAddr" placeholder="Paste the address here" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="submit" id="ccgRescueGo">Sign in</button></form></details>`;
    else if (gateState === 'review') body = `${head}<h2 id="ccgT">App Review sign-in</h2><p>For the App Store and Google Play review team. Players sign in with their email on the previous screen.</p>
      <form id="ccgReviewForm"><label for="ccgREmail">Email</label><input id="ccgREmail" type="email" required autocomplete="username"><label for="ccgRPass">Password</label><input id="ccgRPass" type="password" required autocomplete="current-password"><button type="submit" id="ccgRGo">Sign in</button></form>
      ${gateMsg ? `<p class="err" role="alert">${esc(gateMsg)}</p>` : ''}<p class="small"><button type="button" id="ccgRBack" style="all:unset;cursor:pointer;text-decoration:underline;font-weight:600">Back</button></p>`;
    else body = `${head}<h2 id="ccgT">${esc(gateHead || 'Create your free account to play')}</h2><p>Play for fun or learn strategy. Your drafts, wins and unlocks are saved to your account. Just your email, no password.</p>
      ${nativeApp ? '' : `<button type="button" id="ccgGoogle" class="ccg-google">${GOOGLE_G}<span>Continue with Google</span></button><p class="ccg-or" aria-hidden="true"><span>or</span></p>`}
      <form id="ccgForm"><label for="ccgEmail">Email</label><input id="ccgEmail" type="email" required autocomplete="email" placeholder="you@example.com" value="${esc(pendingEmail)}"><button type="submit" id="ccgGo">Email me a sign-in link</button></form>
      ${gateMsg ? `<p class="err" role="alert">${esc(gateMsg)}</p>` : ''}<p class="small">Already have an account? Use the same email and we'll send you a fresh link.</p>${nativeApp ? '<p class="small"><button type="button" id="ccgReview" style="all:unset;cursor:pointer;text-decoration:underline">App Review sign-in</button></p>' : ''}${forced && !GATED ? '<p class="small"><button type="button" id="ccgClose" style="all:unset;cursor:pointer;text-decoration:underline;font-weight:600">Not now</button></p>' : ''}`;
    gateEl.innerHTML = `<div class="ccgate-card">${body}</div>`;
    const form = gateEl.querySelector('#ccgForm');
    if (form) {
      gateEl.querySelector('#ccgEmail').focus();
      form.onsubmit = async e => {
        e.preventDefault();
        const btn = gateEl.querySelector('#ccgGo'); btn.disabled = true; btn.textContent = 'Sending…'; pendingEmail = gateEl.querySelector('#ccgEmail').value.trim();
        const { error, own } = await requestLoginEmail(pendingEmail); sentOwn = own;
        if (error) { gateMsg = /rate|limit/i.test(error.message) ? 'Too many sign-in emails right now. Please try again in a few minutes.' : 'We could not send the email. Check the address and try again.'; gateState = 'form'; }
        else { gateMsg = ''; gateState = 'sent'; }
        drawGate();
      };
    }
    const rf = gateEl.querySelector('#ccgRescueForm');
    if (rf) rf.onsubmit = async e => { e.preventDefault(); const b = gateEl.querySelector('#ccgRescueGo'); b.disabled = true; b.textContent = 'Checking…'; const bad = await rescueFromAddress(gateEl.querySelector('#ccgAddr').value); if (bad) { gateMsg = bad; drawGate(); } };
    const cf = gateEl.querySelector('#ccgCodeForm');
    if (cf) { gateEl.querySelector('#ccgCode').focus(); cf.onsubmit = async e => { e.preventDefault(); const b = gateEl.querySelector('#ccgCodeGo'); b.disabled = true; b.textContent = 'Checking…'; const bad = await verifyCode(pendingEmail, gateEl.querySelector('#ccgCode').value); if (bad) { gateMsg = bad; drawGate(); } }; }
    const gbtn = gateEl.querySelector('#ccgGoogle');
    if (gbtn) gbtn.onclick = async () => {
      gbtn.disabled = true; gbtn.querySelector('span').textContent = 'Opening Google…';
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      if (error) { gateMsg = 'We could not open Google sign-in. Use your email below instead.'; gateState = 'form'; drawGate(); }
    };
    const rvb = gateEl.querySelector('#ccgReview'); if (rvb) rvb.onclick = () => { gateState = 'review'; gateMsg = ''; drawGate(); };
    const rvf = gateEl.querySelector('#ccgReviewForm');
    if (rvf) {
      gateEl.querySelector('#ccgREmail').focus();
      gateEl.querySelector('#ccgRBack').onclick = () => { gateState = 'form'; gateMsg = ''; drawGate(); };
      rvf.onsubmit = async e => {
        e.preventDefault();
        const b = gateEl.querySelector('#ccgRGo'); b.disabled = true; b.textContent = 'Signing in…';
        const { error } = await client.auth.signInWithPassword({ email: gateEl.querySelector('#ccgREmail').value.trim(), password: gateEl.querySelector('#ccgRPass').value });
        if (error) { gateMsg = 'That email and password did not work.'; drawGate(); }
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
      if (user && user.id !== was) { mode = 'idle'; status = ''; avatar = null; setTimeout(sync, 0); setTimeout(loadAvatar, 0); }
      if (!user) avatar = null;
      if (GATED) { if (user) openGate(); else if ((event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') && gateState !== 'sent') setGate('form'); }
      if (forced && user) { forced = false; openGate(); }
      render();
      window.dispatchEvent(new CustomEvent('cc-auth', { detail: { user } }));
    });
    finishEmailLink();
    markReady();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
