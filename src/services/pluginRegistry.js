/**
 * CC 插件注册表
 * 飞书代码不动，只加注册。以后微信/钉钉等插件也在这里注册。
 * 工具箱 UI 从注册表渲染。
 */

import { FEISHU_TOOLS, FEISHU_EXECUTORS } from './feishuTools';

const PLUGIN_REGISTRY = {
  feishu: {
    id: 'feishu',
    name: '飞书',
    icon: '📨',
    subtitle: '消息·文档·多维表格',
    installed: true,
    connected: false,
    tools: FEISHU_TOOLS,
    executors: FEISHU_EXECUTORS,
  },
  wechat: {
    id: 'wechat',
    name: '微信',
    icon: '💬',
    subtitle: '消息·联系人',
    installed: false,
    connected: false,
    tools: [],
    executors: {},
    installHint: '安装 Chatlog 后即可获取微信消息',
  },
};

export function getPlugins() { return { ...PLUGIN_REGISTRY }; }

export function getPlugin(id) { return PLUGIN_REGISTRY[id] || null; }

export function getInstalledPlugins() {
  return Object.values(PLUGIN_REGISTRY).filter(p => p.installed);
}

export function getPluginTools() {
  const tools = [];
  for (const p of Object.values(PLUGIN_REGISTRY)) {
    if (p.installed && p.tools) tools.push(...p.tools);
  }
  return tools;
}

export function getPluginExecutors() {
  const executors = {};
  for (const p of Object.values(PLUGIN_REGISTRY)) {
    if (p.installed && p.executors) Object.assign(executors, p.executors);
  }
  return executors;
}

export function setPluginConnected(pluginId, status) {
  if (PLUGIN_REGISTRY[pluginId]) {
    PLUGIN_REGISTRY[pluginId].connected = status;
  }
}

export default PLUGIN_REGISTRY;
