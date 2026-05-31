import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { useApp } from '../store/AppContext';
import { speakText, cancelSpeech } from '../services/speech';

/** 全息舞台背景 — 2D Canvas 绘制 */
function drawStageBackground(ctx, w, h, time) {
  const gridSpacing = 80;
  const particles = [];
  const codeCols = [];
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]<>/?@#$%^&*';

  // --- 首次初始化 ---
  if (!drawStageBackground._init) {
    drawStageBackground._init = true;
    drawStageBackground.particles = [];
    drawStageBackground.codeCols = [];
    for (let i = 0; i < 60; i++) {
      drawStageBackground.particles.push({
        x: Math.random() * w, y: Math.random() * h,
        size: Math.random() * 3 + 1,
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: (Math.random() - 0.5) * 0.3 - 0.2,
        opacity: Math.random() * 0.5 + 0.2,
        hue: Math.random() * 40 + 190,
      });
    }
    for (let i = 0; i < 24; i++) {
      drawStageBackground.codeCols.push({
        x: i * 80 + Math.random() * 20,
        y: Math.random() * -h,
        speed: Math.random() * 3 + 2,
        length: Math.floor(Math.random() * 10 + 8),
      });
    }
  }

  const pts = drawStageBackground.particles;
  const cols = drawStageBackground.codeCols;

  // 清屏
  ctx.fillStyle = '#06060F';
  ctx.fillRect(0, 0, w, h);

  // --- 透视网格 ---
  const vpX = w * 0.5, vpY = h * 0.67;
  ctx.save();
  ctx.translate(vpX, vpY);
  ctx.scale(1, 0.35);

  for (let i = -14; i <= 14; i++) {
    const alpha = 0.18 - Math.abs(i) * 0.012;
    if (alpha <= 0) continue;
    ctx.strokeStyle = `rgba(0,180,255,${alpha})`;
    ctx.lineWidth = i === 0 ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(i * gridSpacing, -500);
    ctx.lineTo(i * gridSpacing * 3.5, 700);
    ctx.stroke();
  }
  for (let j = -6; j <= 12; j++) {
    const alpha = 0.12 - (j + 6) * 0.008;
    if (alpha <= 0) continue;
    ctx.strokeStyle = `rgba(0,200,255,${alpha})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-2500, j * gridSpacing);
    ctx.lineTo(2500, j * gridSpacing);
    ctx.stroke();
  }
  ctx.restore();

  // --- 底座光晕（简洁：仅椭圆光晕） ---
  const podiumX = vpX, podiumY = vpY + 40;
  const glowAlpha = 0.3 + Math.sin(time * 2) * 0.1;

  ctx.save();
  ctx.translate(podiumX, podiumY + 30);
  ctx.scale(1, 0.28);
  ctx.beginPath();
  ctx.arc(0, 0, 160, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,120,220,0.08)';
  ctx.fill();
  ctx.strokeStyle = `rgba(0,200,255,${0.3 + glowAlpha * 0.5})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // --- 2D浮动粒子 ---
  for (const p of pts) {
    p.x += p.speedX;
    p.y += p.speedY;
    if (p.x < -50) p.x = w + 50;
    if (p.x > w + 50) p.x = -50;
    if (p.y < -200) p.y = h + 200;
    if (p.y > h + 200) p.y = -200;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.opacity})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.opacity * 0.12})`;
    ctx.fill();
  }

  // --- 代码雨 ---
  ctx.font = '15px "JetBrains Mono", "Consolas", monospace';
  for (const col of cols) {
    col.y += col.speed;
    if (col.y > h + 200) { col.y = Math.random() * -200; }
    for (let i = 0; i < col.length; i++) {
      const cy = col.y - i * 22;
      if (cy < -50 || cy > h + 50) continue;
      const alpha = 1 - (i / col.length) * 0.85;
      const char = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillStyle = `rgba(100,220,255,${alpha})`;
      ctx.fillText(char, col.x, cy);
    }
  }
}

export default function OpeningAnimation() {
  const { dispatch } = useApp();
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const lastProgressUpdateRef = useRef(0);

  const skip = () => {
    cancelSpeech();
    setSkipped(true);
    window.electronAPI?.setFullScreen?.(false);
    dispatch({ type: 'SET_STAGE', payload: 'chat' });
  };

  useEffect(() => {
    if (skipped) return;
    const container = containerRef.current;
    if (!container) return;

    // 强制全屏
    window.electronAPI?.setFullScreen?.(true);

    const W = container.clientWidth;
    const H = container.clientHeight;

    // ====== Layer 1: 2D Canvas 全息舞台背景 ======
    const bgCanvas = document.createElement('canvas');
    bgCanvas.style.cssText = 'position:absolute;top:0;left:0;z-index:1;pointer-events:none;';
    bgCanvas.width = W;
    bgCanvas.height = H;
    const bgCtx = bgCanvas.getContext('2d');
    container.appendChild(bgCanvas);

    // ====== Layer 2: Three.js 3D场景 ======
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 50);
    camera.position.set(0, 2.5, 10);
    camera.lookAt(0, 1.3, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;z-index:2;';
    container.appendChild(renderer.domElement);

    // --- 灯光（与主界面CharacterScene完全一致） ---
    scene.add(new THREE.AmbientLight(0xbbbbdd, 2.8));
    const key = new THREE.DirectionalLight(0xfff5e8, 3.5);
    key.position.set(3, 6, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899cc, 2.0);
    fill.position.set(-2, 3, -3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xa78bfa, 2.2);
    rim.position.set(0, 4, -4);
    scene.add(rim);
    const podiumLight = new THREE.PointLight(0x00BFFF, 5, 10);
    podiumLight.position.set(0, 0.5, 0);
    scene.add(podiumLight);
    const topLight = new THREE.PointLight(0xffffff, 2.0, 6);
    topLight.position.set(0, 4, 2);
    scene.add(topLight);

    // --- 地面光环（与主界面一致） ---
    const glowGeom = new THREE.RingGeometry(1.4, 1.7, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00BFFF, side: THREE.DoubleSide,
      transparent: true, opacity: 0.5,
    });
    const groundRing = new THREE.Mesh(glowGeom, glowMat);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.05;
    scene.add(groundRing);
    const innerGlowGeom = new THREE.CircleGeometry(1.4, 64);
    const innerGlowMat = new THREE.MeshBasicMaterial({
      color: 0x003366, side: THREE.DoubleSide,
      transparent: true, opacity: 0.18,
    });
    const innerCircle = new THREE.Mesh(innerGlowGeom, innerGlowMat);
    innerCircle.rotation.x = -Math.PI / 2;
    innerCircle.position.y = 0.03;
    scene.add(innerCircle);

    // --- 加载3D模型 ---
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    let finalBaseY = 0; // 模型加载后计算脚底位置

    const loader = new GLTFLoader();
    let mixer = null;
    let modelLoaded = false;

    loader.load(
      './models/Angry.glb',
      (gltf) => {
        modelGroup.add(gltf.scene);
        mixer = new THREE.AnimationMixer(gltf.scene);

        // 缩放模型到目标高度（与主界面一致）
        const box = new THREE.Box3();
        gltf.scene.traverse((c) => { if (c.isMesh) box.expandByObject(c); });
        const size = box.getSize(new THREE.Vector3());
        const targetH = 2.8;
        const s = targetH / Math.max(size.y, 0.001);
        gltf.scene.scale.setScalar(s);

        // 缩放后重新计算包围盒
        const sb = new THREE.Box3();
        gltf.scene.traverse((c) => { if (c.isMesh) sb.expandByObject(c); });
        const sc = sb.getCenter(new THREE.Vector3());

        // 居中模型包围盒
        gltf.scene.position.set(-sc.x, -sc.y, -sc.z);

        // 脚底位置补偿（与CharacterScene一致）
        const feetY = sb.min.y - sc.y;
        finalBaseY = -feetY + 0.1;

        if (gltf.animations.length > 0) {
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
        }

        modelLoaded = true;
      },
      undefined,
      (err) => console.warn('3D模型加载失败，使用默认展示:', err.message)
    );

    // --- 动画循环 ---
    const startTime = Date.now();
    const duration = 7000; // 7秒
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = Date.now() - startTime;
      const p = Math.min(elapsed / duration, 1);
      const rounded = Math.round(p * 100);
      if (rounded !== progress && Date.now() - lastProgressUpdateRef.current > 200) {
        lastProgressUpdateRef.current = Date.now();
        setProgress(rounded);
      }

      const clock = performance.now() * 0.001;

      // 降落动画：悬停 → 下降 → 着陆
      let descentY, rotationY, scaleY;

      if (p < 0.15) {
        // 悬停阶段
        const sp = p / 0.15;
        descentY = 7 - sp * 1;
        rotationY = sp * Math.PI;
        scaleY = 0.85 + sp * 0.15;
      } else if (p < 0.8) {
        // 下降阶段（easeOutCubic）
        const dp = (p - 0.15) / 0.65;
        const ease = 1 - Math.pow(1 - dp, 3);
        descentY = 6 - ease * 6;
        rotationY = Math.PI + dp * Math.PI * 0.8;
        scaleY = 1;
      } else {
        // 着陆稳定
        descentY = 0;
        rotationY = Math.PI * 1.8;
        scaleY = 1;
      }

      modelGroup.position.set(0, descentY + finalBaseY, 0);
      modelGroup.rotation.y = rotationY;
      modelGroup.scale.setScalar(scaleY);

      if (mixer) mixer.update(0.016);

      // --- 灯光脉动 ---
      podiumLight.intensity = 3.5 + Math.sin(clock * 3) * 1.2 + p * 3;

      // --- 渲染 ---
      renderer.render(scene, camera);

      // --- 绘制2D背景 ---
      drawStageBackground(bgCtx, W, H, clock);

      // --- 结束 ---
      if (p >= 1 && !skipped) {
        cancelAnimationFrame(animId);
        setTimeout(() => {
          window.electronAPI?.setFullScreen?.(false);
          dispatch({ type: 'SET_STAGE', payload: 'chat' });
        }, 500);
      }
    };
    animate();

    // 语音 — 用克隆声音，未就绪时自动fallback
    const speakTimer = setTimeout(() => {
      speakText('华人牌2026款CC为您服务', { rate: 0.85 });
    }, 800);

    // --- Resize ---
    const handleResize = () => {
      const nw = container.clientWidth, nh = container.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      bgCanvas.width = nw;
      bgCanvas.height = nh;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(speakTimer);
      cancelSpeech();
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(bgCanvas)) container.removeChild(bgCanvas);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      drawStageBackground._init = false;
    };
  }, [dispatch, skipped]);

  return (
    <div
      ref={containerRef}
      onClick={skip}
      style={{
        width: '100vw', height: '100vh', cursor: 'pointer', position: 'relative',
        background: '#06060F', overflow: 'hidden',
      }}>
      <div style={{
        position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, zIndex: 10,
      }}>
        <div style={{
          width: 200, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`, height: '100%',
            background: 'linear-gradient(90deg, #00BFFF, #7c3aed)',
            borderRadius: 2, transition: 'width 0.3s',
          }}/>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 3 }}>
          {progress < 100 ? '点按任意位置跳过' : '正在进入...'}
        </span>
      </div>
    </div>
  );
}
