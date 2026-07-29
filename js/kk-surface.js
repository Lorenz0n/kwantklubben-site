/* kk-surface.js — the halftone plate
 *
 * One picture, one claim: the normal distribution is wrong in a specific,
 * measurable place. We plot the signed excess
 *
 *     f(x,y) = mixture(x,y) - fitted_gaussian(x,y)
 *
 * where `mixture` is a fat-tailed bivariate density (a tight core plus a broad,
 * off-centre tail component) and `fitted_gaussian` is the axis-aligned
 * moment-matched normal — what an analyst gets by measuring the mixture's mean
 * and per-axis variance and calling it a day. (Axis-aligned: the tail component
 * leans along both axes, so the true mixture carries a small induced covariance,
 * rho up to about 0.07. The fit ignores it, exactly as a per-axis fit would.)
 * f is therefore not decorative noise: it is the error that fitting makes,
 * drawn to scale.
 *
 * The lattice is a printed halftone screen. Dot POSITIONS never move — only the
 * radius carries information, which is why the pointer warps the sampling
 * coordinates rather than the grid. Lime marks f > 0: the peak and the tails,
 * where the normal UNDER-states real mass. Ink marks f < 0: the shoulders,
 * where it over-states. Paper-mute marks the near-zero level set, the ring where
 * the normal happens to be right.
 *
 * ES5-only IIFE to match js/kk-motion.js and js/kk-nav.js — no build step here.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('kk-surface');
  // Loaded on every page; the four interior pages have no canvas. Leave without
  // binding anything at all rather than guarding every listener below.
  if (!canvas) { return; }

  var ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) { return; }

  var readout = document.getElementById('kk-surface-readout');

  /* ---- brand tokens ----------------------------------------------------
   * Re-read on every layout() (boot, resize, bfcache restore) rather than
   * snapshotted once, so a palette change in CSS actually reaches the canvas.
   * Not per-frame: getComputedStyle in the draw loop is a needless tax when the
   * palette can only change on a stylesheet swap.
   */
  var INK = '#0C1016', LIME = '#A6CE12', MUTE = '#C2B79A';
  function refreshTokens() {
    var s = getComputedStyle(document.documentElement);
    function token(name, fallback) {
      var v = s.getPropertyValue(name);
      v = v ? v.replace(/^\s+|\s+$/g, '') : '';
      return v || fallback;
    }
    INK  = token('--ink-900', '#0C1016');
    LIME = token('--lime-600', '#A6CE12');
    MUTE = token('--paper-400', '#C2B79A');
  }

  var TAU = Math.PI * 2;
  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse  = window.matchMedia &&
                window.matchMedia('(pointer: coarse)').matches;

  /* ---- field constants ------------------------------------------------
   * All distribution parameters live in "field units" ~ standard deviations of
   * the fitted normal. The plate window is deliberately clipped at about
   * +-2.5 sd: far enough out to show the tail excess, close enough in that the
   * lime dots stay a minority of the plate rather than a lime border.
   */
  var X_MIN = -2.5, X_MAX = 2.5;
  var Y_MIN = -2.0, Y_MAX = 2.0;

  var W_TAIL = 0.19;   // weight of the heavy component
  var S_CORE = 0.55;   // sd of the tight core
  var S_TAIL = 1.45;   // sd of the fat tail
  var SKEW_X = 1.15;   // how far the tail component leans per unit of skew
  var SKEW_Y = 0.45;

  var GAMMA = 0.42;    // perceptual compression of |f|; without it the centre
                       // spike swamps the tail excess, which is the whole point
  var MUTE_N = 0.085;  // below this normalised amplitude a dot is "the normal
                       // is right here" and drawn in paper-mute
  var IDLE_MS = 6000;  // pointer silence after which autonomous drift resumes
  var RING_LIFE = 2.0; // seconds
  var RING_SPEED = 1.6;// field units per second
  var RING_WIDTH = 0.30;
  var RING_GAIN = 0.35;// additive, NOT multiplicative — see paint()

  /* ---- lattice state --------------------------------------------------- */
  var dpr = 1;
  var cssW = 0, cssH = 0;
  var cols = 0, rows = 0, count = 0, pitch = 0;
  var px = [], py = [];        // fixed pixel centres (never move)
  var fx = [], fy = [];        // the field coordinate each cell samples at rest
  var vals = [];               // signed f per cell, reused every frame
  var amp = [];                // normalised radius amplitude, computed once/frame
  var xStep = 0, yStep = 0;    // field units per cell, for the mass integral
  var fieldPerPxX = 0, fieldPerPxY = 0;
  var plateX0 = 0, plateY0 = 0;
  var dotScale = 1;

  /* ---- mixture parameters, refreshed once per frame --------------------
   * Module-level rather than local to render() so field() can read them without
   * a closure being allocated on every frame.
   */
  var m2x = 0, m2y = 0, mx = 0, my = 0;
  var aCore = 0, bCore = 0, aTail = 0, bTail = 0, aFit = 0, bFitX = 0, bFitY = 0;

  function field(x, y) {
    var dx = x, dy = y;
    var v = aCore * Math.exp(-(dx * dx + dy * dy) * bCore);        // tight core
    dx = x - m2x; dy = y - m2y;
    v += aTail * Math.exp(-(dx * dx + dy * dy) * bTail);           // fat tail
    dx = x - mx;  dy = y - my;
    v -= aFit * Math.exp(-(dx * dx * bFitX + dy * dy * bFitY));    // the fit
    return v;
  }

  /* ---- animation state ------------------------------------------------- */
  var clock = 0;               // accumulated only while running, so pausing
  var driftPhase = 0;          // never produces a jump on resume
  var lastT = 0;
  var norm = 0, normSeeded = false;
  var influence = 0;           // eased pointer authority, 0..1
  var lastPointer = -1e9;
  var cursorX = 0, cursorY = 0, cursorLive = false;
  var rings = [];
  var rafId = 0;
  var running = false;
  var onScreen = true;
  var lastReadout = -1e9;
  var skewNow = 0, pctNow = 0;

  /* ---- layout ---------------------------------------------------------- */
  function layout() {
    refreshTokens();

    cssW = canvas.clientWidth || canvas.offsetWidth || 0;
    cssH = canvas.clientHeight || canvas.offsetHeight || 0;
    if (cssW < 2 || cssH < 2) { count = 0; return; }

    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 24 columns at 360px up to 46 at 1440px, linear in between.
    var t = (cssW - 360) / (1440 - 360);
    if (t < 0) { t = 0; } else if (t > 1) { t = 1; }
    cols = Math.round(24 + 22 * t);

    var availW = cssW * 0.88;
    var availH = cssH * 0.84;
    pitch = availW / cols;

    // Cap the plate's height against its width so the screen stays a printed
    // rectangle even when the canvas box is very tall.
    var plateH = Math.min(availH, availW * 0.70);
    rows = Math.max(8, Math.round(plateH / pitch));
    var plateW = (cols - 1) * pitch;
    plateH = (rows - 1) * pitch;

    plateX0 = (cssW - plateW) / 2;
    // Sit slightly below centre: the plate is the lower mass of the hero.
    plateY0 = (cssH - plateH) * 0.56;
    if (plateY0 < cssH * 0.04) { plateY0 = cssH * 0.04; }

    xStep = (X_MAX - X_MIN) / (cols - 1);
    yStep = (Y_MAX - Y_MIN) / (rows - 1);
    fieldPerPxX = xStep / pitch;
    fieldPerPxY = yStep / pitch;

    // Dots must never touch: keep the largest radius well under half a pitch.
    dotScale = pitch / 22;
    if (dotScale < 0.62) { dotScale = 0.62; }
    if (dotScale > 1.15) { dotScale = 1.15; }

    count = cols * rows;
    px.length = py.length = fx.length = fy.length = vals.length = amp.length = count;
    var i = 0, r, c;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        px[i] = plateX0 + c * pitch;
        py[i] = plateY0 + r * pitch;
        fx[i] = X_MIN + c * xStep;
        fy[i] = Y_MIN + r * yStep;   // +y is screen-down; the field is symmetric
        vals[i] = 0;
        amp[i] = 0;
        i++;
      }
    }
    normSeeded = false;
  }

  /* ---- one frame ------------------------------------------------------- */
  function render() {
    if (!count) { return; }

    // Slow autonomous drift of the mixture's skew: one dominant ~20s cycle plus
    // an incommensurate slower term so the plate never visibly loops.
    var k = 0.62 * Math.sin(driftPhase) + 0.18 * Math.sin(driftPhase * 0.63 + 1.7);
    skewNow = k;

    m2x = SKEW_X * k; m2y = SKEW_Y * k;

    // Moment-matched normal: same mean, same per-axis variance as the mixture.
    // This is the honest "fitted" object — not a hand-tuned strawman.
    mx = W_TAIL * m2x; my = W_TAIL * m2y;
    var vcore = S_CORE * S_CORE, vtail = S_TAIL * S_TAIL;
    var vX = (1 - W_TAIL) * (vcore + mx * mx) +
             W_TAIL * (vtail + (m2x - mx) * (m2x - mx));
    var vY = (1 - W_TAIL) * (vcore + my * my) +
             W_TAIL * (vtail + (m2y - my) * (m2y - my));

    aCore = (1 - W_TAIL) / (TAU * vcore); bCore = 1 / (2 * vcore);
    aTail = W_TAIL / (TAU * vtail);       bTail = 1 / (2 * vtail);
    aFit  = 1 / (TAU * Math.sqrt(vX * vY));
    bFitX = 1 / (2 * vX); bFitY = 1 / (2 * vY);

    // Pointer warp: samples are pulled TOWARD the cursor with a Gaussian
    // falloff, i.e. a local magnifier on the field. The displacement is
    // proportional to the offset, so there is no singularity under the cursor
    // and the lattice itself stays rigid — only what each cell reads changes.
    var warp = cursorLive ? 0.55 * influence : 0;
    var warpSig2 = 2 * 0.95 * 0.95;

    var i, x, y, g, dx, dy, v, vRest, a;
    var maxAbs = 0, posMass = 0;

    for (i = 0; i < count; i++) {
      x = fx[i]; y = fy[i];

      // The mass integral is a property of the DISTRIBUTION, so it is always
      // summed at the unwarped lattice point. Reading it off the warped samples
      // (as an earlier version did) made the headline number swing 2.3x purely
      // with cursor position: the warp is not area-preserving, so the warped
      // Riemann sum is no longer the integral it is labelled as.
      vRest = field(x, y);
      if (vRest > 0) { posMass += vRest; }

      if (warp) {
        dx = x - cursorX; dy = y - cursorY;
        g = warp * Math.exp(-(dx * dx + dy * dy) / warpSig2);
        v = field(x - dx * g, y - dy * g);
      } else {
        v = vRest;                        // the common case costs nothing extra
      }
      vals[i] = v;

      a = v < 0 ? -v : v;
      if (a > maxAbs) { maxAbs = a; }
    }

    // Integral of max(f,0) over the PLATE WINDOW. That is a lower bound on the
    // total variation distance between the mixture and its own best normal, not
    // the whole of it — the window clips at about +-2.5 sd while the tail
    // component has sd 1.45, so a slab of positive excess falls outside (~21%
    // in view against ~25% in full at peak skew). The readout says "in view"
    // for exactly that reason.
    pctNow = posMass * xStep * yStep * 100;

    if (!normSeeded) { norm = maxAbs; normSeeded = true; }
    else { norm += (maxAbs - norm) * 0.12; }   // smoothed so radii never flicker
    if (norm <= 1e-9) { norm = 1e-9; }
    var invNorm = 1 / norm;

    // Amplitude is computed ONCE here, not once per colour pass. The three
    // paint() calls below used to recompute pow() and ringGain() for every dot,
    // which cost more than the field loop above it.
    var n, boost;
    for (i = 0; i < count; i++) {
      a = vals[i] < 0 ? -vals[i] : vals[i];
      n = Math.pow(a * invNorm, GAMMA);
      boost = ringGain(fx[i], fy[i]);
      // Additive, not multiplicative: where f is near zero n is near zero too,
      // so scaling it leaves the click ring invisible on precisely the level set
      // the piece is about, and the annulus visibly breaks into two arcs.
      if (boost) { n += boost * RING_GAIN; }
      if (n > 1.4) { n = 1.4; }
      amp[i] = n;
    }

    ctx.clearRect(0, 0, cssW, cssH);   // paper shows through; never fill a bg

    // Three fills total: mute / ink / lime. Grouping by colour is the only
    // grouping — per-dot fill() at ~1000 dots is what kills the frame budget.
    paint(MUTE, 0);
    paint(INK, -1);
    paint(LIME, 1);
  }

  // sign: -1 negative dots, +1 positive dots, 0 the near-zero level set.
  function paint(colour, sign) {
    var i, n, r;
    ctx.beginPath();
    for (i = 0; i < count; i++) {
      n = amp[i];
      if (n < MUTE_N) { if (sign !== 0) { continue; } }
      else if (sign === 0) { continue; }
      else if ((vals[i] > 0 ? 1 : -1) !== sign) { continue; }

      r = (0.6 + 3.6 * n) * dotScale;
      ctx.moveTo(px[i] + r, py[i]);   // break the subpath, else arcs chain
      ctx.arc(px[i], py[i], r, 0, TAU);
    }
    ctx.fillStyle = colour;
    ctx.fill();
  }

  // Click sends an expanding annulus of extra amplitude outward, decaying
  // linearly to nothing in RING_LIFE seconds.
  function ringGain(x, y) {
    var n = rings.length;
    if (!n) { return 0; }
    var total = 0, i, ring, age, R, d, dd;
    for (i = 0; i < n; i++) {
      ring = rings[i];
      age = clock - ring.t;
      if (age < 0 || age > RING_LIFE) { continue; }
      R = age * RING_SPEED;
      d = Math.sqrt((x - ring.x) * (x - ring.x) + (y - ring.y) * (y - ring.y));
      dd = d - R;
      total += 0.9 * (1 - age / RING_LIFE) *
               Math.exp(-(dd * dd) / (2 * RING_WIDTH * RING_WIDTH));
    }
    return total;
  }

  /* ---- readout --------------------------------------------------------- */
  function commas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function updateReadout(now) {
    if (!readout) { return; }
    if (now - lastReadout < 165) { return; }   // ~6 Hz, not per frame
    lastReadout = now;
    readout.textContent = commas(count) + ' cells  ·  excess in view ' +
      pctNow.toFixed(1) + '%  ·  skew ' + skewNow.toFixed(2);
  }

  /* ---- loop ------------------------------------------------------------ */
  function frame(now) {
    rafId = 0;
    if (!running) { return; }
    var dt = lastT ? (now - lastT) / 1000 : 0;
    if (dt > 0.05) { dt = 0.05; }   // tab wake-ups must not fast-forward drift
    lastT = now;
    clock += dt;

    // Pointer authority eases in on movement and releases after IDLE_MS.
    var want = (now - lastPointer < IDLE_MS) ? 1 : 0;
    influence += (want - influence) * (want ? 0.10 : 0.03);
    if (influence < 0.002) { influence = 0; cursorLive = false; }

    // While the pointer is driving, the autonomous drift steps aside; it
    // resumes full rate once the cursor goes quiet.
    driftPhase += dt * (TAU / 20) * (1 - 0.7 * influence);

    if (rings.length) {
      var keep = [], i;
      for (i = 0; i < rings.length; i++) {
        if (clock - rings[i].t <= RING_LIFE) { keep.push(rings[i]); }
      }
      rings = keep;
    }

    render();
    updateReadout(now);
    rafId = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced || !count) { return; }
    running = true;
    lastT = 0;
    if (!rafId) { rafId = window.requestAnimationFrame(frame); }
  }
  function stop() {
    running = false;
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
  }
  function sync() {
    if (onScreen && !document.hidden) { start(); } else { stop(); }
  }

  /* ---- pointer --------------------------------------------------------- */
  function toField(ev, out) {
    var rect = canvas.getBoundingClientRect();
    out.x = X_MIN + (ev.clientX - rect.left - plateX0) * fieldPerPxX;
    out.y = Y_MIN + (ev.clientY - rect.top - plateY0) * fieldPerPxY;
  }
  var scratch = { x: 0, y: 0 };

  function onMove(ev) {
    if (!count) { return; }
    toField(ev, scratch);
    cursorX = scratch.x; cursorY = scratch.y;
    cursorLive = true;
    lastPointer = performance.now();   // same clock domain as the rAF timestamp
  }
  function onLeave() {
    lastPointer = -1e9;   // release immediately rather than idling out
  }
  function onDown(ev) {
    if (!count) { return; }
    toField(ev, scratch);
    if (rings.length > 2) { rings.shift(); }
    rings.push({ x: scratch.x, y: scratch.y, t: clock });
    // Only claim pointer authority where the warp actually exists. On touch,
    // pointermove is not bound, so cursorLive stays false and the warp stays 0 —
    // but a non-zero influence would still slow the autonomous drift to 30% for
    // six seconds, i.e. a tap would visibly stall the piece for no visible cause.
    if (!coarse) { lastPointer = performance.now(); }
  }

  /* ---- resize ---------------------------------------------------------- */
  var resizeTimer = 0;
  function onResize() {
    if (resizeTimer) { window.clearTimeout(resizeTimer); }
    resizeTimer = window.setTimeout(function () {
      resizeTimer = 0;
      // Only rebuild when the CSS box actually changed. layout() writes
      // canvas.width/height, and if this canvas is ever used without CSS sizing
      // those attributes ARE its layout size — a ResizeObserver would then
      // observe its own write and oscillate. The site's CSS sizes it at 100%,
      // so this is a guard against future misuse, not a live bug.
      var w = canvas.clientWidth || canvas.offsetWidth || 0;
      var h = canvas.clientHeight || canvas.offsetHeight || 0;
      if (w !== cssW || h !== cssH || !count) { layout(); }
      // sync(), not just staticFrame(): if the canvas had no layout size when
      // this module booted (display:none, a not-yet-measured flex parent, a
      // zero-height stage) then count was 0, start() refused, and nothing else
      // would ever call it again — the IntersectionObserver does not re-fire for
      // an element that was already on screen. That leaves a permanently dead
      // canvas, which is exactly the failure this file is meant not to have.
      if (reduced) { staticFrame(); } else { sync(); }
    }, 140);
  }

  function staticFrame() {
    // Reduced motion: a single printed plate, at a phase where the skew is
    // visible rather than at zero. No rAF, ever.
    driftPhase = 1.15;
    clock = 0;
    render();
    // Re-arm the throttle first. updateReadout() is time-gated, and a fixed
    // sentinel here would set lastReadout to that sentinel and then bail on
    // every later call — freezing the cell count at its boot value while the
    // plate behind it was relaid out (408 cells on a phone still labelled 1242).
    lastReadout = -1e9;
    updateReadout(0);
  }

  /* ---- boot ------------------------------------------------------------ */
  layout();
  window.addEventListener('resize', onResize);

  // A ResizeObserver catches the canvas being laid out or resized by something
  // other than the window — a flex parent settling, a font landing, the mobile
  // URL bar collapsing. window.resize alone misses all of those.
  var ro = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(onResize);
    ro.observe(canvas);
  }

  if (reduced) {
    staticFrame();
  } else {
    if (!coarse) {
      // Move-driven warping is a cursor idiom; on touch it would only ever fire
      // as a side effect of a tap, so touch keeps tap-to-perturb alone.
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointercancel', onLeave);
    }
    canvas.addEventListener('pointerdown', onDown);

    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        sync();
      }, { threshold: 0 });
      io.observe(canvas);
    }
    document.addEventListener('visibilitychange', sync);

    // Draw one frame up front. A tab opened in the background has
    // document.hidden true, so sync() will not start the loop and the hero
    // would be blank at the moment the user first switches to it.
    render();
    updateReadout(0);
    sync();
  }

  function teardown() {
    stop();
    if (resizeTimer) { window.clearTimeout(resizeTimer); resizeTimer = 0; }
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointercancel', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    if (io) { io.disconnect(); io = null; }
    if (ro) { ro.disconnect(); ro = null; }
  }

  // pagehide fires on ordinary back/forward navigation too. If the page goes
  // into the bfcache the module is NOT re-executed on the way back, so a full
  // teardown there returns the user to a frozen, dead canvas. Tear down only
  // when the page is really being discarded; otherwise just pause.
  window.addEventListener('pagehide', function (ev) {
    if (ev && ev.persisted) { stop(); } else { teardown(); }
  });
  window.addEventListener('pageshow', function (ev) {
    if (!ev || !ev.persisted) { return; }
    refreshTokens();
    if (reduced) { staticFrame(); } else { sync(); }
  });
})();
