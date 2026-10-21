# Phase 3 — 修复与一致性

四个阶段，顺序执行。**每个阶段独立验证、独立 merge to main，验收通过后才开始下一个。**
不做 Blender、不做新 3D 资产、不做付费主题 —— 那些在 Phase 4。

通用规则（每阶段都适用）：
- 每阶段开一个分支 `phase-3-<n>-<slug>`，从最新 main 切出。
- 提交前必须 `npm run check:all` 全绿。
- UI 改动必须补 `tests/screenshots/phase-3/` 下三档截图：390×844 / 768×1024 / 1440×900。
- 遵守既有代码规则：ES modules、无 `window.X`、无裸 hex（阶段 3 起强制）、`asset()` 引用静态文件。
- 每阶段结束在本文件末尾追加一节「阶段 N 验证记录」，写实测数字与截图路径。

---

## 阶段 1 — 房间闪动修复

**问题**：从 preloader 进入房间时，先出现一个偏暖黄的房间，再切成真正的 3D 房间（天花板、窗外颜色明显不同）。

**根因（实测修正）**：闪动是**海报与实时场景是两张不同的图**。`public/room-poster.webp` 是某一天按
warm-study 灯光拍的静帧（暖黄窗、深天花板、便签日期 Oct 19、默认头像），实时场景按时段选
skin（上午是 mist-morning：白窗、浅天花板）、显示当天日期和用户头像。所以只有下午大致对得上。
最初"贴图晚到造成平面→3D"的判断只是次要因素。同时，"房间几乎直接呈现"的体感主要来自这张海报，
并不是真实加载变快。

**决定（经 owner 实测两轮后确定）**：不要海报，也不要遮罩，点 Enter 直接进房间，物品一件件填进来。
- 第一轮试过"纯色遮罩 + Opening…，就绪后淡出"：闪动消失，但 1 到 2 秒灰色留白、导航先出现，
  体验反而比原来的逐件加载差（逐件填充看起来像有意为之的效果）。已放弃。
- 海报的问题无法靠调整解决：它是固定的一张图，永远和实时场景的时段/日期/头像/主题对不上。

**改动**
- 去掉海报：`index.html` 的 `<img class="room-poster">`、`base.css` 的海报样式、
  `three-room-view.js` 的 `showRoomPoster` 及 `onSceneReady` 接线、`public/room-poster.webp`
  （`git rm`）。`src/three/room.ts` 保持原样（逐件加载、原有推镜）。
- 预热：`src/core/view-registry.ts` 新增 `preloadView(id)`，`src/preloader/preloader.js` 在落地页出现
  Enter 按钮后空闲时调用 `preloadView('room')`，点 Enter 时房间代码已经下载好，不用再等。
- `scripts/measure-room-load.mjs` 去掉海报指标；`scripts/capture-room.mjs` 去掉 `--poster`；
  `CLAUDE.md`、`docs/open-questions.md`（Q1.6-c）同步。

**验证记录（2026-10-21）**
- 生产构建 + preview，无头 Chrome：点击前房间代码已下载；点 Enter 后约 1 秒房间 Canvas 出现，
  落地页淡出的同时房间已带纹理（墙、地板、地毯、桌、窗），其余家具随后补入；无灰色空档，0 个 pageerror。
- 未验证：真机观感（需 owner 目视）；完整 `check:all`（待 owner 确认观感后跑）。

## 阶段 2 — 布局重构

**问题**：顶部出现三层水平条（nav pill / camera bar / mode switch），层级混乱；
视角控制放顶部不符合操作习惯；Library 页四层标题说同一件事。

**原则**：导航（去哪）在顶部；视角与模式（怎么看）贴近它控制的内容。

### 2a. Room — camera bar 下移到底栏

现状：`src/three-room/three-room.css:395-416`，`position:absolute; top:18px`，
侧栏收起时 `top:96px`，压在 nav pill 下面。

目标布局：
```
顶部：☰        Library Map Graph Profile        ⚙        ← 唯一一条导航
                      （房间画面全开）
底部：[Reading ▴]  [Front·Desk·Shelf·Notes·Free]  [Today 1]  [+]
```

- `#roomCameraControls` 移到底部居中，与 Today pill 同一条视觉基线。
- **样式降级**：去掉毛玻璃胶囊容器（border / background / backdrop-filter / box-shadow），
  改为纯文字按钮 + 选中态下划线或小圆点。它必须明显比 nav pill 轻。
- 保留 `id="roomCameraControls"`、`data-room-pose` 属性、`#roomFreeLookBtn` 的
  id 与 `aria-pressed` —— `tests/e2e/navigation.spec.ts` 和
  `tests/e2e-emulator/helpers.ts` 依赖它们。
- 删除 `.is-sidebar-collapsed .room-camera-bar` 的 `top:96px` 覆盖（第 412、915 行）。
- 窄屏（≤768px）底部横向可滚动，不换行；触控目标仍 ≥44px。
- 与 Today pill、`+` 按钮做碰撞检查：三者不得重叠，必要时 Today 居中偏左。

### 2b. Library — 模式切换并入标题行，删重复标题

现状四层：`Marginalia` → `Library` tab → `Browse|Arrange` → `Search` 大标题。

目标两层：
```
Marginalia        Library Map Graph Profile        Add Book
──────────────────────────────────────────────────────────
Library  [Browse|Arrange]          7 finished · 0 reading · …
🔍 Search your shelf…                 Search all  Import  Filters
```

- 删掉独立的 "Search" `<h1>`（与 Library tab 语义重复），页面标题统一为 "Library"。
- `renderLibraryModeSwitch()` 的输出位置挪进 header 容器，与标题同行，统计数字靠右。
- `.lib-mode` 样式改为小号 mono 文字 + 选中下划线，**不再是第三个圆角胶囊**。
- 两个页面都要改：`src/search/search.js` 与 `src/library-2d/library-2d-template.js`
  （两处 header 结构要一致）。
- 保留 `data-view` 路由不变 —— `#search`/`#library` 必须继续工作，
  `primaryTabIdForView` 不动。

**验证**
- 三档截图，前后对比贴进验证记录。
- 顶部只剩一条水平条；Library 页比改前少一行，且无重复标题。
- `npm run test:e2e` 与 `test:e2e:emu` 全绿（camera bar 选择器是回归高风险点）。
- 键盘可达性：Tab 能到每个 pose 按钮，focus-visible 清晰。
- `npm run check:all` 全绿。

---

## 阶段 3 — 设计 token 一致性

**问题**：房间 overlay 大量裸 `rgba()`（典型 `three-room.css:407-410`），
字号散用，深色页面与浅色房间没有共用语义。

**前置**：开工前需 owner 拍板两件事（见文末「待决事项」）。未拍板不要开始。

**做法：按页面分批，每批独立截图回归。** 不要一次全站替换。

批次顺序（依赖从低到高）：
1. `src/core/base.css` — 建立语义 token 层（新增，先不改调用方）
2. Room overlay — `src/three-room/three-room.css`
3. Library — `src/search/`、`src/library-2d/`、`library-mode-switch`
4. Book — `src/book/` 及 panels
5. Profile — `src/profile/`
6. Map / Graph — `src/map/`、`src/web/`

**命名要求**：语义化，不是色值化。
- 对：`--surface-raised`、`--text-secondary`、`--border-subtle`、`--accent-warm`
- 错：`--taupe-40`、`--gold-warm`（现存的这类名字保留为底层原子，
  语义 token 引用它们，不要一次性重命名，避免大爆炸）

**双语境**：同一语义 token 在浅色房间与深色页面取值不同。
用 `[data-view="room"]` 或 `.is-light-context` 作用域覆盖，不要新建一套平行命名。

**字号**：统一到一套比例（建议 12/14/16/20/28/40，待拍板），
现有 `--fs-12` 之类映射过去，不保留散值。

**硬性检查**：`npm run check:hardcoded` 必须覆盖本批次改过的文件并通过。
如果该脚本当前没覆盖房间 CSS，本阶段要把它纳入。

**验证**
- 每批次单独 commit，单独三档截图。
- 全部完成后整站走一遍：Room / Library(Browse+Arrange) / Book / Profile / Map / Graph，
  浅色深色都看，确认无错配。
- `npm run check:all` 全绿。
- 注意：字号统一会改变部分卡片高度，截图回归必须逐页看，不能只看通过与否。

---

## 阶段 4 — 房间主题真正接入

**问题**：Theme 五个 chip 只切 CSS class，不驱动渲染（`three-room-view.js:559-563`）。
Ambient Effects 三个 chip 同样是假的（`:573-577`）。

**但这不是补一个调用能解决的 —— 存在设计冲突，必须先拆轴。**

### 冲突说明

- Theme 的值是 `taupe/ink/cream/sage/clay`；`ROOM_SKINS` 的值是
  `warm-study/mist-morning/night-lamp/amber-dusk`，两套不对应。
- `skinId` 已被 Atmosphere 独占（`getSkinIdForAtmosphere`，`three-room-view.js:1098`）。
- skin 同时含 colors 和 lighting，而 Atmosphere 要控灯光、Theme 要控材质，语义重叠。
- `room.ts:585-595`：贴图加载成功后材质色被强制 `#ffffff`，**skin 颜色被贴图完全覆盖**。
  Theme 若只改 `material.color` 将完全无效。

### 目标模型（两个正交轴）

```
Atmosphere（时间）→ 灯光强度 / 色温 / 窗外景象        morning afternoon dusk night
Theme（材质）     → 墙/地板/桌面/木料的色调            taupe ink cream sage clay
最终渲染 = Theme 的材质色调  ×  Atmosphere 的灯光
```

这同时是未来付费主题系统的地基，所以值得现在做对。

**改动**

A. `src/three/skins.ts` — 拆成两张表
   - `ROOM_ATMOSPHERES`：只含 `lighting` + `windowGlow`，四个值。
   - `ROOM_THEMES`：只含材质色调（wall/floor/desk/ceiling/sideWall tint），五个值
     `taupe/ink/cream/sage/clay`。taupe 取当前 `warm-study` 的颜色，保证默认外观不变。
   - 保留 `ROOM_SKINS` 导出一段时间或提供兼容映射，避免破坏现有调用方；
     若无外部依赖可直接替换，但要全仓搜索确认。

B. `src/three/room.ts` — 贴图与色调相乘
   - `applySkin()` 拆为 `applyAtmosphere(id)` 与 `applyTheme(id)`，各自独立可调。
   - **关键**：有贴图时不再设 `#ffffff`，而是设为 theme 的 tint 色
     （three.js 中 `material.color` 与 `map` 本就是相乘关系，所以 tint 会正确着色贴图）。
     需要为每个 theme 调出合适的 tint 强度，避免过饱和 —— 建议 tint 色明度偏高、饱和度低。
   - 无贴图时（加载失败的降级路径）直接用 theme 色，保持现有行为。
   - 两个方法都要能单独重入调用而不互相覆盖。

C. `src/three-room/three-room-view.js` — 接上 UI
   - theme handler（:559）补 `ROOM_VIEW_STATE.handle.setTheme(id)` + localStorage 持久化，
     新 key `marginalia_room_theme_v1`，照搬 atmosphere 的 load/save/normalize 三件套。
   - 新增 `syncThemeControls()`，与 `syncAtmosphereControls()` 同构。
   - 初始化路径（:359 / :400 / :389 / :411 附近）要读取并应用存储的 theme。
   - `mountRoomScene` 的 `.finally` / 重建路径（:728 附近）要一并恢复 theme。

D. Ambient Effects 三个 chip —— **本阶段只做诚实处理，不实现**
   Rain / Vinyl Noise / Fireplace 需要音频与粒子，属于新功能，不在本 Phase 范围。
   二选一（倾向前者）：
   - 从 settings 面板中移除这三个 chip；或
   - 保留但置 `disabled` 并加 "Coming soon" 说明，不要留假开关。

**验证**
- 五个 theme × 四个 atmosphere = 20 个组合逐一目视，确认：
  无过饱和、无死黑、贴图纹理在所有 theme 下都还看得见。
- 刷新页面后 theme 与 atmosphere 都保持住。
- 切换 theme 不重新下载任何资产（Network 面板确认：应为零新请求）。
- 切 theme 不触发闪动、不打断相机。
- 台灯/吊灯的 `practicalGlow` 自发光在暗色 theme + night 下仍正确。
- `npm run check:all` 全绿；room-load 仍 ≤ 12 MB（本阶段不应增加任何字节）。

---

## 待决事项（阶段 3 开工前需 owner 拍板）

1. **语义色板**：token 命名方案与浅色/深色两套取值。
2. **字号阶梯**：建议 12/14/16/20/28/40 六档，需确认。
3. **Ambient Effects**：移除，还是保留为 disabled + Coming soon。

---

## 不在本 Phase 范围

- Blender / MCP / 任何新 3D 资产
- 付费主题、entitlement `theme.*`、按需加载分组、防盗链
- `INTERACTIVE_ASSETS` 的主题化抽象（阶段 4 的双轴拆分是它的前置，但抽象本身留到 Phase 4）
- 邮件服务商接入
