// The manager's notebook as a sheet over the current page, so a phone never has to leave the draft (or the roster builder) to use it.
(function () {
  'use strict';
  if (window.NBSheet) return;
  var wrap, frame, closeBtn, noteEl, opener = null, isOpen = false, loaded = false;
  var css = '#nbSheet[hidden]{display:none}#nbSheet{position:fixed;inset:0;z-index:9500}' +
    '#nbSheet .nbs-back{position:absolute;inset:0;background:rgba(15,25,20,.55)}' +
    '#nbSheet .nbs-panel{position:absolute;left:0;right:0;bottom:0;top:56px;margin:0 auto;max-width:760px;background:#F3ECD8;border-radius:16px 16px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}' +
    '#nbSheet .nbs-head{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 16px;background:#1F3F8F;color:#fff;flex:0 0 auto}' +
    '#nbSheet .nbs-head b{font:400 21px "Permanent Marker","Comic Sans MS",cursive;flex:0 0 auto}' +
    '#nbSheet .nbs-note{flex:1;min-width:0;font:14px/1.25 system-ui,sans-serif;opacity:.95}' +
    '#nbSheet .nbs-close{min-height:44px;min-width:84px;padding:0 18px;border:2px solid #fff;border-radius:8px;background:#fff;color:#1F3F8F;font:700 16px/1 system-ui,sans-serif;cursor:pointer;flex:0 0 auto;margin-left:auto}' +
    '#nbSheet .nbs-frame{flex:1 1 auto;width:100%;border:0;background:#F3ECD8}' +
    'html.nbs-lock,html.nbs-lock body{overflow:hidden!important}' +
    '@media (min-width:900px){#nbSheet .nbs-panel{top:5vh;bottom:5vh;border-radius:16px}}';
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    wrap = document.createElement('div'); wrap.id = 'nbSheet'; wrap.hidden = true;
    wrap.innerHTML = '<div class="nbs-back"></div><div class="nbs-panel" role="dialog" aria-modal="true" aria-label="Manager\'s notebook"><div class="nbs-head"><b>Notebook</b><span class="nbs-note" aria-live="polite"></span><button type="button" class="nbs-close">Close</button></div><iframe class="nbs-frame" title="Manager\'s notebook" src="about:blank"></iframe></div>';
    document.body.appendChild(wrap);
    frame = wrap.querySelector('iframe'); closeBtn = wrap.querySelector('.nbs-close'); noteEl = wrap.querySelector('.nbs-note');
    closeBtn.addEventListener('click', close); wrap.querySelector('.nbs-back').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); } });
  }
  function open() {
    if (!wrap) build();
    if (isOpen) return;
    opener = document.activeElement;
    var n = typeof api.onOpen === 'function' ? api.onOpen() : '';
    noteEl.textContent = typeof n === 'string' ? n : '';
    if (!loaded) { frame.src = 'notebook.html?embed=1'; loaded = true; }
    wrap.hidden = false; isOpen = true; document.documentElement.classList.add('nbs-lock'); closeBtn.focus();
  }
  function close() {
    if (!isOpen) return;
    wrap.hidden = true; isOpen = false; document.documentElement.classList.remove('nbs-lock');
    if (opener && opener.focus && document.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
    if (typeof api.onClose === 'function') api.onClose();
  }
  var api = window.NBSheet = { open: open, close: close, isOpen: function () { return isOpen; }, onOpen: null, onClose: null };
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data && e.data.nbClose === true) close(); });
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href="notebook.html"]') : null;
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); open();
  });
})();
