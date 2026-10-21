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

### 2a. Room — 四个角各司其职（owner 两轮实测后定）

先试过"相机栏挪到底部 Today 上方"和"相机栏与 Today 并排一行"，都又出现两行/功能混在一个入口，放弃。
Today 是功能入口，不能和视角切换放在一起。最终布局：

```
左上：☰ 菜单（Settings 收进菜单）   中上：Library Map Graph Profile   右上：Today ▾（点击竖向展开）
                                  （房间画面全开）
左下：Reading 计时器              中下：Front Desk Shelf wall Notes wall Free look              右下：+
```

- 相机栏回到底部正中，独占一行；样式与其它悬浮控件同一套药丸配方（`--color-smoke-bg` 74% + 铜色描边 + 模糊）。
  窄于 1000px 标签缩短（Shelf / Notes / Free）。保留 `#roomCameraControls`、`data-room-pose`、`#roomFreeLookBtn`。
- Today 挂到右上角（原来 Settings 齿轮的位置），收起是药丸，与导航垂直居中对齐；展开成竖向单列面板向下拉，
  最大高度随视口。窄于 900px 药丸缩成 "Today 3"（隐藏 "to revisit"），导航宽度相应收窄避免相撞。
- Settings：齿轮从右上角移除，成为左侧菜单里的一项（`#roomSettingsTrigger` 保留为菜单项）。
  面板在宽屏从菜单右侧弹出；≤900px 仍是右侧抽屉。Today 与 Settings 因此不再抢同一个角。
- Reading 计时器（`.room-focus-dock`）保持在左下，不动。
- 测试：`navigation.spec.ts`、`legal.spec.ts` 里点 Settings 前先展开左侧菜单（菜单默认收起）。

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

## 阶段 3 — 设计 token 一致性（已完成）

**做法（owner 同意的版本）**：沿用现有命名（`--text-*`、`--glass-*`、`--panel-*`），补缺口，再逐页迁移；
字号阶梯 11 / 12 / 14 / 16 / 20 / 28 / 40，另有展示档 48 / 72。详见 `docs/design-tokens.md`。

**批次与提交**：1 Room（35b7793）· 2 Library · 3 Book / AI / 导入 / 仪式 / 引导 · 4 Profile · 5 Map / Graph · 6 登录面板 / 落地页 / 其它。
共 33 个 CSS 文件登记在 `scripts/colors-migrated.txt`，`npm run check:colors`（颜色和字号字面量、旧 `--fs-N`）已进 `check:all`。

**验证记录（2026-10-21）**
- 每批迁移前后各截一组图（Room 7 张、Library 12、Book 6、Profile 12、Map/Graph 8、落地页和登录 4），用像素差量化：
  平均色差多在 0.3–6（满分 255）；偏大的都有解释（筛选芯片多折一行、整页下移、登录面板从蓝黑改暖色）。
- 评审截图时发现并修正了 7 类回归：书脊小字被放大、书架木色层次被压平、彩虹色板变淡、暗灰变近黑（8 处）、
  黄铜金被归成发灰的棕、左栏按钮折行、落地页五个主题被合并。每一条都写进了 `docs/design-tokens.md`。
- 已知残留：Profile 顶部卡片左侧面板边缘有 3–8 个色阶的台阶，肉眼很淡。

**统一的结果（用户可见）**：房间里所有浮动控件同一种暖棕玻璃材质；全站字号收敛到一套阶梯，
原来 8–10px 的小字统一为 11px；登录面板与全站同色系。

## 阶段 3.5 — 按钮统一（已完成）

**做法**：`src/components/button/button.css` 是按钮外观的唯一来源，页面只选层级：主要 / 次要 / 轻量 / 危险 / 图标，
另有筹码（`chip`）；44px 高、12px 圆角、mono 12px，密集处加 `btn--sm`（32px）。分四批迁移：
1 顶栏 / Library 工具栏 / Add Book；2 Book、AI、对话框、同意横幅；3 Profile、房间浮层、登录、Graph；4 其余零散按钮。
共约 140 个旧按钮类名映射到组件，约 1,500 行各页自己写的按钮外观被删除。

**护栏**：`npm run check:buttons`（进 `check:all`）：新写的 `<button class>` 既不是 `.btn` / `.chip` 也不在
`scripts/buttons-allowlist.txt` 时失败。有意例外：相机栏（分段控件）、缩放按钮组、导航标签、Browse | Arrange、Today 药丸、卡片和色块。

**验证记录（2026-10-21）**：每批前后截图对比（Library / Book / Profile / Graph / 房间 / 登录 / 对话框）；
运行时审计每个页面上所有 `.btn` / `.chip` 的计算样式（高度、圆角、字号、图标按钮必须是正方形）。
审计抓到并修正了：全局边框规则盖过轻量按钮、房间里 `width: auto` 让图标按钮变形、"+ Add row" 被误当作图标按钮。

## 阶段 4 — 房间主题真正接入（已完成）

**问题**：Theme 五个 chip 只切 CSS class；Ambient Effects 三个 chip 同样是假的；skinId 被 Atmosphere 独占，
且贴图加载成功后材质色被强制设为白色，Theme 即使接上也会被贴图盖住。

**做法**：拆成两个独立的轴。`src/three/skins.ts` 现在是 `ROOM_ATMOSPHERES`（时段：灯光、窗、天空）和
`ROOM_THEMES`（taupe / ink / cream / sage / clay：墙、侧墙、地板、桌、天花板、地毯），房间的样子 = 主题的材质被时段的灯光照亮。
`src/three/room.ts`：`applySkin` → `applyAtmosphere` + `setTheme` + `applySurfaces`。贴图表面的色调乘数 =
主题色 ÷ taupe 色（线性空间，按通道），所以 taupe 的乘数恰好是 1，默认外观不变；无贴图的表面（天花板、护墙板、加载前）
直接用主题色，并按时段变暗（`shade`，线性乘数，保持原来"夜晚天花板更暗"）。
`src/three-room/three-room-view.js`：theme chip 接上 `applyRoomTheme`（存 `marginalia_room_theme_v1`，刷新后保持），
首帧就用存储的主题和时段创建场景（不再先显示默认再跳变）。Ambient Effects 三个按钮置灰并标 "Coming soon."。

**验证记录（2026-10-21）**
- 5 主题 × 4 时段共 20 种组合逐一截图（`tests/screenshots/phase-3/3.4-themes-5x4.png`）：五个主题差异清楚，
  没有死黑或过饱和，贴图纹理在所有组合下都可见。
- 默认外观：taupe 在四个时段与 main 的像素差——下午 0.04、早晨 0.9、黄昏 1.1、夜晚 4.7（夜晚天花板色相略有不同）。
- 切换主题 0 个新网络请求；刷新后保持；页面 0 个报错；新增 `tests/e2e/room-theme.spec.ts`（2 个测试）。
- 未做：主题对 2D 页面的联动、付费主题与按需加载（Phase 4 之后）。

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
