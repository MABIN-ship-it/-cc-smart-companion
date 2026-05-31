/**
 * Migration — 从旧版17键localStorage迁移到新统一存储。
 *
 * 迁移后旧键保留不删除（回滚安全），标记 legacy_migrated 防重复迁移。
 * 只在首次启动时运行一次，之后持久化走 StorageEngine。
 */

import { getStorageEngine } from './StorageEngine.js';
import { getCapacityManager } from './CapacityManager.js';

/** 旧版localStorage键 → 新存储映射 */
const LEGACY_KEYS = {
  userProfile: 'cc_user_profile',
  memoryStore: 'cc_memory_store',
  lessonsLearned: 'cc_lessons_learned',
  knowledgeBase: 'cc_knowledge_base',
  projectContext: 'cc_project_context',
  relationship: 'cc_relationship',
};

/** 迁移状态标记（存入 meta store） */
const MIGRATION_FLAG = 'legacy_migrated';

/**
 * 检查是否需要迁移
 * @returns {boolean}
 */
export function isMigrationNeeded() {
  const storage = getStorageEngine();
  if (storage.getMeta(MIGRATION_FLAG)) return false;

  // 检查是否有任何旧数据
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      if (localStorage.getItem(key)) return true;
    } catch {}
  }
  return false;
}

/**
 * 执行迁移。
 * @returns {{ success: boolean, migrated: Record<string, number>, errors: string[] }}
 */
export function runMigration() {
  const storage = getStorageEngine();
  const result = { success: true, migrated: {}, errors: [] };

  if (storage.getMeta(MIGRATION_FLAG)) {
    return { success: true, migrated: {}, errors: [] };
  }

  // 1. 迁移用户画像 (cc_user_profile)
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.userProfile);
    if (raw) {
      const data = JSON.parse(raw);
      const fields = data?.fields || data || {};
      let count = 0;
      for (const [key, value] of Object.entries(fields)) {
        if (value && typeof value === 'string' && key !== 'updatedAt') {
          storage.putEntity(`profile_${key}`, {
            type: 'profile_fact',
            category: guessProfileCategory(key),
            key,
            value,
            confidence: 0.5, // 正则提取的数据默认中等置信度
            evidence: '(从旧版正则提取数据迁移)',
            _updatedAt: data.updatedAt || Date.now(),
          });
          count++;
        }
      }
      result.migrated.profile_fact = count;
    }
  } catch (e) {
    result.errors.push(`用户画像迁移失败: ${e.message}`);
  }

  // 2. 迁移记忆 (cc_memory_store)
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.memoryStore);
    if (raw) {
      const data = JSON.parse(raw);
      const memories = Array.isArray(data) ? data : (data?.memories || []);
      let count = 0;
      for (const m of memories) {
        if (m.content) {
          storage.putEntity(m.id || `mem_legacy_${count}`, {
            type: 'memory',
            content: m.content,
            level: m.level || 'warm',
            importance: m.importance || 5,
            memoryType: m.type || 'user',
            mentions: m.mentions || 1,
            source: m.source || 'auto',
            createdAt: m.createdAt || Date.now(),
            lastAccessed: m.lastAccessed || Date.now(),
            expiresAt: m.expiresAt || null,
            _updatedAt: m.createdAt || Date.now(),
          });
          count++;
        }
      }
      result.migrated.memory = count;
    }
  } catch (e) {
    result.errors.push(`记忆迁移失败: ${e.message}`);
  }

  // 3. 迁移经验教训 (cc_lessons_learned)
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.lessonsLearned);
    if (raw) {
      const lessons = JSON.parse(raw);
      const list = Array.isArray(lessons) ? lessons : (lessons?.lessons || []);
      let count = 0;
      for (const l of list) {
        if (l.context) {
          storage.putEntity(l.id || `lesson_legacy_${count}`, {
            type: 'lesson',
            context: l.context,
            approach: l.approach || '',
            result: l.result || '',
            isMistake: l.isMistake || false,
            category: guessLessonCategory(l.context, l.isMistake),
            createdAt: l.createdAt || Date.now(),
            _updatedAt: l.createdAt || Date.now(),
          });
          count++;
        }
      }
      result.migrated.lesson = count;
    }
  } catch (e) {
    result.errors.push(`经验教训迁移失败: ${e.message}`);
  }

  // 4. 迁移知识库文档 (cc_knowledge_base)
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.knowledgeBase);
    if (raw) {
      const data = JSON.parse(raw);
      const docs = data?.documents || [];
      let count = 0;
      for (const doc of docs) {
        storage.putEntity(doc.id, {
          type: 'knowledge_doc',
          title: doc.title,
          source: doc.source || '',
          fileType: doc.type || 'txt',
          chunkCount: doc.chunkCount || 0,
          addedAt: doc.addedAt || Date.now(),
          // 文档全文不迁移到实体（太大），保留原始chunks引用
          // 检索时仍从原key读取或用StorageEngine的query
          _legacyChunks: doc.chunks?.length || 0,
          _updatedAt: doc.addedAt || Date.now(),
        });
        count++;
      }
      result.migrated.knowledge_doc = count;

      // 文档全文和大chunks仍保留在旧key中（太大不适合全量迁移）
      // 检索时searchKnowledge继续从原key读取
    }
  } catch (e) {
    result.errors.push(`知识库迁移失败: ${e.message}`);
  }

  // 5. 迁移项目上下文 (cc_project_context)
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.projectContext);
    if (raw) {
      const data = JSON.parse(raw);
      let count = 0;

      if (data.projectPath) {
        storage.putEntity('project_current', {
          type: 'project_entity',
          entity: 'workspace',
          path: data.projectPath,
          name: data.projectName || '',
          type_: data.projectType || '',
          techStack: data.techStack || [],
          gitBranch: data.gitBranch || '',
          gitStatus: data.gitStatus || '',
          lastAnalyzed: data.lastAnalyzed || Date.now(),
          _updatedAt: data.lastAnalyzed || Date.now(),
        });
        count++;
      }

      if (data.keyFiles?.length) {
        for (const f of data.keyFiles) {
          storage.putEntity(`project_file_${f.replace(/[^a-zA-Z0-9]/g, '_')}`, {
            type: 'project_entity',
            entity: f,
            relationship: 'key_file',
            _updatedAt: Date.now(),
          });
          count++;
        }
      }

      if (data.lastTask) {
        storage.putEntity('project_last_task', {
          type: 'project_entity',
          entity: 'last_task',
          description: data.lastTask,
          _updatedAt: Date.now(),
        });
        count++;
      }

      if (data.pendingTasks?.length) {
        data.pendingTasks.forEach((task, i) => {
          storage.putEntity(`project_task_${i}`, {
            type: 'project_entity',
            entity: 'pending_task',
            description: task,
            _updatedAt: Date.now(),
          });
          count++;
        });
      }

      result.migrated.project_entity = count;
    }
  } catch (e) {
    result.errors.push(`项目上下文迁移失败: ${e.message}`);
  }

  // 6. 迁移关系数据 (cc_relationship) → meta
  try {
    const raw = localStorage.getItem(LEGACY_KEYS.relationship);
    if (raw) {
      const data = JSON.parse(raw);
      storage.setMeta('relationship', data);
      result.migrated.relationship = 1;
    }
  } catch (e) {
    result.errors.push(`关系数据迁移失败: ${e.message}`);
  }

  // 标记迁移完成
  storage.setMeta(MIGRATION_FLAG, true);
  storage.setMeta('migration_timestamp', Date.now());
  storage.setMeta('migration_result', result);

  // 持久化
  const persisted = storage.tryPersist();
  if (!persisted) {
    // 配额不足，尝试压缩
    const cm = getCapacityManager(storage);
    cm.evict();
    storage.tryPersist();
  }

  result.success = result.errors.length === 0;
  return result;
}

/** 根据画像key推测分类 */
function guessProfileCategory(key) {
  const identityKeys = ['name', 'preferred_name', 'age', 'birthday', 'gender', 'city', 'location'];
  const preferenceKeys = ['reply_style', 'detail_level', 'humor_preference'];
  const skillKeys = ['skills', 'tech_stack', 'programming_languages'];

  if (identityKeys.includes(key)) return 'identity';
  if (preferenceKeys.includes(key)) return 'preference';
  if (skillKeys.includes(key)) return 'skill';
  if (key.includes('喜欢') || key.includes('偏好') || key.includes('prefer')) return 'preference';
  if (key.includes('擅长') || key.includes('skill') || key.includes('技术')) return 'skill';
  if (key.includes('兴趣') || key.includes('hobby') || key.includes('爱好')) return 'interest';

  // 旧版 "对CC的感受" 等垃圾数据标记为低置信度
  if (key === '对CC的感受' || key === 'cc_feeling' || key === 'attitude_toward_cc') {
    return 'cc_perception';
  }

  return 'general';
}

/** 根据教训内容推测分类 */
function guessLessonCategory(context, isMistake) {
  const ctx = (context || '').toLowerCase();
  if (ctx.includes('啰嗦') || ctx.includes('简洁') || ctx.includes('太长') || ctx.includes('短')) return 'communication_style';
  if (ctx.includes('代码') || ctx.includes('编程') || ctx.includes('bug') || ctx.includes('错误')) return 'technical';
  if (ctx.includes('搜索') || ctx.includes('查找') || ctx.includes('search')) return 'information_seeking';
  if (ctx.includes('工具') || ctx.includes('tool') || ctx.includes('命令')) return 'tool_usage';
  if (ctx.includes('解释') || ctx.includes('说明') || ctx.includes('清晰')) return 'clarity';
  return isMistake ? 'general_mistake' : 'general_success';
}

/**
 * 回滚迁移（仅用于测试/开发环境）。
 * 清除新存储的迁移标记，下次启动会重新迁移。
 */
export function rollbackMigration() {
  const storage = getStorageEngine();
  storage.setMeta(MIGRATION_FLAG, false);
  storage.persist();
}

export { LEGACY_KEYS, MIGRATION_FLAG };
export default { isMigrationNeeded, runMigration, rollbackMigration };
