/* kk-bean.js — the hero board
 *
 * A Galton board, one peg row per trading day. Each ball falls through 25 rows
 * of fair-ish coin flips and lands in the bin its path adds up to, so the pile
 * that builds is Binomial(25, p) — the distribution of a month made out of
 * twenty-five random days.
 *
 *   grey silhouette   the exact distribution for the odds currently set: where
 *                     the pile WOULD sit if every day so far had run at these
 *                     odds. It jumps the instant the slider moves.
 *   ink bars          days that actually landed, inside 2 sigma
 *   lime bars         the tails, beyond 2 sigma
 *
 * The x axis is in standard deviations of a FAIR coin and does not move when
 * you move P(up day). A ruler that slides with the thing it measures cannot
 * show you that the thing moved.
 *
 * R = 25, and that is load-bearing. Bar edges sit at half-integers and sigma is
 * sqrt(R)/2, so a bar edge lands exactly on 2 sigma only when R is an odd
 * perfect square. At 25: sigma 2.5, mean 12.5, so -2s = 7.5 and +2s = 17.5, the
 * shared edges of bins 7|8 and 17|18. Whole bars AND an exact split.
 *
 * Settled bars are history and are never recomputed. Moving P(up day) changes
 * the odds for bounces that have not happened yet; it does not reach back and
 * re-roll days that already landed.
 *
 * ES5-only IIFE to match js/kk-motion.js and js/kk-nav.js — no build step here.
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
      var INK4 = cvar('--ink-400', '#5A6677');
      var LIME7 = cvar('--lime-700', '#7E9C0A');   // lime dark enough to read as text
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
      // Vertical geometry is derived, not fixed. H comes from the measured width
      // in layout(); BASE, BOARD_BOTTOM and MAXH are recomputed from it in
      // render(). At the 440px desktop height they resolve to exactly the
      // constants this sketch was tuned at -- 366 / 236 / 126 -- so the desktop
      // drawing is unchanged and only narrow viewports actually move.
      var H = 440;
      var H_MIN = 330, H_MAX = 440;
      var FOOTER = 74;         /* sigma ticks, labels and tail brackets below BASE */
      var BOARD_BOTTOM = 236;  /* y where the last bounce ends */
      var BASE = 366;          /* bin floor */
      var MAXH = 126;          /* tallest bar */
      // The plot is scaled against at least this many days. Without a floor the
      // first ball to land is the tallest bar on an empty board, so it is drawn
      // at full plot height and the scale then collapses under it over the next
      // second. It also lets the implied silhouette -- which depends on p alone
      // and needs no data -- be drawn from the very first frame instead of
      // leaving the hero blank until enough balls have landed. Above 60 days
      // this is inert and the drawing is bit-for-bit what it was before.
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
      canvas.style.cursor = 'crosshair';
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
      lab.textContent = 'P(up day)';
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
      rLab.textContent = 'daily returns/sec';
      rLab.htmlFor = uid + '-rate';
      var rate = document.createElement('input');
      rate.type = 'range';
      rate.id = uid + '-rate';
      rate.min = '1'; rate.max = '60'; rate.step = '1'; rate.value = '12';
      rate.setAttribute('aria-valuetext', '12 per second');
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
      var dx = 20, cx = 320, yTop = 24, rowGap = 7;
      var small = false;
      function layout() {
        // dpr is re-read every layout rather than cached at mount. Browser zoom
        // and a drag to a different-density display both change it, and the old
        // guard compared the fresh backing store against the stale value, so the
        // canvas stayed soft for the rest of the session.
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.floor(canvas.clientWidth || root.clientWidth || 640);
        if (w < 200) { w = 200; }
        // Anything at or above 564px keeps the full 440 this was tuned at, so a
        // desktop hero is untouched; below that the board gets shorter instead
        // of keeping a 440px slab on a 360px phone.
        var h = Math.round(w * 0.78);
        if (h < H_MIN) { h = H_MIN; } else if (h > H_MAX) { h = H_MAX; }
        if (w !== W || h !== H || dpr !== DPR) {
          W = w; H = h; DPR = dpr;
          canvas.style.height = H + 'px';
          canvas.width = Math.round(W * DPR);
          canvas.height = Math.round(H * DPR);
        }
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        dx = Math.max(9, Math.min(44, (W - 40) / (R + 1)));
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
         P(up day) changes the odds for bounces that have not happened yet; it
         does not reach back and re-roll days that already landed.

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
      // clear / reduced-motion: resolve a whole run at once, every bounce
      // against the p in force right now
      function instantDrops(n, now) {
        var i, k, uni, u;
        for (i = 0; i < n; i++) {
          uni = freshPath(); u = 0;
          for (k = 0; k < R; k++) { if (uni[k] < p) { u++; } }
          land(u, now);
        }
      }

      /* ---------- beads ----------
         Each bounce is decided at the moment the ball reaches that peg, using
         the p in force then. A ball already falling re-routes for the rows
         below it; a ball that has landed is history. */
      function spawn(delay) {
        var b = { uni: freshPath(), dirs: [], row: 0, t: -delay, phase: 0,
                  drop: 0, u: 0, y: 0, x: cx };
        b.dirs.push(b.uni[0] < p ? 1 : 0);
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
        // function of P(up day) alone, so it is meaningful with no data at all;
        // the measured column shows an en dash until a ball actually lands.
        // Printing 0.00 for a statistic nobody has measured yet reads as "we
        // measured zero", which is a different claim from "we have no data".
        var nil = '–';
        // Shorter keys on a phone. The size/separator ladder below can only
        // trade type size against gap width; trimming the labels is what
        // actually buys a legible size at 360px instead of bottoming out at 9px.
        var kDay = small ? 'd ' : 'days ';
        var kMon = small ? 'mo ' : 'months ';
        var kP = small ? 'p ' : 'P(up day) ';
        var kT = small ? 'tails ' : 'tails>2σ ';
        var g = [
          [{ t: kDay, c: INK4 }, { t: fmtInt(N), c: INK, b: 1 }],
          [{ t: d + kMon, c: INK4 }, { t: fmtInt(Math.floor(N / R)), c: INK, b: 1 }],
          [{ t: d + kP, c: INK4 }, { t: p.toFixed(3), c: INK, b: 1 }],
          [{ t: d + kT, c: INK4 },
           { t: N ? (ts.lo + ts.hi).toFixed(2) + '%' : nil, c: N ? LIME7 : INK4, b: 1 }],
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

        yTop = 28 + (lines.length - 1) * 16;
        // Derived from the measured height so a short board stays in proportion
        // instead of keeping desktop constants on a phone. At H=440 these come
        // out to exactly 366 / 126 / 236 -- the values this was tuned at.
        BASE = H - FOOTER;
        MAXH = Math.round((BASE - yTop) * 0.373);
        BOARD_BOTTOM = BASE - MAXH - 4;
        rowGap = (BOARD_BOTTOM - yTop) / R;
        var pegEnd = yTop + R * rowGap;

        /* hopper */
        ctx.strokeStyle = PAPER; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 11, yTop - 13); ctx.lineTo(cx - 2.5, yTop - 4);
        ctx.moveTo(cx + 11, yTop - 13); ctx.lineTo(cx + 2.5, yTop - 4);
        ctx.stroke();

        /* pegs */
        var k, j, px, py;
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = INK4;
        for (k = 0; k < R; k++) {
          py = yTop + k * rowGap;
          for (j = 0; j <= k; j++) {
            px = cx + (2 * j - k) * dx * 0.5;
            ctx.beginPath();
            ctx.arc(px, py, 1.3, 0, 6.28318);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;

        // Scale against at least N_REF days. On an empty board the tallest thing
        // in the plot was the single ball that had just landed, so it was drawn
        // at full height and the scale then collapsed under it; and the implied
        // silhouette, which needs no data at all, was suppressed entirely until
        // enough had landed to give it a height. Both were the same missing
        // floor. Past N_REF this term drops out and nothing changes.
        var nEff = N > N_REF ? N : N_REF;
        var pmfMaxN = 0, q;
        for (q = 0; q <= R; q++) { if (pmf[q] * nEff > pmfMaxN) { pmfMaxN = pmf[q] * nEff; } }
        var denom = Math.max(1, maxC, pmfMaxN);
        var sc = MAXH / denom;
        var bw = Math.max(2, dx - 2);
        var h, top;

        /* Everything in the plot is drawn three times, clipped into the three
           regions the two sigma lines cut the board into. That is what makes the
           colour change land on exactly the same x as the tick and the bracket:
           a bar straddling a line comes out part tail, part body, cut at the
           line rather than at its own edge. */
        function paintImplied(colour, alpha) {
          var j;
          ctx.beginPath();
          ctx.moveTo(binX(0) - dx / 2, BASE);
          for (j = 0; j <= R; j++) {
            var gy = BASE - pmf[j] * nEff * sc;
            ctx.lineTo(binX(j) - dx / 2, gy);
            ctx.lineTo(binX(j) + dx / 2, gy);
          }
          ctx.lineTo(binX(R) + dx / 2, BASE);
          ctx.closePath();
          ctx.fillStyle = colour;
          ctx.globalAlpha = alpha;
          ctx.fill();
          ctx.globalAlpha = alpha * 2.6;
          ctx.strokeStyle = colour;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        function paintBars(colour, alpha) {
          var j, hh, tp;
          for (j = 0; j <= R; j++) {
            if (counts[j] <= 0) { continue; }
            hh = Math.max(0.8, counts[j] * sc);
            tp = BASE - hh;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = colour;
            ctx.fillRect(binX(j) - bw / 2, tp, bw, hh);
            ctx.globalAlpha = 1;
            if (now - hits[j] < 260) {
              ctx.strokeStyle = colour;
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(binX(j) - bw / 2, tp - 1);
              ctx.lineTo(binX(j) + bw / 2, tp - 1);
              ctx.stroke();
            }
          }
        }
        function band(x0, x1, colour, impliedAlpha, barAlpha) {
          if (x1 - x0 < 0.4) { return; }
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, 0, x1 - x0, BASE + 1);
          ctx.clip();
          paintImplied(colour, impliedAlpha);
          paintBars(colour, barAlpha);
          ctx.restore();
        }

        var xLo = binX(SIG_LO), xHi = binX(SIG_HI);
        var xL = binX(0) - dx / 2, xR = binX(R) + dx / 2;
        band(xL, xLo, LIME, 0.17, 0.92);      // left tail
        band(xLo, xHi, INK, 0.15, 0.82);      // body
        band(xHi, xR, LIME, 0.17, 0.92);      // right tail

        /* axis */
        ctx.strokeStyle = PAPER; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(binX(0) - dx / 2, BASE + 0.5);
        ctx.lineTo(binX(R) + dx / 2, BASE + 0.5);
        ctx.stroke();

        /* axis in standard deviations */
        // Pinned, not inherited: the metric line above auto-shrinks to stay on
        // one row, and the axis must not shrink with it.
        ctx.font = FONT_A;
        ctx.textAlign = 'center';
        var sg, sgx;
        for (sg = -4; sg <= 4; sg++) {
          sgx = xOfSigma(sg);
          if (sgx < binX(0) - dx || sgx > binX(R) + dx) { continue; }
          ctx.strokeStyle = PAPER; ctx.lineWidth = 1;
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
        ctx.strokeStyle = LIME; ctx.lineWidth = 1.4;
        ctx.fillStyle = LIME7;
        // The label has to fit inside the bracket it annotates. The left bracket
        // is 8 bins wide, which is ~98px on a 360px board -- less than the full
        // phrase needs, so the narrow board gets the initial instead.
        ctx.font = small ? '700 11px "Space Mono", ui-monospace, monospace' : FONT_AB;
        var lEnd = binX(ts.loEnd), rStart = binX(ts.hiStart);
        var lStart = binX(0) - dx / 2, rEnd = binX(R) + dx / 2;
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

        /* beads */
        // Still one fill per bead -- overlapping beads compound at 0.9 and a
        // single batched path would not -- but the alpha is set once rather than
        // written twice per bead.
        ctx.fillStyle = INK;
        ctx.globalAlpha = 0.9;
        for (i = 0; i < beads.length; i++) {
          var b = beads[i];
          var bxp, byp;
          if (b.phase === 0) {
            var tt = b.t < 0 ? 0 : b.t;
            var x0 = xAtRow(b, b.row);
            var x1 = b.row < R ? xAtRow(b, b.row + 1) : x0;
            bxp = x0 + (x1 - x0) * tt;
            byp = yTop + (b.row + b.t) * rowGap - 2.4 * Math.sin(Math.PI * tt);
          } else {
            var tgt = Math.max(pegEnd + 2, BASE - Math.max(0.8, counts[b.u] * sc) - 3);
            bxp = binX(b.u);
            byp = pegEnd + (tgt - pegEnd) * b.drop * b.drop;
          }
          if (byp < 15) { continue; }
          ctx.beginPath();
          ctx.arc(bxp, byp, 2.8, 0, 6.28318);
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

        // One ball IS one daily return, so the slider is balls per second
        // directly: at 1 the machine releases one ball a second.
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
              // decide the next peg as the ball arrives at it, at today's odds
              if (b.row < R) { b.dirs.push(b.uni[b.row] < p ? 1 : 0); }
            }
            if (b.row >= R) { b.phase = 1; b.drop = 0; b.u = sumDirs(b, R); b.t = 0; }
          } else {
            b.drop += dt / 0.30;
            if (b.drop >= 1) {
              land(b.u, ts);
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
        var s = 'Bean machine. Balls fall through ' + R + ' rows of pegs and pile up ' +
          'into a distribution. The axis is in standard deviations of a fair coin, ' +
          'and bars beyond 2 sigma are drawn as tails. ' +
          'Press Enter to release more days. ' +
          'P of an up day, ' + p.toFixed(3) + '. ' +
          fmtInt(N) + ' days, ' + fmtInt(Math.floor(N / R)) + ' months. ';
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
        rate.setAttribute('aria-valuetext', rate.value + ' per second');
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
        N = 0; maxC = 1; beads = [];
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
          beads = [];
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
      // Starts empty: watching the pile build from nothing is the point of the
      // machine, and the implied silhouette is drawn from the first frame now,
      // so an empty board still has something to read. Reduced motion gets a
      // filled board, since there is no animation there to do the filling.
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