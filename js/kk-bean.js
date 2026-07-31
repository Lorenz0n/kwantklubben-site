/* kk-bean.js — the hero board
 *
 * Each bead is ONE TRADING DAY. It opens at zero and takes twenty-five small
 * moves through the session, so where it comes to rest is that day's close.
 * Stack enough days and the pile is Binomial(25, p) — the distribution a day is
 * drawn from. Months are just days/30, a calendar convenience for reading the
 * horizon; nothing in the model knows about them.
 *
 * There are no pegs, because nothing bounces off anything. The bead's horizontal
 * position IS its running sum, and the column it opens in is the zero of the very
 * axis it lands on. A peg field drew a mechanism that does not exist, and read as
 * a pinball machine — which asserts that the shape comes from the apparatus. It
 * comes from adding up twenty-five independent moves.
 *
 *   solid bars        days that actually closed there. A fill means "this happened".
 *   lime bars         the same days, out beyond 2 sigma of a FAIR coin
 *   ink outline       the exact distribution at the odds currently set: where the
 *                     pile WOULD sit if every day so far had run at these odds.
 *                     An open stroke, drawn LAST and over the bars — a reference
 *                     you cannot see where the data is is not a reference. It
 *                     jumps the instant the slider moves; the bars migrate toward
 *                     it only as new days land.
 *
 * Mark type carries the layer (fill = measured, outline = implied) and lightness
 * carries the region (ink = body, lime = tail). Hue is load-bearing on nothing, so
 * the chart survives greyscale, print and all three dichromacies: ink-900 against
 * lime-800 is 3.65:1 normally and never below 3.36:1 simulated. The previous build
 * had this exactly backwards — hue carried the layer and ALPHA carried the
 * comparison, at 1.10-1.38:1, under bars that were drawn on top of it.
 *
 * The x axis is in standard deviations of a FAIR coin and does not move when you
 * move P(up move). A ruler that slides with the thing it measures cannot show you
 * that the thing moved. "Beyond 2 sigma" therefore means "further than a market
 * with no edge in it would have gone" — which is why the tail figure climbing as
 * you raise the odds is the whole point rather than a rounding artefact.
 *
 * R = 25, and that is load-bearing. Bar edges sit at half-integers and sigma is
 * sqrt(R)/2, so a bar edge lands exactly on 2 sigma only when R is an odd perfect
 * square. At 25: sigma 2.5, mean 12.5, so -2s = 7.5 and +2s = 17.5, the shared
 * edges of bins 7|8 and 17|18. Whole bars AND an exact split — and the walk opens
 * at binX(12.5), which is exactly the 0 sigma tick.
 *
 * Settled bars are history and are never recomputed. Moving the odds changes the
 * odds for moves that have not happened yet; it does not reach back and re-roll
 * days that already closed.
 *
 * ES5-only IIFE to match js/kk-nav.js — no build step here.
 */
(function () {
  'use strict';

  var UID = 0;

  function mount(root) {
      UID += 1;
      var uid = 'kk-bean-' + UID;

      /* ---------- brand ---------- */
      var css = window.getComputedStyle(document.documentElement);
      function cvar(name, fb) {
        var v = '';
        try { v = css.getPropertyValue(name); } catch (e) { v = ''; }
        if (v) { v = v.replace(/^\s+|\s+$/g, ''); }
        return v || fb;
      }
      var INK = cvar('--ink-900', '#0C1016');
      var LIME = cvar('--lime-600', '#A6CE12');
      var PAPER = cvar('--paper-300', '#DCD4BD');
      // The page behind the canvas, which is transparent everywhere nothing is
      // drawn. Needed as a real colour because the implied outline is cased in it
      // to survive crossing an ink bar — a knockout has to be painted, and
      // "transparent" would knock out the bar as well.
      var PAPER50 = cvar('--paper-50', '#FBF9F2');
      var INK4 = cvar('--ink-400', '#5A6677');
      // lime-700 was used here and is nowhere near the 4.5:1 small text owes
      // (it is tuned for LARGE text at 3:1). lime-800 is the same hue at 4.95:1,
      // so the tail figures stay lime-coded rather than dropping to grey.
      var LIME8 = cvar('--lime-800', '#5E7507');
      var FONT = '11px "Space Mono", ui-monospace, monospace';
      var FONT_M = '12px "Space Mono", ui-monospace, monospace';   // metric line
      var FONT_B = '700 12px "Space Mono", ui-monospace, monospace';
      var FONT_A  = '12px "Space Mono", ui-monospace, monospace';        // axis
      var FONT_AB = '700 12px "Space Mono", ui-monospace, monospace';    // tails
      function setMetric(px) {
        FONT_M = px + 'px "Space Mono", ui-monospace, monospace';
        FONT_B = '700 ' + px + 'px "Space Mono", ui-monospace, monospace';
      }

      /* ---------- model constants ---------- */
      // 25, not 21. Bar edges sit at half-integers and sigma = sqrt(R)/2, so a
      // bar edge coincides with 2 sigma only when R is an odd perfect square.
      // At 25: sigma = 2.5, mean = 12.5, so -2s = 7.5 and +2s = 17.5 -- exactly
      // the edges of bins 7|8 and 17|18. Whole bars, exact split, no widths
      // fudged. At 21 you can have one or the other, not both.
      var R = 25;
      // Months are a reading convenience laid over the day count, not part of the
      // model -- nothing in the walk knows what a month is. 30 is calendar days;
      // a trading month is nearer 21. This is here to give the day count a sense
      // of horizon, not to settle anything.
      var DAYS_PER_MONTH = 30;
      // The DRAWN window: bins 3..22, which is exactly -4 sigma to +4 sigma.
      // The full support is 0..25, i.e. +/-5 sigma, and the outermost sigma at
      // each end carried no visible mass at any odds this slider reaches -- it
      // was a flat rule running out to a tick, and it made the board about a
      // quarter wider than the picture in it.
      //
      // 4 sigma is the right amount to cut because it lands on bin EDGES, the
      // same property that makes R=25 work at 2 sigma: 12.5 +/- 4*2.5 = 2.5 and
      // 22.5, and a bin spans j+/-0.5. So the window is whole bars and its ends
      // fall exactly on the -4 and +4 ticks, with no bar sliced to fit.
      //
      // Everything OUTSIDE the window is still simulated, still counted in N,
      // still in the tail percentages and still in the moments -- it is not
      // drawn, that is all. At p=0.5 that is 1.9e-5 of the pile; at the 0.600
      // end of the slider the far right bins reach ~4e-4, so roughly one day in
      // 2,300 lands beyond the frame. The printed figures stay complete.
      var J0 = 3, J1 = 22;
      var JN = J1 - J0 + 1;
      // Vertical geometry is derived, not fixed. H comes from the measured width
      // in layout(); BASE, BOARD_BOTTOM and MAXH are recomputed from it in
      // render(). At the 440px desktop height they resolve to exactly the
      // constants this sketch was tuned at -- 366 / 236 / 126 -- so the desktop
      // drawing is unchanged and only narrow viewports actually move.
      var H = 440;
      var H_MIN = 330, H_MAX = 440;
      var FOOTER = 74;         /* sigma ticks, labels and tail brackets below BASE */
      var BOARD_BOTTOM = 236;  /* y where the 25th step lands */
      var BASE = 366;          /* bin floor */
      var MAXH = 126;          /* tallest bar */
      // The plot is scaled against at least this many days. Without a floor the
      // first day to land is the tallest bar on an empty board, so it is drawn
      // at full plot height and the scale then collapses under it over the next
      // second. It also lets the implied outline -- which depends on p alone and
      // needs no data -- be drawn from the very first frame instead of leaving
      // the hero blank until enough days have landed. Above 60 days this is
      // inert and the drawing is unchanged.
      var N_REF = 60;
      var u;

      /* ---------- per-instance state ---------- */
      var p = 0.5;
      var N = 0;
      var counts = [], hits = [];
      for (u = 0; u <= R; u++) { counts.push(0); hits.push(-9); }
      var maxC = 1;
      var beads = [];
      var pmf = [];
      var seed = 12345;
      function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

      var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      var reduce = !!(reduceMq && reduceMq.matches);

      /* ---------- dom ---------- */
      var canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      // Width is CSS-driven, never a pixel value written from JS: at a container
      // narrower than the old 300px floor the JS-set width overflowed the page.
      // 100% cannot, and layout() only sizes the backing store to match.
      canvas.style.width = '100%';
      canvas.style.height = H + 'px';
      // Not crosshair. Crosshair means "pick a coordinate", and there is no
      // coordinate to pick here — a click anywhere on the board does the one
      // same thing, release a burst of days. That is a pointer.
      canvas.style.cursor = 'pointer';
      // pan-y, not manipulation: a drag that starts on the board must still be
      // able to scroll the page vertically on a phone.
      canvas.style.touchAction = 'pan-y';
      canvas.setAttribute('role', 'img');
      // Focusable so releasing days is not mouse-only. The global :focus-visible
      // ring in styles.css supplies the affordance; nothing is drawn for it here.
      canvas.tabIndex = 0;
      root.appendChild(canvas);
      var ctx = canvas.getContext ? canvas.getContext('2d') : null;
      if (!ctx) { root.removeChild(canvas); return; }

      var bar = document.createElement('div');
      bar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;' +
        'font:' + FONT + ';color:' + INK4 + ';';
      // Real <label for>, not a floating <span> beside an aria-label that says
      // something else: the visible text then IS the accessible name, which is
      // what voice control needs to address the control (WCAG 2.5.3).
      var lab = document.createElement('label');
      lab.textContent = 'P(up move)';
      lab.htmlFor = uid + '-p';
      var slider = document.createElement('input');
      slider.type = 'range';
      slider.id = uid + '-p';
      slider.min = '400'; slider.max = '600'; slider.step = '5'; slider.value = '500';
      // Without this the raw 400-600 is announced while the screen reads 0.400-0.600.
      slider.setAttribute('aria-valuetext', '0.500');
      slider.style.cssText = 'flex:1 1 150px;max-width:260px;accent-color:' + LIME + ';cursor:pointer;';
      var val = document.createElement('span');
      val.textContent = '0.500';
      val.style.cssText = 'color:' + INK + ';min-width:42px;';
      var rLab = document.createElement('label');
      rLab.textContent = 'days/sec';
      rLab.htmlFor = uid + '-rate';
      var rate = document.createElement('input');
      rate.type = 'range';
      rate.id = uid + '-rate';
      rate.min = '1'; rate.max = '60'; rate.step = '1'; rate.value = '12';
      rate.setAttribute('aria-valuetext', '12 days per second');
      rate.style.cssText = 'flex:1 1 120px;max-width:190px;accent-color:' + LIME + ';cursor:pointer;';
      var rVal = document.createElement('span');
      rVal.textContent = '12';
      rVal.style.cssText = 'color:' + INK + ';min-width:34px;';

      var clr = document.createElement('button');
      clr.type = 'button';
      clr.textContent = 'clear';
      // 5px padding, not 3px: at 3px the target measured ~21px tall, under the
      // 24px minimum of WCAG 2.5.8.
      clr.style.cssText = 'font:' + FONT + ';color:' + INK4 + ';background:transparent;border:1px solid ' + PAPER +
        ';border-radius:0;padding:5px 10px;cursor:pointer;';
      bar.appendChild(lab); bar.appendChild(slider); bar.appendChild(val);
      bar.appendChild(rLab); bar.appendChild(rate); bar.appendChild(rVal);
      bar.appendChild(clr);
      root.appendChild(bar);

      // Every number this sketch produces exists only as canvas pixels. This is
      // the same readout in text, announced when a control changes -- not per
      // frame, which would be a stream of noise.
      var sr = document.createElement('p');
      sr.setAttribute('role', 'status');
      sr.setAttribute('aria-live', 'polite');
      sr.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
        'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';
      root.appendChild(sr);

      /* ---------- geometry ---------- */
      var W = 640, DPR = 1;
      // stepY, not rowGap: there are no rows of anything any more. It is the
      // vertical distance one trading day advances the walk.
      var dx = 20, cx = 320, yTop = 24, stepY = 7;
      var small = false;
      function layout() {
        // dpr is re-read every layout rather than cached at mount. Browser zoom
        // and a drag to a different-density display both change it, and the old
        // guard compared the fresh backing store against the stale value, so the
        // canvas stayed soft for the rest of the session.
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.floor(canvas.clientWidth || root.clientWidth || 640);
        if (w < 200) { w = 200; }
        // TWO heights, not a continuous ramp. h = round(w * 0.78) meant every
        // pixel of width changed the height, so the board resized under a
        // dragged window, under a scrollbar appearing, and under a webfont
        // landing -- the whole drawing breathed. One step, at the same 560px the
        // rest of this layout already breaks at: a phone gets the short board,
        // everything else gets the 440 this was tuned at, and between those two
        // nothing moves at all.
        var h = w < 560 ? H_MIN : H_MAX;
        if (w !== W || h !== H || dpr !== DPR) {
          W = w; H = h; DPR = dpr;
          canvas.style.height = H + 'px';
          canvas.width = Math.round(W * DPR);
          canvas.height = Math.round(H * DPR);
        }
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        // Divided by the DRAWN bin count, not the full support. Keeping the old
        // denominator would have spent the width on bins that are no longer
        // drawn and left the board the same size with a gap at each end; using
        // JN, the 44px cap is what actually narrows it -- on a wide hero the
        // chart is now 20*44 = 880px instead of 1,105, while a phone still
        // spends its whole width and gets fatter bars for it.
        dx = Math.max(9, Math.min(44, (W - 40) / JN));
        cx = Math.round(W / 2);
        small = W < 560;
      }
      function binX(fu) { return cx + (2 * fu - R) * dx * 0.5; }
      // The sigma ruler is anchored to the FAIR COIN, not to the current p.
      // Standardising it to the live distribution made it slide right by exactly
      // as much as the pile did, so the pile could never appear to move against
      // it — and because the axis moves continuously (n*p) while the pile's mode
      // moves in integer bin jumps (floor((n+1)p)), raising p actually walked the
      // pile LEFT into negative sigma between jumps. A ruler must not move when
      // you change the thing being measured.
      var BASE_MEAN = R * 0.5;
      var BASE_SD = Math.sqrt(R * 0.25);
      // +/-2 sigma in bin coordinates. Both are constants, because the ruler is
      // anchored to the fair coin. At R=25, sigma is exactly 2.5 bins and the
      // mean exactly 12.5, so these land on 7.5 and 17.5 -- the shared edges of
      // bins 7|8 and 17|18. Every bar is therefore whole and the colour change
      // still falls on exactly 2 sigma, with no width fudged to make it fit.
      var SIG_LO = BASE_MEAN - 2 * BASE_SD;
      var SIG_HI = BASE_MEAN + 2 * BASE_SD;
      function xOfSigma(s) { return binX(BASE_MEAN + s * BASE_SD); }
      // Bin j spans j-0.5 to j+0.5, and at R=25 the sigma lines land on 7.5 and
      // 17.5, so every bin is WHOLLY in the body or WHOLLY in a tail — nothing
      // straddles. That is what lets a bar be coloured by its index, and is why
      // the three clipped regions the old build cut the board into are gone: they
      // existed only to cut a bar that, at this R, never needs cutting.
      function isTail(j) { return (j + 0.5) <= SIG_LO || (j - 0.5) >= SIG_HI; }
      // observed mass in each 2-sigma tail, reported separately
      // Share of the pile beyond each 2-sigma line. A bin straddling the line
      // contributes the fraction of its width that lies past it -- the same
      // apportionment the drawing uses when it cuts that bar, so the printed
      // number and the coloured area always agree. (It assumes a bin's count is
      // spread evenly across its width, which is what a rectangle bar asserts.)
      function frac(lo, hi) {
        var f = hi - lo;
        if (f < 0) { return 0; }
        if (f > 1) { return 1; }
        return f;
      }
      function tailSplit() {
        var i, lo = 0, hi = 0;
        for (i = 0; i <= R; i++) {
          lo += counts[i] * frac(i - 0.5, Math.min(i + 0.5, SIG_LO));
          hi += counts[i] * frac(Math.max(i - 0.5, SIG_HI), i + 0.5);
        }
        return {
          lo: N ? 100 * lo / N : 0,
          hi: N ? 100 * hi / N : 0,
          loEnd: SIG_LO, hiStart: SIG_HI
        };
      }

      /* ---------- histogram ----------
         The bars are settled outcomes and are never recomputed. Changing
         the odds changes them for moves that have not happened yet; it does
         not reach back and re-roll days that already closed.

         pmf is the exact Binomial(R, p) at the CURRENT setting. Scaled to N it
         is the implied distribution: where the pile would sit if every day so
         far had run at these odds. It jumps the moment the slider moves, while
         the bars migrate toward it only as new days land. */
      function buildPmf() {
        pmf = [];
        var c = 1, i;
        for (i = 0; i <= R; i++) {
          pmf.push(c * Math.pow(p, i) * Math.pow(1 - p, R - i));
          c = c * (R - i) / (i + 1);
        }
      }
      function land(u, now) {
        counts[u]++;
        if (counts[u] > maxC) { maxC = counts[u]; }
        N++;
        hits[u] = now;
      }
      function freshPath() {
        var uni = [], k;
        for (k = 0; k < R; k++) { uni.push(rnd()); }
        return uni;
      }
      // clear / reduced-motion: resolve a whole run at once, every day against
      // the p in force right now
      function instantDrops(n, now) {
        var i, k, uni, u;
        for (i = 0; i < n; i++) {
          uni = freshPath(); u = 0;
          for (k = 0; k < R; k++) { if (uni[k] < p) { u++; } }
          land(u, now);
        }
      }

      /* ---------- beads ----------
         Each day is decided at the moment the walk reaches it, using the p in
         force then. A month still in progress re-rolls the days it has not
         reached yet; a month that has landed is history. */
      // How many walks draw their path at once. Four is enough to say "each of
      // these is a walk" and few enough that they never stack into a wedge.
      var TRAIL_MAX = 4;
      var tracing = 0;
      function spawn(delay) {
        var b = { uni: freshPath(), dirs: [], row: 0, t: -delay, phase: 0,
                  drop: 0, u: 0, y: 0, x: cx, trace: false };
        b.dirs.push(b.uni[0] < p ? 1 : 0);
        // Top up to TRAIL_MAX rather than tracing every Nth bead. A traced walk
        // only frees its slot when it lands, so the traced ones spread themselves
        // down the board instead of bunching at the top, and the number of them
        // adapts on its own when the release rate changes. Every Nth would draw
        // four stubs at the opening on a fast board and nothing at all on a slow
        // one.
        if (tracing < TRAIL_MAX) { b.trace = true; tracing++; }
        beads.push(b);
      }
      function sumDirs(b, row) {
        var c = 0, k, m = Math.min(row, b.dirs.length);
        for (k = 0; k < m; k++) { c += b.dirs[k]; }
        return c;
      }
      function xAtRow(b, row) { return cx + (2 * sumDirs(b, row) - row) * dx * 0.5; }

      /* ---------- text helpers ---------- */
      function fmtInt(n) {
        var s = String(n), o = '', c = 0, i;
        for (i = s.length - 1; i >= 0; i--) {
          o = s.charAt(i) + o; c++;
          if (c % 3 === 0 && i > 0) { o = ',' + o; }
        }
        return o;
      }
      // Sample moments of the realised pile, in units of the fixed fair-coin
      // sigma -- the same units the axis uses -- with the exact moments of
      // Binomial(R, p) beside them in brackets. Standardising to z makes sd read
      // 1.00 for a fair coin, so any departure is legible at a glance.
      function moments() {
        if (!N) { return null; }
        var i, z, w, m1 = 0, m2 = 0, m3 = 0;
        for (i = 0; i <= R; i++) {
          if (!counts[i]) { continue; }
          m1 += counts[i] * (i - BASE_MEAN) / BASE_SD;
        }
        m1 = m1 / N;
        for (i = 0; i <= R; i++) {
          if (!counts[i]) { continue; }
          z = (i - BASE_MEAN) / BASE_SD - m1; w = counts[i];
          m2 += w * z * z; m3 += w * z * z * z;
        }
        m2 /= N; m3 /= N;
        return {
          mean: m1,
          vari: m2,
          skew: m2 > 1e-12 ? m3 / Math.pow(m2, 1.5) : 0
        };
      }
      function exact() {
        var q = 1 - p, npq = R * p * q;
        return {
          mean: (R * p - BASE_MEAN) / BASE_SD,
          vari: 4 * p * q,          // npq / (n/4); the n cancels
          skew: npq > 0 ? (1 - 2 * p) / Math.sqrt(npq) : 0
        };
      }
      function sgn(v, d) {
        return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
      }

      function groupsFor(ts, d) {
        var mo = moments(), ex = exact();
        // Every metric keeps its slot from the first frame. The exact column is a
        // function of P(up move) alone, so it is meaningful with no data at all;
        // the measured column shows an en dash until a ball actually lands.
        // Printing 0.00 for a statistic nobody has measured yet reads as "we
        // measured zero", which is a different claim from "we have no data".
        var nil = '–';
        // Shorter keys on a phone. The size/separator ladder below can only
        // trade type size against gap width; trimming the labels is what
        // actually buys a legible size at 360px instead of bottoming out at 9px.
        var kDay = small ? 'd ' : 'days ';
        var kMon = small ? 'mo ' : 'months ';
        // P(up MOVE), not P(up day). It is the odds on each of the R moves inside
        // the session; the odds that the DAY closes up is a different number the
        // walk produces rather than takes.
        var kP = small ? 'p ' : 'P(up move) ';
        var kT = 'Tails ';
        // One bead is one DAY -- it takes R moves through the session and closes
        // once -- so N counts days directly, and months are days/30. Days lead:
        // it is the unit a bead actually is, and the one the pile is a
        // distribution OF. The month figure is a horizon, nothing more.
        var g = [
          [{ t: kDay, c: INK4 }, { t: fmtInt(N), c: INK, b: 1 }],
          [{ t: d + kMon, c: INK4 },
           { t: fmtInt(Math.floor(N / DAYS_PER_MONTH)), c: INK, b: 1 }],
          [{ t: d + kP, c: INK4 }, { t: p.toFixed(3), c: INK, b: 1 }],
          [{ t: d + kT, c: INK4 },
           { t: N ? (ts.lo + ts.hi).toFixed(2) + '%' : nil, c: N ? LIME8 : INK4, b: 1 }],
          [{ t: d + 'E[z] ', c: INK4 },
           { t: mo ? sgn(mo.mean, 2) : nil, c: INK, b: 1 },
           { t: ' (' + sgn(ex.mean, 2) + ')', c: INK4 }],
          [{ t: d + 'Var[z] ', c: INK4 },
           { t: mo ? mo.vari.toFixed(2) : nil, c: INK, b: 1 },
           { t: ' (' + ex.vari.toFixed(2) + ')', c: INK4 }],
          [{ t: d + 'Skew[z] ', c: INK4 },
           { t: mo ? sgn(mo.skew, 2) : nil, c: INK, b: 1 },
           { t: ' (' + sgn(ex.skew, 2) + ')', c: INK4 }]
        ];
        return g;
      }
      function groupW(g) {
        var w = 0, i;
        for (i = 0; i < g.length; i++) {
          ctx.font = g[i].b ? FONT_B : FONT_M;
          w += ctx.measureText(g[i].t).width;
        }
        return w;
      }
      function totalW(gs) {
        var w = 0, i;
        for (i = 0; i < gs.length; i++) { w += groupW(gs[i]); }
        return w;
      }
      function wrapGroups(gs, maxw) {
        var lines = [[]], w = 0, i, gw;
        for (i = 0; i < gs.length; i++) {
          gw = groupW(gs[i]);
          if (w + gw > maxw && lines[lines.length - 1].length) {
            lines.push([]); w = 0;
          }
          lines[lines.length - 1] = lines[lines.length - 1].concat(gs[i]);
          w += gw;
        }
        // a wrapped line must not open with the separator it inherited from the
        // group that got pushed onto it
        var sepRe = /^[\s·]+/;
        for (i = 1; i < lines.length; i++) {
          if (lines[i].length) {
            lines[i] = lines[i].slice();
            lines[i][0] = { t: lines[i][0].t.replace(sepRe, ''),
                            c: lines[i][0].c, b: lines[i][0].b };
          }
        }
        return lines;
      }
      function drawSegs(segs, x, y) {
        var i;
        for (i = 0; i < segs.length; i++) {
          ctx.font = segs[i].b ? FONT_B : FONT_M;
          ctx.fillStyle = segs[i].c;
          ctx.fillText(segs[i].t, x, y);
          x += ctx.measureText(segs[i].t).width;
        }
      }

      /* ---------- render ---------- */
      function render(now) {
        layout();
        ctx.clearRect(0, 0, W, H);
        ctx.font = FONT_M;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.lineCap = 'butt';

        var pad = 14;
        var ts = tailSplit();
        var maxw = W - 2 * pad;
        // Keep the metrics on ONE row: step the size down, then tighten the
        // separator, until they fit. Only if even the smallest combination
        // overflows -- a phone -- is wrapping allowed, so it degrades instead of
        // breaking. The numbers change width as the pile grows, so this has to be
        // measured every frame rather than picked once. The floor is 10px, not 9:
        // at 9px the line was both unreadable AND still wrapping to three rows,
        // paying the cost twice. On a narrow board the shorter keys and two
        // honest lines beat one illegible one.
        var combos = small
          ? [[11, '  ·  '], [11, ' · '], [10, ' · ']]
          : [[12, '   ·   '], [12, '  ·  '], [11, '  ·  '], [11, ' · '], [10, ' · ']];
        var gs = null, ci;
        for (ci = 0; ci < combos.length; ci++) {
          setMetric(combos[ci][0]);
          gs = groupsFor(ts, combos[ci][1]);
          if (totalW(gs) <= maxw) { break; }
        }
        var lines = wrapGroups(gs, maxw);
        var i;
        for (i = 0; i < lines.length; i++) { drawSegs(lines[i], pad, 13 + i * 16); }

        // RESERVED, not measured. Deriving the board's top from the number of
        // rows the readout happened to wrap to meant the entire drawing -- BASE,
        // MAXH, stepY, every bar and every bead -- jumped 16px the instant a
        // number grew a digit and pushed the metrics onto another row. The board
        // moved because a counter ticked over. The reserve is the most rows the
        // readout can need at this width, so it grows into space already set
        // aside for it and the geometry below is constant.
        var METRIC_ROWS = small ? 3 : (W < 900 ? 2 : 1);
        // Where the READOUT ends -- not where the walks start. The plot is sized
        // against this rather than against the spawn line, so widening the head
        // gap below cannot quietly steal height from the histogram.
        var headEnd = 28 + (METRIC_ROWS - 1) * 16;
        // Derived from the measured height so a short board stays in proportion
        // instead of keeping desktop constants on a phone. At H=440 these come
        // out to exactly 366 / 126 / 236 -- the values this was tuned at.
        BASE = H - FOOTER;
        MAXH = Math.round((BASE - headEnd) * 0.373);
        BOARD_BOTTOM = BASE - MAXH - 4;
        // Air between the readout and the line the walks open on. Without it the
        // first beads appear immediately under the metrics and the two read as
        // one block of marks rather than a caption above a drawing.
        //
        // It comes out of the WALK region, which is mostly empty and can afford
        // it, and not out of the plot, which cannot -- that is the whole reason
        // MAXH is measured from headEnd above. Less on a phone, where three rows
        // of readout have already taken the space this would come from.
        yTop = headEnd + (small ? 12 : 20);
        stepY = (BOARD_BOTTOM - yTop) / R;
        var walkEnd = yTop + R * stepY;

        /* Two things have been drawn in this space and both are gone now.

           A hopper — two strokes forming a funnel — was removed earlier because
           the beads do not come out of it.

           A triangle of 325 pegs was removed here, for the same reason one layer
           down: nothing ever collided with one. Every outcome is drawn from the
           seeded LCG before the bead moves, and no code path ever read a peg's
           position. They were 325 arc fills a frame asserting that the shape on
           the floor is produced by the apparatus. It is produced by adding up
           twenty-five independent days, which is a fact about the arithmetic and
           not about the machine.

           A full-height rule at cx replaced them for one revision, marking that
           the walk opens at zero -- binX(12.5) IS cx, so the opening column is
           exactly the 0 sigma tick. It is gone: a vertical line rising from the
           origin of a chart reads as a Y AXIS, and this chart has no y axis to
           offer. It was answering a question nobody asked while implying a scale
           that does not exist. The opening is still legible without it, from the
           point the walks fan out from and from the 0 tick directly below it. */

        // Scale against at least N_REF days. On an empty board the tallest
        // thing in the plot was the single day that had just landed, so it was
        // drawn at full height and the scale then collapsed under it; and the
        // implied outline, which needs no data at all, was suppressed entirely
        // until enough had landed to give it a height. Both were the same missing
        // floor. Past N_REF this term drops out and nothing changes.
        var nEff = N > N_REF ? N : N_REF;
        var pmfMaxN = 0, q;
        for (q = 0; q <= R; q++) { if (pmf[q] * nEff > pmfMaxN) { pmfMaxN = pmf[q] * nEff; } }
        var denom = Math.max(1, maxC, pmfMaxN);
        var sc = MAXH / denom;

        // Bars butt up against each other: no gap, and the edges are ROUNDED so
        // adjacent bars share an integer x. A bar was dx-2 wide centred on
        // binX(j), which left a ~2px paper gap; at zero gap on fractional
        // coordinates the shared edge antialiases into a pale seam instead, which
        // is a gap you did not ask for and cannot control. Rounding both edges and
        // taking the width as the difference makes bin j end exactly where bin j+1
        // begins. The only adjacency this creates is ink against lime-800 at the
        // sigma line, which is 3.65:1 -- the one place the palette was chosen to
        // survive touching.
        function barEdge(j) {
          var x0 = Math.round(binX(j) - dx / 2);
          return { x0: x0, w: Math.round(binX(j) + dx / 2) - x0 };
        }

        /* MEASURED — what actually landed. Solid fill, FULL opacity, coloured by
           bin index. Every bin is wholly body or wholly tail (isTail), which is
           why the old build's three clipped bands are gone: they existed to cut a
           bar at the sigma line, and at R=25 no bar ever needs cutting.

           Alpha is 1.0 now, not 0.82/0.92. The alphas were there so the reference
           layer underneath could show through — but it never did, because a fill
           at 0.15 over paper is 1.38:1, and the bars were painted on top of it
           anyway. Paying for a transparency nobody could see cost the bars 2:1 of
           their own contrast. */
        function paintBars() {
          var j, hh, tp, col, e;
          for (j = J0; j <= J1; j++) {
            if (counts[j] <= 0) { continue; }
            col = isTail(j) ? LIME8 : INK;
            hh = Math.max(0.8, counts[j] * sc);
            tp = BASE - hh;
            e = barEdge(j);
            ctx.fillStyle = col;
            ctx.fillRect(e.x0, tp, e.w, hh);
            if (now - hits[j] < 260) {
              ctx.strokeStyle = col;
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(e.x0, tp - 1);
              ctx.lineTo(e.x0 + e.w, tp - 1);
              ctx.stroke();
            }
          }
        }

        /* IMPLIED — the exact Binomial(R, p) at the current setting, scaled to N.
           One open staircase in a single colour, stroked LAST, so it crosses the
           bars instead of hiding under them. This is the whole of the old
           "implied and actual look the same" bug: band() painted the reference
           first and the bars second, so the reference was occluded in exactly the
           places where a comparison was possible.

           An OUTLINE rather than a fill is what separates the layers. Mark type
           is a categorical channel — it survives greyscale, print and every
           dichromacy — where the old build used alpha, which is the weakest
           channel there is, for the most important distinction on the chart.

           Stroked twice: a 3.4px paper casing, then a 1.6px ink core. The casing
           is legibility insurance, not a semantic channel. Without it the line is
           ink-on-ink (1:1) wherever it crosses a body bar. ink-400 was the obvious
           alternative to casing and is unusable: 1.12:1 against lime-800, i.e.
           invisible over exactly the bars the tails are about.

           The casing is CLIPPED TO THE BARS, which is not a refinement — an
           unclipped one is a bug. paper-50 is opaque, and the canvas is
           transparent over .kk-gridpaper, so stroking it across the full width
           punches a 3.4px band of blank paper through the grid ruling the hero
           sits on, following the curve out to where pmf is ~0 and the line lies
           along the axis. Inside a bar it knocks out ink, which is the whole job;
           outside one it knocks out the page. */
        // The staircase itself. Built twice rather than once and kept, because
        // clipping needs its own beginPath() and that discards whatever path is
        // being assembled -- which silently strokes the clip rectangles instead
        // of the curve.
        function impliedPath() {
          var j, gy;
          ctx.beginPath();
          for (j = J0; j <= J1; j++) {
            gy = BASE - pmf[j] * nEff * sc;
            if (j === J0) { ctx.moveTo(binX(j) - dx / 2, gy); }
            else { ctx.lineTo(binX(j) - dx / 2, gy); }
            ctx.lineTo(binX(j) + dx / 2, gy);
          }
        }
        function paintImplied() {
          var j, hh, e;
          ctx.lineJoin = 'miter';
          ctx.save();
          // An empty path clips to nothing, so on an empty board the casing pass
          // simply does not paint -- which is correct, as there is nothing there
          // for the line to be illegible against.
          ctx.beginPath();
          for (j = J0; j <= J1; j++) {
            if (counts[j] <= 0) { continue; }
            hh = Math.max(0.8, counts[j] * sc);
            e = barEdge(j);
            ctx.rect(e.x0, BASE - hh, e.w, hh);
          }
          ctx.clip();
          impliedPath();
          ctx.strokeStyle = PAPER50;
          ctx.lineWidth = 3.4;
          ctx.stroke();
          ctx.restore();
          impliedPath();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        paintBars();
        paintImplied();

        /* axis */
        // The window's own edges, which ARE -4 and +4 sigma exactly: binX(2.5)
        // and binX(22.5). The rule therefore starts and ends on a tick instead
        // of running a sigma past the last one at each end.
        var xWL = binX(J0) - dx / 2, xWR = binX(J1) + dx / 2;
        ctx.strokeStyle = INK4; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xWL, BASE + 0.5);
        ctx.lineTo(xWR, BASE + 0.5);
        ctx.stroke();

        /* axis in standard deviations */
        // Pinned, not inherited: the metric line above auto-shrinks to stay on
        // one row, and the axis must not shrink with it.
        ctx.font = FONT_A;
        ctx.textAlign = 'center';
        var sg, sgx;
        for (sg = -4; sg <= 4; sg++) {
          sgx = xOfSigma(sg);
          // The half-pixel slack is because +/-4 sigma lands ON the window edge
          // rather than inside it, and a strict compare would drop both end
          // ticks -- the two the new width was chosen to end on.
          if (sgx < xWL - 0.5 || sgx > xWR + 0.5) { continue; }
          ctx.strokeStyle = INK4; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sgx, BASE + 1); ctx.lineTo(sgx, BASE + 6);
          ctx.stroke();
          ctx.fillStyle = sg === 0 ? INK : INK4;
          ctx.fillText(sg === 0 ? '0' : (sg > 0 ? '+' : '−') + Math.abs(sg) + 'σ',
                       sgx, BASE + 18);
        }

        /* the size of each tail, bracketed where the tail actually is */
        // ty, not by: the bead loop below declares its own `by`, and var is
        // function-scoped, so the two were the same binding.
        var ty = BASE + 30;
        ctx.strokeStyle = LIME8; ctx.lineWidth = 1.4;
        ctx.fillStyle = LIME8;
        // The label has to fit inside the bracket it annotates. The left bracket
        // is 8 bins wide, which is ~98px on a 360px board -- less than the full
        // phrase needs, so the narrow board gets the initial instead.
        ctx.font = small ? '700 11px "Space Mono", ui-monospace, monospace' : FONT_AB;
        var lEnd = binX(ts.loEnd), rStart = binX(ts.hiStart);
        var lStart = xWL, rEnd = xWR;
        if (lEnd > lStart + 6) {
          ctx.beginPath();
          ctx.moveTo(lStart, ty - 4); ctx.lineTo(lStart, ty);
          ctx.lineTo(lEnd, ty); ctx.lineTo(lEnd, ty - 4);
          ctx.stroke();
          ctx.textAlign = 'left';
          ctx.fillText((small ? 'L ' : 'left tail ') + ts.lo.toFixed(2) + '%',
                       lStart + 2, ty + 12);
        }
        if (rStart < rEnd - 6) {
          ctx.beginPath();
          ctx.moveTo(rStart, ty - 4); ctx.lineTo(rStart, ty);
          ctx.lineTo(rEnd, ty); ctx.lineTo(rEnd, ty - 4);
          ctx.stroke();
          ctx.textAlign = 'right';
          ctx.fillText((small ? 'R ' : 'right tail ') + ts.hi.toFixed(2) + '%',
                       rEnd - 2, ty + 12);
        }


        ctx.textAlign = 'left';

        /* the walks */
        // One place that answers "where is this bead now", so the trail and the
        // dot cannot disagree about it.
        //
        // The -2.4*sin(pi*t) hop that used to be in the y term is gone. It lifted
        // the bead between one row and the next, which is a BOUNCE: the arc of
        // something rebounding off a surface. There is no surface. A day moves the
        // walk one step across and one step down, and the path between them is a
        // straight line.
        var b;
        function beadXY(bd) {
          var tt, x0, x1, tgt;
          if (bd.phase === 0) {
            tt = bd.t < 0 ? 0 : bd.t;
            x0 = xAtRow(bd, bd.row);
            x1 = bd.row < R ? xAtRow(bd, bd.row + 1) : x0;
            return { x: x0 + (x1 - x0) * tt, y: yTop + (bd.row + bd.t) * stepY };
          }
          tgt = Math.max(walkEnd + 2, BASE - Math.max(0.8, counts[bd.u] * sc) - 3);
          return { x: binX(bd.u), y: walkEnd + (tgt - walkEnd) * bd.drop * bd.drop };
        }

        // Trails on a handful of beads, never on all of them. Two hundred
        // polylines at low alpha do not read as an ensemble — they composite into
        // a solid grey wedge sitting over the histogram, and cost ~5,000 lineTo a
        // frame, which is more than the peg field that was just deleted. A few
        // full-length paths say "each of these is a 25-day walk"; the loose dots
        // say "and there are a great many of them".
        var pos, kk, lim;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        for (i = 0; i < beads.length; i++) {
          b = beads[i];
          if (!b.trace) { continue; }
          // Fade as it settles: a finished path left hanging over the pile is a
          // walk whose walker stopped moving a second ago.
          ctx.globalAlpha = 0.32 * (b.phase === 0 ? 1 : 1 - b.drop);
          if (ctx.globalAlpha <= 0.015) { continue; }
          pos = beadXY(b);
          ctx.beginPath();
          // xAtRow(b, 0) is cx exactly — the walk opens on the zero rule.
          ctx.moveTo(cx, yTop);
          lim = Math.min(b.row, R);
          for (kk = 1; kk <= lim; kk++) {
            ctx.lineTo(xAtRow(b, kk), yTop + kk * stepY);
          }
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }

        /* beads */
        // Still one fill per bead -- overlapping beads compound at 0.9 and a
        // single batched path would not -- but the alpha is set once rather than
        // written twice per bead.
        ctx.fillStyle = INK;
        ctx.globalAlpha = 0.9;
        for (i = 0; i < beads.length; i++) {
          pos = beadXY(beads[i]);
          if (pos.y < 15) { continue; }
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 2.8, 0, 6.28318);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      /* ---------- loop ---------- */
      var raf = 0, last = 0, drip = 0, frames = 0;
      function step(ts) {
        if (!root.isConnected) { stop(); return; }
        frames++;
        var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
        last = ts;

        // One bead IS one day, so the slider is beads per second directly: at 1
        // the board opens one new trading day a second.
        var rps = parseInt(rate.value, 10) || 12;
        if (rps < 1) { rps = 1; }
        var gap = 1 / rps;
        drip += dt;
        while (drip > gap) {
          drip -= gap;
          if (beads.length < 220) { spawn(0); }
        }

        var i, b, keep = [];
        for (i = 0; i < beads.length; i++) {
          b = beads[i];
          if (b.phase === 0) {
            b.t += dt * 7.5;
            while (b.t >= 1 && b.row < R) {
              b.t -= 1; b.row++;
              // roll the next day as the walk arrives at it, at today's odds
              if (b.row < R) { b.dirs.push(b.uni[b.row] < p ? 1 : 0); }
            }
            if (b.row >= R) { b.phase = 1; b.drop = 0; b.u = sumDirs(b, R); b.t = 0; }
          } else {
            b.drop += dt / 0.30;
            if (b.drop >= 1) {
              land(b.u, ts);
              if (b.trace) { tracing--; }
              continue;
            }
          }
          keep.push(b);
        }
        beads = keep;

        render(ts);
        // Refresh the description about once a second. aria-label is only read
        // when something navigates to the canvas, so keeping it current costs
        // nothing and stops it going stale as the pile grows -- unlike the live
        // region, which stays on user actions only.
        if (frames % 60 === 0) { canvas.setAttribute('aria-label', describe()); }
        raf = window.requestAnimationFrame(step);
      }
      var ro = null, rt = 0;
      function stop() {
        if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
        if (rt) { window.clearTimeout(rt); rt = 0; }
        if (srT) { window.clearTimeout(srT); srT = 0; }
        window.removeEventListener('resize', onResize);
        if (ro) { ro.disconnect(); ro = null; }
        if (reduceMq) {
          if (reduceMq.removeEventListener) { reduceMq.removeEventListener('change', onReduceChange); }
          else if (reduceMq.removeListener) { reduceMq.removeListener(onReduceChange); }
        }
      }
      function repaint() {
        render(reduce ? 0 : (window.performance ? window.performance.now() : 0));
      }
      // Debounced, and observed on the canvas as well as the window: a flex
      // parent settling or a webfont landing resizes this without a window
      // resize event ever firing.
      function onResize() {
        if (!root.isConnected) { stop(); return; }
        if (rt) { window.clearTimeout(rt); }
        rt = window.setTimeout(function () {
          rt = 0;
          if (!root.isConnected) { stop(); return; }
          repaint();
        }, 140);
      }

      /* ---------- the same readout, in words ---------- */
      // Everything this sketch computes is canvas pixels and nothing else, so
      // without this none of it exists for a screen reader.
      function describe() {
        var t = tailSplit(), mo = moments(), ex = exact();
        // "R small moves", never "R days": the running total further down this
        // string is reported as "N days", and a listener (or a regex) meeting two
        // different "<number> days" in one description has no way to tell which
        // is the count.
        var s = 'A distribution built out of random walks. Each bead is one ' +
          'trading day: it opens at zero and takes ' + R + ' small moves through ' +
          'the session, and where it comes to rest is that day\'s close. ' +
          'The days stack into a histogram, and an outline over it is the exact ' +
          'distribution implied by the odds currently set. The axis is in standard ' +
          'deviations of a fair coin and does not move when the odds do, so bars ' +
          'beyond 2 sigma are days that went further than a market with no edge ' +
          'in it would have gone. ' +
          'Press Enter to release more days. ' +
          'P of an up move, ' + p.toFixed(3) + '. ' +
          fmtInt(N) + ' days, ' +
          fmtInt(Math.floor(N / DAYS_PER_MONTH)) + ' months. ';
        if (mo) {
          s += 'Beyond 2 sigma, ' + (t.lo + t.hi).toFixed(2) + '% of the pile: ' +
            t.lo.toFixed(2) + '% left, ' + t.hi.toFixed(2) + '% right. ' +
            'Measured mean ' + sgn(mo.mean, 2) + ', variance ' + mo.vari.toFixed(2) +
            ', skew ' + sgn(mo.skew, 2) + '. ';
        } else {
          s += 'Nothing has landed yet. ';
        }
        return s + 'Exact at these odds: mean ' + sgn(ex.mean, 2) + ', variance ' +
          ex.vari.toFixed(2) + ', skew ' + sgn(ex.skew, 2) + '.';
      }
      var srT = 0;
      // On control changes only. Per frame this would be a stream no screen
      // reader user could follow.
      function announce() {
        canvas.setAttribute('aria-label', describe());
        if (srT) { window.clearTimeout(srT); }
        srT = window.setTimeout(function () {
          srT = 0;
          if (root.isConnected) { sr.textContent = describe(); }
        }, 600);
      }

      /* ---------- interaction ---------- */
      rate.addEventListener('input', function () {
        rVal.textContent = rate.value;
        rate.setAttribute('aria-valuetext', rate.value + ' days per second');
      });
      slider.addEventListener('input', function () {
        p = parseInt(slider.value, 10) / 1000;
        val.textContent = p.toFixed(3);
        slider.setAttribute('aria-valuetext', p.toFixed(3));
        buildPmf();              // the target moves at once...
        if (reduce) { render(0); }   // ...the bars only as new days land
        announce();
      });
      function dropBurst() {
        if (reduce) {
          // -9999, not 0: these stamps are compared against the render clock,
          // which is a literal 0 under reduced motion, so a 0 stamp left the
          // "just landed" cap lit on every bar it touched, permanently.
          instantDrops(160, -9999);
          render(0);
          announce();
          return;
        }
        var i;
        // the same cap every other spawn path respects
        for (i = 0; i < 12; i++) {
          if (beads.length < 220) { spawn(i * 0.11); }
        }
      }
      canvas.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        dropBurst();
      });
      // Releasing days was pointer-only on an element nothing could focus.
      canvas.addEventListener('keydown', function (ev) {
        var k = ev.key;
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
          ev.preventDefault();
          dropBurst();
        }
      });
      clr.addEventListener('click', function () {
        var i;
        // tracing counts traced beads that are still in flight. Dropping the
        // beads without zeroing it leaks the trail budget: after two clears no
        // walk would ever draw its path again.
        N = 0; maxC = 1; beads = []; tracing = 0;
        for (i = 0; i <= R; i++) { counts[i] = 0; hits[i] = -9; }
        seed = 12345;
        if (reduce) { instantDrops(1400, -9999); render(0); }
        announce();
      });

      // Sampled once at mount was not enough: turning the OS setting on left the
      // animation running for the rest of the session.
      function onReduceChange() {
        var now = !!(reduceMq && reduceMq.matches);
        if (now === reduce) { return; }
        reduce = now;
        rate.disabled = reduce;
        rLab.style.opacity = reduce ? '0.45' : '';
        if (reduce) {
          if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
          beads = []; tracing = 0;
          if (!N) { instantDrops(2400, -9999); }
          render(0);
        } else {
          last = 0;
          if (!raf) { raf = window.requestAnimationFrame(step); }
        }
        announce();
      }
      if (reduceMq) {
        if (reduceMq.addEventListener) { reduceMq.addEventListener('change', onReduceChange); }
        else if (reduceMq.addListener) { reduceMq.addListener(onReduceChange); }
      }

      /* ---------- start: a correct frame first, then motion ---------- */
      layout();
      ctx.font = FONT;
      buildPmf();
      // Under reduced motion the flow rate has nothing to act on -- there is no
      // clock -- so it is disabled rather than left looking live and doing
      // nothing.
      rate.disabled = reduce;
      if (reduce) { rLab.style.opacity = '0.45'; }
      // Starts empty: watching the pile build from nothing is the point, and the
      // implied outline is drawn from the first frame, so an empty board still
      // has something to read -- and reads unambiguously as the MODEL, because it
      // is an outline with no fill under it. The old build drew a filled grey
      // silhouette here, which on an empty board was the only thing on screen and
      // therefore looked exactly like data. Reduced motion gets a filled board,
      // since there is no animation there to do the filling.
      if (reduce) { instantDrops(2400, -9999); }
      render(0);
      announce();
      if (!reduce) {
        raf = window.requestAnimationFrame(step);
        // rAF is throttled to a standstill in a background tab. Judge that on
        // the frame count, not on whether anything has landed: at one day per
        // second the first ball has genuinely not landed yet at this point.
        window.setTimeout(function () {
          if (!root.isConnected || reduce || frames >= 5) { return; }
          instantDrops(400, -9999);
          render(0);
          announce();
        }, 2200);
      }
      window.addEventListener('resize', onResize);
      if (window.ResizeObserver) {
        ro = new window.ResizeObserver(onResize);
        ro.observe(canvas);
      }
  }

  var host = document.getElementById('kk-bean');
  // Loaded on every page; only the landing page has the board.
  if (host) { mount(host); }
  // Exposed so _probe-bean.html can mount instances at chosen widths and assert
  // against the shipped file rather than a copy of it.
  window.KK_BEAN = { mount: mount };
})();