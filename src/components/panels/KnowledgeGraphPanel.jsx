/**
 * KnowledgeGraphPanel — 知识图谱可视化主面板
 *
 * 三Tab布局：
 *   图谱 — Canvas力导向图（节点+边可视化）
 *   画像 — 结构化用户画像仪表板
 *   时间线 — 记忆按时间排列
 *
 * 使用方式：
 *   <KnowledgeGraphPanel onClose={fn} getKnowledgeSystem={fn} />
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import GraphCanvas from './GraphCanvas';
import ProfileDashboard from './ProfileDashboard';
import MemoryTimeline from './MemoryTimeline';
import { NODE_TYPES, NODE_DISPLAY } from '../../knowledge/graph/NodeTypes.js';
import '../../styles/knowledgeGraph.css';

const FILTER_OPTIONS = [
  { value: '', label: '全部' },
  { value: NODE_TYPES.PROFILE_FACT, label: '画像', color: NODE_DISPLAY[NODE_TYPES.PROFILE_FACT]?.color },
  { value: NODE_TYPES.MEMORY, label: '记忆', color: NODE_DISPLAY[NODE_TYPES.MEMORY]?.color },
  { value: NODE_TYPES.LESSON, label: '教训', color: NODE_DISPLAY[NODE_TYPES.LESSON]?.color },
  { value: NODE_TYPES.PSYCH_OBSERVATION, label: '心理', color: NODE_DISPLAY[NODE_TYPES.PSYCH_OBSERVATION]?.color },
  { value: NODE_TYPES.PROJECT_ENTITY, label: '项目', color: NODE_DISPLAY[NODE_TYPES.PROJECT_ENTITY]?.color },
  { value: NODE_TYPES.INTEREST_DOMAIN, label: '兴趣', color: NODE_DISPLAY[NODE_TYPES.INTEREST_DOMAIN]?.color },
];

export default function KnowledgeGraphPanel({ onClose, getKnowledgeSystem }) {
  const [activeTab, setActiveTab] = useState('graph');
  const [graphData, setGraphData] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [graphSearch, setGraphSearch] = useState('');

  const ks = useMemo(() => {
    try { return getKnowledgeSystem?.(); } catch { return null; }
  }, [getKnowledgeSystem]);

  const refreshData = useCallback(() => {
    if (!ks) return;
    try {
      const gv = ks.getGraphVisualization(500);
      setGraphData(gv);
      setDashboard(ks.getProfileDashboard());
      setStats(ks.getGraphSummary());

      // 记忆时间线
      const allMemories = (gv?.nodes || [])
        .filter(n => n.type === NODE_TYPES.MEMORY)
        .map(n => ({ ...n.data, id: n.id, importance: n.importance }))
        .sort((a, b) => (b.importance || 0) - (a.importance || 0));
      setTimeline(allMemories);
    } catch (err) {
      console.warn('[KnowledgeGraphPanel] 数据刷新失败:', err);
    }
  }, [ks]);

  useEffect(() => {
    refreshData();
    // 面板打开时定期刷新
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // 删除节点
  const handleDeleteNode = useCallback((nodeId) => {
    if (!ks) return;
    try {
      ks._graph?.removeNode(nodeId);
      setSelectedNode(null);
      refreshData();
    } catch (err) {
      console.warn('[KnowledgeGraphPanel] 删除节点失败:', err);
    }
  }, [ks, refreshData]);

  // 删除记忆
  const handleDeleteMemory = useCallback((id) => {
    if (!ks) return;
    try {
      ks._storage?.removeEntity(id);
      refreshData();
    } catch (err) {
      console.warn('[KnowledgeGraphPanel] 删除记忆失败:', err);
    }
  }, [ks, refreshData]);

  // 过滤后搜索
  const filteredGraphData = useMemo(() => {
    if (!graphData) return null;
    if (!graphSearch.trim()) return graphData;

    const q = graphSearch.trim().toLowerCase();
    const matchedIds = new Set();
    for (const n of graphData.nodes) {
      if ((n.label || '').toLowerCase().includes(q)) {
        matchedIds.add(n.id);
      }
    }
    // 也匹配边连接的节点
    const filteredEdges = graphData.edges.filter(e =>
      matchedIds.has(e.source) || matchedIds.has(e.target)
    );
    const edgeNodeIds = new Set();
    for (const e of filteredEdges) {
      edgeNodeIds.add(e.source);
      edgeNodeIds.add(e.target);
    }
    const filteredNodes = graphData.nodes.filter(n =>
      matchedIds.has(n.id) || edgeNodeIds.has(n.id)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graphData, graphSearch]);

  // 类型过滤后的数据
  const displayGraphData = useMemo(() => {
    if (!filteredGraphData) return null;
    if (!filterType) return filteredGraphData;

    const filteredNodes = filteredGraphData.nodes.filter(n => n.type === filterType);
    const visibleIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = filteredGraphData.edges.filter(e =>
      visibleIds.has(e.source) && visibleIds.has(e.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [filteredGraphData, filterType]);

  const nodeCount = graphData?.nodes?.length || 0;
  const edgeCount = graphData?.edges?.length || 0;

  const tabs = [
    { key: 'graph', label: '知识图谱', count: nodeCount },
    { key: 'profile', label: '用户画像', count: null },
    { key: 'timeline', label: '记忆时间线', count: timeline.length },
  ];

  return (
    <div className="kg-panel" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="kg-header">
        <h3>知识图谱</h3>
        <div className="kg-header-actions">
          <button className="kg-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="kg-tabs">
        {tabs.map(t => (
          <div
            key={t.key}
            className={`kg-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}{t.count !== null && t.count > 0 ? ` (${t.count})` : ''}
          </div>
        ))}
      </div>

      {/* 图谱Tab */}
      {activeTab === 'graph' && (
        <>
          {/* 搜索栏 */}
          <div className="kg-search">
            <input
              type="text"
              placeholder="搜索节点..."
              value={graphSearch}
              onChange={e => setGraphSearch(e.target.value)}
            />
          </div>

          {/* 类型过滤 */}
          <div style={{
            display: 'flex', gap: 4, padding: '6px 14px', flexWrap: 'wrap',
            borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
          }}>
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterType(opt.value)}
                style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: filterType === opt.value ? (opt.color ? `${opt.color}30` : 'rgba(255,255,255,0.1)') : 'transparent',
                  color: filterType === opt.value ? (opt.color || '#fff') : '#888',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 画布 */}
          <GraphCanvas
            graphData={displayGraphData}
            onNodeSelect={setSelectedNode}
            selectedNodeId={selectedNode?.id}
            filterType={filterType}
          />

          {/* 节点详情卡 */}
          {selectedNode && (
            <div className="kg-node-detail">
              <h4>{selectedNode.display?.icon || '●'} {selectedNode.label || selectedNode.id}</h4>
              <p>类型: {selectedNode.display?.label || selectedNode.type}</p>
              <p>重要度: {Math.round((selectedNode.importance || 0) * 100)}%</p>
              {selectedNode.data?.evidence && (
                <p>证据: {selectedNode.data.evidence.slice(0, 100)}</p>
              )}
              {selectedNode.data?.confidence !== undefined && (
                <p>置信度: {Math.round(selectedNode.data.confidence * 100)}%</p>
              )}
              {selectedNode.data?.value && (
                <p>值: {String(selectedNode.data.value).slice(0, 80)}</p>
              )}
              {selectedNode.data?.content && (
                <p>内容: {String(selectedNode.data.content).slice(0, 120)}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="kg-delete-btn" onClick={() => handleDeleteNode(selectedNode.id)}>
                  删除此节点
                </button>
                <button className="kg-action-btn" onClick={() => setSelectedNode(null)}>
                  关闭
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 画像Tab */}
      {activeTab === 'profile' && (
        <ProfileDashboard dashboard={dashboard} />
      )}

      {/* 时间线Tab */}
      {activeTab === 'timeline' && (
        <MemoryTimeline
          memories={timeline}
          onDelete={handleDeleteMemory}
          stats={stats?.typeBreakdown ? {
            hot: stats.typeBreakdown.hot_memories || 0,
            warm: (stats.typeBreakdown.memories || 0) - (stats.typeBreakdown.hot_memories || 0),
            cold: 0,
          } : null}
        />
      )}

      {/* 底部统计 */}
      {activeTab === 'graph' && (
        <div className="kg-stats">
          <div className="kg-stat">节点 {nodeCount}</div>
          <div className="kg-stat">边 {edgeCount}</div>
          {stats?.typeBreakdown && (
            <>
              <div className="kg-stat">
                <span className="kg-stat-dot" style={{ background: '#a855f7' }} />
                画像 {stats.typeBreakdown.profile_facts || 0}
              </div>
              <div className="kg-stat">
                <span className="kg-stat-dot" style={{ background: '#ef4444' }} />
                热记忆 {stats.typeBreakdown.hot_memories || 0}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
