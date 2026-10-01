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
  let soundOn = store.get('cc-sound2') !== '0', ac = null, soundBtn = null;

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
  let outNode = null, silentEl = null, unlocked = false;
  function audio() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ac = new C(); } catch (e) { return null; }
      // everything goes through one master gain and a compressor: phone speakers are small, so it needs to be loud, and the compressor keeps it from clipping
      const master = ac.createGain(); master.gain.value = 3.4;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 8; comp.attack.value = .003; comp.release.value = .25;
      master.connect(comp); comp.connect(ac.destination); outNode = master;
    }
    if (ac.state === 'suspended') ac.resume(); return ac;
  }
  // iPhones play web audio like a ringtone: silent switch on = silence, and ringer volume instead of media volume. Playing a silent
  // <audio> clip (and asking Safari for the 'playback' audio session) makes the sounds behave like media. This runs inside a tap.
  function silentWav() {
    const n = 800, b = new Uint8Array(44 + n), w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); }, u32 = (o, v) => { b[o] = v & 255; b[o + 1] = v >> 8 & 255; b[o + 2] = v >> 16 & 255; b[o + 3] = v >> 24 & 255; };
    w(0, 'RIFF'); u32(4, 36 + n); w(8, 'WAVEfmt '); u32(16, 16); b[20] = 1; b[22] = 1; u32(24, 8000); u32(28, 8000); b[32] = 1; b[34] = 8; w(36, 'data'); u32(40, n); b.fill(128, 44);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }
  function unlock() {
    if (!soundOn) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    try {
      if (!silentEl) { silentEl = new Audio(silentWav()); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.volume = 1; }
      const p = silentEl.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) {}
    const a = audio(); if (!a) return;
    try { const s = a.createBufferSource(); s.buffer = a.createBuffer(1, 1, 22050); s.connect(outNode || a.destination); s.start(0); } catch (e) {}
    unlocked = true;
  }
  ['touchend', 'pointerdown', 'click', 'keydown'].forEach(e => addEventListener(e, () => { if (!unlocked || (silentEl && silentEl.paused)) unlock(); }, true));
  function noise(dur, freq, peak, delay, type, attack) {
    const a = audio(); if (!a) return; const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; const f = a.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = a.createGain(), t0 = a.currentTime + (delay || 0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + (attack != null ? attack : Math.min(.02, dur / 4))); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(outNode || a.destination); src.start(t0);
  }
  const pop = () => noise(.12, rnd(2200, 4200), .12, 0, 'highpass');
  function playSounds(big) {
    if (!soundOn || !audio()) return;
    noise(.09, 3200, .55, 0, 'bandpass');                       // the crack of the bat
    if (crowd) playBuf(crowd.roar, big ? .9 : .6, .15); else noise(big ? 3.2 : 2.2, 900, big ? .32 : .22, .18, 'lowpass'); // the crowd swells
  }
  // ---------- crowd voices: a babble of many small synthesized voices, a roar, and single shouts ----------
  // Real crowds are lots of overlapping voices, not hiss. Each voice here is a buzzing vocal source (a sawtooth at a speaking pitch)
  // shaped by moving vowel filters and chopped into syllables. Many of them, run through a big-room echo, read as people.
  let crowd = null, crowdP = null, crowdFailed = false;
  function offline(ch, secs, rate) { const O = window.OfflineAudioContext || window.webkitOfflineAudioContext; return new O(ch, Math.floor(secs * rate), rate); }
  function render(off) { const r = off.startRendering(); return r && r.then ? r : new Promise(res => { off.oncomplete = e => res(e.renderedBuffer); }); }
  function room(c, wet) { // a dry path plus a big stadium echo, rolled off above the range of speech
    const inp = c.createGain(), dry = c.createGain(), w = c.createGain(), cv = c.createConvolver(), out = c.createBiquadFilter();
    const len = Math.floor(c.sampleRate * 1.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
    cv.buffer = ir; dry.gain.value = 1 - wet; w.gain.value = wet; out.type = 'lowpass'; out.frequency.value = 4800;
    inp.connect(dry); inp.connect(cv); cv.connect(w); dry.connect(out); w.connect(out);
    return { inp, out };
  }
  function voice(c, dst, t0, dur, o) {
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(o.f0, t0);
    for (let t = t0 + rnd(.1, .3); t < t0 + dur; t += rnd(.12, .35)) osc.frequency.linearRampToValueAtTime(o.f0 * (1 + rnd(-.09, .09) + (o.glide || 0) * (t - t0) / dur), t);
    const sum = c.createGain(), amp = c.createGain();
    for (const [rng, q, gn] of [[o.f1, 6, 1], [o.f2, 7, .65], [[2500, 2700], 8, .3]]) { // three vowel formants that keep drifting
      const f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = q; g.gain.value = gn;
      f.frequency.setValueAtTime(rnd(rng[0], rng[1]), t0);
      for (let t = t0 + rnd(.08, .25); t < t0 + dur; t += rnd(.1, .3)) f.frequency.linearRampToValueAtTime(rnd(rng[0], rng[1]), t);
      osc.connect(f); f.connect(g); g.connect(sum);
    }
    amp.gain.setValueAtTime(.0001, t0);
    if (o.single) { amp.gain.linearRampToValueAtTime(o.gain, t0 + .07); amp.gain.linearRampToValueAtTime(o.gain * .7, t0 + dur * .45); amp.gain.linearRampToValueAtTime(.0001, t0 + dur); }
    else for (let t = t0 + rnd(0, .5); t < t0 + dur - .4; ) { // syllables with pauses between them
      const on = rnd(o.on[0], o.on[1]), pk = o.gain * rnd(.4, 1);
      amp.gain.linearRampToValueAtTime(.0001, t); amp.gain.linearRampToValueAtTime(pk, t + Math.min(.04, on * .3)); amp.gain.linearRampToValueAtTime(pk * .55, t + on * .75); amp.gain.linearRampToValueAtTime(.0001, t + on);
      t += on + rnd(o.gap[0], o.gap[1]);
    }
    sum.connect(amp);
    let node = amp; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan || 0; amp.connect(p); node = p; }
    node.connect(dst); osc.start(t0); osc.stop(t0 + dur + .1);
  }
  const pitch = () => Math.random() < .45 ? rnd(180, 270) : Math.random() < .12 ? rnd(280, 380) : rnd(88, 145); // men, women, kids
  function renderBabble() {
    const off = offline(2, 10, 16000), r = room(off, .3); r.out.connect(off.destination);
    for (let i = 0; i < 26; i++) voice(off, r.inp, 0, 10, { f0: pitch(), f1: [380, 850], f2: [950, 2200], gain: .05, on: [.08, .26], gap: [.04, 1.2], pan: rnd(-.85, .85) });
    return render(off).then(b => norm(b, .1));
  }
  function renderRoar() {
    const off = offline(2, 6.5, 16000), r = room(off, .35), env = off.createGain();
    env.gain.setValueAtTime(.001, 0); env.gain.exponentialRampToValueAtTime(1, 1.8); env.gain.setValueAtTime(1, 3.3); env.gain.exponentialRampToValueAtTime(.001, 6.4);
    env.connect(r.inp); r.out.connect(off.destination);
    for (let i = 0; i < 48; i++) voice(off, env, 0, 6.5, { f0: pitch() * rnd(1, 1.12), f1: [560, 900], f2: [1000, 1750], gain: .04, on: [.3, .9], gap: [0, .15], pan: rnd(-.9, .9) });
    const nb = off.createBuffer(1, off.length, 16000), nd = nb.getChannelData(0); // hand claps
    for (let k = 0; k < 160; k++) { const at = Math.floor(rnd(.8, 5.8) * 16000), n = Math.floor(rnd(.004, .012) * 16000); for (let i = 0; i < n && at + i < nd.length; i++) nd[at + i] = (Math.random() * 2 - 1) * (1 - i / n) * rnd(.1, .4); }
    const ns = off.createBufferSource(), hp = off.createBiquadFilter(), ng = off.createGain(); ns.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 1800; ng.gain.value = .12;
    ns.connect(hp); hp.connect(ng); ng.connect(env); ns.start(0);
    return render(off).then(b => norm(b, .1));
  }
  function renderShout() {
    const off = offline(2, 1.3, 16000), r = room(off, .4); r.out.connect(off.destination);
    voice(off, r.inp, .02, 1.1, { f0: rnd(150, 235), glide: -.2, f1: [420, 820], f2: [1000, 2300], gain: .5, single: true, pan: rnd(-.7, .7) });
    return render(off).then(b => norm(b, .08));
  }
  function norm(buf, target) { // bring each rendered sound to a known loudness
    let s = 0, n = 0, pk = 0; const ds = []; for (let c = 0; c < buf.numberOfChannels; c++) ds.push(buf.getChannelData(c));
    for (const d of ds) for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; n++; }
    let k = s ? target / Math.sqrt(s / n) : 1;
    for (const d of ds) for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]) * k);
    if (pk > .9) k *= .9 / pk;
    for (const d of ds) for (let i = 0; i < d.length; i++) d[i] *= k;
    return buf;
  }
  function prepCrowd() {
    if (!crowdP) crowdP = Promise.all([renderBabble(), renderRoar(), renderShout(), renderShout(), renderShout(), renderShout()])
      .then(([babble, roar, ...shouts]) => (crowd = { babble, roar, shouts })).catch(() => { crowdFailed = true; return null; });
    return crowdP;
  }
  function playBuf(buf, gain, delay, pan) {
    const a = audio(); if (!a || !buf) return;
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = buf; g.gain.value = gain; s.connect(g); let n = g;
    if (pan != null && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = pan; g.connect(p); n = p; }
    n.connect(outNode || a.destination); s.start(a.currentTime + (delay || 0));
  }

  // ---------- ballpark ambience: a crowd murmur with the odd swell and shout (follows the Sound button) ----------
  let amb = null, ambWanted = false, ambTimer = 0;
  function startAmb() {
    if (amb || !soundOn) return;
    const a = audio(); if (!a) return;
    if (!crowd && !crowdFailed) { prepCrowd().then(() => { if (ambWanted && !amb) startAmb(); }); return; } // the voices are still being made
    let buf = crowd && crowd.babble;
    if (!buf) { // fallback if this browser couldn't render the voices: a soft noise bed
      const len = a.sampleRate * 8; buf = a.createBuffer(2, len, a.sampleRate);
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .11; } }
    }
    const level = crowd && crowd.babble ? .24 : .55;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const bed = a.createGain(); bed.gain.value = 0.0001;
    const sway = a.createGain(); sway.gain.value = 1;
    const lfo = a.createOscillator(), lfoAmt = a.createGain(); lfo.frequency.value = .11; lfoAmt.gain.value = .12; // slow breathing, like a crowd
    lfo.connect(lfoAmt); lfoAmt.connect(sway.gain);
    src.connect(bed); bed.connect(sway); sway.connect(outNode || a.destination);
    src.start(); lfo.start();
    bed.gain.setValueAtTime(0.0001, a.currentTime); bed.gain.linearRampToValueAtTime(level, a.currentTime + 2.5);
    amb = { src, lfo, bed };
    const swell = () => { // now and then the crowd rises: a murmur swell, sometimes a roar or a lone shout
      ambTimer = setTimeout(() => {
        if (!amb) return; const t = a.currentTime, big = Math.random() < .3;
        amb.bed.gain.cancelScheduledValues(t); amb.bed.gain.setValueAtTime(amb.bed.gain.value, t);
        amb.bed.gain.linearRampToValueAtTime(level * (big ? 1.8 : 1.4), t + 1.3); amb.bed.gain.linearRampToValueAtTime(level, t + (big ? 6 : 4));
        if (crowd) { if (big) playBuf(crowd.roar, .35, .2); if (Math.random() < .6) playBuf(crowd.shouts[Math.floor(Math.random() * crowd.shouts.length)], rnd(.3, .6), rnd(.4, 1.6), rnd(-.8, .8)); }
        swell();
      }, rnd(7000, 18000));
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

  // walking into the park: a roar that builds, cheers and whistles on top, and scattered claps
  function cheer() {
    if (!soundOn) return; unlock(); if (!audio()) return;
    if (!crowd && !crowdFailed) { const t = Date.now(); prepCrowd().then(() => { if (Date.now() - t < 4200) cheer(); }); return; } // the voices are still being made: cheer as soon as they are
    if (crowd) { playBuf(crowd.roar, .95, .05); [.8, 1.7, 2.6].forEach(d => playBuf(crowd.shouts[Math.floor(Math.random() * crowd.shouts.length)], .5, d, rnd(-.8, .8))); return; }
    noise(4.8, 2600, .34, .15, 'lowpass', 1.8);
    noise(3.8, 3400, .08, .9, 'bandpass', 1.4);
    for (let i = 0; i < 18; i++) noise(.09, rnd(1800, 3800), .1, 1 + Math.random() * 3.2, 'highpass');
  }
  function setSound(on) {
    soundOn = !!on; store.set('cc-sound2', soundOn ? '1' : '0');
    if (soundBtn) { soundBtn.setAttribute('aria-pressed', String(soundOn)); soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off'; }
    if (soundOn) { unlock(); audio(); noise(.08, 3000, .3, 0, 'bandpass'); if (ambWanted) startAmb(); } else { stopAmb(); if (silentEl) silentEl.pause(); }
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
    cheer,
    prepare() { return prepCrowd(); }, // pages that play games call this early so the crowd voices are ready
    ambience(on) { ambWanted = !!on; if (ambWanted) startAmb(); else stopAmb(); }, // ballpark crowd noise while a game is being played
    get soundOn() { return soundOn; },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSoundButton); else mountSoundButton();
})();
