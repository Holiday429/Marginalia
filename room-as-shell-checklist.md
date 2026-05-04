# Room-as-Shell 重构执行清单

**目标：** 把 3D Room 从一个平级 tab 升级为应用的主 Shell，其他功能页以全屏 overlay 面板的形式覆盖在 room 之上。面板完全覆盖时暂停 Three.js 的 `requestAnimationFrame`，关闭时恢复。

**背景约束：**
- 当前代码处于 prototype → production 迁移期，`window.X` globals 和 ES modules 共存，新代码遵循 ES module 模式
- `src/three/room.ts` 是 Three.js 场景核心，renderLoop 在第 1280 行，destroy 在第 545 行
- `src/three-room/three-room-view.js` 是 Room view 的控制层，所有 `exitRoomToXxx()` 函数在这里
- `src/core/app.js` 是 SPA 路由，`App.show()` 控制 view 切换，通过 `window.App` 暴露
- `src/studio/studio.js` 是 Library（书架）的实现，id 是 `view-studio`
- preloader 结束后目前跳转到 `App.showShelf()`（shelf view）
- `index.html` 中各 view 是并列的 `<div id="view-xxx" hidden>` 结构

---

## Step 1：给 RoomScene 加 pause / resume 能力

**文件：** `src/three/room.ts`

在 `RoomScene` class 中增加两个方法和一个私有状态字段：

```ts
private _paused = false;

pause(): void {
  this._paused = true;
  window.cancelAnimationFrame(this.frameHandle);
}

resume(): void {
  if (!this._paused) return;
  this._paused = false;
  this.frameHandle = window.requestAnimationFrame(this.renderLoop);
}
```

修改 `renderLoop` 开头：
```ts
private renderLoop = (): void => {
  if (this.disposed || this._paused) return;   // 加 _paused 检查
  // ... 其余不变
```

---

## Step 2：在 createThreeRoomPreview 暴露 pause / resume

**文件：** `src/three-room/three-room.js`

在返回的 handle 对象里增加：

```js
pause() {
  scene.pause();
},

resume() {
  scene.resume();
},
```

---

## Step 3：新建 Panel Manager 模块

**新建文件：** `src/core/panel-manager.js`

这个模块负责所有面板的开/关，并在面板状态变化时通知 Room 暂停/恢复。

```js
/* ==========================================================================
   Marginalia · Panel Manager
   --------------------------------------------------------------------------
   Manages overlay panels that appear above the 3D room shell.
   Panels: 'library' | 'map' | 'book' | 'todo' | 'profile' | 'web' | 'booklist'
   ========================================================================== */

const PANEL_IDS = ['library', 'map', 'book', 'todo', 'profile', 'web', 'booklist'];

// Panels that should be treated as "full cover" (pause the room RAF)
const FULL_COVER_PANELS = new Set(['library', 'map', 'book', 'web', 'booklist', 'todo', 'profile']);

const PanelManager = (() => {
  let _roomHandle = null;   // set via setRoomHandle()
  let _activePanel = null;
  let _activeParams = {};

  // Called by three-room-view.js once the room scene is mounted
  function setRoomHandle(handle) {
    _roomHandle = handle;
  }

  function open(panelId, params = {}) {
    if (!PANEL_IDS.includes(panelId)) {
      console.warn(`[PanelManager] Unknown panel: "${panelId}"`);
      return;
    }

    // Close current panel without resuming room (another panel is about to open)
    if (_activePanel && _activePanel !== panelId) {
      _closeActivePanel({ skipResume: true });
    }

    _activePanel = panelId;
    _activeParams = params;

    // Show the panel element
    const el = document.getElementById(`panel-${panelId}`);
    if (el) {
      el.hidden = false;
      el.dataset.panelActive = 'true';
    }

    // Update body state for CSS hooks
    document.body.dataset.panel = panelId;

    // Pause room if this panel fully covers it
    if (FULL_COVER_PANELS.has(panelId) && _roomHandle) {
      _roomHandle.pause();
    }

    // Run panel's enter hook if registered
    const enterFn = window[`enterPanel_${panelId}`];
    if (typeof enterFn === 'function') enterFn(params);

    window.dispatchEvent(new CustomEvent('marginalia:panel-open', { detail: { panelId, params } }));
  }

  function close(panelId) {
    if (_activePanel !== panelId) return;
    _closeActivePanel({ skipResume: false });
  }

  function closeAll() {
    _closeActivePanel({ skipResume: false });
  }

  function _closeActivePanel({ skipResume = false } = {}) {
    if (!_activePanel) return;
    const panelId = _activePanel;

    const el = document.getElementById(`panel-${panelId}`);
    if (el) {
      el.hidden = true;
      delete el.dataset.panelActive;
    }

    document.body.dataset.panel = '';
    _activePanel = null;
    _activeParams = {};

    // Resume room RAF
    if (!skipResume && FULL_COVER_PANELS.has(panelId) && _roomHandle) {
      _roomHandle.resume();
    }

    window.dispatchEvent(new CustomEvent('marginalia:panel-close', { detail: { panelId } }));
  }

  function getActive() {
    return _activePanel;
  }

  return { open, close, closeAll, setRoomHandle, getActive };
})();

window.PanelManager = PanelManager;
export { PanelManager };
```

---

## Step 4：重构 index.html 的 DOM 结构

**文件：** `index.html`

### 4a. 把 Room 变为常驻底层 Shell

将 `<div id="view-room" hidden>` 改为：

```html
<!-- ============================================================
     ROOM SHELL — persistent, never hidden
     ============================================================ -->
<div id="view-room"></div>
```

注意：**去掉 `hidden` 属性**，room 从此不参与 App.show() 的隐藏/显示轮换。

### 4b. 把其他 view 容器改为 panel 容器

将以下原有 view div：
```html
<div id="view-studio"   hidden></div>
<div id="view-book"     hidden></div>
<div id="view-map"      hidden></div>
<div id="view-web"      hidden></div>
<div id="view-booklist" hidden></div>
```

替换为：
```html
<!-- ============================================================
     OVERLAY PANELS — shown above the room shell
     ============================================================ -->
<div id="panel-library"  class="room-panel" hidden></div>
<div id="panel-book"     class="room-panel" hidden></div>
<div id="panel-map"      class="room-panel" hidden></div>
<div id="panel-web"      class="room-panel" hidden></div>
<div id="panel-booklist" class="room-panel" hidden></div>
<div id="panel-todo"     class="room-panel" hidden></div>
<div id="panel-profile"  class="room-panel" hidden></div>
```

> ⚠️ `view-shelf` 单独处理（见 Step 6），暂时保留以免 preloader 报错。

### 4c. Nav 的 Library tab 改为指向 room

```html
<!-- 把 data-view="studio" 改为触发 room，href 改为 #room -->
<a href="#room" class="nav-link" data-view="room">…Library</a>
```

---

## Step 5：新增 room-panel CSS

**文件：** `src/three-room/three-room.css`（追加到文件末尾）

```css
/* ── Overlay panels ─────────────────────────────────────────── */
.room-panel {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--bg);
  overflow-y: auto;
  /* Slide-in from right */
  transform: translateX(4px);
  opacity: 0;
  transition: opacity 0.22s ease, transform 0.22s ease;
  pointer-events: none;
}

.room-panel:not([hidden]) {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

/* Body state hook for when any panel is active */
body[data-panel]:not([data-panel='']) #view-room {
  /* Room stays in DOM; optionally dim it slightly under the panel */
  filter: brightness(0.85);
  transition: filter 0.22s ease;
}
```

---

## Step 6：迁移各 view 的 init/enter 为 panel enter hooks

每个原来注册在 `window.initXxx / window.enterXxx` 上的 view，改为注册成面板钩子。

### Library（原 studio）

**文件：** `src/studio/studio.js`

- `initLibrary()` 内把 `document.getElementById('view-studio')` 全部改为 `document.getElementById('panel-library')`
- 函数末尾改为：
  ```js
  window.enterPanel_library = function(params = {}) { enterLibrary(params); };
  ```
- 在面板顶部加一个"返回房间"按钮（见 Step 8 的 back button 模式）

### Map

**文件：** `src/map/map.js`

- 把所有 `document.getElementById('view-map')` → `document.getElementById('panel-map')`
- 注册：`window.enterPanel_map = function(params) { enterMap(params); };`

### Book

**文件：** `src/book/book.js`

- 把所有 `document.getElementById('view-book')` → `document.getElementById('panel-book')`
- 注册：`window.enterPanel_book = function(params) { enterBook(params); };`

### Web / Booklist

同理，`view-web` → `panel-web`，`view-booklist` → `panel-booklist`。

### Shelf（特殊处理）

Shelf 现在被 room 里的"笔记本"触发，进入 Library panel 的 search mode。**不再是独立面板**，而是 Library panel 的一个入口参数：
```js
PanelManager.open('library', { mode: 'search' });
```
`view-shelf` div 可以暂时保留但不再被 App.show() 直接调用——等 Library panel 稳定后再做清理（标记为 `// TODO(p0-cleanup)`）。

---

## Step 7：重构 three-room-view.js 的退出逻辑

**文件：** `src/three-room/three-room-view.js`

### 7a. 用通用 openPanel() 替换所有 exitRoomToXxx()

删除以下函数：
- `exitRoomToMap()`
- `exitRoomToShelf()`
- `exitRoomToBook(bookId)`
- `exitRoomToLayer(mode)`

用一个通用函数替代：

```js
function openPanel(panelId, params = {}) {
  if (ROOM_VIEW_STATE.transitioning) return;
  ROOM_VIEW_STATE.transitioning = true;

  // 如果有对应的 camera pose，先移动相机
  const PANEL_POSES = {
    library: 'shelf',
    map:     'approach',
    book:    'approach',
    todo:    'notes',
    profile: 'front',
  };
  const pose = PANEL_POSES[panelId];
  if (pose && ROOM_VIEW_STATE.handle) {
    ROOM_VIEW_STATE.handle.goToPose(pose, false);
  }

  const TRANSITION_MS = { library: 420, map: 460, book: 360, default: 360 };
  const delay = TRANSITION_MS[panelId] ?? TRANSITION_MS.default;

  if (ROOM_VIEW_STATE.transitionTimer) {
    window.clearTimeout(ROOM_VIEW_STATE.transitionTimer);
  }
  ROOM_VIEW_STATE.transitionTimer = window.setTimeout(() => {
    ROOM_VIEW_STATE.transitioning = false;
    ROOM_VIEW_STATE.transitionTimer = null;
    PanelManager.open(panelId, params);
  }, delay);
}
```

### 7b. 更新 mountRoomScene 的回调

```js
ROOM_VIEW_STATE.handle = createThreeRoomPreview(stage, {
  onGlobeSelect:    () => openPanel('map'),
  onLaptopSelect:   () => openPanel('library', { mode: 'search' }),
  onOrganizeSelect: () => openPanel('library', { mode: 'organize' }),
  onSapiensSelect:  () => openPanel('book', { id: 'sapiens' }),
  onHeroBookSelect: () => exitRoomViaHeroFlip(),
  // 新增的 room 对象只需在这里加一行：
  // onStickyWallSelect: () => openPanel('todo'),
  // onFrameSelect:      () => openPanel('profile'),
});
```

### 7c. 把 roomHandle 注册到 PanelManager

在 `mountRoomScene()` 创建 handle 之后加：
```js
PanelManager.setRoomHandle(ROOM_VIEW_STATE.handle);
```

### 7d. 保留 exitRoomViaHeroFlip()

这个函数逻辑特殊（有 GLB pull 动画），保留，但最后的跳转改为：
```js
PanelManager.open('library', { source: 'room-hero-book', mode: 'organize' });
```

---

## Step 8：给每个面板加"返回房间"按钮

每个面板在渲染自己的 header 时，在 nav 右侧（或 wordmark 旁）加一个 back 按钮：

```html
<button class="panel-back-btn" data-panel-close>← Room</button>
```

在 `src/core/app.js` 里加一个全局事件委托（加在现有 click 委托旁边）：

```js
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-panel-close]')) {
    e.preventDefault();
    const panelId = document.body.dataset.panel;
    if (panelId) PanelManager.close(panelId);
  }
});
```

CSS（加到 `src/core/base.css`）：
```css
.panel-back-btn {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  color: var(--text-secondary);
}
.panel-back-btn:hover {
  color: var(--text);
  border-color: var(--text-secondary);
}
```

---

## Step 9：改 App.show() 的路由逻辑

**文件：** `src/core/app.js`

### 9a. 从 NAV_ITEMS 移除 studio，library tab 直接关闭面板（回到 room）

```js
const NAV_ITEMS = [
  { view: 'room',     label: 'Library',  icon: 'library', href: '#room' },
  { view: 'map',      label: 'Map',      icon: 'map',     href: '#map' },
  { view: 'web',      label: 'Graph',    icon: 'graph',   href: '#web' },
  { view: 'booklist', label: 'Booklist', icon: 'list',    href: '#booklist' },
];
```

### 9b. click 委托更新

```js
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-view]');
  if (!link || link === document.body) return;
  e.preventDefault();
  const requestedView = link.dataset.view;

  // 'room' → 关闭所有面板，回到 room
  if (requestedView === 'room') {
    PanelManager.closeAll();
    return;
  }
  // map / web / booklist → 用 PanelManager 打开
  if (['map', 'web', 'booklist'].includes(requestedView)) {
    PanelManager.open(requestedView);
    return;
  }
  // 其余走原有逻辑（book、preloader 等内部跳转）
  show(requestedView);
});
```

### 9c. views 注册表只保留真正需要 hidden 切换的 view

```js
const views = {
  preloader: document.getElementById('view-preloader'),
  shelf:     document.getElementById('view-shelf'),   // TODO(p0-cleanup): merge into panel-library
  book:      document.getElementById('view-book'),    // 过渡期保留，实际使用 panel-book
};
```

Room 不在这里——它永不 hidden，不参与 show() 的视图切换。

### 9d. `App.show('book', ...)` 等内部调用改为 PanelManager

全局搜索 `App.show('book'`、`App.show('map'`、`App.show('studio'`，改为对应的 `PanelManager.open(...)`。

---

## Step 10：Preloader 结束后进入 Room（不再进 Shelf）

**文件：** `src/preloader/preloader.js`

把所有 `App.showShelf()` 调用改为：

```js
App.showRoom();   // 见下方新增函数
```

**文件：** `src/core/app.js`

新增 `showRoom()`（类似现有的 `showShelf()`，做 preloader fade-out 动画，目标是让 room 可见）：

```js
function showRoom() {
  if (transitioning) return;
  transitioning = true;

  const preloader = views.preloader;

  // Room 已经常驻，只需要 fade out preloader
  document.body.dataset.view = 'room';
  // 更新 nav active state
  document.querySelectorAll('.nav-link[data-view]').forEach(a => {
    a.classList.toggle('active', a.dataset.view === 'room');
  });

  // 触发 room 初始化
  if (typeof window.initRoom === 'function' && !initialized.has('room')) {
    try { window.initRoom(); } catch(e) { console.error('[App] initRoom threw:', e); }
    initialized.add('room');
  }

  preloader.style.position   = 'fixed';
  preloader.style.inset      = '0';
  preloader.style.zIndex     = '100';
  preloader.style.transition = 'opacity 0.7s ease';
  requestAnimationFrame(() => { preloader.style.opacity = '0'; });

  setTimeout(() => {
    preloader.hidden = true;
    preloader.style.cssText = '';
    transitioning = false;
    window.dispatchEvent(new Event('marginalia:ui-refresh'));
  }, 750);
}

// 暴露
window.App = { show, showShelf, showRoom };
```

---

## Step 11：导入 PanelManager 到 main.js

**文件：** `src/main.js`

在 `// 4. Core app utilities` 区块加一行：

```js
import './core/panel-manager.js';
```

确保 panel-manager.js 在 app.js 和所有 view 脚本之前加载。

---

## Step 12：CSS — Room 从 "view" 升格为 "shell"

**文件：** `src/three-room/three-room.css`

把原来的 `#view-room { min-height: 100vh }` 改为：

```css
#view-room {
  position: fixed;   /* 常驻底层，面板叠在上方 */
  inset: 0;
  z-index: 0;
  background: var(--bg);
}

/* Room 不再靠 body[data-view='room'] 控制显示，
   但保留这个 selector 用于样式 hook */
body[data-view='room'] {
  overflow: hidden;  /* Room 本身不滚动，面板自己管滚动 */
}
```

同时删除 `marginalia:ui-refresh` 时销毁 room handle 的逻辑（`three-room-view.js` 里那段 `window.addEventListener('marginalia:ui-refresh', ...)`）——room 现在是 shell，不应该在切换 view 时被销毁。

---

## 验收检查点

实现完成后逐一验证：

1. **启动流程：** preloader 结束 → 进入 3D room，不再是 shelf
2. **书架进入：** 点击书架（或 nav Library）→ library 面板从右滑入，room 暂停渲染
3. **返回房间：** 面板内点"← Room" → 面板关闭，room 恢复渲染
4. **RAF 暂停确认：** 面板打开后打开浏览器 Performance tab，确认没有持续的 animation frame 活动
5. **地球仪：** 点击地球仪 → map 面板打开
6. **书籍详情：** 点击桌上的书 → book 面板打开，params.id 正确传入
7. **Nav 跳转：** 点 Map / Graph / Booklist nav link → 对应面板打开；点 Library → 关闭面板回到 room
8. **面板叠加：** 在 map 面板内触发 book 打开（如有入口）→ map 关闭，book 打开，room 保持暂停
9. **无孤儿 view：** `view-studio`、`view-map`、`view-book` 等旧 div 不再被 `App.show()` 直接操作（可留 div 暂时但不再调用）
10. **iPad Safari：** 面板 `position: fixed; inset: 0` 在 Safari 上不出现滚动穿透

---

## 文件改动汇总

| 文件 | 类型 |
|------|------|
| `src/three/room.ts` | 修改：加 `pause()` / `resume()` |
| `src/three-room/three-room.js` | 修改：暴露 `pause` / `resume` |
| `src/core/panel-manager.js` | **新建** |
| `src/core/app.js` | 修改：路由逻辑、showRoom()、views 注册表 |
| `src/main.js` | 修改：import panel-manager |
| `src/preloader/preloader.js` | 修改：showShelf → showRoom |
| `src/three-room/three-room-view.js` | 修改：openPanel() 替换 exitRoomToXxx()，注册 handle |
| `src/three-room/three-room.css` | 修改：room 改 fixed，加 .room-panel 样式 |
| `src/studio/studio.js` | 修改：view-studio → panel-library，注册 enterPanel_library |
| `src/map/map.js` | 修改：view-map → panel-map，注册 enterPanel_map |
| `src/book/book.js` | 修改：view-book → panel-book，注册 enterPanel_book |
| `src/web/web.js` | 修改：view-web → panel-web |
| `src/booklist/booklist.js` | 修改：view-booklist → panel-booklist |
| `src/core/base.css` | 修改：加 .panel-back-btn 样式 |
| `index.html` | 修改：DOM 结构，view → panel，room 去掉 hidden |
