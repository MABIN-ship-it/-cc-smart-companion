import { useRef, useEffect, useMemo } from 'react';

/**
 * 全息舞台背景 — 2D Canvas 动画
 * 包含：透视地面网格 + 底座光晕 + 浮动粒子 + 代码雨 + 暗角
 *
 * 尺寸策略：CSS 为唯一真源（width:100%;height:100%），
 * JS 通过 ResizeObserver 读取 canvas 实际渲染尺寸来同步。
 */
export default function StageBackground({ width, height }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const resizeTimerRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]<>/?@#$%^&*';
    let gridSpacing, particles, codeCols, time = 0, animId;

    const initParams = (W, H) => {
      gridSpacing = 80;
      const particleCount = Math.round(W * 0.06);
      const codeColCount = Math.round(W / 55);

      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * W, y: Math.random() * H,
          size: Math.random() * 3 + 1,
          speedX: (Math.random() - 0.5) * 0.5,
          speedY: (Math.random() - 0.5) * 0.3 - 0.2,
          opacity: Math.random() * 0.5 + 0.2,
          hue: Math.random() * 40 + 190,
        });
      }

      codeCols = [];
      for (let i = 0; i < codeColCount; i++) {
        codeCols.push({
          x: (i / codeColCount) * W + Math.random() * 20,
          y: Math.random() * -H,
          speed: Math.random() * 3 + 2,
          length: Math.floor(Math.random() * 10 + 8),
        });
      }
    };

    const setCanvasSize = (W, H) => {
      canvas.width = W;
      canvas.height = H;
    };

    const draw = () => {
      animId = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      time += 0.016;

      ctx.fillStyle = '#080820';
      ctx.fillRect(0, 0, W, H);

      // === 透视网格 ===
      const vpX = W * 0.5, vpY = H * 0.62;
      ctx.save();
      ctx.translate(vpX, vpY);
      ctx.scale(1, 0.35);

      for (let i = -14; i <= 14; i++) {
        const alpha = 0.35 - Math.abs(i) * 0.02;
        if (alpha <= 0) continue;
        ctx.strokeStyle = `rgba(0,200,255,${alpha})`;
        ctx.lineWidth = i === 0 ? 3 : 1.3;
        ctx.shadowColor = 'rgba(0,180,255,0.6)';
        ctx.shadowBlur = i === 0 ? 12 : 4;
        ctx.beginPath();
        ctx.moveTo(i * gridSpacing, -500);
        ctx.lineTo(i * gridSpacing * 3.5, 700);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (let j = -6; j <= 12; j++) {
        const alpha = 0.22 - (j + 6) * 0.012;
        if (alpha <= 0) continue;
        ctx.strokeStyle = `rgba(0,220,255,${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(-2500, j * gridSpacing);
        ctx.lineTo(2500, j * gridSpacing);
        ctx.stroke();
      }
      ctx.restore();

      // === 底座光晕 ===
      const podiumX = vpX, podiumY = vpY + 40;
      const glowAlpha = 0.4 + Math.sin(time * 2) * 0.15;

      ctx.save();
      ctx.translate(podiumX, podiumY + 30);
      ctx.scale(1, 0.28);
      ctx.beginPath();
      ctx.arc(0, 0, 160, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,140,240,0.15)';
      ctx.fill();
      ctx.strokeStyle = `rgba(0,220,255,${0.5 + glowAlpha * 0.5})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(0,200,255,0.8)';
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // === 粒子 ===
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < -50) p.x = W + 50;
        if (p.x > W + 50) p.x = -50;
        if (p.y < -200) p.y = H + 200;
        if (p.y > H + 200) p.y = -200;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${p.opacity + 0.15})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 75%, ${p.opacity * 0.18})`;
        ctx.fill();
      }

      // === 代码雨 ===
      ctx.font = '15px "JetBrains Mono", "Consolas", monospace';
      for (const col of codeCols) {
        col.y += col.speed;
        if (col.y > H + 200) { col.y = Math.random() * -200; }
        for (let i = 0; i < col.length; i++) {
          const cy = col.y - i * 22;
          if (cy < -50 || cy > H + 50) continue;
          const alpha = (1 - (i / col.length) * 0.8) * 0.6;
          const char = chars[Math.floor(Math.random() * chars.length)];
          ctx.fillStyle = `rgba(120,230,255,${alpha})`;
          ctx.fillText(char, col.x, cy);
        }
      }
    };

    // 初始尺寸：CSS width:100% 控制布局，这里只设置渲染缓冲区
    const W = window.innerWidth || 1920;
    const H = window.innerHeight || 1080;

    canvas.width = W;
    canvas.height = H;
    initParams(W, H);
    draw();
    stateRef.current = { animId };

    // ─── Resize：CSS 为真源 ───
    // ResizeObserver 直接监听 canvas，读取其实际渲染尺寸
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: cw, height: ch } = entry.contentRect;
        if (cw > 0 && ch > 0) {
          clearTimeout(resizeTimerRef.current);
          resizeTimerRef.current = setTimeout(() => {
            if (cw === canvas.width && ch === canvas.height) return;
            setCanvasSize(cw, ch);
            initParams(cw, ch);
          }, 250);
          break;
        }
      }
    });
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, [width, height]);

  const canvasStyle = useMemo(() => ({
    position: 'fixed', top: 0, left: 0,
    width: '100%', height: '100%',
    zIndex: 0, pointerEvents: 'none',
  }), []);

  return (
    <canvas
      ref={canvasRef}
      style={canvasStyle}
    />
  );
}
