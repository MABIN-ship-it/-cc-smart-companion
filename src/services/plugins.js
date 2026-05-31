import { getDefaultScript } from './websiteBuilder.js';

// Website Templates
export const websiteTemplates = {
  blog: {
    name: '个人博客',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的博客</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header>
    <div class="container">
      <h1>我的博客</h1>
      <nav>
        <a href="#">首页</a>
        <a href="#">归档</a>
        <a href="#">关于</a>
      </nav>
      <button class="theme-toggle" onclick="toggleTheme()" title="切换主题">🌓</button>
    </div>
  </header>
  <main class="container">
    <article class="post">
      <h2>欢迎来到我的博客</h2>
      <div class="post-meta">2026年5月24日 · 作者：博主</div>
      <p>这是CC帮我搭建的个人博客。开始写作吧！</p>
    </article>
    <article class="post">
      <h2>第二篇文章</h2>
      <div class="post-meta">2026年5月20日 · 作者：博主</div>
      <p>一篇关于技术与生活的文章。</p>
    </article>
  </main>
  <footer>
    <div class="container">
      <p>&copy; 2026 我的博客 | Powered by CC</p>
    </div>
  </footer>
  <script src="js/main.js"></script>
</body>
</html>`,
      'css/style.css': `/* CC生成的博客样式 */
*{margin:0;padding:0;box-sizing:border-box;}

:root{
  --bg:#f8f9fa;
  --surface:#fff;
  --text:#333;
  --text-muted:#888;
  --primary:#6c5ce7;
  --primary-light:#a29bfe;
  --border:#e5e5e5;
  --shadow:0 2px 12px rgba(0,0,0,0.06);
}

[data-theme="dark"]{
  --bg:#1a1a2e;
  --surface:#16213e;
  --text:#e0e0e0;
  --text-muted:#888;
  --border:#2a2a4a;
  --shadow:0 2px 12px rgba(0,0,0,0.3);
}

body{
  font-family:"Microsoft YaHei","PingFang SC",sans-serif;
  background:var(--bg);
  color:var(--text);
  line-height:1.8;
  transition:background 0.3s,color 0.3s;
}

.container{max-width:800px;margin:0 auto;padding:0 20px;}

header{
  background:linear-gradient(135deg,var(--primary),var(--primary-light));
  color:#fff;
  padding:48px 0 24px;
  text-align:center;
}
header .container{display:flex;flex-direction:column;align-items:center;gap:16px;}
header h1{font-size:2.2em;}
nav{display:flex;gap:24px;}
nav a{color:rgba(255,255,255,0.9);text-decoration:none;font-size:1.05em;transition:color 0.2s;}
nav a:hover{color:#fff;}
.theme-toggle{
  background:rgba(255,255,255,0.15);
  border:none;color:#fff;font-size:1.2em;cursor:pointer;
  padding:6px 12px;border-radius:20px;transition:background 0.2s;
}
.theme-toggle:hover{background:rgba(255,255,255,0.3);}

main{margin:40px auto;}

.post{
  background:var(--surface);
  padding:32px;
  border-radius:12px;
  box-shadow:var(--shadow);
  margin-bottom:24px;
  border:1px solid var(--border);
}
.post h2{margin-bottom:8px;color:var(--primary);}
.post-meta{color:var(--text-muted);font-size:0.9em;margin-bottom:16px;}

footer{
  text-align:center;
  padding:32px 20px;
  color:var(--text-muted);
  border-top:1px solid var(--border);
}

@media(max-width:768px){
  header h1{font-size:1.6em;}
  nav{gap:12px;flex-wrap:wrap;justify-content:center;}
  .post{padding:20px;}
}

.nav-toggle{display:none;background:none;border:none;color:#fff;font-size:1.6em;cursor:pointer;}
@media(max-width:600px){
  .nav-toggle{display:block;}
  nav{display:none;flex-direction:column;align-items:center;width:100%;gap:8px;}
  nav.open{display:flex;}
}`,
      'js/main.js': `function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme');
  const next=current==='dark'?'':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
}

(function(){
  const saved=localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);

  const nav=document.querySelector('nav');
  if(nav){
    const toggle=document.querySelector('.nav-toggle');
    if(toggle){
      toggle.addEventListener('click',()=>nav.classList.toggle('open'));
    }
  }
})();`,
    },
  },
  landing: {
    name: '产品落地页',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>产品名称 - 让工作更智能</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header>
    <div class="container">
      <span class="logo">产品名称</span>
      <nav>
        <a href="#features">功能</a>
        <a href="#pricing">价格</a>
        <a href="#contact">联系</a>
      </nav>
      <button class="theme-toggle" onclick="toggleTheme()" title="切换主题">🌓</button>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <h1>让工作更智能</h1>
      <p>一款革命性的AI工具，帮你提升效率、节省时间、创造更多价值。</p>
      <div class="hero-btns">
        <a href="#" class="btn-primary">立即体验</a>
        <a href="#" class="btn-outline">了解更多</a>
      </div>
    </div>
  </section>

  <section id="features" class="features">
    <div class="container">
      <h2>核心功能</h2>
      <div class="feature-grid">
        <div class="feature">
          <div class="feature-icon">⚡</div>
          <h3>高效</h3>
          <p>自动化繁琐任务，释放你的时间</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🧠</div>
          <h3>智能</h3>
          <p>AI驱动决策，数据精准分析</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🎯</div>
          <h3>简单</h3>
          <p>零学习成本，开箱即用</p>
        </div>
      </div>
    </div>
  </section>

  <section id="pricing" class="pricing">
    <div class="container">
      <h2>价格方案</h2>
      <div class="pricing-grid">
        <div class="pricing-card">
          <h3>基础版</h3>
          <div class="price">免费</div>
          <ul>
            <li>基础功能</li>
            <li>5GB存储</li>
            <li>邮件支持</li>
          </ul>
          <a href="#" class="btn-primary">开始使用</a>
        </div>
        <div class="pricing-card featured">
          <h3>专业版</h3>
          <div class="price">¥99<small>/月</small></div>
          <ul>
            <li>全部功能</li>
            <li>50GB存储</li>
            <li>优先支持</li>
            <li>API接入</li>
          </ul>
          <a href="#" class="btn-primary">立即订阅</a>
        </div>
        <div class="pricing-card">
          <h3>企业版</h3>
          <div class="price">¥299<small>/月</small></div>
          <ul>
            <li>无限存储</li>
            <li>专属客服</li>
            <li>定制开发</li>
            <li>SLA保障</li>
          </ul>
          <a href="#" class="btn-primary">联系我们</a>
        </div>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <p>&copy; 2026 产品名称 | Powered by CC</p>
    </div>
  </footer>
  <script src="js/main.js"></script>
</body>
</html>`,
      'css/style.css': `*{margin:0;padding:0;box-sizing:border-box;}

:root{
  --bg:#fff;
  --surface:#f8f9fa;
  --text:#333;
  --text-muted:#666;
  --primary:#6c5ce7;
  --primary-light:#a29bfe;
  --dark:#0a0a0f;
  --border:#e5e5e5;
}

[data-theme="dark"]{
  --bg:#0a0a0f;
  --surface:#1a1a2e;
  --text:#e0e0e0;
  --text-muted:#999;
  --border:#2a2a4a;
}

body{
  font-family:"Microsoft YaHei","PingFang SC",sans-serif;
  background:var(--bg);
  color:var(--text);
  line-height:1.7;
  transition:background 0.3s,color 0.3s;
}

.container{max-width:1100px;margin:0 auto;padding:0 24px;}

header{
  background:var(--dark);
  color:#fff;
  padding:16px 0;
  position:sticky;top:0;z-index:100;
}
header .container{display:flex;align-items:center;justify-content:space-between;}
.logo{font-size:1.2em;font-weight:bold;}
nav{display:flex;gap:24px;}
nav a{color:rgba(255,255,255,0.8);text-decoration:none;transition:color 0.2s;}
nav a:hover{color:#fff;}
.theme-toggle{background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:1.1em;cursor:pointer;padding:4px 10px;border-radius:16px;}
.theme-toggle:hover{background:rgba(255,255,255,0.2);}

.hero{
  background:linear-gradient(135deg,var(--dark),#1a1a30);
  color:#fff;
  text-align:center;
  padding:100px 24px;
}
.hero h1{font-size:3em;margin-bottom:16px;}
.hero p{font-size:1.2em;opacity:0.85;margin-bottom:40px;max-width:600px;margin-left:auto;margin-right:auto;}
.hero-btns{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;}
.btn-primary{
  display:inline-block;
  padding:14px 36px;
  background:linear-gradient(135deg,var(--primary),var(--primary-light));
  color:#fff;
  border-radius:30px;
  text-decoration:none;
  font-size:1.05em;
  transition:transform 0.2s,box-shadow 0.2s;
  cursor:pointer;
}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(108,92,231,0.4);}
.btn-outline{
  display:inline-block;
  padding:14px 36px;
  border:2px solid rgba(255,255,255,0.4);
  color:#fff;
  border-radius:30px;
  text-decoration:none;
  font-size:1.05em;
  transition:all 0.2s;
}
.btn-outline:hover{border-color:#fff;}

.features{padding:80px 24px;}
.features h2,.pricing h2{text-align:center;font-size:2em;margin-bottom:48px;color:var(--text);}
.feature-grid,.pricing-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:32px;
}
.feature{
  text-align:center;
  padding:40px 24px;
  background:var(--surface);
  border-radius:16px;
  border:1px solid var(--border);
  transition:transform 0.3s,box-shadow 0.3s;
}
.feature:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,0.08);}
.feature-icon{font-size:2.5em;margin-bottom:16px;}
.feature h3{color:var(--primary);margin-bottom:8px;font-size:1.3em;}
.feature p{color:var(--text-muted);}

.pricing{padding:80px 24px;background:var(--surface);}
.pricing-card{
  background:var(--bg);
  padding:40px 32px;
  border-radius:16px;
  text-align:center;
  border:2px solid var(--border);
  transition:transform 0.3s;
}
.pricing-card:hover{transform:translateY(-4px);}
.pricing-card.featured{border-color:var(--primary);box-shadow:0 4px 24px rgba(108,92,231,0.15);}
.pricing-card h3{font-size:1.3em;margin-bottom:8px;}
.price{font-size:2.5em;font-weight:bold;color:var(--primary);margin:16px 0;}
.price small{font-size:0.4em;color:var(--text-muted);font-weight:normal;}
.pricing-card ul{list-style:none;margin:24px 0;text-align:left;padding:0;}
.pricing-card li{padding:8px 0;border-bottom:1px solid var(--border);color:var(--text-muted);}
.pricing-card li::before{content:"✓ ";color:var(--primary);font-weight:bold;}
.pricing-card .btn-primary{margin-top:8px;}

footer{text-align:center;padding:32px;background:var(--dark);color:var(--text-muted);}

@media(max-width:768px){
  .hero h1{font-size:2em;}
  .hero p{font-size:1em;}
  header .container{flex-wrap:wrap;gap:12px;}
  nav{gap:12px;flex-wrap:wrap;justify-content:center;}
  .feature-grid,.pricing-grid{grid-template-columns:1fr;}
}

.nav-toggle{display:none;}
@media(max-width:600px){
  .nav-toggle{display:block;background:none;border:none;color:#fff;font-size:1.6em;cursor:pointer;}
  header nav{display:none;width:100%;flex-direction:column;align-items:center;gap:8px;padding-top:12px;}
  header nav.open{display:flex;}
}`,
      'js/main.js': `function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme');
  const next=current==='dark'?'':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
}

(function(){
  const saved=localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);

  const headerNav=document.querySelector('header nav');
  if(headerNav){
    const toggle=document.querySelector('.nav-toggle');
    if(toggle){
      toggle.addEventListener('click',()=>headerNav.classList.toggle('open'));
    }
  }

  document.querySelectorAll('a[href^="#"]').forEach(link=>{
    link.addEventListener('click',e=>{
      const target=document.querySelector(link.getAttribute('href'));
      if(target){e.preventDefault();target.scrollIntoView({behavior:'smooth'});}
    });
  });

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting) entry.target.classList.add('visible');
    });
  },{threshold:0.1});
  document.querySelectorAll('.feature,.pricing-card').forEach(el=>{
    el.style.opacity='0';
    el.style.transform='translateY(20px)';
    el.style.transition='all 0.6s ease';
    observer.observe(el);
  });
  const s=document.createElement('style');
  s.textContent='.visible{opacity:1!important;transform:translateY(0)!important;}';
  document.head.appendChild(s);
})();`,
    },
  },
  portfolio: {
    name: '个人作品集',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的作品集</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header>
    <div class="container">
      <h1>我的作品集</h1>
      <p>记录创意与成长</p>
      <button class="theme-toggle" onclick="toggleTheme()" title="切换主题">🌓</button>
    </div>
  </header>

  <section class="filter-bar">
    <div class="container">
      <button class="filter-btn active" data-category="all">全部</button>
      <button class="filter-btn" data-category="web">网页设计</button>
      <button class="filter-btn" data-category="app">应用开发</button>
      <button class="filter-btn" data-category="design">平面设计</button>
    </div>
  </section>

  <section class="gallery">
    <div class="container">
      <div class="card" data-category="web">
        <div class="card-img" style="background:linear-gradient(135deg,#6c5ce7,#a29bfe)"></div>
        <h3>项目一</h3>
        <p>一个响应式的企业官网设计</p>
      </div>
      <div class="card" data-category="app">
        <div class="card-img" style="background:linear-gradient(135deg,#00cec9,#81ecec)"></div>
        <h3>项目二</h3>
        <p>跨平台移动应用开发</p>
      </div>
      <div class="card" data-category="design">
        <div class="card-img" style="background:linear-gradient(135deg,#fd79a8,#fab1a0)"></div>
        <h3>项目三</h3>
        <p>品牌视觉识别系统设计</p>
      </div>
      <div class="card" data-category="web">
        <div class="card-img" style="background:linear-gradient(135deg,#fdcb6e,#ffeaa7)"></div>
        <h3>项目四</h3>
        <p>电商平台前端架构</p>
      </div>
      <div class="card" data-category="app">
        <div class="card-img" style="background:linear-gradient(135deg,#74b9ff,#a29bfe)"></div>
        <h3>项目五</h3>
        <p>智能家居控制面板</p>
      </div>
      <div class="card" data-category="design">
        <div class="card-img" style="background:linear-gradient(135deg,#55efc4,#00b894)"></div>
        <h3>项目六</h3>
        <p>活动海报系列设计</p>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <p>&copy; 2026 我的作品集 | Powered by CC</p>
    </div>
  </footer>
  <script src="js/main.js"></script>
</body>
</html>`,
      'css/style.css': `*{margin:0;padding:0;box-sizing:border-box;}

:root{
  --bg:#f8f9fa;
  --surface:#fff;
  --text:#333;
  --text-muted:#888;
  --primary:#6c5ce7;
  --border:#e5e5e5;
}

[data-theme="dark"]{
  --bg:#1a1a2e;
  --surface:#16213e;
  --text:#e0e0e0;
  --text-muted:#888;
  --border:#2a2a4a;
}

body{
  font-family:"Microsoft YaHei","PingFang SC",sans-serif;
  background:var(--bg);
  color:var(--text);
  line-height:1.7;
  transition:background 0.3s,color 0.3s;
}

.container{max-width:1100px;margin:0 auto;padding:0 24px;}

header{
  background:linear-gradient(135deg,#2d3436,#636e72);
  color:#fff;
  text-align:center;
  padding:80px 24px;
}
header h1{font-size:2.5em;margin-bottom:8px;}
header p{opacity:0.75;font-size:1.1em;}
.theme-toggle{
  background:rgba(255,255,255,0.15);
  border:none;color:#fff;font-size:1.2em;cursor:pointer;
  padding:6px 12px;border-radius:20px;
  margin-top:16px;transition:background 0.2s;
}
.theme-toggle:hover{background:rgba(255,255,255,0.3);}

.filter-bar{padding:24px 0;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50;}
.filter-bar .container{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
.filter-btn{
  padding:8px 20px;
  border:2px solid var(--border);
  border-radius:24px;
  background:var(--bg);
  color:var(--text);
  cursor:pointer;
  font-size:0.95em;
  transition:all 0.2s;
}
.filter-btn:hover,.filter-btn.active{
  border-color:var(--primary);
  background:var(--primary);
  color:#fff;
}

.gallery{padding:48px 0;}
.gallery .container{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
  gap:28px;
}
.card{
  background:var(--surface);
  border-radius:16px;
  overflow:hidden;
  box-shadow:0 4px 20px rgba(0,0,0,0.06);
  transition:transform 0.3s,box-shadow 0.3s;
  cursor:pointer;
}
.card:hover{transform:translateY(-6px);box-shadow:0 8px 30px rgba(0,0,0,0.1);}
.card-img{height:200px;}
.card h3{font-size:1.2em;margin:16px 20px 8px;}
.card p{color:var(--text-muted);margin:0 20px 20px;}

footer{text-align:center;padding:32px;color:var(--text-muted);border-top:1px solid var(--border);}

@media(max-width:768px){
  header h1{font-size:1.8em;}
  .gallery .container{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));}
}`,
      'js/main.js': `function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme');
  const next=current==='dark'?'':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
}

(function(){
  const saved=localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);

  const filterBtns=document.querySelectorAll('.filter-btn');
  const cards=document.querySelectorAll('.card');
  filterBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      filterBtns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const cat=btn.dataset.category;
      cards.forEach(card=>{
        card.style.display=(cat==='all'||card.dataset.category===cat)?'':'none';
      });
    });
  });
})();`,
    },
  },
  docs: {
    name: '文档站',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>项目文档</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h2>文档目录</h2>
      <button class="theme-toggle" onclick="toggleTheme()" title="切换主题">🌓</button>
    </div>
    <nav>
      <a href="#intro" class="active">项目介绍</a>
      <a href="#start">快速开始</a>
      <a href="#guide">使用指南</a>
      <a href="#api">API参考</a>
      <a href="#faq">常见问题</a>
    </nav>
  </aside>
  <button class="sidebar-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
  <main>
    <section id="intro">
      <h1>项目介绍</h1>
      <p>欢迎使用本项目。这里记录完整的使用文档和开发指南，帮助你快速上手。</p>
      <div class="callout info">本项目采用MIT开源协议，欢迎贡献代码。</div>
    </section>
    <section id="start">
      <h2>快速开始</h2>
      <p>只需几步即可在你的项目中集成：</p>
      <pre><code>git clone https://github.com/example/project.git
cd project
npm install
npm start</code></pre>
    </section>
    <section id="guide">
      <h2>使用指南</h2>
      <p>详细的使用说明将帮助你快速上手。以下是一些基础操作：</p>
      <h3>基础配置</h3>
      <p>在项目根目录创建 config.json，填写必要的配置项。</p>
      <h3>运行项目</h3>
      <p>使用 <code>npm start</code> 启动开发服务器，默认访问 http://localhost:3000</p>
    </section>
    <section id="api">
      <h2>API参考</h2>
      <p>完整的API接口文档如下：</p>
      <h3>GET /api/v1/users</h3>
      <p>获取用户列表，支持分页和筛选参数。</p>
      <pre><code>curl -X GET "http://localhost:3000/api/v1/users?page=1&limit=20"</code></pre>
      <h3>POST /api/v1/users</h3>
      <p>创建新用户。</p>
      <pre><code>curl -X POST "http://localhost:3000/api/v1/users" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"张三","email":"zhangsan@example.com"}'</code></pre>
    </section>
    <section id="faq">
      <h2>常见问题</h2>
      <div class="faq-item">
        <h3>如何升级到最新版本？</h3>
        <p>运行 <code>npm update</code> 即可升级所有依赖。建议在升级前备份配置文件。</p>
      </div>
      <div class="faq-item">
        <h3>遇到报错怎么办？</h3>
        <p>请先检查Node.js版本是否≥18，然后清除缓存：<code>npm cache clean --force</code></p>
      </div>
    </section>
  </main>
  <script src="js/main.js"></script>
</body>
</html>`,
      'css/style.css': `*{margin:0;padding:0;box-sizing:border-box;}

:root{
  --bg:#fff;
  --surface:#f8f9fa;
  --sidebar-bg:#1a1a2e;
  --sidebar-text:#ccc;
  --text:#333;
  --text-muted:#666;
  --primary:#6c5ce7;
  --primary-light:#a29bfe;
  --border:#e5e5e5;
  --code-bg:#1a1a2e;
}

[data-theme="dark"]{
  --bg:#0d1117;
  --surface:#161b22;
  --text:#e0e0e0;
  --text-muted:#999;
  --border:#30363d;
  --code-bg:#0d1117;
}

body{
  font-family:"Microsoft YaHei","PingFang SC",sans-serif;
  background:var(--bg);
  color:var(--text);
  line-height:1.8;
  display:flex;
  min-height:100vh;
  transition:background 0.3s,color 0.3s;
}

.sidebar{
  width:260px;
  background:var(--sidebar-bg);
  color:#fff;
  padding:32px 20px;
  position:fixed;
  top:0;left:0;bottom:0;
  overflow-y:auto;
  z-index:100;
  transition:transform 0.3s;
}
.sidebar-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;}
.sidebar h2{font-size:1.2em;color:var(--primary-light);}
.theme-toggle{background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:1em;cursor:pointer;padding:4px 8px;border-radius:12px;transition:background 0.2s;}
.theme-toggle:hover{background:rgba(255,255,255,0.2);}
.sidebar nav a{
  display:block;
  color:var(--sidebar-text);
  text-decoration:none;
  padding:8px 12px;
  border-radius:8px;
  margin-bottom:4px;
  transition:all 0.2s;
}
.sidebar nav a:hover,.sidebar nav a.active{background:rgba(108,92,231,0.25);color:#fff;}

main{flex:1;margin-left:260px;padding:60px 40px;max-width:900px;}
section{margin-bottom:48px;}
section h1{font-size:2em;margin-bottom:12px;color:var(--text);}
section h2{font-size:1.5em;margin:28px 0 12px;color:var(--primary);}
section h3{font-size:1.15em;margin:20px 0 8px;color:var(--text);}
p{color:var(--text);margin-bottom:12px;}
pre{
  background:var(--code-bg);
  color:var(--primary-light);
  padding:20px;
  border-radius:12px;
  overflow-x:auto;
  font-size:14px;
  line-height:1.6;
  margin:12px 0;
}
code{font-family:"Consolas","Courier New",monospace;}
.callout{padding:16px 20px;border-radius:10px;margin:16px 0;}
.callout.info{background:rgba(108,92,231,0.08);border-left:4px solid var(--primary);}
.faq-item{background:var(--surface);padding:20px 24px;border-radius:12px;margin-bottom:12px;border:1px solid var(--border);}

.sidebar-toggle{display:none;position:fixed;top:12px;left:12px;z-index:200;background:var(--primary);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:1.4em;cursor:pointer;}

@media(max-width:768px){
  .sidebar{transform:translateX(-100%);}
  .sidebar.open{transform:translateX(0);}
  .sidebar-toggle{display:block;}
  main{margin-left:0;padding:50px 20px 30px;}
  section h1{font-size:1.6em;}
}`,
      'js/main.js': `function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme');
  const next=current==='dark'?'':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
}

(function(){
  const saved=localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);

  const sections=document.querySelectorAll('main section[id]');
  const navLinks=document.querySelectorAll('.sidebar nav a');

  if(sections.length&&navLinks.length){
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          navLinks.forEach(link=>link.classList.remove('active'));
          const active=document.querySelector('.sidebar nav a[href="#'+entry.target.id+'"]');
          if(active) active.classList.add('active');
        }
      });
    },{rootMargin:'-20% 0px -70% 0px'});
    sections.forEach(s=>observer.observe(s));
  }

  navLinks.forEach(link=>{
    link.addEventListener('click',e=>{
      e.preventDefault();
      const target=document.querySelector(link.getAttribute('href'));
      if(target){target.scrollIntoView({behavior:'smooth'});}
      document.getElementById('sidebar')?.classList.remove('open');
    });
  });

  document.querySelector('main')?.addEventListener('click',()=>{
    document.getElementById('sidebar')?.classList.remove('open');
  });
})();`,
    },
  },
  business: {
    name: '企业官网',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>公司名称 - 专业企业服务</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header>
    <div class="container">
      <div class="header-left">
        <span class="logo">公司名称</span>
        <nav>
          <a href="#home">首页</a>
          <a href="#services">服务</a>
          <a href="#cases">案例</a>
          <a href="#about">关于</a>
          <a href="#contact">联系</a>
        </nav>
      </div>
      <div class="header-right">
        <button class="theme-toggle" onclick="toggleTheme()" title="切换主题">🌓</button>
        <a href="#contact" class="btn-primary btn-sm">咨询我们</a>
      </div>
    </div>
  </header>

  <section id="home" class="hero">
    <div class="container">
      <h1>专业的企业数字化解决方案</h1>
      <p>十余年行业经验，服务超过500家企业客户，助力业务数字化转型与增长</p>
      <div class="hero-stats">
        <div class="stat"><strong>500+</strong><span>服务客户</span></div>
        <div class="stat"><strong>98%</strong><span>客户满意度</span></div>
        <div class="stat"><strong>50+</strong><span>技术专家</span></div>
      </div>
      <div class="hero-btns">
        <a href="#contact" class="btn-primary">免费咨询</a>
        <a href="#services" class="btn-outline">了解服务</a>
      </div>
    </div>
  </section>

  <section id="services" class="services">
    <div class="container">
      <div class="section-header">
        <h2>核心服务</h2>
        <p>从咨询到落地，一站式解决企业技术需求</p>
      </div>
      <div class="service-grid">
        <div class="service-card"><div class="service-icon">🌐</div><h3>网站建设</h3><p>响应式企业官网、电商平台、门户网站定制开发</p></div>
        <div class="service-card"><div class="service-icon">📱</div><h3>移动开发</h3><p>iOS/Android原生应用、小程序、跨平台解决方案</p></div>
        <div class="service-card"><div class="service-icon">☁️</div><h3>云服务</h3><p>云架构设计、迁移、运维，降低IT成本提升可靠性</p></div>
        <div class="service-card"><div class="service-icon">🤖</div><h3>AI解决方案</h3><p>智能客服、数据分析、流程自动化，AI赋能业务</p></div>
        <div class="service-card"><div class="service-icon">🔒</div><h3>网络安全</h3><p>安全评估、渗透测试、合规咨询，守护企业数字资产</p></div>
        <div class="service-card"><div class="service-icon">📊</div><h3>数据服务</h3><p>数据仓库、BI报表、大数据分析，让数据说话</p></div>
      </div>
    </div>
  </section>

  <section id="cases" class="cases">
    <div class="container">
      <div class="section-header">
        <h2>成功案例</h2>
        <p>与行业领先企业的合作成果</p>
      </div>
      <div class="case-grid">
        <div class="case-card">
          <div class="case-img" style="background:linear-gradient(135deg,#6c5ce7,#a29bfe)"></div>
          <div class="case-body"><span class="case-tag">零售行业</span><h3>某大型连锁商城数字化升级</h3><p>线上线下全渠道打通，销售额提升40%</p></div>
        </div>
        <div class="case-card">
          <div class="case-img" style="background:linear-gradient(135deg,#00cec9,#81ecec)"></div>
          <div class="case-body"><span class="case-tag">制造业</span><h3>智能工厂MES系统</h3><p>生产效率提升35%，质量不良率降低60%</p></div>
        </div>
        <div class="case-card">
          <div class="case-img" style="background:linear-gradient(135deg,#fd79a8,#fab1a0)"></div>
          <div class="case-body"><span class="case-tag">金融科技</span><h3>银行核心系统云迁移</h3><p>零停机迁移，IT成本降低50%</p></div>
        </div>
      </div>
    </div>
  </section>

  <section id="about" class="about">
    <div class="container">
      <div class="about-grid">
        <div class="about-text">
          <h2>关于我们</h2>
          <p>公司名称成立于2015年，总部位于北京，在全国设有5个分支机构。我们致力于为企业提供专业的技术解决方案和数字化转型服务。</p>
          <p>公司拥有一支由50余名技术专家组成的核心团队，涵盖架构设计、软件开发、数据分析、AI算法等多个领域。</p>
        </div>
        <div class="about-values">
          <div class="value-item"><strong>使命</strong><span>用技术推动商业进步</span></div>
          <div class="value-item"><strong>愿景</strong><span>成为最受信赖的企业技术服务商</span></div>
          <div class="value-item"><strong>价值观</strong><span>专业 · 创新 · 诚信 · 共赢</span></div>
        </div>
      </div>
    </div>
  </section>

  <section id="contact" class="contact">
    <div class="container">
      <div class="section-header"><h2>联系我们</h2><p>获取免费咨询，我们将在24小时内回复</p></div>
      <div class="contact-grid">
        <div class="contact-info">
          <div class="contact-item"><strong>地址</strong><span>北京市朝阳区建国路88号</span></div>
          <div class="contact-item"><strong>电话</strong><span>400-888-8888</span></div>
          <div class="contact-item"><strong>邮箱</strong><span>contact@company.com</span></div>
        </div>
        <form class="contact-form" onsubmit="handleContact(event)">
          <input type="text" placeholder="您的姓名" required>
          <input type="email" placeholder="电子邮箱" required>
          <input type="text" placeholder="公司名称">
          <textarea placeholder="请描述您的需求..." rows="4" required></textarea>
          <button type="submit" class="btn-primary">提交咨询</button>
        </form>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col"><h4>公司名称</h4><p>专业的企业数字化解决方案提供商</p></div>
        <div class="footer-col"><h4>快速链接</h4><a href="#services">服务</a><a href="#cases">案例</a><a href="#about">关于</a></div>
        <div class="footer-col"><h4>联系方式</h4><p>400-888-8888</p><p>contact@company.com</p></div>
      </div>
      <div class="footer-bottom"><p>&copy; 2026 公司名称 | Powered by CC</p></div>
    </div>
  </footer>
  <script src="js/main.js"></script>
</body>
</html>`,
      'css/style.css': `*{margin:0;padding:0;box-sizing:border-box;}

:root{
  --bg:#fff;
  --surface:#f8f9fa;
  --text:#333;
  --text-muted:#666;
  --primary:#1a56db;
  --primary-dark:#1e40af;
  --dark:#0f172a;
  --border:#e2e8f0;
  --shadow:0 4px 24px rgba(0,0,0,0.06);
}

[data-theme="dark"]{
  --bg:#0f172a;
  --surface:#1e293b;
  --text:#e2e8f0;
  --text-muted:#94a3b8;
  --border:#334155;
  --shadow:0 4px 24px rgba(0,0,0,0.3);
}

body{
  font-family:"Microsoft YaHei","PingFang SC",sans-serif;
  background:var(--bg);
  color:var(--text);
  line-height:1.7;
  transition:background 0.3s,color 0.3s;
}

.container{max-width:1200px;margin:0 auto;padding:0 24px;}

header{
  background:var(--bg);
  border-bottom:1px solid var(--border);
  position:sticky;top:0;z-index:100;
  padding:14px 0;
}
header .container{display:flex;align-items:center;justify-content:space-between;}
.header-left{display:flex;align-items:center;gap:40px;}
.logo{font-size:1.3em;font-weight:bold;color:var(--primary);}
nav{display:flex;gap:28px;}
nav a{
  color:var(--text);
  text-decoration:none;
  font-size:0.95em;
  padding:4px 0;
  border-bottom:2px solid transparent;
  transition:all 0.2s;
}
nav a:hover{color:var(--primary);border-bottom-color:var(--primary);}
.header-right{display:flex;align-items:center;gap:12px;}
.theme-toggle{background:none;border:1px solid var(--border);font-size:1.1em;cursor:pointer;padding:4px 10px;border-radius:8px;}
.btn-sm{padding:8px 20px;font-size:0.9em;}

.btn-primary{
  display:inline-block;
  padding:14px 36px;
  background:var(--primary);
  color:#fff;
  border:none;
  border-radius:8px;
  text-decoration:none;
  font-size:1em;
  cursor:pointer;
  transition:all 0.2s;
}
.btn-primary:hover{background:var(--primary-dark);transform:translateY(-1px);box-shadow:0 4px 16px rgba(26,86,219,0.3);}
.btn-outline{
  display:inline-block;
  padding:14px 36px;
  border:2px solid var(--border);
  color:var(--text);
  border-radius:8px;
  text-decoration:none;
  font-size:1em;
  transition:all 0.2s;
}
.btn-outline:hover{border-color:var(--primary);color:var(--primary);}

.hero{
  background:linear-gradient(135deg,var(--dark),#1e3a5f);
  color:#fff;
  text-align:center;
  padding:100px 24px;
}
.hero h1{font-size:2.8em;margin-bottom:16px;line-height:1.3;}
.hero>div>p{opacity:0.85;max-width:700px;margin:0 auto 40px;font-size:1.15em;}
.hero-stats{display:flex;justify-content:center;gap:60px;margin-bottom:48px;}
.stat{display:flex;flex-direction:column;align-items:center;}
.stat strong{font-size:2em;font-weight:bold;}
.stat span{opacity:0.7;font-size:0.9em;}
.hero-btns{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;}

.section-header{text-align:center;margin-bottom:48px;}
.section-header h2{font-size:2em;margin-bottom:8px;}
.section-header p{color:var(--text-muted);font-size:1.05em;}

.services{padding:80px 24px;}
.service-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
  gap:28px;
}
.service-card{
  padding:36px 28px;
  background:var(--surface);
  border-radius:16px;
  border:1px solid var(--border);
  transition:transform 0.3s,box-shadow 0.3s;
}
.service-card:hover{transform:translateY(-4px);box-shadow:var(--shadow);}
.service-icon{font-size:2.2em;margin-bottom:16px;}
.service-card h3{font-size:1.2em;margin-bottom:8px;}
.service-card p{color:var(--text-muted);}

.cases{padding:80px 24px;background:var(--surface);}
.case-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px;}
.case-card{background:var(--bg);border-radius:16px;overflow:hidden;border:1px solid var(--border);transition:transform 0.3s;}
.case-card:hover{transform:translateY(-4px);}
.case-img{height:180px;}
.case-body{padding:24px;}
.case-tag{display:inline-block;padding:4px 12px;background:var(--primary);color:#fff;border-radius:12px;font-size:0.8em;margin-bottom:12px;}
.case-body h3{font-size:1.15em;margin-bottom:8px;}
.case-body p{color:var(--text-muted);}

.about{padding:80px 24px;}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start;}
.about-text h2{margin-bottom:16px;font-size:1.8em;}
.about-text p{margin-bottom:16px;color:var(--text-muted);}
.about-values{display:flex;flex-direction:column;gap:20px;}
.value-item{background:var(--surface);padding:20px 24px;border-radius:12px;border:1px solid var(--border);display:flex;flex-direction:column;gap:4px;}
.value-item strong{color:var(--primary);}

.contact{padding:80px 24px;background:var(--surface);}
.contact-grid{display:grid;grid-template-columns:1fr 1.5fr;gap:48px;align-items:start;}
.contact-info{display:flex;flex-direction:column;gap:24px;}
.contact-item{display:flex;flex-direction:column;gap:4px;}
.contact-item strong{color:var(--primary);}
.contact-form{display:flex;flex-direction:column;gap:16px;}
.contact-form input,.contact-form textarea{
  padding:12px 16px;
  border:1px solid var(--border);
  border-radius:10px;
  font-size:1em;
  font-family:inherit;
  background:var(--bg);
  color:var(--text);
  transition:border-color 0.2s;
}
.contact-form input:focus,.contact-form textarea:focus{outline:none;border-color:var(--primary);}
.contact-form button{align-self:flex-start;}

footer{background:var(--dark);color:#fff;padding:60px 24px 32px;}
.footer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:40px;margin-bottom:40px;}
.footer-col h4{font-size:1.1em;margin-bottom:16px;}
.footer-col p,.footer-col a{color:rgba(255,255,255,0.65);text-decoration:none;display:block;margin-bottom:8px;font-size:0.95em;}
.footer-col a:hover{color:#fff;}
.footer-bottom{border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;text-align:center;color:rgba(255,255,255,0.4);font-size:0.9em;}

@media(max-width:768px){
  .hero h1{font-size:1.8em;}
  .hero-stats{gap:24px;flex-wrap:wrap;}
  header .container{flex-wrap:wrap;gap:12px;}
  .header-left{flex-direction:column;align-items:flex-start;gap:12px;width:100%;}
  nav{gap:16px;flex-wrap:wrap;}
  .header-right{width:100%;justify-content:space-between;}
  .about-grid{grid-template-columns:1fr;}
  .contact-grid{grid-template-columns:1fr;}
  .service-grid{grid-template-columns:1fr;}
  .case-grid{grid-template-columns:1fr;}
  .about-grid{gap:32px;}
}

.nav-toggle{display:none;}
@media(max-width:600px){
  .nav-toggle{display:block;background:none;border:none;color:var(--text);font-size:1.6em;cursor:pointer;}
  header nav{display:none;width:100%;flex-direction:column;gap:8px;padding-top:12px;}
  header nav.open{display:flex;}
}`,
      'js/main.js': `function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme');
  const next=current==='dark'?'':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('theme',next);
}

function handleContact(e){
  e.preventDefault();
  const form=e.target;
  const name=form.querySelector('input[placeholder*="姓名"]')?.value||'';
  alert('感谢您的咨询，'+name+'！我们将在24小时内与您联系。');
  form.reset();
}

(function(){
  const saved=localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme',saved);

  const headerNav=document.querySelector('header nav');
  if(headerNav){
    const toggle=document.querySelector('.nav-toggle');
    if(toggle){
      toggle.addEventListener('click',()=>headerNav.classList.toggle('open'));
    }
  }

  document.querySelectorAll('a[href^="#"]').forEach(link=>{
    link.addEventListener('click',e=>{
      const target=document.querySelector(link.getAttribute('href'));
      if(target){e.preventDefault();target.scrollIntoView({behavior:'smooth'});}
    });
  });

  const sections=document.querySelectorAll('section[id]');
  const navLinks=document.querySelectorAll('header nav a[href^="#"]');
  if(sections.length&&navLinks.length){
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          navLinks.forEach(link=>{
            link.style.color=link.getAttribute('href')==='#'+entry.target.id?'var(--primary)':'';
          });
        }
      });
    },{rootMargin:'-20% 0px -70% 0px'});
    sections.forEach(s=>observer.observe(s));
  }

  const stats=document.querySelectorAll('.stat strong');
  if(stats.length){
    const animateStats=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const el=entry.target;
          const target=parseInt(el.textContent.replace(/[^0-9]/g,''))||0;
          let current=0;
          const step=Math.ceil(target/40);
          const timer=setInterval(()=>{
            current+=step;
            if(current>=target){current=target;clearInterval(timer);}
            if(current>=target) el.textContent=target.toLocaleString()+el.textContent.replace(/[0-9,]+/,'');
          },30);
          animateStats.unobserve(el);
        }
      });
    },{threshold:0.5});
    stats.forEach(s=>animateStats.observe(s));
  }
})();`,
    },
  },
};

export function generateWebsite(templateName) {
  return websiteTemplates[templateName] || null;
}

export function buildWebsiteProject({ name, type, pages, customCSS }) {
  const template = websiteTemplates[type];
  if (!template) return null;

  const project = { name, type, files: {} };

  for (const [filename, content] of Object.entries(template.files)) {
    let customized = content;

    if (name && filename === 'index.html') {
      customized = customized
        .replace(/我的博客/g, name)
        .replace(/我的作品集/g, name)
        .replace(/产品名称/g, name)
        .replace(/项目文档/g, name)
        .replace(/公司名称/g, name);
    }

    if (customCSS && filename.includes('.css')) {
      customized += '\n/* 自定义样式 */\n' + customCSS;
    }

    project.files[filename] = customized;
  }

  if (pages && Array.isArray(pages)) {
    for (const page of pages) {
      if (page.filename && page.content && !project.files[page.filename]) {
        project.files[page.filename] = page.content;
      }
    }
  }

  if (!project.files['js/main.js']) {
    project.files['js/main.js'] = getDefaultScript(type);
  }

  return project;
}

export const WEBSITE_BUILDER_PROMPT = `
## 网站搭建能力

你可以直接帮用户搭建网站。支持以下类型：
- **blog** — 个人博客
- **landing** — 产品落地页
- **portfolio** — 作品集展示站
- **docs** — 文档站
- **business** — 企业官网

搭建流程：
1. 先了解用户需求（网站类型、名称、风格偏好）
2. 使用 write_file 在项目目录中创建 HTML/CSS/JS 文件
3. 文件命名使用 index.html、css/style.css、js/main.js
4. 给用户一个完整的项目目录
5. 可选：使用 execute_shell 运行 npx live-server 预览
`;

const WORKFLOWS_KEY = 'cc_workflows';

export function createWorkflow(workflowData) {
  const workflows = listWorkflows();
  const wf = {
    id: Date.now().toString(),
    name: workflowData.name || '未命名工作流',
    trigger: workflowData.trigger || '',
    steps: workflowData.steps || [],
    enabled: true,
    createdAt: Date.now(),
  };
  workflows.push(wf);
  localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows));
  return wf;
}

export function listWorkflows() {
  try { return JSON.parse(localStorage.getItem(WORKFLOWS_KEY) || '[]'); } catch { return []; }
}

export function toggleWorkflow(id) {
  const workflows = listWorkflows();
  let found = null;
  const updated = workflows.map(w => {
    if (w.id === id) { w.enabled = !w.enabled; found = w; }
    return w;
  });
  localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(updated));
  return found;
}

export function deleteWorkflow(id) {
  const workflows = listWorkflows();
  const found = workflows.find(w => w.id === id);
  const filtered = workflows.filter(w => w.id !== id);
  localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(filtered));
  return found;
}
