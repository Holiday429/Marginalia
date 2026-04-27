# Marginalia

个人读书记录网站。单页应用（SPA），未来会接入 Notion 数据和书籍 API，并生成可分享的年度书单。

## 项目结构

```
Marginalia/
├── index.html          # 唯一 HTML 文件，所有视图的壳子
├── book.glb            # 3D 书本模型（Three.js）
├── book.mp4
└── src/
    ├── core/           # 全局共用
    │   ├── base.css    # 设计变量（:root tokens）、reset
    │   ├── app.js      # 视图切换管理器（App.show / App.showHome）
    │   └── books.js    # 静态书目数据（BOOKS、SHELF_BOOKS）
    ├── preloader/      # 入场动画视图
    │   ├── preloader.css
    │   ├── preloader.js
    │   └── hero-glb.js # Three.js GLB 渲染（ES module）
    ├── home/           # 主页视图
    │   ├── home.css
    │   └── home.js     # initHome() 由 app.js 调用
    ├── api/            # 数据层（待接入）
    │   ├── notion.js   # Notion API
    │   └── books-api.js
    └── yearbook/       # 年度书单生成（待接入）
        ├── yearbook.css
        └── yearbook.js
```

## 架构规则

**SPA，单一入口**
- 只有 `index.html` 一个 HTML 文件，不新增其他 `.html` 文件
- 页面切换通过 `App.show(viewName)` 控制，不使用 `window.location.href`
- 每个视图对应 `index.html` 里的一个 `<div id="view-xxx">`，默认 `hidden`

**按功能模块组织，不按文件类型**
- 新增功能 → 在 `src/` 下新建对应模块目录，CSS 和 JS 放在一起
- 全局共用的内容（设计变量、数据、路由）放 `src/core/`
- 不使用 `assets/` 这类按文件类型分类的目录

**新增视图的步骤**
1. 在 `index.html` 里加 `<div id="view-xxx" hidden>...</div>`
2. 在 `src/xxx/` 下创建 `xxx.css` 和 `xxx.js`
3. 在 `index.html` 引入对应 CSS 和 JS
4. 在 `src/core/app.js` 的 `views` 对象里注册新视图
5. 在 `xxx.js` 里导出 `initXxx()` 供 `app.js` 调用

**数据层**
- 当前书目数据在 `src/core/books.js`（静态，`window.BOOKS` / `window.SHELF_BOOKS`）
- 接入动态数据后迁移到 `src/api/`，`books.js` 改为调用 API 的适配层
- Notion 相关逻辑全部放 `src/api/notion.js`，不散落在视图模块里

## 设计系统

字体：Fraunces（正文 serif）、IBM Plex Mono（标注/标签）、Bodoni Moda（封面标题）

颜色变量（定义在 `src/core/base.css`）：
- `--bg` #b8ad9e · `--ink` #1a1714 · `--paper` #e8dfc8
- `--accent` #c68b4a · `--navy` #14263e · `--muted` rgba(26,23,20,0.58)

Preloader 主题通过 `body.theme-xxx` 切换（ink / taupe / cream / sage / clay）。
Home 视图通过 `body[data-view="home"]` 控制样式，不依赖 theme class。

## 注意事项

- `book.glb` 路径相对于 `index.html`（根目录），不需要加 `src/` 前缀
- `hero-glb.js` 是 ES module（`type="module"`），其余 JS 是普通脚本，加载顺序：`books.js` → `app.js` → `preloader.js` → `home.js` → `hero-glb.js`
- CSS 命名注意作用域冲突：preloader 和 home 共存于同一页面，`.masthead` 等通用类名需要区分（home 用 `.home-masthead`，shelf filter 用 `.shelf-filters .chip`）
