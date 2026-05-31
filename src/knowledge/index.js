/**
 * CC Knowledge System — 统一入口
 *
 * 模块结构：
 *   storage/      存储基础设施（StorageEngine, CapacityManager, Migration）
 *   extraction/   知识提取引擎（ExtractionEngine, ExtractionCache, ExtractionPrompt）
 *   graph/        知识图谱（KnowledgeGraph, GraphTraversal, NodeTypes）
 *   profiles/     用户画像（ProfileModel）
 *   analysis/     分析归纳（AnalysisScheduler）
 *
 * 使用：
 *   import { getKnowledgeSystem } from './knowledge/index.js';
 *   const ks = getKnowledgeSystem(modelAdapter);
 *   await ks.initialize();
 */

export { getKnowledgeSystem, KnowledgeSystem } from './KnowledgeSystem.js';
export { getStorageEngine, StorageEngine } from './storage/StorageEngine.js';
export { getCapacityManager, CapacityManager, SOFT_LIMIT, HARD_LIMIT } from './storage/CapacityManager.js';
export { isMigrationNeeded, runMigration } from './storage/Migration.js';
export { getExtractionEngine, ExtractionEngine } from './extraction/ExtractionEngine.js';
export { getExtractionCache, ExtractionCache, DAILY_TOKEN_BUDGET } from './extraction/ExtractionCache.js';
export { getKnowledgeGraph, KnowledgeGraph, NODE_TYPES, EDGE_TYPES } from './graph/KnowledgeGraph.js';
export { GraphTraversal } from './graph/GraphTraversal.js';
export { getProfileModel, ProfileModel, PROFILE_DIMENSIONS } from './profiles/ProfileModel.js';
export { AnalysisScheduler } from './analysis/AnalysisScheduler.js';
