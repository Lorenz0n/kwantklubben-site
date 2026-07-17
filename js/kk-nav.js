/* Kwant Klubben — mobile nav disclosure.
   Companion to the .kk-nav* rules in css/styles.css. Kept separate from
   kk-motion.js, which is a verbatim copy of the design-system original and must
   not be edited.

   The panel ships with `hidden` in the markup rather than having this script add
   it: this file is `defer`, so on the poster-QR path (mobile data, cold cache)
   the nav would otherwise render OPEN until the script lands. Same reasoning as
   .kk-onview hiding in CSS rather than in kk-motion.js.

   The 700px breakpoint is duplicated in css/styles.css's @media block. A media
   query can't read a custom property, so the number lives in two places on
   purpose. Change both together. */
(function(){
  var toggle = document.querySelector('.kk-nav__toggle');
  var panel  = document.getElementById('kk-nav-panel');
  if (!toggle || !panel) return;

  var mq = matchMedia('(max-width: 700px)');

  function isOpen(){ return !panel.hidden; }

  function setOpen(open){
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  toggle.addEventListener('click', function(){
    var open = !isOpen();
    setOpen(open);
    // The drawer renders below the bar but sits BEFORE the CTA in the DOM, so
    // Tab from the toggle would sail straight past it into the page. Move focus
    // in. Programmatic focus after a tap doesn't match :focus-visible, so touch
    // users get no stray ring.
    if (open) panel.querySelector('a').focus();
  });

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape' || !mq.matches || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });

  // Tap outside the bar closes it. No focus restore — the user has moved on.
  document.addEventListener('pointerdown', function(e){
    if (!mq.matches || !isOpen()) return;
    if (!e.target.closest('.kk-nav')) setOpen(false);
  });

  // On `/`, "About" -> /#about is a same-document jump: nothing unloads, so the
  // drawer would sit open on top of the section it just scrolled to.
  panel.addEventListener('click', function(e){
    if (mq.matches && e.target.closest('a')) setOpen(false);
  });

  // Above the breakpoint there is no drawer, so the collapsed state — and the
  // `hidden` attribute carrying it — only applies below it.
  function sync(){ setOpen(!mq.matches); }
  mq.addEventListener('change', sync);
  sync();

  // Marked here rather than in the markup so the NAV block stays byte-identical
  // across the three files. `!a.hash` keeps /#about from matching "/" on the home
  // page — About is a section, not a page.
  var here = location.pathname.replace(/index\.html$/, '');
  Array.prototype.forEach.call(panel.querySelectorAll('a'), function(a){
    if (!a.hash && a.pathname.replace(/index\.html$/, '') === here){
      a.setAttribute('aria-current', 'page');
    }
  });
})();
