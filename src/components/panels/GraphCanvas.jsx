/**
 * GraphCanvas — 固定径向树图谱渲染
 *
 * 绝对确定性的径向树布局：1个根节点 → 6个分类 → N个数据节点。
 * 无力导向、无随机性，刷新不变。
 */

import { useRef, useEffect, useCallback, useState } from 'react';

/* ────────── 常量 ────────── */

// 6个固定分类
const CATEGORIES = [
  { type: 'profile_fact', label: '画像' },
  { type: 'memory', label: '记忆' },
  { type: 'lesson', label: '教训' },
  { type: 'psych_observation', label: '心理' },
  { type: 'project_entity', label: '项目' },
  { type: 'interest_domain', label: '兴趣' },
];

// 钟表位（12点/2点/4点/6点/8点/10点）→ 弧度
const CLOCK_RAD = [-90, -30, 30, 90, 150, 210].map(d => d * Math.PI / 180);

// 视觉规格
const VISUAL = {
  bg: '#111827',
  root: { fill: '#7C3AED', stroke: '#9B6FF0', radius: 45 },
  cat: { fill: '#8B5CF6', stroke: '#A78BFA', radius: 30 },
  data: { fill: '#A78BFA', stroke: '#C4B5FD', radius: 20 },
  edge: { color: '#6B7280', width: 1.5, alpha: 0.6 },
  label: { color: '#F9FAFB', font: '"Microsoft YaHei", sans-serif' },
  catRingRadius: 160,
  dataBaseRadius: 340,
  dataRingStep: 110,
  maxPerRing: 3,
  sectorHalfAngle: Math.PI / 4.5, // ~40°
};

/* ────────── 布局 ────────── */

function buildRadialTree(rawNodes, cx, cy, filterType) {
  const dataNodes = rawNodes.map(n => ({ ...n }));

  if (dataNodes.length === 0) return { nodes: [], edges: [] };

  // 1. 根节点 — name画像，否则合成"用户"
  let root;
  const nameIdx = dataNodes.findIndex(n => n.type === 'profile_fact' && n.data?.key === 'name');
  if (nameIdx >= 0) {
    const [nameNode] = dataNodes.splice(nameIdx, 1);
    root = { ...nameNode, type: 'root', isRoot: true, label: nameNode.label || '用户' };
  } else {
    root = { id: '__root__', type: 'root', label: '用户', isRoot: true };
  }
  root._radius = VISUAL.root.radius;
  root.x = cx;
  root.y = cy;

  // 2. 筛选模式：中心 + 该类型数据节点单圈
  if (filterType) {
    const filtered = dataNodes.filter(n => n.type === filterType);
    const n1 = filtered.length;
    for (let i = 0; i < n1; i++) {
      const a = (2 * Math.PI * i) / Math.max(1, n1) - Math.PI / 2;
      filtered[i].x = cx + 200 * Math.cos(a);
      filtered[i].y = cy + 200 * Math.sin(a);
      filtered[i]._radius = VISUAL.data.radius;
    }
    const nodes = [root, ...filtered];
    const edges = filtered.map(n => ({
      id: '__e_' + n.id, source: root.id, target: n.id,
    }));
    return { nodes, edges };
  }

  // 3. 全面模式：根 → 6分类 → 数据节点
  const allNodes = [root];
  const synthEdges = [];

  // 按类型分组数据节点
  const groups = {};
  for (const cat of CATEGORIES) {
    groups[cat.type] = dataNodes.filter(n => n.type === cat.type);
  }

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const baseAngle = CLOCK_RAD[i];

    // 分类节点
    const catNode = {
      id: '__cat_' + cat.type,
      type: 'category',
      label: cat.label,
      isCategory: true,
      _radius: VISUAL.cat.radius,
      catType: cat.type,
      x: cx + VISUAL.catRingRadius * Math.cos(baseAngle),
      y: cy + VISUAL.catRingRadius * Math.sin(baseAngle),
      _angle: baseAngle,
    };
    allNodes.push(catNode);

    // 根 → 分类
    synthEdges.push({ id: '__e_c2c_' + cat.type, source: root.id, target: catNode.id });

    // 该分类的数据节点
    const kids = groups[cat.type] || [];
    const n = kids.length;
    const numRings = Math.max(1, Math.ceil(n / VISUAL.maxPerRing));
    let idx = 0;

    for (let ring = 0; ring < numRings; ring++) {
      const r = VISUAL.dataBaseRadius + ring * VISUAL.dataRingStep;
      const count = Math.min(VISUAL.maxPerRing, n - idx);

      for (let j = 0; j < count; j++) {
        const spread = count > 1
          ? (j - (count - 1) / 2) / (count - 1) * 2 : 0;
        const a = baseAngle + spread * VISUAL.sectorHalfAngle;
        kids[idx].x = cx + r * Math.cos(a);
        kids[idx].y = cy + r * Math.sin(a);
        kids[idx]._radius = VISUAL.data.radius;
        kids[idx]._catId = catNode.id;
        allNodes.push(kids[idx]);

        synthEdges.push({ id: '__e_c2d_' + kids[idx].id, source: catNode.id, target: kids[idx].id });
        idx++;
      }
    }
  }

  // 未分类节点放最外层
  const catTypeSet = new Set(CATEGORIES.map(c => c.type));
  const rest = dataNodes.filter(n => !catTypeSet.has(n.type));
  const nr = rest.length;
  for (let i = 0; i < nr; i++) {
    const a = (2 * Math.PI * i) / Math.max(1, nr);
    rest[i].x = cx + 500 * Math.cos(a);
    rest[i].y = cy + 500 * Math.sin(a);
    rest[i]._radius = VISUAL.data.radius;
    allNodes.push(rest[i]);
  }

  return { nodes: allNodes, edges: synthEdges };
}

/* ────────── 组件 ────────── */

export default function GraphCanvas({ graphData, onNodeSelect, selectedNodeId, filterType }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  const layoutRef = useRef({ nodes: [], edges: [], offsetX: 0, offsetY: 0, scale: 1 });
  const dragRef = useRef(null);   // 只用于平移
  const animRef = useRef(null);

  /* ── Hover邻居 ── */
  const getNeighborIds = useCallback((nodeId) => {
    const s = new Set();
    for (const e of layoutRef.current.edges) {
      if (e.source === nodeId) s.add(e.target);
      if (e.target === nodeId) s.add(e.source);
    }
    return s;
  }, []);

  /* ── 渲染 ── */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景
    ctx.fillStyle = VISUAL.bg;
    ctx.fillRect(0, 0, w, h);

    const { nodes, edges, offsetX, offsetY, scale } = layoutRef.current;
    if (!nodes?.length) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('和CC聊聊天，知识图谱会慢慢生长 🌱', w / 2, h / 2);
      return;
    }

    // 坐标变换
    const tx = (x) => (x + offsetX) * scale + w / 2 * (1 - scale);
    const ty = (y) => (y + offsetY) * scale + h / 2 * (1 - scale);

    // Hover高亮集合
    let hoverSet = null;
    if (hoveredNodeId) {
      hoverSet = new Set([hoveredNodeId, ...getNeighborIds(hoveredNodeId)]);
    }

    ctx.lineCap = 'round';

    // ── 边 ──
    for (const edge of edges) {
      const src = nodes.find(n => n.id === edge.source);
      const tgt = nodes.find(n => n.id === edge.target);
      if (!src || !tgt) continue;

      let alpha = VISUAL.edge.alpha;
      if (hoverSet) {
        alpha = (src.id === hoveredNodeId || tgt.id === hoveredNodeId)
          ? VISUAL.edge.alpha : 0.08;
      }

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = VISUAL.edge.color;
      ctx.lineWidth = VISUAL.edge.width * scale;

      const sx = tx(src.x), sy = ty(src.y);
      const ex = tx(tgt.x), ey = ty(tgt.y);
      const dx = ex - sx, dy = ey - sy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const sr = (src._radius || VISUAL.data.radius) * scale;
      const tr = (tgt._radius || VISUAL.data.radius) * scale;
      const gap = 5;

      ctx.beginPath();
      ctx.moveTo(sx + (dx / len) * (sr + gap), sy + (dy / len) * (sr + gap));
      ctx.lineTo(ex - (dx / len) * (tr + gap), ey - (dy / len) * (tr + gap));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── 节点 ──
    for (const node of nodes) {
      const x = tx(node.x), y = ty(node.y);
      const r = Math.max(4, (node._radius || VISUAL.data.radius) * scale);
      const sel = node.id === selectedNodeId;
      const hov = node.id === hoveredNodeId;
      const isRootCat = node.isRoot || node.isCategory;

      // 透明度
      let na = 1;
      if (hoverSet) {
        na = (hov || hoverSet.has(node.id)) ? 1 : 0.15;
      }
      ctx.globalAlpha = na;

      // 颜色
      let fill, stroke;
      if (node.isRoot) {
        fill = VISUAL.root.fill; stroke = VISUAL.root.stroke;
      } else if (node.isCategory) {
        fill = VISUAL.cat.fill; stroke = VISUAL.cat.stroke;
      } else {
        fill = VISUAL.data.fill; stroke = VISUAL.data.stroke;
      }

      // 选中/Hover光晕
      if (sel || hov) {
        ctx.beginPath();
        ctx.arc(x, y, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(167,139,250,0.3)';
        ctx.fill();
      }

      // 径向渐变
      const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.05, x, y, r);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, fill + '88');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // 描边
      ctx.strokeStyle = sel ? '#E9D5FF' : stroke;
      ctx.lineWidth = (sel ? 3 : 2) * scale;
      ctx.stroke();

      // 标签：统一在节点正下方，带阴影
      const showLabel = true; // 所有节点常驻标签
      if (showLabel) {
        const label = node.label || '';
        const short = label.length > 8 ? label.slice(0, 8) + '…' : label;
        let fs;
        if (node.isRoot) fs = Math.max(12, 14 * scale);
        else if (node.isCategory) fs = Math.max(11, 12 * scale);
        else fs = Math.max(10, 11 * scale);
        ctx.font = `500 ${fs}px ${VISUAL.label.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.92)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = VISUAL.label.color;
        ctx.fillText(short, x, y + r + 7);
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.globalAlpha = 1;

    animRef.current = null;
  }, [hoveredNodeId, selectedNodeId, getNeighborIds]);

  /* ── 调度渲染 ── */
  const renderRef = useRef(render);
  renderRef.current = render;

  const scheduleRender = useCallback(() => {
    if (animRef.current) return;
    animRef.current = requestAnimationFrame(() => { renderRef.current(); animRef.current = null; });
  }, []); // 稳定引用，从不变化

  // 数据变更：重算布局 + 重绘。不重置视图偏移。
  useEffect(() => {
    if (!graphData?.nodes?.length) {
      layoutRef.current = { nodes: [], edges: [], offsetX: 0, offsetY: 0, scale: 1 };
      scheduleRender();
      return;
    }
    const w = containerRef.current?.clientWidth || 480;
    const h = containerRef.current?.clientHeight || 400;
    const { offsetX, offsetY, scale } = layoutRef.current;
    layoutRef.current = {
      ...buildRadialTree(graphData.nodes, w / 2, h / 2, filterType),
      offsetX, offsetY, scale, // 保留当前视图状态
    };
    scheduleRender();
  }, [graphData, filterType]); // 不依赖scheduleRender，避免hover触发重置

  // 挂载+resize：触发渲染
  useEffect(() => {
    scheduleRender();
    const onResize = () => scheduleRender();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(animRef.current); };
  }, [scheduleRender]);

  /* ── 交互 ── */

  const screenToWorld = useCallback((sx, sy) => {
    const { offsetX, offsetY, scale } = layoutRef.current;
    const w = containerRef.current?.clientWidth || 480;
    const h = containerRef.current?.clientHeight || 400;
    return {
      x: (sx - w / 2 * (1 - scale)) / scale - offsetX,
      y: (sy - h / 2 * (1 - scale)) / scale - offsetY,
    };
  }, []);

  const findNodeAt = useCallback((wx, wy) => {
    for (const n of layoutRef.current.nodes) {
      const r = (n._radius || VISUAL.data.radius) + 6;
      if (Math.hypot(n.x - wx, n.y - wy) < r) return n;
    }
    return null;
  }, []);

  const resetView = useCallback(() => {
    layoutRef.current.offsetX = 0;
    layoutRef.current.offsetY = 0;
    layoutRef.current.scale = 1;
    scheduleRender();
  }, [scheduleRender]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const { offsetX, offsetY, scale } = layoutRef.current;
    const w = containerRef.current?.clientWidth || 480;
    const h = containerRef.current?.clientHeight || 400;
    const world = screenToWorld(mx, my);
    const ns = Math.max(0.15, Math.min(3, scale * (e.deltaY < 0 ? 1.12 : 0.88)));
    layoutRef.current.scale = ns;
    layoutRef.current.offsetX = offsetX + (world.x - (mx - w / 2 * (1 - ns)) / ns + offsetX) * (ns / scale - 1);
    layoutRef.current.offsetY = offsetY + (world.y - (my - h / 2 * (1 - ns)) / ns + offsetY) * (ns / scale - 1);
    scheduleRender();
  }, [screenToWorld, scheduleRender]);

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = findNodeAt(world.x, world.y);
    if (node) {
      onNodeSelect?.(node);
    } else {
      onNodeSelect?.(null); // 空白处点击关闭详情
    }
    // 总是开始平移（空白区域拖拽用，拖节点区域也不拖节点）
    dragRef.current = {
      sx: e.clientX - rect.left, sy: e.clientY - rect.top,
      ox: layoutRef.current.offsetX, oy: layoutRef.current.offsetY,
    };
  }, [screenToWorld, findNodeAt, onNodeSelect]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    if (dragRef.current) {
      const dx = (mx - dragRef.current.sx) / layoutRef.current.scale;
      const dy = (my - dragRef.current.sy) / layoutRef.current.scale;
      layoutRef.current.offsetX = dragRef.current.ox + dx;
      layoutRef.current.offsetY = dragRef.current.oy + dy;
      scheduleRender();
    } else {
      const world = screenToWorld(mx, my);
      const node = findNodeAt(world.x, world.y);
      setHoveredNodeId(node?.id || null);
      canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
    }
  }, [screenToWorld, findNodeAt, scheduleRender]);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const handleDoubleClick = useCallback(() => {
    const ns = layoutRef.current.nodes;
    if (!ns.length) return;
    const w = containerRef.current?.clientWidth || 480;
    const h = containerRef.current?.clientHeight || 400;
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const n of ns) {
      const r = (n._radius || VISUAL.data.radius) + 30; // 含标签空间
      if (n.x - r < mnx) mnx = n.x - r;
      if (n.y - r < mny) mny = n.y - r;
      if (n.x + r > mxx) mxx = n.x + r;
      if (n.y + r > mxy) mxy = n.y + r;
    }
    const pad = 40;
    const sc = Math.min(1, Math.min(
      (w - pad * 2) / Math.max(1, mxx - mnx),
      (h - pad * 2) / Math.max(1, mxy - mny),
    ));
    layoutRef.current.scale = sc;
    // 画面中心 = 数据中心，而非映射到屏幕原点
    const cx = (mnx + mxx) / 2;
    const cy = (mny + mxy) / 2;
    layoutRef.current.offsetX = w / 2 - cx;
    layoutRef.current.offsetY = h / 2 - cy;
    scheduleRender();
  }, [scheduleRender]);

  /* ── JSX ── */
  return (
    <div ref={containerRef} className="kg-graph-area">
      <canvas ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: 'grab' }}
      />
      <div className="kg-graph-controls">
        <button onClick={() => {
          layoutRef.current.scale = Math.min(3, layoutRef.current.scale * 1.2);
          scheduleRender();
        }} title="放大">+</button>
        <button onClick={() => {
          layoutRef.current.scale = Math.max(0.15, layoutRef.current.scale * 0.8);
          scheduleRender();
        }} title="缩小">−</button>
        <button onClick={handleDoubleClick} title="适应视图">⊡</button>
        <button onClick={resetView} title="重置视图" style={{ fontWeight: 'bold' }}>⟲</button>
      </div>
    </div>
  );
}
