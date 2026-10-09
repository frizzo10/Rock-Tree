// The GM's voice, shared by every page where the general manager speaks (league games and the draft report card).
// A natural voice from the server when it is available (gm-voice), otherwise the best voice on the phone, spoken sentence by sentence.
(function () {
  'use strict';
  const S = { audio: null, speaking: false, via: '', token: 0 }, subs = [];
  function floatStop() {   // a Stop button that stays on screen however far you have scrolled
    let fs = document.getElementById('gmStopFloat');
    if (!fs) { if (!document.body) return; fs = document.createElement('button'); fs.type = 'button'; fs.id = 'gmStopFloat'; fs.textContent = 'Stop GM'; fs.setAttribute('aria-label', 'Stop the GM talking');
      fs.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:max(18px,env(safe-area-inset-bottom));z-index:60;padding:14px 26px;border-radius:999px;border:2px solid #fff;background:#a31212;color:#fff;font:700 17px/1 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.45);display:none';
      fs.onclick = () => stop(); document.body.appendChild(fs); }
    fs.style.display = S.speaking ? 'block' : 'none';
  }
  const emit = () => { try { floatStop(); } catch (e) {} subs.forEach(f => { try { f(S); } catch (e) {} }); };
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  // how the GM feels: it follows the result, never the AI's words
  function toneForGame(f) {
    const m = (f.finalScore && f.finalScore.you || 0) - (f.finalScore && f.finalScore.opponent || 0), won = !!f.youWon, walkOff = (f.moments || []).some(x => x && x.walkOff);
    if (won) return walkOff || (f.innings || 9) > 9 || (f.leadChanges || 0) >= 2 || m >= 7 ? 'thrilled' : 'upbeat';
    return m >= -1 ? 'even' : m > -7 ? 'down' : 'grim';
  }
  const toneForDraft = grade => { const g = String(grade || '')[0]; return g === 'A' ? 'thrilled' : g === 'B' ? 'upbeat' : g === 'C' ? 'even' : 'down'; };
  const OPEN = { thrilled: ['What a ballgame, skipper!', 'That is how you win one, skipper!'], upbeat: ['Good win, skipper.', 'Nice work out there, skipper.'], even: ['Tough one, skipper. We were right there with them.', 'That one stings, skipper. It was close.'], down: ['Not our day, skipper.', 'That one got away from us, skipper.'], grim: ['Rough night, skipper. Let me be straight with you.', 'That one hurt, skipper. Here is what I saw.'] };
  const OPEN_DRAFT = { thrilled: ['Now that is a draft, skipper!', 'You built a real contender, skipper!'], upbeat: ['Solid draft, skipper.', 'Good work in that draft, skipper.'], even: ['Not a bad draft, skipper, but there is room to grow.', 'A fair draft, skipper. Here is what I would change.'], down: ['That draft needs work, skipper. Let me be straight with you.', 'We left a lot on the table, skipper. Here is my honest take.'] };
  const pickOne = a => a[Math.floor(Math.random() * a.length)];
  function gameScript(r, f, tone) {
    const part = (lead, txt) => txt ? `${lead} ${txt}` : '', ch = (f.changes || []).filter(c => c.side === 'you' && r.changes && r.changes[c.n]).map(c => `${c.half === 'top' ? 'Top' : 'Bottom'} of the ${ord(c.inning)}: ${c.entering.name} for ${c.leaving.name}. ${r.changes[c.n]}`);
    return [pickOne(OPEN[tone] || OPEN.even), r.verdict, part('On the pitching,', r.pitching), ...ch, part('The turning point:', r.moment), part('Next time,', r.next)].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  }
  function draftScript(r, notable, tone) {
    const picks = (notable || []).filter(p => r.picks && r.picks[p.n]).map(p => `Pick ${p.n}, ${p.player}, ${p.season}. ${r.picks[p.n]}`);
    return [pickOne(OPEN_DRAFT[tone] || OPEN_DRAFT.even), r.synopsis, ...picks, r.next ? `Next time, ${r.next}` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  }
  // plays inside a tap so the browser lets the voice play when the report arrives a moment later
  function prime() {
    try { if (!S.audio) S.audio = new Audio(); S.audio.src = SILENT; const p = S.audio.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
  }
  function pickVoice() {
    const vs = (window.speechSynthesis && speechSynthesis.getVoices && speechSynthesis.getVoices() || []).filter(v => /^en[-_]/i.test(v.lang) || v.lang === 'en');
    if (!vs.length) return null;
    const score = v => { const n = v.name + ' ' + (v.voiceURI || ''); let sc = 0; if (/premium|enhanced|natural|neural|siri/i.test(n)) sc += 6; if (/google (us|uk) english|microsoft (aria|guy|jenny|davis|ryan|sonia)/i.test(n)) sc += 4; if (/daniel|alex|aaron|evan|fred|oliver|arthur|guy|ryan|david|mark|james/i.test(n)) sc += 3; if (/compact|espeak|novelty|whisper|zarvox|bad news|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|trinoids|wobble/i.test(n)) sc -= 9; if (/^en[-_]US/i.test(v.lang)) sc += 2; if (v.localService === false) sc += 1; return sc; };
    return vs.sort((a, b) => score(b) - score(a))[0];
  }
  const FEEL = { thrilled: { rate: 1.06, pitch: 1.08 }, upbeat: { rate: 1.02, pitch: 1.04 }, even: { rate: .98, pitch: 1 }, down: { rate: .94, pitch: .94 }, grim: { rate: .9, pitch: .88 } };
  function speakDevice(text, tone, tok) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
    const sents = (text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text]).map(x => x.trim()).filter(Boolean), feel = FEEL[tone] || FEEL.even, voice = pickVoice();
    S.via = 'device'; S.speaking = true; emit(); let i = 0;
    const next = () => {
      if (tok !== S.token) return; if (i >= sents.length) { S.speaking = false; emit(); return; }
      const sentence = sents[i++], u = new SpeechSynthesisUtterance(sentence), q = /[?]$/.test(sentence), ex = /!$/.test(sentence);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
      u.rate = Math.max(.7, Math.min(1.3, feel.rate + (Math.random() - .5) * .06)); u.pitch = Math.max(.6, Math.min(1.5, feel.pitch + (ex ? .06 : 0) + (q ? .08 : 0) + (Math.random() - .5) * .08)); u.volume = 1;
      u.onend = () => setTimeout(next, /[.!?]$/.test(sentence) ? 170 + Math.random() * 140 : 60); u.onerror = () => { if (tok === S.token) { S.speaking = false; emit(); } };
      speechSynthesis.speak(u);
    };
    try { speechSynthesis.cancel(); } catch (e) {} setTimeout(next, 60); return true;
  }
  function stop() {
    S.token++; S.speaking = false;
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    try { if (S.audio) S.audio.pause(); } catch (e) {}
    emit();
  }
  function playBlob(blob, tok) {
    return new Promise(res => {
      try {
        if (!S.audio) S.audio = new Audio(); const a = S.audio, url = URL.createObjectURL(blob); a.onended = a.onerror = null; a.src = url; a.volume = 1;
        a.onended = () => { if (tok === S.token) { S.speaking = false; emit(); } URL.revokeObjectURL(url); }; a.onerror = () => { if (tok === S.token) { S.speaking = false; emit(); } };
        const p = a.play(); S.via = 'server'; S.speaking = true; emit();
        if (p && p.then) p.then(() => res(true)).catch(() => { S.speaking = false; emit(); res(false); }); else res(true);
      } catch (e) { res(false); }
    });
  }
  // item: { text, tone, blob? }. The finished audio is kept on the item, so a replay does not ask the server again.
  async function speak(item) {
    const tok = ++S.token, text = item.text, tone = item.tone;
    try { speechSynthesis.cancel(); } catch (e) {} S.speaking = true; S.via = 'loading'; emit();
    const cc = window.CC;
    if (item.blob) { if (await playBlob(item.blob, tok)) return; }
    else if (cc && cc.client && cc.client.functions) {
      try {
        const ask = cc.client.functions.invoke('gm-voice', { body: { text, tone } }), timed = new Promise(r => setTimeout(() => r({ timeout: true }), 35000)), out = await Promise.race([ask, timed]);
        if (tok !== S.token) return;
        const d = out && out.data; if (d && typeof d === 'object' && d.size > 1000 && !out.error) { item.blob = new Blob([d], { type: 'audio/wav' }); if (await playBlob(item.blob, tok)) return; }
      } catch (e) {}
      if (tok !== S.token) return;
    }
    if (!speakDevice(text, tone, tok)) { S.speaking = false; S.via = ''; emit(); }
  }
  addEventListener('pagehide', () => { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} try { if (S.audio) S.audio.pause(); } catch (e) {} });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.speaking) stop(); });
  window.GMVoice = { state: S, prime, stop, speak, on: f => subs.push(f), toneForGame, toneForDraft, gameScript, draftScript, soundOn: () => !!(window.FX && FX.soundOn) };
})();
