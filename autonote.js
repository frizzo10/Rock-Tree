// A short notice, on the pages where people play or choose, saying which calls the game makes for them. One wording, shared by every page.
(function () {
  'use strict';
  var s = document.currentScript, before = s && s.getAttribute('data-before'), after = s && s.getAttribute('data-after');
  var anchor = before ? document.querySelector(before) : after ? document.querySelector(after) : null;
  if (!anchor || document.querySelector('details.autonote')) return;
  var css = '.autonote{margin:12px 0;background:#FFF4CF;border:1.5px solid #C69A2B;border-left-width:6px;border-radius:6px;color:#20262D;font:16px/1.45 "IBM Plex Sans Condensed","Arial Narrow",Arial,sans-serif}' +
    '.autonote summary{cursor:pointer;padding:8px 14px;min-height:44px;display:flex;align-items:center;font-weight:700}' +
    '.autonote .an-body{padding:0 14px 12px}.autonote ul{margin:6px 0 8px 20px;padding:0}.autonote li{margin:6px 0}.autonote p{margin:8px 0}.autonote a{color:#1F3F8F;font-weight:700}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var d = document.createElement('details'); d.className = 'autonote';
  d.innerHTML = '<summary>The game makes some calls for you: extra bases, tag-ups, double plays and pitching changes. Tap to see how.</summary><div class="an-body"><ul>' +
    '<li><b>Taking extra bases:</b> runners advance by fixed odds, nudged by the hitter\'s speed. There are no outfield arm ratings.</li>' +
    '<li><b>Tagging up:</b> it\'s automatic. About 6 times in 10 a runner on third scores on a fly ball, and a runner on second tags up to third about a quarter of the time when third is open.</li>' +
    '<li><b>Trailing and forced runners:</b> they advance by the rules, with no choice.</li>' +
    '<li><b>Double plays:</b> the chance depends on the hitter\'s speed. In a quick game you can set double-play depth, the infield in and the rest of your defense. In a league the game decides for now.</li>' +
    '<li><b>Pitching changes and the closer:</b> the game decides when a pitcher is taken out, by the stamina and run rules. In a league, the next reliever follows the bullpen order you set on your manager page (or the best one available, if you let the game choose). In a quick game you choose who comes in.</li>' +
    '</ul><p>Steals, sacrifice bunts and intentional walks are your calls: live in a quick game, or set on your manager page in a league. There are no pinch hitters or fielder positioning. <a href="howtoplay.html#calls">Read the full rules</a></p></div>';
  if (before) anchor.parentNode.insertBefore(d, anchor); else anchor.parentNode.insertBefore(d, anchor.nextSibling);
})();
