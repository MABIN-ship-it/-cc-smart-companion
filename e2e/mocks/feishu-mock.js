/**
 * 飞书 API Mock 服务器
 * 用于 E2E 测试中模拟飞书开放平台 API 响应
 * 启动：node e2e/mocks/feishu-mock.js
 * 端口：18888
 */
const http = require('http');

const PORT = 18888;
const TOKEN = 'mock-t-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const OPEN_ID = 'ou_mock123456789';
const TENANT = 'mocktenant';

// 预设响应数据
const responses = {
  // 获取 tenant_access_token
  '/open-apis/auth/v3/tenant_access_token/internal': (method) => ({
    code: 0, msg: 'success',
    tenant_access_token: TOKEN,
    expire: 7200,
  }),

  // 获取用户信息
  '/open-apis/contact/v3/users/me': () => ({
    code: 0, msg: 'success',
    data: { user: { open_id: OPEN_ID, name: '测试用户', avatar_url: '' } },
  }),

  // 发送消息
  '/open-apis/im/v1/messages': (method, body) => ({
    code: 0, msg: 'success',
    data: { message_id: `om_mock${Date.now()}`, root_id: '', parent_id: '' },
  }),

  // 上传图片
  '/open-apis/im/v1/images': () => ({
    code: 0, msg: 'success',
    data: { image_key: `img_mock${Date.now()}` },
  }),

  // 上传文件
  '/open-apis/im/v1/files': () => ({
    code: 0, msg: 'success',
    data: { file_key: `file_mock${Date.now()}` },
  }),

  // 创建多维表格
  '/bitable/v1/apps': (method, body) => ({
    code: 0, msg: 'success',
    data: { app: { app_token: `bascn_mock${Date.now()}`, name: body?.name || '测试表格', url: `https://${TENANT}.feishu.cn/base/bascn_mock` } },
  }),

  // 添加数据表
  '/bitable/v1/apps/([^/]+)/tables': () => ({
    code: 0, msg: 'success',
    data: { table: { table_id: `tbl_mock${Date.now()}`, name: 'Sheet1' } },
  }),

  // 批量写入记录
  '/bitable/v1/apps/([^/]+)/tables/([^/]+)/records/batch_create': (method, body) => ({
    code: 0, msg: 'success',
    data: { records: (body?.records || []).map((r, i) => ({ record_id: `rec_mock${i}`, fields: r.fields })) },
  }),

  // 列出字段
  '/bitable/v1/apps/([^/]+)/tables/([^/]+)/fields': () => ({
    code: 0, msg: 'success',
    data: { items: [{ field_id: 'fld_mock1', field_name: '名称', type: 1 }, { field_id: 'fld_mock2', field_name: '金额', type: 22 }] },
  }),

  // 创建视图
  '/bitable/v1/apps/([^/]+)/tables/([^/]+)/views': () => ({
    code: 0, msg: 'success',
    data: { view: { view_id: 'vew_mock', view_name: '表格视图', view_type: 'grid' } },
  }),

  // 创建仪表盘
  '/bitable/v1/apps/([^/]+)/tables/([^/]+)/dashboards': () => ({
    code: 0, msg: 'success',
    data: { dashboard: { dashboard_id: `dash_mock${Date.now()}` } },
  }),

  // 云文档
  '/open-apis/drive/v1/files': () => ({
    code: 0, msg: 'success',
    data: { files: [{ token: 'mock_file_token', name: '测试文件', url: 'https://mock.feishu.cn/docx/mock' }] },
  }),

  // 通讯录搜索
  '/open-apis/contact/v3/users': () => ({
    code: 0, msg: 'success',
    data: { items: [{ open_id: OPEN_ID, name: '测试用户' }] },
    has_more: false,
  }),

  // 权限检测
  '/open-apis/auth/v3/app_access_token/internal': () => ({
    code: 0, msg: 'success',
    app_access_token: TOKEN,
    expire: 7200,
  }),

  // 消息列表
  '/open-apis/im/v1/messages': () => ({
    code: 0, msg: 'success',
    data: { items: [], has_more: false },
  }),

  // 群列表
  '/open-apis/im/v1/chats': () => ({
    code: 0, msg: 'success',
    data: { items: [], has_more: false },
  }),

  // 云盘导入
  '/open-apis/drive/v1/import_tasks': () => ({
    code: 0, msg: 'success',
    data: { ticket: 'mock_ticket_123' },
  }),
};

function matchPath(actualPath) {
  // 先精确匹配
  if (responses[actualPath]) return responses[actualPath];

  // 再正则匹配
  for (const pattern of Object.keys(responses)) {
    if (pattern.includes('(')) {
      const re = new RegExp(`^${pattern}$`);
      if (re.test(actualPath)) return responses[pattern];
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let jsonBody = null;
    try { if (body) jsonBody = JSON.parse(body); } catch {}

    // Auth 检查（简单 mock）
    const auth = req.headers['authorization'];
    if (auth && !auth.includes('mock') && !auth.includes(TOKEN)) {
      res.writeHead(401);
      res.end(JSON.stringify({ code: 99991663, msg: 'invalid token' }));
      return;
    }

    const handler = matchPath(pathname);
    if (handler) {
      const response = handler(method, jsonBody);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } else {
      // 未匹配的路径返回默认成功
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, msg: 'ok (mock)', data: { _mock: true, path: pathname } }));
    }
  });
});

function start() {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[FeishuMock] Mock 飞书 API 服务器已启动: http://localhost:${PORT}`);
      console.log(`[FeishuMock] 覆盖 30+ 飞书 API 端点`);
      resolve({ server, port: PORT });
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('[FeishuMock] 服务器已关闭');
      resolve();
    });
  });
}

if (require.main === module) {
  start();
  process.on('SIGINT', () => { stop().then(() => process.exit(0)); });
  process.on('SIGTERM', () => { stop().then(() => process.exit(0)); });
}

module.exports = { start, stop, PORT };
