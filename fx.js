/* Cooperstown Cash: home run celebrations.
   FX.homeRun({ text, runs, walkOff }) fires fireworks, a banner, a flash and a screen shake.
   Several home runs in the same moment (like auto-roll to the final) become one celebration.
   Everything is skipped or softened for people who ask for reduced motion. Sound is on unless the player turns it off with the Sound button. */
(function () {
  'use strict';
  const PALETTES = [['#FFD86B', '#FFF1B8', '#F2B33D'], ['#FF6B4A', '#FFB199', '#E0452B'], ['#6FA8FF', '#BFD8FF', '#3E74D6'], ['#FFFFFF', '#F3EAD3', '#E8D5A4'], ['#7CE0A3', '#C8F5D8', '#3FB36E']];
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  let cv = null, cx = null, W = 0, H = 0, dpr = 1, raf = 0, last = 0, parts = [], rockets = [], timers = [], queue = [], flushT = 0, bannerT = 0;
  let soundOn = store.get('cc-sound') !== '0', ac = null, soundBtn = null;

  const css = `
.fx-canvas { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9990; }
.fx-dim { position: fixed; inset: 0; pointer-events: none; z-index: 9988; background: radial-gradient(ellipse at 50% 40%, rgba(12,20,54,.42), rgba(6,10,30,.78)); animation: fxdim 3.6s ease both; }
.fx-flash { position: fixed; inset: 0; pointer-events: none; z-index: 9989; background: radial-gradient(circle at 50% 30%, rgba(255,236,170,.75), rgba(255,236,170,0) 65%); animation: fxflash .55s ease-out both; }
.fx-banner { position: fixed; left: 50%; top: 24%; z-index: 9995; pointer-events: none; text-align: center; width: max-content; max-width: 94vw; transform: translate(-50%, -50%); animation: fxpop 3.1s cubic-bezier(.2, .9, .3, 1.2) both; }
.fx-banner b { display: block; font: 400 clamp(46px, 12vw, 132px)/1 'Permanent Marker', 'Comic Sans MS', 'Chalkboard SE', cursive; color: #FFD86B; letter-spacing: .01em; -webkit-text-stroke: 3px #14213D; paint-order: stroke fill; text-shadow: 0 6px 0 #14213D, 0 10px 24px rgba(0,0,0,.45); }
.fx-banner.big b { color: #FF6B4A; font-size: clamp(50px, 14vw, 150px); }
.fx-banner small { display: block; margin-top: 12px; font: 600 clamp(16px, 3.4vw, 26px)/1.25 'IBM Plex Sans Condensed', 'Arial Narrow', Arial, sans-serif; color: #FFF7E0; text-shadow: 0 2px 0 #14213D, 0 3px 12px rgba(0,0,0,.6); }
.fx-shake { animation: fxshake .55s ease-in-out; }
.fx-sound { position: fixed; left: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 9000; min-width: 44px; height: 44px; padding: 0 14px; border-radius: 22px; border: 1.5px solid rgba(20,33,61,.45); background: rgba(247,242,228,.94); color: #14213D; font: 600 14px 'IBM Plex Sans Condensed', Arial, sans-serif; cursor: pointer; }
.fx-sound[aria-pressed="true"] { background: #14213D; color: #FFD86B; }
.fx-sound:focus-visible { outline: 3px solid #F2B33D; outline-offset: 2px; }
@keyframes fxdim { 0% { opacity: 0; } 14% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes fxflash { from { opacity: 1; } to { opacity: 0; } }
@keyframes fxpop { 0% { transform: translate(-50%, -50%) scale(.25) rotate(-8deg); opacity: 0; } 14% { transform: translate(-50%, -50%) scale(1.18) rotate(2deg); opacity: 1; } 26% { transform: translate(-50%, -50%) scale(1) rotate(-1deg); } 84% { opacity: 1; } 100% { transform: translate(-50%, -58%) scale(1.06); opacity: 0; } }
@keyframes fxshake { 0%, 100% { transform: none; } 15% { transform: translate(-6px, 3px); } 30% { transform: translate(5px, -4px); } 45% { transform: translate(-4px, -2px); } 60% { transform: translate(3px, 3px); } 80% { transform: translate(-2px, 1px); } }
@keyframes fxfade { 0% { opacity: 0; } 12% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fx-banner { animation: fxfade 2.6s ease both; } }`;

  function ensureStyle() { if (document.getElementById('fx-style')) return; const s = document.createElement('style'); s.id = 'fx-style'; s.textContent = css; document.head.appendChild(s); }

  // ---------- canvas fireworks ----------
  function ensureCanvas() {
    if (cv) return true;
    cv = document.createElement('canvas'); cv.className = 'fx-canvas'; cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv); cx = cv.getContext('2d'); if (!cx) { cv.remove(); cv = null; return false; }
    resize(); window.addEventListener('resize', resize); return true;
  }
  function resize() { if (!cv) return; dpr = Math.min(window.devicePixelRatio || 1, 2); W = cv.width = Math.floor(innerWidth * dpr); H = cv.height = Math.floor(innerHeight * dpr); }
  function launch(pal, big) {
    const x = rnd(.12, .88) * W, ty = rnd(.14, .5) * H;
    rockets.push({ x, y: H + 10, vx: rnd(-.7, .7) * dpr, vy: -rnd(11, 15) * dpr, ty, pal, big });
  }
  function explode(x, y, pal, big) {
    const n = big ? 120 : 84, ring = Math.random() < .35, sp0 = rnd(3.6, 5.2) * dpr;
    for (let i = 0; i < n; i++) {
      const a = ring ? (i / n) * Math.PI * 2 : rnd(0, Math.PI * 2), sp = ring ? sp0 : rnd(.8, 6.2) * dpr;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rnd(.009, .019), r: rnd(1.3, 2.8) * dpr, c: pick(pal), g: .05 * dpr, tw: Math.random() < .3 });
    }
    for (let i = 0; i < 14; i++) parts.push({ x, y, vx: rnd(-1.4, 1.4) * dpr, vy: rnd(-1.4, 1.4) * dpr, life: 1, decay: rnd(.006, .011), r: rnd(1, 1.8) * dpr, c: '#FFE9A8', g: .03 * dpr, tw: true });
    if (parts.length > 1400) parts.splice(0, parts.length - 1400);
  }
  function frame(now) {
    const dt = Math.min(2.5, (now - last) / 16.67 || 1); last = now;
    cx.globalCompositeOperation = 'destination-out'; cx.fillStyle = 'rgba(0,0,0,.2)'; cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.x += r.vx * dt; r.y += r.vy * dt; r.vy += .16 * dpr * dt;
      parts.push({ x: r.x, y: r.y, vx: rnd(-.3, .3) * dpr, vy: rnd(.2, .8) * dpr, life: .5, decay: .05, r: 1.6 * dpr, c: '#FFE9A8', g: 0, tw: false });
      if (r.y <= r.ty || r.vy > -1.2 * dpr) { explode(r.x, r.y, r.pal, r.big); rockets.splice(i, 1); }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= .992; p.vy *= .992; p.life -= p.decay * dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      cx.globalAlpha = Math.max(0, p.tw ? p.life * (.55 + .45 * Math.sin(now / 40 + i)) : p.life);
      cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.r * (.6 + p.life * .5), 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1;
    if (parts.length || rockets.length || timers.length) raf = requestAnimationFrame(frame);
    else { raf = 0; cx.clearRect(0, 0, W, H); }
  }
  function startLoop() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function fireworks(count, big) {
    if (!ensureCanvas()) return;
    for (let i = 0; i < count; i++) {
      const t = setTimeout(() => { timers = timers.filter(x => x !== t); launch(pick(PALETTES), big); if (soundOn) pop(); startLoop(); }, i * (big ? 230 : 300) + rnd(0, 120));
      timers.push(t);
    }
    startLoop();
  }

  // ---------- sound: tiny synthesized bat crack, crowd swell and pops (off until turned on) ----------
  function audio() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ac = new C(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume(); return ac;
  }
  function noise(dur, freq, peak, delay, type) {
    const a = audio(); if (!a) return; const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; const f = a.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = a.createGain(), t0 = a.currentTime + (delay || 0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(a.destination); src.start(t0);
  }
  const pop = () => noise(.12, rnd(2200, 4200), .12, 0, 'highpass');
  function playSounds(big) {
    if (!soundOn || !audio()) return;
    noise(.09, 3200, .55, 0, 'bandpass');                       // the crack of the bat
    noise(big ? 3.2 : 2.2, 900, big ? .32 : .22, .18, 'lowpass'); // the crowd swells
  }
  // ---------- ballpark ambience: a soft synthesized crowd bed with the odd swell (follows the Sound button) ----------
  let amb = null, ambWanted = false, ambTimer = 0;
  function startAmb() {
    if (amb || !soundOn) return;
    const a = audio(); if (!a) return;
    const len = a.sampleRate * 8, buf = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) { // pink-ish noise reads as a distant crowd; two channels keep it wide
      const d = buf.getChannelData(c); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .11; }
    }
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = .4;
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    const bed = a.createGain(); bed.gain.value = 0.0001;
    const sway = a.createGain(); sway.gain.value = 1;
    const lfo = a.createOscillator(), lfoAmt = a.createGain(); lfo.frequency.value = .11; lfoAmt.gain.value = .18; // slow breathing, like a crowd
    lfo.connect(lfoAmt); lfoAmt.connect(sway.gain);
    src.connect(hp); hp.connect(lp); lp.connect(bed); bed.connect(sway); sway.connect(a.destination);
    src.start(); lfo.start();
    bed.gain.setValueAtTime(0.0001, a.currentTime); bed.gain.linearRampToValueAtTime(.55, a.currentTime + 2.5);
    amb = { src, lfo, bed, lp };
    const swell = () => { // now and then the crowd rises, then settles
      ambTimer = setTimeout(() => {
        if (!amb) return; const t = a.currentTime, big = Math.random() < .3;
        amb.bed.gain.cancelScheduledValues(t); amb.bed.gain.setValueAtTime(amb.bed.gain.value, t);
        amb.bed.gain.linearRampToValueAtTime(big ? 1.05 : .8, t + 1.3); amb.bed.gain.linearRampToValueAtTime(.55, t + (big ? 6 : 4));
        amb.lp.frequency.cancelScheduledValues(t); amb.lp.frequency.setValueAtTime(amb.lp.frequency.value, t);
        amb.lp.frequency.linearRampToValueAtTime(big ? 2400 : 1700, t + 1.3); amb.lp.frequency.linearRampToValueAtTime(1100, t + (big ? 6 : 4));
        swell();
      }, rnd(9000, 24000));
    };
    swell();
    if (a.state !== 'running') { // browsers hold audio until the first tap or key press
      const go = () => { a.resume(); ['pointerdown', 'keydown', 'touchend'].forEach(e => removeEventListener(e, go, true)); };
      ['pointerdown', 'keydown', 'touchend'].forEach(e => addEventListener(e, go, true));
    }
  }
  function stopAmb() {
    clearTimeout(ambTimer); if (!amb || !ac) { amb = null; return; }
    const m = amb, t = ac.currentTime; amb = null;
    try { m.bed.gain.cancelScheduledValues(t); m.bed.gain.setValueAtTime(Math.max(.0001, m.bed.gain.value), t); m.bed.gain.linearRampToValueAtTime(.0001, t + .6); m.src.stop(t + .7); m.lfo.stop(t + .7); } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else if (soundOn) ac.resume(); });

  function setSound(on) {
    soundOn = !!on; store.set('cc-sound', soundOn ? '1' : '0');
    if (soundBtn) { soundBtn.setAttribute('aria-pressed', String(soundOn)); soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off'; }
    if (soundOn) { audio(); noise(.08, 3000, .3, 0, 'bandpass'); if (ambWanted) startAmb(); } else stopAmb();
  }
  function mountSoundButton() {
    if (soundBtn || !document.body) return;
    soundBtn = document.createElement('button'); soundBtn.type = 'button'; soundBtn.className = 'fx-sound'; soundBtn.setAttribute('aria-label', 'Home run sound effects');
    soundBtn.onclick = () => setSound(!soundOn); document.body.appendChild(soundBtn); setSound(soundOn);
  }

  // ---------- the celebration ----------
  function show(evs) {
    ensureStyle();
    const n = evs.length, slam = evs.some(e => e.runs === 4), walk = evs.some(e => e.walkOff), big = slam || walk || n >= 3;
    const title = walk ? 'WALK-OFF HOME RUN!' : slam ? 'GRAND SLAM!' : n > 1 ? `${n} HOME RUNS!` : 'HOME RUN!';
    const ev = evs.find(e => e.walkOff) || evs.find(e => e.runs === 4) || evs[evs.length - 1];
    const sub = n > 1 ? `${n} balls left the yard.${ev.text ? ' Latest: ' + ev.text : ''}` : (ev.text || '');
    document.querySelectorAll('.fx-banner').forEach(b => b.remove()); clearTimeout(bannerT);
    const el = document.createElement('div'); el.className = 'fx-banner' + (big ? ' big' : ''); el.setAttribute('aria-hidden', 'true'); // the play-by-play already announces the play
    const b = document.createElement('b'); b.textContent = title; el.appendChild(b);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
    document.body.appendChild(el); bannerT = setTimeout(() => el.remove(), 3300);
    playSounds(big);
    if (reduced()) return; // banner only: no flashes, shaking or moving particles
    document.querySelectorAll('.fx-dim').forEach(d => d.remove());
    const dim = document.createElement('div'); dim.className = 'fx-dim'; dim.setAttribute('aria-hidden', 'true'); const dimMs = big ? 5200 : 3800; dim.style.animationDuration = dimMs + 'ms'; document.body.appendChild(dim); setTimeout(() => dim.remove(), dimMs + 100);
    const fl = document.createElement('div'); fl.className = 'fx-flash'; fl.setAttribute('aria-hidden', 'true'); document.body.appendChild(fl); setTimeout(() => fl.remove(), 650);
    const shaker = document.querySelector('.wrap') || document.body; shaker.classList.remove('fx-shake'); void shaker.offsetWidth; shaker.classList.add('fx-shake'); setTimeout(() => shaker.classList.remove('fx-shake'), 650);
    fireworks(slam || walk ? 12 : n > 1 ? 8 : 5, big);
  }
  function flush() { flushT = 0; const evs = queue.splice(0); if (evs.length) show(evs); }

  window.FX = {
    homeRun(o) { queue.push(o || {}); if (!flushT) flushT = setTimeout(flush, 0); }, // same-moment home runs become one celebration
    setSound,
    ambience(on) { ambWanted = !!on; if (ambWanted) startAmb(); else stopAmb(); }, // ballpark crowd noise while a game is being played
    get soundOn() { return soundOn; },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSoundButton); else mountSoundButton();
})();
