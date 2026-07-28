(() => {
  const canvas = document.getElementById('math-field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const points = [];
  const bursts = [];
  const pointer = { x: 0, y: 0, active: false };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = 0;

  const palette = {
    paper: [245, 241, 228],
    lime: [194, 235, 43],
    coral: [255, 90, 60],
    blue: [110, 134, 255],
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    points.length = 0;
    const density = Math.max(70, Math.min(180, Math.round(width / 8)));
    for (let i = 0; i < density; i += 1) {
      points.push({
        x: Math.random() * width,
        y: Math.random() * height,
        seed: Math.random() * Math.PI * 2,
        speed: 0.12 + Math.random() * 0.3,
        size: 0.6 + Math.random() * 1.8,
        color: [palette.lime, palette.paper, palette.blue][i % 3],
      });
    }
    pointer.x = width * 0.74;
    pointer.y = height * 0.48;
  }

  function rgba(color, alpha) {
    return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
  }

  function drawGrid(time) {
    const spacing = Math.max(44, Math.min(84, width / 16));
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(194,235,43,.09)';
    ctx.beginPath();
    for (let x = -spacing; x < width + spacing; x += spacing) {
      ctx.moveTo(x + Math.sin(time * 0.00025 + x * 0.01) * 8, 0);
      ctx.lineTo(x + Math.sin(time * 0.00025 + x * 0.01) * 8, height);
    }
    for (let y = -spacing; y < height + spacing; y += spacing) {
      ctx.moveTo(0, y + Math.cos(time * 0.0002 + y * 0.008) * 8);
      ctx.lineTo(width, y + Math.cos(time * 0.0002 + y * 0.008) * 8);
    }
    ctx.stroke();
  }

  function draw(time) {
    const t = reduceMotion ? 0 : time;
    ctx.fillStyle = 'rgba(12,16,22,.18)';
    ctx.fillRect(0, 0, width, height);
    drawGrid(t);

    const centerX = width * 0.72;
    const centerY = height * 0.5;
    const influence = Math.min(width, height) * 0.35;
    ctx.lineWidth = 1;

    points.forEach((point, index) => {
      const wave = Math.sin(point.seed + t * 0.00045 * point.speed);
      const orbit = point.x + Math.sin(point.seed + t * 0.00018) * 34 + wave * 10;
      const lift = point.y + Math.cos(point.seed * 1.7 + t * 0.00022) * 28;
      const dx = orbit - centerX;
      const dy = lift - centerY;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const pull = Math.max(0, 1 - radius / (influence * 1.7));
      const targetX = pointer.active ? pointer.x : centerX;
      const targetY = pointer.active ? pointer.y : centerY;
      const px = orbit - (orbit - targetX) * pull * 0.06;
      const py = lift - (lift - targetY) * pull * 0.06;
      const alpha = 0.15 + pull * 0.55;

      if (index % 3 === 0) {
        ctx.strokeStyle = rgba(point.color, alpha * 0.5);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + dx * 0.1, py + dy * 0.1);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(point.color, alpha);
      ctx.beginPath();
      ctx.arc(px, py, point.size + pull * 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(194,235,43,.34)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i += 1) {
      const radius = 34 + i * 26 + Math.sin(t * 0.0007 + i) * 5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    bursts.forEach((burst, index) => {
      const age = (t - burst.time) / 900;
      if (age >= 1) {
        bursts.splice(index, 1);
        return;
      }
      ctx.strokeStyle = rgba(burst.color, (1 - age) * 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, age * 180, 0, Math.PI * 2);
      ctx.stroke();
    });

    frame = window.requestAnimationFrame(draw);
  }

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = true;
  });
  canvas.addEventListener('pointerleave', () => { pointer.active = false; });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    bursts.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, time: performance.now(), color: palette.coral });
  });
  window.addEventListener('resize', resize);
  resize();
  ctx.fillStyle = '#0C1016';
  ctx.fillRect(0, 0, width, height);
  frame = window.requestAnimationFrame(draw);
  window.addEventListener('pagehide', () => window.cancelAnimationFrame(frame), { once: true });
})();
