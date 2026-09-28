// Cooperstown Cash: accounts and saved progress.
// Play works without an account. Signing in (email link, no password) copies your drafts, leagues,
// wins and unlocks to your account and keeps them in sync across devices.
(function () {
  const SUPABASE_URL = 'https://yqungoehuurjxanobpsb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_OOOgHRHOes5EYOVnZGyPCw_4FG9Xkz6'; // publishable key: safe in the browser, rows are protected per player
  const SLOTS = ['gts-draft', 'gts-progress', 'gts-clock', 'gts-proj', 'cc-league-v1'];
  const META = 'cc-sync-meta'; // when each slot last changed on this device

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
      host.innerHTML = `<button class="lnk" id="accIn">Sign in to save your progress</button>`;
      host.querySelector('#accIn').onclick = () => { mode = 'form'; status = ''; render(); };
    }
  }

  function start() {
    mount();
    if (!window.supabase || !window.supabase.createClient) return; // offline or blocked: the game still works, just without accounts
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((event, session) => {
      const was = user && user.id;
      user = session ? session.user : null;
      if (user && user.id !== was) { mode = 'idle'; status = ''; setTimeout(sync, 0); }
      render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
