/* kk-tails.js — the hero chart
 *
 * One claim, drawn so you can check it: the normal distribution does not have
 * enough mass in its tails to account for how often markets move a lot.
 *
 *   bars        how often a day of each size actually happened
 *   thin line   how often the fitted normal says it should happen
 *   lime        the gap between them out in the tails — the moves the normal
 *               cannot account for
 *
 * The y axis is LOG frequency, and that is not decoration. On a linear density
 * axis everything past 2 sigma is sub-pixel and the entire point of the chart is
 * invisible. On a log axis the normal falls away as a parabola while the real
 * bars refuse to come down with it, and the gap is the picture.
 *
 * Drag anywhere on the chart to move the +/- threshold. The readout compares
 * what the normal predicts beyond it against what the sample actually contains.
 *
 * THE DATA IS SIMULATED, and the caption in the markup says so. It is a
 * Student-t with nu = 3, standardised to unit variance: the shape real return
 * distributions have, generated from a fixed seed so the picture is the same on
 * every load. Swap in a real return series and only sample() below changes.
 *
 * No animation loop. The chart is static once drawn — it redraws on resize and
 * while dragging, and plays a single short entrance unless the visitor has asked
 * for reduced motion. Nothing here runs when you are not looking at it.
 *
 * ES5-only IIFE to match js/kk-motion.js and js/kk-nav.js — no build step here.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('kk-tails');
  // Loaded on every page; only the landing page has the chart.
  if (!canvas) { return; }
  var ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) { return; }

  var readout = document.getElementById('kk-tails-readout');

  /* ---- brand tokens, re-read on layout so CSS stays the source of truth --- */
  var INK = '#0C1016', LIME = '#A6CE12', RULE = '#DCD4BD', MUTE = '#5A6677';
  function refreshTokens() {
    var s = getComputedStyle(document.documentElement);
    function t(name, fb) {
      var v = s.getPropertyValue(name);
      v = v ? v.replace(/^\s+|\s+$/g, '') : '';
      return v || fb;
    }
    INK  = t('--ink-900', '#0C1016');
    LIME = t('--lime-600', '#A6CE12');
    RULE = t('--paper-300', '#DCD4BD');
    MUTE = t('--ink-400', '#5A6677');
  }

  var N = 25000;          // simulated days, about 100 trading years
  var PER_YEAR = 252;
  var NU = 3;             // Student-t degrees of freedom
  var XMAX = 6;           // sigma at the edge of the plot
  var TAIL = 2;           // where "the tail" starts, for the lime
  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- the sample -------------------------------------------------------
     A fixed-seed LCG rather than Math.random: the hero must not be a different
     shape on every reload. */
  var seed = 20260729;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }
  var spare = 0, hasSpare = false;
  function gauss() {
    if (hasSpare) { hasSpare = false; return spare; }
    var u = rnd() || 1e-12, v = rnd();
    var r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v); hasSpare = true;
    return r * Math.cos(2 * Math.PI * v);
  }
  // t_nu = z / sqrt(chi2_nu / nu), then divided by sqrt(nu/(nu-2)) so the sample
  // has unit variance and sits on the same scale as the normal drawn over it.
  var TSCALE = 1 / Math.sqrt(NU / (NU - 2));
  var data = new Float64Array(N);
  (function build() {
    var i, j, c, z;
    for (i = 0; i < N; i++) {
      c = 0;
      for (j = 0; j < NU; j++) { z = gauss(); c += z * z; }
      data[i] = (gauss() / Math.sqrt(c / NU)) * TSCALE;
    }
  })();

  // Sorted absolute values, so the count beyond a threshold is a binary search
  // rather than a scan of 25,000 numbers on every pointermove.
  var absSorted = new Float64Array(N);
  (function () {
    var i;
    for (i = 0; i < N; i++) { absSorted[i] = data[i] < 0 ? -data[i] : data[i]; }
    Array.prototype.sort.call(absSorted, function (a, b) { return a - b; });
  })();
  function countBeyond(t) {
    var lo = 0, hi = N, mid;
    while (lo < hi) {
      mid = (lo + hi) >> 1;
      if (absSorted[mid] < t) { lo = mid + 1; } else { hi = mid; }
    }
    return N - lo;
  }

  /* ---- the normal -------------------------------------------------------- */
  function pdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    var t = 1 / (1 + p * x);
    return s * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t *
                Math.exp(-x * x));
  }
  // P(X > t). The erf approximation carries ~1.5e-7 absolute error, which is
  // larger than the answer itself past about 4 sigma — exactly the range this
  // chart is about. Beyond 3.2 use the Mills-ratio asymptotic instead, which is
  // accurate to better than 0.1% there and improves as t grows.
  function qNorm(t) {
    if (t < 3.2) { return 0.5 * (1 - erf(t / Math.SQRT2)); }
    var it2 = 1 / (t * t);
    return pdf(t) / t * (1 - it2 * (1 - 3 * it2 * (1 - 5 * it2)));
  }

  /* ---- histogram --------------------------------------------------------- */
  var bins = 0, binW = 0, obsF = null, normF = null;
  function histogram(nbins) {
    bins = nbins;
    binW = (2 * XMAX) / bins;
    obsF = new Float64Array(bins);
    normF = new Float64Array(bins);
    var i, k;
    for (i = 0; i < N; i++) {
      k = Math.floor((data[i] + XMAX) / binW);
      if (k >= 0 && k < bins) { obsF[k] += 1; }
    }
    for (i = 0; i < bins; i++) {
      obsF[i] = obsF[i] / N;                              // observed frequency
      normF[i] = pdf(-XMAX + (i + 0.5) * binW) * binW;    // what the normal predicts
    }
  }

  /* ---- geometry ---------------------------------------------------------- */
  // Log10 frequency bounds. Top is "1 day in 10"; bottom is just past the
  // resolution of a 25,000-day sample, so a bin holding a single day still has
  // somewhere to be drawn.
  var LOGMAX = -1, LOGMIN = -4.7;
  var W = 0, H = 0, padT = 20, padB = 46, padL = 88, padR = 10;
  // entrance defaults to 1 — the finished state. Only the boot code sets it to
  // 0, and only once it knows the animation can actually run.
  var thresh = 3.5, entrance = 1;

  function layout() {
    refreshTokens();
    var cw = canvas.clientWidth || canvas.offsetWidth || 0;
    var ch = canvas.clientHeight || canvas.offsetHeight || 0;
    if (cw < 2 || ch < 2) { W = 0; return false; }
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = cw; H = ch;
    padB = cw < 560 ? 38 : 46;
    padL = cw < 560 ? 46 : 88;
    // Bars wide enough to read as bars rather than as a fringe.
    var n = Math.round((cw - padL - padR) / 15);
    if (n < 36) { n = 36; } else if (n > 96) { n = 96; }
    if (n % 2) { n += 1; }        // even, so no bin straddles zero
    histogram(n);
    return true;
  }

  function xPix(sig) { return padL + (sig + XMAX) / (2 * XMAX) * (W - padL - padR); }
  // freq -> pixel, on a log scale. Anything at or below the floor lands on the
  // baseline and draws as nothing, which is the honest rendering of "this never
  // happened in the sample".
  function yPix(freq) {
    var base = H - padB;
    if (!(freq > 0)) { return base; }
    var l = Math.log(freq) / Math.LN10;
    if (l <= LOGMIN) { return base; }
    if (l > LOGMAX) { l = LOGMAX; }
    var frac = (l - LOGMIN) / (LOGMAX - LOGMIN);
    return base - frac * (H - padT - padB) * entrance;
  }

  /* ---- drawing ----------------------------------------------------------- */
  function draw() {
    if (!W) { return; }
    ctx.clearRect(0, 0, W, H);
    var base = H - padB;
    var small = W < 560;
    var i, x0, x1, yO, yN, xc;

    ctx.font = '11px "Space Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // Decade gridlines, labelled as odds rather than as exponents. "1 day in
    // 1,000" is a thing a reader can picture; 10^-3 is not.
    var labels = small
      ? { '-1': '1/10', '-2': '1/100', '-3': '1/1k', '-4': '1/10k' }
      : { '-1': '1 in 10', '-2': '1 in 100', '-3': '1 in 1,000', '-4': '1 in 10,000' };
    ctx.textAlign = 'right';
    for (i = -1; i >= -4; i--) {
      var gy = yPix(Math.pow(10, i));
      ctx.strokeStyle = RULE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, gy + 0.5); ctx.lineTo(W - padR, gy + 0.5); ctx.stroke();
      ctx.fillStyle = MUTE;
      ctx.fillText(labels[String(i)], padL - 10, gy);
    }

    // Bars: ink up to what the normal predicts, lime for the excess in the tails.
    for (i = 0; i < bins; i++) {
      if (obsF[i] <= 0) { continue; }
      xc = -XMAX + (i + 0.5) * binW;
      x0 = xPix(-XMAX + i * binW) + 0.5;
      x1 = xPix(-XMAX + (i + 1) * binW) - 0.5;
      if (x1 <= x0) { x1 = x0 + 0.6; }
      yO = yPix(obsF[i]);
      yN = yPix(normF[i]);

      if (obsF[i] <= normF[i] || Math.abs(xc) < TAIL) {
        ctx.fillStyle = INK;
        ctx.fillRect(x0, yO, x1 - x0, base - yO);
      } else {
        ctx.fillStyle = INK;
        ctx.fillRect(x0, yN, x1 - x0, base - yN);
        ctx.fillStyle = LIME;
        ctx.fillRect(x0, yO, x1 - x0, yN - yO);
      }
    }

    // What the normal predicts, as a line over the top. On this axis it is a
    // downward parabola, and watching it dive under the bars IS the argument.
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath();
    var started = false;
    for (i = 0; i <= 300; i++) {
      var s = -XMAX + (i / 300) * 2 * XMAX;
      var f = pdf(s) * binW;
      if (Math.log(f) / Math.LN10 <= LOGMIN) { started = false; continue; }
      var px = xPix(s), py = yPix(f);
      if (!started) { ctx.moveTo(px, py); started = true; } else { ctx.lineTo(px, py); }
    }
    ctx.stroke();

    // Baseline + sigma ticks.
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(padL, base + 0.5); ctx.lineTo(W - padR, base + 0.5); ctx.stroke();

    ctx.fillStyle = MUTE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (i = -6; i <= 6; i += 2) {
      var tx = xPix(i);
      ctx.strokeStyle = RULE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, base); ctx.lineTo(tx, base + 5); ctx.stroke();
      ctx.fillText(i === 0 ? '0' : (i > 0 ? '+' : '−') + Math.abs(i) + 'σ', tx, base + 10);
    }
    ctx.textAlign = 'left';
    ctx.fillText(small ? 'day size' : 'size of the day’s move', padL, base + 26);

    // The threshold, both sides.
    if (entrance > 0.98) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      var sides = [-thresh, thresh];
      for (i = 0; i < 2; i++) {
        var px2 = xPix(sides[i]);
        ctx.beginPath(); ctx.moveTo(px2, padT); ctx.lineTo(px2, base); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.font = '700 11px "Space Mono", ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('±' + thresh.toFixed(1) + 'σ', xPix(thresh) + 6, padT);
    }
  }

  /* ---- readout ----------------------------------------------------------- */
  function commas(v) {
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function updateReadout() {
    if (!readout) { return; }
    var q = qNorm(thresh);
    var expected = 2 * q * N;
    var actual = countBeyond(thresh);
    var normalPart;
    if (expected >= 1.5) {
      normalPart = commas(Math.round(expected)) + ' days';
    } else {
      var years = 1 / (2 * q) / PER_YEAR;
      normalPart = 'one day in ' +
        (years >= 1000 ? commas(Math.round(years / 100) * 100)
                       : commas(Math.round(years))) + ' years';
    }
    readout.innerHTML =
      'Beyond ±' + thresh.toFixed(1) + 'σ &nbsp;·&nbsp; the normal predicts <b>' +
      normalPart + '</b> &nbsp;·&nbsp; this sample has <b class="kk-tails__hit">' +
      commas(actual) + ' days</b>';
  }

  /* ---- interaction ------------------------------------------------------- */
  function setFromEvent(ev) {
    if (!W) { return; }
    var r = canvas.getBoundingClientRect();
    var sig = ((ev.clientX - r.left - padL) / (r.width - padL - padR)) * 2 * XMAX - XMAX;
    sig = Math.abs(sig);
    if (sig < 1.5) { sig = 1.5; } else if (sig > 5.5) { sig = 5.5; }
    thresh = Math.round(sig * 10) / 10;
    draw(); updateReadout();
  }
  canvas.addEventListener('pointermove', setFromEvent);
  canvas.addEventListener('pointerdown', setFromEvent);

  /* ---- boot -------------------------------------------------------------- */
  var resizeTimer = 0;
  function onResize() {
    if (resizeTimer) { window.clearTimeout(resizeTimer); }
    resizeTimer = window.setTimeout(function () {
      resizeTimer = 0;
      if (layout()) { draw(); updateReadout(); }
    }, 140);
  }
  window.addEventListener('resize', onResize);
  // Catches the canvas being laid out by something other than the window — a
  // flex parent settling, a webfont landing, the mobile URL bar collapsing.
  if (window.ResizeObserver) { new ResizeObserver(onResize).observe(canvas); }

  if (layout()) {
    updateReadout();

    // The entrance is a decoration and is never allowed to gate correctness.
    // `entrance` stays 1 unless we are certain the animation can actually run:
    // requestAnimationFrame is throttled to a standstill in a background tab, so
    // a page opened in one would otherwise sit at whatever fraction the first
    // frame reached — measured at 9% of full height, i.e. a flat chart.
    var animate = !reduced && !document.hidden;
    if (!animate) {
      draw();
    } else {
      entrance = 0;
      var t0 = 0;
      window.requestAnimationFrame(function step(now) {
        if (!t0) { t0 = now; }
        var p = (now - t0) / 620;
        if (p > 1) { p = 1; }
        entrance = 1 - Math.pow(1 - p, 3);
        draw();
        if (p < 1) { window.requestAnimationFrame(step); }
      });
      // Belt and braces: if those frames never arrive (tab hidden mid-load, a
      // throttling policy we did not anticipate), snap to the finished state.
      window.setTimeout(function () {
        if (entrance < 1) { entrance = 1; draw(); }
      }, 1400);
    }
  }
})();
