/* Kwant Klubben — motion helpers (companion to tokens/motion.css)
   - kkCountUp(el): rolls a number from 0 to data-target (data-dec, data-suffix, data-prefix)
   - auto-wires [data-kk-countup] and .kk-onview (adds .kk-go + triggers count-ups when scrolled into view)
   Usage: <script src=".../assets/kk-motion.js" defer></script> */
(function(){
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setFinal(el){
    var t = parseFloat(el.dataset.target||'0'), dec = parseInt(el.dataset.dec||'0',10);
    el.textContent = (el.dataset.prefix||'') + t.toFixed(dec) + (el.dataset.suffix||'');
  }

  function kkCountUp(el){
    if (reduced) return setFinal(el);
    var t = parseFloat(el.dataset.target||'0'), dec = parseInt(el.dataset.dec||'0',10);
    var pre = el.dataset.prefix||'', suf = el.dataset.suffix||'';
    var dur = parseInt(el.dataset.dur||'900',10), t0 = performance.now();
    function tick(now){
      var p = Math.min(1,(now-t0)/dur), e = 1-Math.pow(1-p,3);
      el.textContent = pre + (t*e).toFixed(dec) + suf;
      if (p<1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function onView(){
    if (!('IntersectionObserver' in window)){
      document.querySelectorAll('.kk-onview').forEach(function(el){ el.classList.add('kk-go'); });
      document.querySelectorAll('[data-kk-countup]').forEach(kkCountUp);
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (!en.isIntersecting) return;
        en.target.classList.add('kk-go');
        en.target.querySelectorAll('[data-kk-countup]').forEach(kkCountUp);
        if (en.target.matches('[data-kk-countup]')) kkCountUp(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: .35 });
    document.querySelectorAll('.kk-onview, [data-kk-countup]').forEach(function(el){ io.observe(el); });
  }

  window.kkCountUp = kkCountUp;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onView);
  else onView();
})();
