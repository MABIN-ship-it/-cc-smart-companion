/**
 * ProfileDashboard — 结构化用户画像展示
 *
 * 展示：
 *   - 身份信息（置信度条）
 *   - 心理画像维度（沟通风格/情绪模式/认知方式/动机）
 *   - 技能与兴趣
 *   - CC交互偏好
 *   - 统计摘要
 */

import { useMemo } from 'react';
import { normalizeProfileKey } from '../../knowledge/graph/KnowledgeGraph.js';

/** 通用 key→中文映射（合并自 KnowledgeGraph.PROFILE_KEY_CN） */
const KEY_CN = {
  name: '姓名', preferred_name: '偏好称呼', nickname: '昵称', alias: '别名',
  role: '角色', occupation: '职位', title: '头衔', job: '工作',
  location: '所在城市', city: '城市', country: '国家', region: '地区',
  organization: '组织', company: '公司', team: '团队', department: '部门',
  gender: '性别', age: '年龄', birthday: '生日', zodiac: '星座',
  language: '语言', timezone: '时区', education: '学历', background: '背景',
  prefer_response_length: '回复长度', prefer_detail_level: '详细程度',
  prefer_tone: '语气风格', prefer_code_style: '代码风格',
  prefer_explanation_depth: '解释深度', prefer_language: '偏好语言',
  prefer_examples: '偏好举例', prefer_humor: '幽默程度',
  prefer_emoji: 'Emoji使用', prefer_formality: '正式程度',
  prefer_initiative: '主动程度', prefer_brevity: '简洁度',
  prefer_proactive_assistant: '偏好主动助手',
  cc_interaction_style: '交互风格', cc_response_style: '回复风格',
  cc_perception: '对CC感受', creator_of_cc: 'CC的创作者',
  dislike_verbose: '厌恶啰嗦', dislike_vague: '厌恶模糊',
  dislike_repetition: '厌恶重复', need_technical_detail: '需求技术细节',
  need_quick_answer: '需求快速回答', need_step_by_step: '需求分步指导',
  skill: '技能', interest: '兴趣', hobby: '爱好',
  // 扩展 —— LLM可能生成的各种key
  interests: '兴趣领域', workplace: '工作地点',
  project_focus: '项目重点', project_focus_detail: '项目重点详情',
  technical_approach: '技术方案', technical_depth: '技术深度',
  proactive_assistant: '主动助手', assistant_mode: '助手模式',
  integration: '集成', feishu_integration: '飞书集成',
  code_assistance: '代码协助', work_style: '工作风格',
  communication_preference: '沟通偏好', task_preference: '任务偏好',
  monitoring_preference: '监测偏好', automation_preference: '自动化偏好',
  notification_preference: '通知偏好', tool_usage_preference: '工具使用偏好',
  learning_style: '学习风格', problem_solving: '解决问题方式',
  profession: '职业', expertise: '专长', domain: '领域',
  personality: '性格', personality_trait: '性格特质',
  work_mode: '工作模式', collaboration_style: '协作风格',
  feedback_style: '反馈风格', report_format: '报告格式',
  summary_style: '总结风格', response_style: '回复风格',
  startup_preference: '启动偏好', autonomy_level: '自主程度',
};

/** 常见英文单词→中文（逐词翻译回退用） */
const WORD_CN = {
  cute: '可爱', interaction: '互动', style: '风格', response: '回复',
  length: '长度', detail: '详细', level: '程度', tone: '语气',
  code: '代码', language: '语言', humor: '幽默', emoji: '表情',
  formality: '正式', initiative: '主动', brevity: '简洁',
  technical: '技术', quick: '快速', step: '步骤', answer: '回答',
  explanation: '解释', depth: '深度', example: '举例', use: '使用',
  vague: '模糊', verbose: '啰嗦', repetition: '重复',
  prefer: '偏好', need: '需求', dislike: '厌恶',
  name: '姓名', nickname: '昵称', role: '角色', job: '工作',
  location: '位置', city: '城市', country: '国家', region: '地区',
  organization: '组织', company: '公司', team: '团队',
  gender: '性别', age: '年龄', birthday: '生日',
  education: '学历', background: '背景', alias: '别名',
  cc: 'CC', perception: '感受', creator: '创作者',
  communication: '沟通', emotional: '情绪', pattern: '模式',
  cognitive: '认知', motivation: '动机', wellbeing: '健康',
  interest: '兴趣', domain: '领域', skill: '技能', hobby: '爱好',
  personality: '性格', trait: '特质', feeling: '感觉',
  // 扩展 —— 常见英语单词
  proactive: '主动', assistant: '助手', approach: '方案',
  focus: '重点', project: '项目', workplace: '工作',
  integration: '集成', monitoring: '监测', autonomous: '自主',
  framework: '框架', workflow: '流程', optimization: '优化',
  notification: '通知', automation: '自动化', collaboration: '协作',
  feedback: '反馈', summary: '总结', report: '报告',
  learning: '学习', problem: '问题', solving: '解决',
  profession: '职业', expertise: '专长', mode: '模式',
  tool: '工具', usage: '使用', startup: '启动',
  autonomy: '自主', config: '配置', setup: '设置',
  data: '数据', analysis: '分析', development: '开发',
  design: '设计', testing: '测试', deployment: '部署',
  security: '安全', performance: '性能', quality: '质量',
  documentation: '文档', research: '研究', support: '支持',
  management: '管理', planning: '规划', execution: '执行',
  review: '审查', tracking: '跟踪', logging: '日志',
  error: '错误', handling: '处理', recovery: '恢复',
  knowledge: '知识', information: '信息', content: '内容',
  file: '文件', path: '路径', folder: '文件夹',
  system: '系统', network: '网络', database: '数据库',
  api: 'API', web: 'Web', mobile: '移动', desktop: '桌面',
  server: '服务器', client: '客户端', cloud: '云',
  feishu: '飞书', wechat: '微信', dingtalk: '钉钉',
  slack: 'Slack', github: 'GitHub', gitlab: 'GitLab',
  positive: '正面', negative: '负面', neutral: '中性',
  explicit: '明确', implicit: '隐含', frequently: '频繁',
};

/** 逐词翻译下划线分隔的英文词组 */
function translateWords(text) {
  return text.split('_')
    .map(w => WORD_CN[w.toLowerCase()] || _capitalize(w))
    .join(' ');
}

/** 首字母大写 */
function _capitalize(word) {
  if (!word || word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** 尝试去复数形式查找 */
function _trySingular(word) {
  const lower = word.toLowerCase();
  if (lower.endsWith('ies') && lower.length > 4) return lower.slice(0, -3) + 'y';
  if (lower.endsWith('ses') && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 3) return lower.slice(0, -1);
  return null;
}

/** 翻译英文 key → 中文标签 */
function translateKey(key) {
  if (!key) return '';
  // 标准化（处理LLM可能返回的中文key）
  const std = normalizeProfileKey(key);
  // 直接匹配
  if (KEY_CN[std]) return KEY_CN[std];
  if (KEY_CN[key]) return KEY_CN[key];
  // 尝试单数形式匹配
  const singular = _trySingular(std);
  if (singular && KEY_CN[singular]) return KEY_CN[singular];
  // 按前缀匹配（去掉前缀后逐词翻译）
  if (std.startsWith('prefer_')) return '偏好' + translateWords(std.slice(7));
  if (std.startsWith('need_')) return '需求' + translateWords(std.slice(5));
  if (std.startsWith('dislike_')) return '厌恶' + translateWords(std.slice(8));
  if (std.startsWith('skill_')) return '技能: ' + translateWords(std.slice(6));
  if (std.startsWith('interest_')) return '兴趣: ' + translateWords(std.slice(9));
  if (std.startsWith('cc_')) return 'CC' + translateWords(std.slice(3));
  // 逐词英→中翻译（已内置首字母大写回退）
  return translateWords(std);
}

/** 获取字段的显示标签：优先 LLM 提供的 label，其次字典翻译 */
function getDisplayLabel(item) {
  if (item.label) return item.label;
  if (item.key) return translateKey(item.key);
  return '';
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  let color = '#ef4444';
  if (pct >= 80) color = '#22c55e';
  else if (pct >= 60) color = '#f59e0b';
  else if (pct >= 40) color = '#fb923c';

  return (
    <div className="kg-confidence-bar" title={`置信度 ${pct}%`}>
      <div className="kg-confidence-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function FieldRow({ label, value, confidence }) {
  return (
    <div className="kg-field-row">
      <span className="kg-field-key">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="kg-field-value">{String(value ?? '—')}</span>
        {confidence !== undefined && <ConfidenceBar value={confidence} />}
      </div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="kg-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function TraitTag({ trait, dimension }) {
  return <span className="kg-trait-tag" title={dimension}>{trait}</span>;
}

const DIMENSION_LABELS = {
  communication_style: '沟通风格',
  emotional_patterns: '情绪模式',
  cognitive_style: '认知方式',
  motivation: '动机驱力',
  wellbeing: '身心健康',
};

export default function ProfileDashboard({ dashboard }) {
  if (!dashboard) {
    return (
      <div className="kg-empty">
        <div className="kg-empty-icon">👤</div>
        <div className="kg-empty-text">暂无画像数据，多和CC聊天会自动生成</div>
      </div>
    );
  }

  const { identity, psychological, skills, interests, preferences, stats } = dashboard;

  const identityEntries = useMemo(() => {
    if (!identity) return [];
    return Object.entries(identity).map(([key, v]) => ({
      key,
      label: v.label || translateKey(key),
      value: v.value,
      confidence: v.confidence,
    }));
  }, [identity]);

  return (
    <div className="kg-dashboard">
      {/* 身份信息 */}
      {identityEntries.length > 0 && (
        <SectionCard title="身份信息">
          {identityEntries.map(e => (
            <FieldRow key={e.key} label={e.label} value={e.value} confidence={e.confidence} />
          ))}
        </SectionCard>
      )}

      {/* 心理画像 */}
      {psychological && Object.keys(psychological).length > 0 && (
        <SectionCard title="心理画像">
          {Object.entries(psychological).map(([dim, traits]) => {
            const traitList = Array.isArray(traits) ? traits : [traits];
            if (traitList.length === 0) return null;
            return (
              <div key={dim} className="kg-psych-dim">
                <h5>{DIMENSION_LABELS[dim] || dim}</h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {traitList.map((t, i) => (
                    <TraitTag key={i} trait={t.trait || t} dimension={dim} />
                  ))}
                </div>
                {traitList[0]?.confidence !== undefined && (
                  <div style={{ marginTop: 4 }}>
                    <ConfidenceBar value={traitList[0].confidence} />
                  </div>
                )}
              </div>
            );
          })}
        </SectionCard>
      )}

      {/* CC交互偏好 */}
      {preferences && preferences.length > 0 && (
        <SectionCard title="互动偏好">
          {preferences.map((p, i) => (
            <FieldRow
              key={i}
              label={p.label || translateKey(p.key) || `偏好${i + 1}`}
              value={p.value}
              confidence={p.confidence}
            />
          ))}
        </SectionCard>
      )}

      {/* 技能 */}
      {skills && skills.length > 0 && (
        <SectionCard title="技能">
          {skills.map((s, i) => (
            <FieldRow
              key={i}
              label={s.label || s.name || s.value || s.key}
              value={s.confidence ? `${Math.round(s.confidence * 100)}%` : ''}
              confidence={s.confidence}
            />
          ))}
        </SectionCard>
      )}

      {/* 兴趣领域 */}
      {interests && interests.length > 0 && (
        <SectionCard title="兴趣领域">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {interests.map((item, i) => (
              <span key={i} className="kg-trait-tag" style={{
                background: 'rgba(236, 72, 153, 0.12)',
                color: '#ec4899',
              }} title={item.label || item.key || ''}>
                {item.name || item.label || item.key || item}
                {item.strength ? ` (${Math.round(item.strength * 100)}%)` : ''}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 统计 */}
      {stats && (
        <SectionCard title="数据统计">
          <FieldRow label="画像事实数" value={stats.totalFacts || 0} />
          <FieldRow label="心理观察数" value={stats.psychObservations || 0} />
          <FieldRow label="高置信度字段" value={stats.highConfidenceFields || 0} />
        </SectionCard>
      )}

      {/* 完全空状态 */}
      {!identityEntries.length && (!psychological || !Object.keys(psychological).length) &&
       (!preferences || !preferences.length) && (!skills || !skills.length) &&
       (!interests || !interests.length) && (
        <div className="kg-empty">
          <div className="kg-empty-icon">👤</div>
          <div className="kg-empty-text">暂无画像数据</div>
        </div>
      )}
    </div>
  );
}
