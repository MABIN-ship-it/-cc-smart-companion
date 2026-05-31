import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** 生成柔光圆点纹理（64x64 径向渐变） */
function createGlowDotTexture() {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s; canvas.height = s;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.08, 'rgba(255,230,170,0.95)');
  g.addColorStop(0.25, 'rgba(255,180,50,0.55)');
  g.addColorStop(0.5, 'rgba(255,140,20,0.12)');
  g.addColorStop(0.75, 'rgba(255,100,10,0.02)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}

const PARTICLE_COUNT = 90;
const EFFECT_DURATION = 1.8;

/**
 * CC 3D角色场景 — GLB模型 + 动画状态机 + 粒子光点召唤
 *
 * 尺寸策略：CSS 为唯一真源（width:100%;height:100%），
 * JS 通过 ResizeObserver 读取 canvas 实际渲染尺寸来同步 Three.js。
 */
export default function CharacterScene({ animParams }) {
  const canvasRef = useRef(null);
  const paramsRef = useRef({});
  const mixerRef = useRef(null);
  const modelRef = useRef(null);
  const bonesRef = useRef({});
  const baseYRef = useRef(0);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const resizeTimerRef = useRef(0);
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const modelGroupRef = useRef(null);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);

  useEffect(() => {
    paramsRef.current = animParams || {};
  }, [animParams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;

    // 初始尺寸：CSS width:100% 控制布局，这里只设置渲染缓冲区
    const W = window.innerWidth || 1280;
    const H = window.innerHeight || 720;
    canvas.width = W;
    canvas.height = H;

    // --- Scene ---
    const scene = new THREE.Scene();

    // --- Camera ---
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 60);
    camera.position.set(0, 2.5, 9);
    camera.lookAt(0, 1.3, 0);
    cameraRef.current = camera;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    rendererRef.current = renderer;
    console.log('[CharacterScene] init:', JSON.stringify({ W, H, dpr: window.devicePixelRatio }));

    // --- Ground Glow ---
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

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0xbbbbdd, 1.8));
    const key = new THREE.DirectionalLight(0xfff5e8, 2.5);
    key.position.set(3, 6, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899cc, 1.4);
    fill.position.set(-2, 3, -3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xa78bfa, 1.5);
    rim.position.set(0, 4, -4);
    scene.add(rim);
    const podiumLight = new THREE.PointLight(0x00BFFF, 3.5, 10);
    podiumLight.position.set(0, 0.5, 0);
    scene.add(podiumLight);
    const topLight = new THREE.PointLight(0xffffff, 1.5, 6);
    topLight.position.set(0, 4, 2);
    scene.add(topLight);

    // --- 粒子系统 ---
    const dotTexture = createGlowDotTexture();

    const palette = [
      new THREE.Color('#ffcc66'),
      new THREE.Color('#ffbb44'),
      new THREE.Color('#ffdd88'),
      new THREE.Color('#ffaa33'),
      new THREE.Color('#ffe099'),
      new THREE.Color('#ffb855'),
    ];

    const particleStates = [];
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const colors = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.5 + Math.random() * 1.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 0.2 + Math.random() * 2.6;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      particleStates.push({
        baseX: x, baseY: y, baseZ: z,
        phase: Math.random() * Math.PI * 2,
        baseSize: 0.03 + Math.random() * 0.1,
        speed: 0.5 + Math.random() * 1.5,
      });

      sizes[i] = 0;

      const col = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      map: dotTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
      vertexColors: true,
      size: 0.15,
    });

    const particles = new THREE.Points(particleGeom, particleMat);
    scene.add(particles);

    // --- Model Container ---
    const modelGroup = new THREE.Group();
    modelGroupRef.current = modelGroup;
    scene.add(modelGroup);

    let fadeMaterials = [];
    let loadTime = 0;
    let effectDone = false;

    // --- Load GLB ---
    const loader = new GLTFLoader();
    loader.load(
      './models/Angry.glb',
      (gltf) => {
        modelGroup.add(gltf.scene);
        modelRef.current = gltf.scene;

        const box = new THREE.Box3();
        gltf.scene.traverse((child) => {
          if (child.isMesh) box.expandByObject(child);
        });
        const size = box.getSize(new THREE.Vector3());

        const targetHeight = 2.8;
        const scale = targetHeight / Math.max(size.y, 0.001);
        gltf.scene.scale.setScalar(scale);

        const scaledBox = new THREE.Box3();
        gltf.scene.traverse((child) => {
          if (child.isMesh) scaledBox.expandByObject(child);
        });
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

        gltf.scene.position.set(-scaledCenter.x, -scaledCenter.y, -scaledCenter.z);

        const feetY = scaledBox.min.y - scaledCenter.y;
        modelGroup.position.set(-0.15, -feetY + 0.1, 0);
        baseYRef.current = modelGroup.position.y;

        gltf.scene.traverse((child) => {
          if (child.isBone) bonesRef.current[child.name] = child;
        });

        fadeMaterials = [];
        gltf.scene.traverse((child) => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              mat.transparent = true;
              mat.opacity = 0;
              mat.needsUpdate = true;
              fadeMaterials.push(mat);
            });
          }
        });

        if (gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(gltf.scene);
          mixerRef.current = mixer;
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
        }

        loadTime = performance.now();
      },
      undefined,
      (err) => console.warn('CC模型加载失败:', err.message)
    );

    // --- Animation loop ---
    let animId;
    const clock = new THREE.Clock();

    lastSizeRef.current = { w: W, h: H };

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // ── 每帧检查：用 window.innerWidth/Height 校准 ──
      const iw = window.innerWidth, ih = window.innerHeight;
      if (!iw || !ih) { /* skip, frame not ready */ }
      else {
        const last = lastSizeRef.current;
        if (Math.abs(last.w - iw) > 1 || Math.abs(last.h - ih) > 1) {
          lastSizeRef.current = { w: iw, h: ih };
          // CSS width:100% 控制布局尺寸，这里只更新 Three.js 视口
          camera.aspect = iw / ih;
          camera.updateProjectionMatrix();
          renderer.setSize(iw, ih, false);
          renderer.setScissorTest(false);
        }
      }

      const dt = Math.min(clock.getDelta(), 0.1);
      const params = paramsRef.current;
      const now = performance.now();

      if (!effectDone && loadTime > 0) {
        const t = (now - loadTime) / 1000;

        if (t >= EFFECT_DURATION) {
          particleMat.opacity = 0;
          fadeMaterials.forEach(mat => {
            mat.opacity = 1;
            mat.transparent = false;
          });
          fadeMaterials.length = 0;
          effectDone = true;
        } else {
          if (t < 0.4) {
            particleMat.opacity = t / 0.4;
          } else if (t < 1.2) {
            particleMat.opacity = 1;
          } else {
            particleMat.opacity = 1 - (t - 1.2) / 0.6;
          }

          if (t > 0.4) {
            const charOpacity = Math.min(1, (t - 0.4) / 0.8);
            fadeMaterials.forEach(mat => { mat.opacity = charOpacity; });
          }

          const posArr = particleGeom.attributes.position.array;
          const sizeArr = particleGeom.attributes.size.array;
          for (let i = 0; i < PARTICLE_COUNT; i++) {
            const p = particleStates[i];
            const delay = p.phase * 0.3;

            const activeT = Math.max(0, t - delay);
            const floatX = Math.cos(activeT * p.speed + p.phase) * 0.3;
            const floatY = Math.sin(activeT * p.speed * 1.3 + p.phase) * 0.2;
            const floatZ = Math.sin(activeT * p.speed * 0.7 + p.phase + 1) * 0.3;

            const driftY = t > 1.2 ? (t - 1.2) * 2.5 : 0;
            const expandR = t > 1.2 ? (t - 1.2) * 1.5 : 0;

            const r = Math.sqrt(p.baseX * p.baseX + p.baseZ * p.baseZ) || 0.01;
            const expandX = r > 0 ? (p.baseX / r) * expandR : 0;
            const expandZ = r > 0 ? (p.baseZ / r) * expandR : 0;

            posArr[i * 3] = p.baseX + floatX + expandX;
            posArr[i * 3 + 1] = p.baseY + floatY + driftY;
            posArr[i * 3 + 2] = p.baseZ + floatZ + expandZ;

            const pulse = 0.7 + 0.3 * Math.sin(activeT * 4 + p.phase);
            const scaleIn = t < 0.4 ? Math.min(1, activeT / 0.3) : 1;
            sizeArr[i] = p.baseSize * pulse * scaleIn;
          }
          particleGeom.attributes.position.needsUpdate = true;
          particleGeom.attributes.size.needsUpdate = true;
        }
      }

      if (mixerRef.current) mixerRef.current.update(dt);

      const headBone = bonesRef.current.mixamorigHead;
      if (headBone && params.headTilt !== undefined) {
        headBone.rotation.z = params.headTilt || 0;
        headBone.rotation.x = params.headLookUp || 0;
      }

      if (params.bodyBounce !== undefined) {
        modelGroup.position.y = baseYRef.current + (params.bodyBounce || 0);
      }

      if (params.breathPhase !== undefined) {
        const bs = 1 + Math.sin(params.breathPhase * Math.PI * 2) * 0.003;
        modelGroup.scale.setScalar(bs);
      }

      if (params.glowIntensity !== undefined) {
        const glow = 0.6 + params.glowIntensity * 0.5;
        key.intensity = 2.5 + glow * 0.4;
        podiumLight.intensity = 3.5 + glow * 1.2;
      }

      if (params.colorShift !== undefined && params.colorShift > 0) {
        rim.color.setHSL(0.7 - params.colorShift * 0.1, 0.8, 0.6);
      } else {
        rim.color.set('#a78bfa');
      }

      renderer.render(scene, camera);
    };
    animate();

    // ─── Resize：CSS 为真源，读取 canvas 实际渲染尺寸同步 Three.js ───
    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width) || window.innerWidth;
      const h = Math.round(rect.height) || window.innerHeight;
      if (!w || !h) return;

      const cam = cameraRef.current;
      if (cam) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }

      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        const r = rendererRef.current;
        if (r) {
          r.setSize(w, h, false);
          lastSizeRef.current = { w, h };
        }
      }, 200);
    };

    // 用 ResizeObserver 直接监听 canvas 元素本身的尺寸变化
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          syncSize();
          break;
        }
      }
    });
    resizeObserver.observe(canvas);

    // 全屏检测辅助：全屏时无延迟直接重建 buffer
    const isFullscreen = () => {
      const dpr = window.devicePixelRatio || 1;
      return Math.abs(window.innerWidth - screen.width / dpr) < 5
        && Math.abs(window.innerHeight - screen.height / dpr) < 5;
    };

    // window resize 作为补充（处理 Electron 全屏等 resize 场景）
    const handleWindowResize = () => {
      if (isFullscreen()) {
        const rect = canvas.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const cam = cameraRef.current;
        const r = rendererRef.current;
        if (cam && r && w > 0 && h > 0) {
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
          r.setSize(w, h, false);
          lastSizeRef.current = { w, h };
        }
      }
    };
    window.addEventListener('resize', handleWindowResize);

    // 监听形象库模型切换
    const handleSwitchModel = (e) => {
      const { path } = e.detail || {};
      if (path && modelRef.current) {
        const loader = new GLTFLoader();
        loader.load(path, (gltf) => {
          modelRef.current.parent?.remove(modelRef.current);
          modelRef.current = gltf.scene;
          const box = new THREE.Box3();
          gltf.scene.traverse(c => { if (c.isMesh) box.expandByObject(c); });
          const s = box.getSize(new THREE.Vector3());
          gltf.scene.scale.setScalar(2.8 / Math.max(s.y, 0.001));
          modelGroup.add(gltf.scene);
        }, undefined, () => {});
      }
    };
    window.addEventListener('cc:switchModel', handleSwitchModel);

    // 监听 Electron 全屏 IPC（如果可用）
    let cleanupFsListener = null;
    if (window.electronAPI?.onFullscreenChanged) {
      cleanupFsListener = window.electronAPI.onFullscreenChanged(() => {
        handleWindowResize();
      });
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('cc:switchModel', handleSwitchModel);
      resizeObserver.disconnect();
      if (cleanupFsListener) cleanupFsListener();
      renderer.dispose();
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  const canvasStyle = useMemo(() => ({
    display: 'block',
    position: 'fixed', top: 0, left: 0,
    width: '100%', height: '100%',
    zIndex: 2,
    pointerEvents: 'auto',
  }), []);

  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    lastMouseXRef.current = e.clientX;
  };
  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || !modelGroupRef.current) return;
    const delta = e.clientX - lastMouseXRef.current;
    modelGroupRef.current.rotation.y += delta * 0.01;
    lastMouseXRef.current = e.clientX;
  };
  const handleMouseUp = () => { isDraggingRef.current = false; };
  const handleMouseLeave = () => { isDraggingRef.current = false; };

  return (
    <canvas
      ref={canvasRef}
      style={canvasStyle}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  );
}
