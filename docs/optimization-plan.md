# Marginalia 分阶段优化执行方案

Oct 19, 2026 · @Holiday Xiao

本方案把「上线评估」里的问题拆成 4 个阶段、共 12 周的任务，每个任务写明要改的文件、做法和可以用命令或截图验证的验收标准，供 Claude Code 逐项执行。一个阶段的全部验收项勾完、门槛通过后，再进入下一阶段。主题书房的 Blender 制作另见独立文档，本方案只负责代码侧的接入。

## 执行规则（给 Claude Code）

每个任务都按「读代码 → 改 → 跑验收 → 提交」完成，不跨任务顺手重构。

1. **先读再改**：开始前读 `CLAUDE.md`、`MARGINALIA_SPEC.md`、`FEATURES.md`；`CLAUDE.md` 里的文件名有滅后（写着 `.js` 的多数已是 `.ts`），以实际文件为准，并在阶段 1 结束时把文档更新正确。
2. **分支与提交**：每个阶段一个分支（`phase-1-stabilize`、`phase-2-loop`、`phase-3-design`、`phase-4-launch`），每个任务至少一个提交，提交信息以任务编号开头（如 `1.1 lock billing fields`）。阶段验收通过后由 Holiday 合并到 main。
3. **每次提交前必跑**：`npm run lint && npm run typecheck && npm run typecheck:room && npm run test:unit && npm run test:rules && npm run build && npm run size`。任一失败不提交。
4. **不碍主题线**：主题书房的 Blender 工作在仓库之外并行进行。在阶段 3 之前，不要重写 `src/three/room.ts` 的场景结构，只做资源压缩、bug 修复和移除硬编码。
5. **数据安全**：任何改 Firestore 路径或字段的任务，都要写迁移脚本（放 `scripts/migrations/`），先对 dev 项目跑，再由 Holiday 对生产跑。不删除用户数据。
6. **遇到设计决策就停**：定价、文案、视觉风格、是否保留某功能这类问题，写在 `docs/open-questions.md` 里等 Holiday 决定，不自行拍板。
7. **留痕**：每个阶段结束时在 `docs/phase-reports/phase-N.md` 写明：完成了哪些任务、每条验收的证据（命令输出、截图路径）、遗留问题。
8. **截图验收**：涉及界面的任务用 Playwright 在 390×844、768×1024、1440×900 三个尺寸截图，存入 `tests/screenshots/phase-N/`。

编号里的「P0 #n」指《上线评估》里的阻断问题编号。

## 阶段 1：止血（第 1–2 周）

目标：关闭全部 7 个 P0，让站点「不会被白嫖、不会丢数据、打开不用等、可以合法收费」。建议顺序：1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9（1.6、1.7 可与前面并行）。

### 1.1 锁定计费字段（P0 #1）

- **问题**：`firestore.rules` 允许用户写自己的 `users/{uid}`，而 plan、entitlements、quota 都在这里；`entitlements-store.ts` 还从客户端写 plan。开启公开主页后，整个 `users/{uid}` 文档对所有人可读。
- **做法**：
  - 新建只有服务端能写的 `billing/{uid}`：`plan`、`status`、`currentPeriodEnd`、`cancelAtPeriodEnd`、`provider`、`providerSubscriptionId`、`customerPortalUrl`、`updatedAt`。规则：本人可读，`allow write: if false`。
  - AI 用量放 `usage/{uid}/months/{YYYY-MM}`，同样只有服务端能写。
  - `users/{uid}` 的规则禁止写入 `plan`、`entitlements`、`quota`（创建时检查 `keys()`，更新时检查 `diff().affectedKeys()`）。
  - 公开主页改读独立的 `publicProfiles/{slug}`（只含显示名、头像、简介、公开书目），`users/{uid}` 改为只有本人可读。
  - `entitlements-store.ts` 改为只读 `billing/{uid}`，删除 `setDoc`。权益表移到 `shared/entitlements.ts`，前端与 `functions/` 共用同一份（用构建脚本复制或 tsconfig paths）。
  - 迁移脚本 `scripts/migrations/001-billing.ts`：所有用户写入 `billing/{uid}` = free，只有 Holiday 提供的付费名单例外（旧的 plan 值可能已被伪造，不可信）；删除 `users/{uid}` 上的旧字段。
- **文件**：`firestore.rules`、`src/store/entitlements-store.ts`、`src/data/schema/entitlements.ts` → `shared/entitlements.ts`、`functions/src/billing-webhook.ts`、`src/profile/profile.ts`、`src/profile/profile-settings.ts`、`tests/firestore-rules.test.ts`
- **验收**：
  - [ ] rules 测试新增并通过：用户写 `users/{uid}.plan` 被拒；用户写 `billing/{uid}` 被拒；用户读自己的 `billing` 成功、读别人的被拒；未登录读 `users/{uid}` 被拒、读 `publicProfiles/{slug}` 成功。
  - [ ] `grep -rn "plan" src --include=*.ts --include=*.js | grep -i setDoc` 无结果；`npm run check:entitlements` 通过。
  - [ ] 在 dev 项目里，浏览器控制台执行写 plan 的代码报 `permission-denied`。
  - [ ] 公开主页在未登录状态下正常显示，网络请求里看不到 email、plan 字段。

### 1.2 AI 网关收口（P0 #2）

- **问题**：`aiGenerate` 转发客户端任意 `prompt`；没有 quota 时为 `Infinity`；不检查 plan；`cors: true`。
- **做法**：
  - 请求体改为 `{ featureId, bookId?, params? }`，不再接受 `prompt`。`featureId` 必须在白名单内。
  - 把 `src/ai/features/prompts/*.js` 的 `build()` 改为纯函数放到 `shared/ai-prompts/`，由云函数用 admin SDK 读取书籍、高亮、笔记后在服务端拼 prompt；用户数据拼入前截断（如高亮最多 60 条、总长度上限）。
  - 用量：事务内读 `billing/{uid}` 与 `usage/{uid}/months/{YYYY-MM}`；免费档每月上限用常量 `FREE_AI_MONTHLY`（初始 10），Pro 用 `PRO_AI_MONTHLY_FAIR_USE`（数值写入 `docs/open-questions.md` 等定价时确认）；先计数、失败时退回。
  - CORS 只允许环境变量 `ALLOWED_ORIGINS` 中的域名；评估开启 Firebase App Check（写入 open-questions）。
  - 审计日志增加 `inputTokens`、`outputTokens`，为阶段 4 的成本核算做准备。
  - 前端 `ai-gateway.ts`、`generate-ui.ts` 改为只传 `featureId` + `bookId`；402 时显示升级提示。
- **文件**：`functions/src/ai-generate.ts`、`shared/ai-prompts/`、`src/services/ai-gateway.ts`、`src/ai/client/generate-ui.ts`、`src/ai/features/registry.ts`
- **验收**：
  - [ ] 用合法 token 发送含自定义 `prompt` 的请求 → 400；未知 `featureId` → 400；不带 token → 401。
  - [ ] 模拟器中免费用户当月第 11 次调用 → 402；调用失败时计数不增加（单元测试覆盖）。
  - [ ] 非白名单来源的浏览器请求被 CORS 拒绝。
  - [ ] registry 里全部 AI 功能在 dev 环境各成功生成一次，输出格式与改动前一致（截图存档）。

### 1.3 修正计费 webhook（P0 #3）

- **问题**：`subscription_cancelled` 立即降为 free；任何 `order_created` 都记为 lifetime；服务端权益表与前端不同。
- **做法**：按下表重写状态机，写入 `billing/{uid}`：

| 事件 / 状态 | 写入的结果 |
| --- | --- |
| `subscription_created` / `updated` / `resumed`，status 为 `active` 或 `on_trial` | plan = pro，`currentPeriodEnd` = `renews_at`，`cancelAtPeriodEnd` = false |
| `subscription_cancelled` | plan 保持 pro，`cancelAtPeriodEnd` = true，`currentPeriodEnd` = `ends_at` |
| `subscription_expired` | plan = free |
| status 为 `past_due` | 保持 pro 并标记 `status: past_due`；宽限期长度写入 open-questions |
| `order_created` 且 variant 为终身版 | plan = lifetime；其他 variant 的 `order_created` 忽略 |
| `order_refunded`（终身版） | plan = free |

- 另外：用订阅的 `updated_at` 丢弃乱序的旧事件；记录 `customer_portal` 链接供「管理订阅」使用；缺 uid 时写入 `billing_orphans` 以便人工处理。
- **文件**：`functions/src/billing-webhook.ts`、`functions/src/create-checkout.ts`、新增 `functions/test/billing-webhook.test.ts` 和事件样例 JSON
- **验收**：
  - [ ] 上表每一行都有用样例 payload 的单元测试，全部通过；签名错误 → 401。
  - [ ] 测试「先收到 cancelled、后收到较旧的 updated」时结果仍是 cancelAtPeriodEnd。
  - [ ] 月付订阅的首张订单不会把用户变成 lifetime。
  - [ ] Holiday 在 Lemon Squeezy 测试模式完成一次「订阅 → 取消 → 到期」和一次「终身版购买 → 退款」，`billing/{uid}` 状态符合上表。

### 1.4 修复阅读计时写入（P0 #4）

- **问题**：`reading-session.ts` 使用 `collection(db,'users',uid,'data','sessions')`，路径段数为偶数，SDK 直接报错，错误被 catch 吞掉；rules 也没有这条路径。
- **做法**：改为 `workspaces/{ws}/users/{uid}/sessions/{sessionId}`（与其它数据同根），补 rules 与索引；热力图、连续天数从这里读。结束计时后弹出「要记一句吗？」，接入阶段 2 的快速记录。
- **文件**：`src/components/reading-session/reading-session.ts`、`src/profile/profile-heatmap.ts`、`firestore.rules`、`firestore.indexes.json`
- **验收**：
  - [ ] 模拟器中开始并停止一次计时，生成带 `durationMs` 的文档；rules 测试覆盖本人可写、他人不可写。
  - [ ] 刷新后 Profile 热力图当天格子有颜色。
  - [ ] Sentry/控制台无 `ReadingSession.start` 错误。

### 1.5 移除演示数据硬编码（P0 #6）

- **问题**：56 行代码对 Sapiens 做特殊处理；`_normalizeSapiens()` 覆盖用户自己的《人类简史》；22 本虚构书脊混入已登录用户书架；没有详情的书会深拷贝 Sapiens 的笔记；Profile 演示封面路径错误导致 10 张裂图；相框照片写死；各页演示数字互相矛盾。
- **做法**：
  - 定义 `BookDataSource` 接口，两个实现：`FirestoreDataSource`（登录）与 `DemoDataSource`（未登录）。所有 store 只经接口取数据；登录后永不读取种子数据。
  - 删除所有 `id === 'sapiens'`、`_isSapiensLike`、`_normalizeSapiens`、`ensureShelfDetailRecord` 的模板克隆；没有详情的书用空书工厂函数 + 空状态 UI。
  - 已登录用户不显示 mock 书脊；书少于 8 本时用「虚线书脊 + 添加一本」占位。
  - 演示数据合并为 `src/data/demo/` 一份：Search、Library、Graph、Map、Profile 的所有数字都从这一份计算。
  - 封面文件改为 ASCII 文件名、放 `public/covers/`，路径统一由 `asset()` 生成。
  - 相框贴图读用户头像；未登录或无头像时用像素小人图。删除 `public/3d/profile-frame-photo.jpg` 与 `me.jpg`。
- **文件**：`src/store/books-store.ts`、`src/search/search.js`、`src/library-2d/library-2d.ts`、`src/book/book.js`、`src/components/notes-wall/notes-wall.ts`、`src/data/seed/*`、`src/data/mock/*`、`src/three/room.ts`、`src/three-room/frame-fly.js`
- **验收**：
  - [ ] `grep -rni sapiens src --exclude-dir=data` 返回 0 行。
  - [ ] e2e：新注册用户看到的 Search/Library/Map/Graph/Profile 全是空状态，没有任何不属于他的书。
  - [ ] e2e：登录用户添加《人类简史》并设为「在读」、写一条高亮，刷新后状态和高亮不变且可编辑。
  - [ ] e2e：未登录演示模式下，各页显示的书籍总数、读完数一致。
  - [ ] Profile 页无裂图（Playwright 检查所有 `img` 的 `naturalWidth > 0`）。

### 1.6 书房资源压缩（P0 #5）

- **问题**：进入书房传输约 244MB；GLB 内嵌未压缩的 2K–4K PNG；7 张 EXR 约 35MB，其中 `oriented_strand_board_rough_2k.exr` 解析失败并抛出未捕获错误；`book.glb` 下载两次；17 个未使用的模型随部署发布。
- **做法**：
  - 新增 `scripts/optimize-assets.mjs`（依赖 `@gltf-transform/cli`）：输入 `assets-src/`，输出 `public/3d/`；交互物件贴图 2048、家具 1024、小配件 512；`--texture-compress webp --compress meshopt --simplify false`。原始文件不进 Git（见 1.7）。
  - 墙、地、桌、地毯、软木板改用 1K JPG（从 Poly Haven / ambientCG 重新取对应材质的 JPG 版），删除全部 EXR 和位移贴图，`room.ts` 中移除 `EXRLoader`。
  - GLB 加载加缓存（同一 URL 只请求一次）；装饰性家具在交互物件之后加载。
  - 进入书房时先显示一张房间海报图（WebP ≤ 250KB），3D 场景就绪后淡入。
  - `vercel.json` 为 `/3d/*`、`/textures/*` 设置 `Cache-Control: public, max-age=31536000, immutable`，文件名带内容 hash。
  - 从 `public/` 移走未引用的模型，包括 3 个 CC-BY-NC 模型。
  - 低端设备降级：`navigator.hardwareConcurrency <= 4` 或移动端时关闭实时阴影、像素比封顶 1.5。
- **文件**：`src/three/room.ts`、`src/preloader/hero-glb.js`、`src/search/search-decor-3d.js`、`public/3d/`、`public/textures/`、`vercel.json`、新增 `scripts/optimize-assets.mjs`
- **验收**：
  - [ ] Playwright 脚本统计「从落地页进入书房」的全部响应体积 ≤ 12MB（改动前实测 243.9MB）。
  - [ ] 同一脚本记录的 `pageerror` 为 0。
  - [ ] `npm run build` 后 `du -sh dist` < 60MB（改动前 481MB）。
  - [ ] 在 Chrome DevTools 「Fast 4G」限速下，点击进入后 2 秒内看到房间海报图。
  - [ ] 改动前后同一镜头的截图并排放入 `tests/screenshots/phase-1/room-compare.png`，由 Holiday 确认无明显画质下降。

### 1.7 仓库清理

- **问题**：已提交 `.npm-cache`（910 个文件）、与 `public/` 重复的根目录 `assets/`（393MB）、`reference_delete when complete/`、`tmp/`、`.vite/`、`.DS_Store`、`_ft.mjs`；`package-lock.json` 与 `package.json` 不同步，`npm ci` 失败。
- **做法**：删除上述目录并写入 `.gitignore`；重新生成锁文件；CI 与 deploy 改用 `npm ci`；大体积原始素材移到仓库外的 `assets-src/`（本地或云盘），只保留优化后的产物。是否用 `git filter-repo` 清理历史以缩小 `.git`（会改写历史）写入 open-questions，由 Holiday 决定。
- **验收**：
  - [ ] 全新克隆后 `npm ci && npm run build` 成功。
  - [ ] `git ls-files | grep -E "npm-cache|^assets/|reference_|^tmp/|\.vite/|DS_Store"` 无结果。
  - [ ] CI 全部任务为绿。

### 1.8 上线合规（P0 #7）

- **做法**：
  - 新增 `/privacy`、`/terms`、`/credits` 三个页面。隐私与条款由 Claude Code 起草模板，列明第三方处理方（Firebase/Google、DeepSeek、PostHog、Sentry、Lemon Squeezy、Vercel），最终文本由 Holiday 审定。
  - Credits 页由脚本从 GLB 的 `asset.extras`（标题、作者、许可、链接）自动生成。
  - 账号删除：设置里「删除账号」→ 先自动下载 JSON 导出 → 二次确认 → 云函数 `deleteAccount` 删除该用户全部 Firestore 路径、Storage 文件与 Auth 用户；有有效订阅时提示先取消。
  - PostHog 与 Sentry 在用户同意后再初始化（简单同意条，选择存 localStorage）。
- **验收**：
  - [ ] 三个页面可从页脚访问；Credits 列出当前加载的每个 CC-BY 模型。
  - [ ] 模拟器中删除测试账号后，脚本确认该 uid 下无任何文档、Auth 用户不存在。
  - [ ] 未同意前，网络面板中没有发往 PostHog / Sentry 的请求。

### 1.9 统一数据路径与文档

- **做法**：新建 `src/firebase/paths.ts` 作为所有 Firestore 路径的唯一来源，前端与云函数共用；代码里不再出现手写的 `collection(db, 'users', …)`。更新 `CLAUDE.md` 的文件名、数据结构、付费模型与本阶段的新约定。
- **验收**：
  - [ ] `grep -rnE "collection\(|doc\(" src | grep -v paths.ts` 中没有字面量路径字符串。
  - [ ] rules 测试对 `paths.ts` 中的每条路径至少有「本人可读写 / 他人不可」两个用例。
  - [ ] `CLAUDE.md` 中提到的每个文件路径都存在（脚本检查）。

### 阶段 1 门槛

- [ ] 1.1–1.9 全部验收项已勾选，`docs/phase-reports/phase-1.md` 附证据。
- [ ] Playwright 冒烟测试依次访问落地页、书房、Search、Library、Map、Graph、Profile、Book，`pageerror` 为 0。
- [ ] Holiday 用测试卡走完一遍订阅生命周期，状态正确。

## 阶段 2：核心闭环（第 3–6 周）

目标：让用户第一天就有满的书架、每天打开有事可做、不打开也会被邮件拉回来。`FEATURES.md` 已有快速记录、重温、读完仪式、统计的分步规格，按其实现，下面只写差异和验收。先做 2.10（埋点），否则无法判断阶段门槛。

### 2.1 全局快速记录

- **做法**：按 `FEATURES.md` Feature 1 实现。任意页面右下角「+」和快捷键 `C` 打开底部面板；书可不选，之后归属；网络中断时先写 IndexedDB，恢复后同步。阅读计时结束时自动打开它并预选当前书。
- **验收**：
  - [ ] 从书房、Library、Book、Map 任一页面，打开到保存最多 2 次点击 + 输入（e2e 覆盖）。
  - [ ] 390px 宽度下面板不被键盘遮挡（截图）。
  - [ ] 断网保存 → 恢复网络后出现在 Firestore（e2e 用 `context.setOffline`）。
  - [ ] 未归属记录可拖到书脊上归属，归属后出现在该书 Highlights 中。

### 2.2 书籍详情不再空白

- **做法**：添加书时自动生成「读前卡 + 文化背景」（新增 `intro-card` featureId，占 1 次免费额度；额度用尽时跳过并显示手动生成按钮）；每个 tab 设计有引导语的空状态；进入详情始终从 Overview 开始；书架预览里的行动数与 Actions tab 读同一个 store。
- **验收**：
  - [ ] 新添加一本书，30 秒内 Overview 显示读前卡（dev 环境截图）。
  - [ ] 从书房桌面、Library、搜索结果进入详情，默认 tab 均为 Overview。
  - [ ] 书架预览显示的行动数 = Actions tab 中的条数（e2e）。

### 2.3 读完仪式

- **做法**：按 `FEATURES.md` Feature 3 实现。状态从任意值变为 finished 时弹出三步问答（可跳过），AI 生成复盘卡存入 `moments/{bookId}`；复盘卡可导出为阅读卡片图片。
- **验收**：
  - [ ] 标记读完 → 回答三题 → 复盘卡显示在 Notes tab 顶部，刷新后仍在。
  - [ ] 跳过仪式不影响状态变更；重复标记读完不重复弹出。
  - [ ] Profile 年度书架上该书可打开复盘卡。

### 2.4 重温与每周邮件

- **做法**：
  - 按 `FEATURES.md` Feature 2 给高亮加 7/30/90 天重温字段；四种回应：仍然成立 / 补一句 / 变成行动 / 不再提醒。
  - 每周定时云函数生成邮件：到期高亮 3 条 + 到期行动 1 条。邮件内按钮为带签名的一次性链接（14 天过期），点击即更新状态，无需登录。含退订链接；用户可在设置里选择发送日。
  - 邮件服务商（如 Resend、Postmark）与发件域名写入 open-questions，由 Holiday 开通并配置 DNS。
  - 现有的行动提醒（`action-reminders.ts`）并入同一封周报，不单独发信。
- **验收**：
  - [ ] 模拟器中构造到期数据并触发定时函数，测试邮箱收到一封内容正确的邮件（HTML 截图存档）。
  - [ ] 点击邮件中「仍然成立」后对应字段更新；同一链接第二次点击显示「已处理」；过期链接被拒。
  - [ ] 退订后不再发送；没有到期内容的用户不发送空邮件。
  - [ ] 书房首页每日展示 3 条到期高亮，回应后即更新。

### 2.5 导入

- **做法**：在已有 Kindle 导入基础上新增 Goodreads CSV、StoryGraph CSV、微信读书笔记（用户粘贴导出的文本）、Readwise CSV。统一经过一个「预览 → 确认」页，按 ISBN 或「书名 + 作者」去重；导入后触发 2.6 的自动定位。
- **验收**：
  - [ ] `tests/fixtures/imports/` 中每种格式各有样例文件与单元测试，解析出的书、高亮数量正确。
  - [ ] 导入 200 本的 Goodreads CSV 在 10 秒内完成；重复导入同一文件书籍数不增加。
  - [ ] 微信读书样例中的章节名与想法正确对应到高亮的 `chapter` 与 `note` 字段。

### 2.6 地图自动定位

- **做法**：云函数 `resolveBookGeo`：用 Wikidata 查作者出生地（P19）与国籍（P27）得到「作者来源」；用一次内部 AI 调用推断「故事发生地」（不计入用户额度）；结果缓存到全局 `geoCache/{authorKey}`。书籍上显示「待确认」标记，用户一键确认或修改。地图洞察在已定位书 ≥ 10 本时才显示。开始阅读计时时可选记录「在哪里读」（城市级，需用户授权）。
- **验收**：
  - [ ] 一份 30 本的测试书单（15 本中文、15 本英文，存 `tests/fixtures/geo-books.json`，含标准答案）中，作者来源国家正确率 ≥ 80%。
  - [ ] 导入 20 本书后地图无需手动操作即出现标记。
  - [ ] 不足 10 本时不显示「You read most from …」类洞察。

### 2.7 跨书全文搜索

- **做法**：用 MiniSearch 或 FlexSearch 在客户端索引书名、作者、高亮、笔记、行动；中文按单字 + 双字切分；全局 `⌘K / Ctrl+K` 打开搜索面板，结果按类型分组并高亮命中词。
- **验收**：
  - [ ] 搜索只在高亮正文中出现的两字中文词（如演示数据里的「骗局」）能命中对应高亮。
  - [ ] 2,000 条高亮的测试数据下，建索引 < 1 秒、单次查询 < 50ms（单元测试计时）。

### 2.8 Today 首页与信息架构整理

- **做法**：
  - 书房作为首页，增加 Today 面板：当前在读（可点进详情）、今日重温 3 条、到期行动、开始计时。桌上的书点击打开「当前在读」，没有在读时打开「添加一本」。
  - Search 与 Library 合并为 Library（「浏览 / 整理」两个模式）；全局搜索由 2.7 提供。顶部导航变为 Library / Insights（Map、Graph、年度回顾）/ Profile。
  - 底部镜头按钮（Front/Desk/Shelf Wall/Notes Wall/Free Look）移入设置里的「镜头」分组。
  - 旧的 `#search`、`#library` 哈希路由继续可用（重定向）。
  - 导航结构变更前，先在 `docs/open-questions.md` 画出新结构由 Holiday 确认。
- **验收**：
  - [ ] 390 / 768 / 1440 三个尺寸下导航项全部可见、不重叠（截图）。
  - [ ] 桌上的书打开的是登录用户的在读书（e2e）。
  - [ ] 旧哈希链接均能到达新页面。

### 2.9 首次使用引导与落地页入口

- **做法**：落地页「Enter Library」改为立即可见、可键盘聚焦的 `<button>`；修复落地页书脊文字重叠。新用户首次登录进入三步引导：导入或添加 3 本书 → 记下第一条高亮 → 看到自己的书房与地图。
- **验收**：
  - [ ] 落地页加载后 1 秒内入口按钮可见，390px 下在首屏内；Tab 键可聚焦。
  - [ ] 引导可跳过，完成或跳过后不再出现。

### 2.10 埋点（最先做）

- **做法**：在 PostHog 定义事件：`signup`、`book_added`、`import_completed`、`highlight_saved`（含来源：quick/book/import）、`resurface_responded`、`email_action_clicked`、`session_completed`、`book_finished`、`ai_generated`。建一个漏斗和一个「每周活跃」留存看板。
- **验收**：
  - [ ] dev 环境走一遍注册 → 添加 → 高亮 → 读完，PostHog 中每个事件各出现一次。

### 阶段 2 门槛

- [ ] 2.1–2.10 验收项全部勾选。
- [ ] Holiday 邀请约 20 位内测用户（免费 Pro）：第 4 周仍有至少一半用户当周有保存高亮或回应重温。
- [ ] 至少 5 位内测用户做过 20 分钟访谈，结论写入 `docs/phase-reports/phase-2.md`。
- [ ] 未达标时不进入阶段 3，先根据访谈继续改闭环。

## 阶段 3：设计系统与主题接入（第 7–10 周）

目标：统一视觉元素，并把书房从「代码里写死的场景」改成「按主题 manifest 加载的场景」，让 Blender 做好的主题不改代码就能换上。主题的锚点命名与 manifest 字段以《AI × Blender 主题书房方案》为准，两份文档需保持一致。

### 3.1 补齐设计 token

- **做法**：在 `src/core/base.css` 增加：`--radius-sm/md/lg/pill`（4/8/16/999）、`--elev-1/2/3`、`--z-base/room-ui/panel/overlay/modal/toast`（0/10/100/200/300/400）、`--control-sm/md/lg`（32/40/48px）、字号 7 级（12/14/16/18/22/28/40）。字体变量加中文回退链：`--font-serif: 'Fraunces', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif`。语义层整理为 `--surface-0/1/2`、`--ink-1/2/3`、`--line-1/2`、`--accent`、`--accent-ink`、`--positive/--warning/--danger`、`--focus-ring`，主题切换时只重绑这一层。删除 Caveat 字体加载；字体改为自托管 woff2。
- **验收**：
  - [ ] `base.css` 中上述 token 全部存在，并在 `#styleguide` 页逐一展示。
  - [ ] 网络面板中没有对 `fonts.googleapis.com` / `fonts.gstatic.com` 的请求。

### 3.2 基础组件

- **做法**：新建 `src/components/ui/`：`button.css`（Primary / Secondary / Ghost / Danger / Icon，尺寸 sm/md/lg，状态 hover/active/focus-visible/disabled/loading）、`input.css`、`chip.css`、`panel.css`、`dialog.css`，以及输出自动转义模板的 `html` 工具（如 lit-html）。触屏下 sm 尺寸点击区扩到 44px。新增隐藏路由 `#styleguide` 展示全部组件与状态，并支持切换主题 token。
- **验收**：
  - [ ] `#styleguide` 在 1440 与 390 宽度的截图存档，Holiday 确认视觉。
  - [ ] 按钮 focus 状态可见（键盘 Tab 截图）。

### 3.3 样式规范化与 lint

- **做法**：加 Stylelint：组件 CSS 禁止 hex/rgb(a) 字面量、禁止非 token 的 `font-size`/`border-radius`/`z-index`、禁止 `!important`。先全局设为 warning，按 Book → Library → 弹窗与设置 → Profile → Map/Graph → 落地页的顺序迁移，每迁完一个目录就把该目录改为 error。所有按钮改用 `.btn` 变体，删除各视图自己的按钮类。JS/TS 中的颜色字面量收到 `src/shared/spine-colors.ts` 与图表调色板两处。
- **验收**（迁移前实测值写在括号里）：
  - [ ] `base.css` 之外的 hex 颜色 = 0（286）。
  - [ ] `rgba()` 字面量 ≤ 50（1,174），剩余的只用于 3D 叠加层并有注释。
  - [ ] 不同 `font-size` 写法 ≤ 10（124）；不同 `border-radius` ≤ 5（34）；`z-index` 只用 token（38 种）；`!important` = 0（32）。
  - [ ] 按钮类选择器（名称含 btn/button/cta）只剩 `.btn` 体系（137 个）。
  - [ ] `npx stylelint "src/**/*.css"` 0 error，并加入 CI。

### 3.4 响应式与无障碍

- **做法**：修复 390px 下导航只剩 Map 图标、书房导航与齿轮重叠；1440×900 下书籍预览面板超出视口；给设置面板 17 个无名按钮加 `aria-label`；触控目标 ≥ 44px。用 `@axe-core/playwright` 在主要视图跑检查。
- **验收**：
  - [ ] axe 在书房、Library、Book、Map、Graph、Profile、设置上 0 个 serious/critical 问题。
  - [ ] 三个尺寸的全视图截图无重叠、无横向滚动、无被裁掉的主操作。

### 3.5 主题 manifest 与场景加载器（可提前到第 3 周开始）

这一项是主题线和修复线的交汇点，建议在阶段 2 期间就先完成「契约 + 旧房间包装」两步，这样 Holiday 在 Blender 里做的主题可以随时接入预览。

- **做法**：
  1. **契约**：写 `docs/theme-contract.md`（锚点命名、单位与朝向、manifest 字段），内容与《AI × Blender 主题书房方案》的「锚点契约」一致；用 Zod 实现 `src/themes/schema.ts`。
  2. **加载器**：重构 `src/three/room.ts`：从 manifest 读取一个场景 GLB；按名字查找 `hotspot_*`（交互热区）、`slot_*`（CSS3D 插槽）、`cam_*`（镜头位姿）、`dyn_*`（运行时换贴图的网格）；热区到动作的映射写在一张表里；材质名以 `BAKED_` 开头的按无光照材质（MeshBasicMaterial）渲染，关闭实时阴影；飞入转场动画（`globe-fly`、`laptop-fly`、`frame-fly`、`graph-fly`、`book-fly`）改为克隆场景里对应的 `hotspot_*` 物件，不再单独加载 GLB。
  3. **旧房间包装**：把当前房间包装成 `legacy-study` 主题（继续使用现有的分件加载逻辑），在新主题到位前行为完全不变。
  4. **用户内容注入**：`dyn_book_current`（当前在读封面）、`dyn_photo`（头像）、`dyn_spines_*`（用户书脊生成的 canvas 贴图）、`slot_notes_wall`。
  5. **UI 联动**：manifest 的 `ui` 字段写入 `:root` 语义 token，2D 页面随主题变色。
  6. **加载体验**：先显示 manifest 的 `poster`，GLB 就绪后淡入；切换主题不刷新页面。
  7. **开关与权益**：URL 参数 `?theme=<id>` 和设置里的主题选择器；上线前选择器只对管理员 uid 可见。受限主题检查 `room.theme.<id>` 权益，未解锁时显示海报与升级入口。
  8. **托管**：主题文件从 `VITE_THEME_CDN`（如 Cloudflare R2）读取，不进 Git 与 Vercel 部署包。
  9. **契约测试**：用脚本（gltf-transform 的 JS API）生成一个只含方盒房间和全部锚点的 `test-theme.glb`，作为加载器的自动化测试夹具；另写 `scripts/validate-theme.mjs`，检查任意主题 GLB 是否包含全部必需锚点、体积是否在预算内，供 Blender 一侧导出后自检。
- **验收**：
  - [ ] `legacy-study` 下五个镜头的截图与重构前一致（Playwright 像素差异 < 1%）。
  - [ ] `?theme=test-theme` 时全部热区可点击并触发对应视图，镜头位姿来自 `cam_*`（e2e）。
  - [ ] 缺少非必需锚点时场景仍能加载并在控制台给出警告；缺少必需锚点时回退到 `legacy-study`。
  - [ ] `node scripts/validate-theme.mjs test-theme.glb` 通过；对缺锚点的文件给出具体缺失清单。
  - [ ] 已缓存时切换主题 < 3 秒且不刷新页面。
  - [ ] Holiday 的第一个 Blender 主题只通过新增 manifest 就能加载，不改任何前端代码。

### 3.6 轻量 2.5D 书房（移动端与低端设备）

- **做法**：manifest 增加可选的 `layers2d`（若干分层 WebP + 每层视差系数）与 `hotspots2d`（百分比坐标矩形 → 动作）。触屏手机、`prefers-reduced-motion`、WebGL 初始化失败或 GPU 基准过低时使用 2.5D 版；分层图可从主题的 Blender 场景直接渲染得到。
- **验收**：
  - [ ] 390×844 下默认显示 2.5D 书房，全部入口可点击；单个主题 2.5D 资源 ≤ 2MB。
  - [ ] 设置里可手动切换 3D / 2.5D。

### 阶段 3 门槛

- [ ] 3.1–3.6 验收项全部勾选；Stylelint 对所有视图目录为 error 级别且通过。
- [ ] 日间与复古暗色两个 Blender 主题已通过 `validate-theme.mjs`，在 iPad 与一台中端 Windows 笔记本上帧率 ≥ 30fps、首次加载传输 ≤ 10MB。
- [ ] 日间主题替换 `legacy-study` 成为默认房间；旧的分件加载代码与素材删除。

## 阶段 4：收费上线（第 11–12 周）

目标：用独立域名、能被搜索到的营销页和跑通的真实支付上线。开始前先完成 4.5（成本核算），再定最终价格。

### 4.1 域名与邮件

- **做法**：Holiday 购买域名并在 Vercel 绑定；Claude Code 配置 `marginalia-reading.vercel.app` 301 到新域名、把新域名加入 Firebase Auth 授权域名与 `ALLOWED_ORIGINS`、更新 Lemon Squeezy 的回跳地址；发件域名配置 SPF/DKIM/DMARC。
- **验收**：
  - [ ] 旧域名任意路径跳转到新域名同路径；登录、AI、支付回跳在新域名下正常。
  - [ ] 周报测试邮件在 Gmail 中不进垃圾箱，邮件头显示 SPF/DKIM 通过。

### 4.2 营销页

- **做法**：`/` 改为预渲染的静态营销页，应用本体移到 `/app`。结构：一句话价值主张 + 书房短视频或海报 → 三个核心场景（记录、重温、阅读地图）→ 主题书房展示 → 价格 → 常见问题 → 注册。中英文两版；含 Open Graph、`sitemap.xml`、`robots.txt`。文案由 Claude Code 起草、Holiday 定稿。
- **验收**：
  - [ ] Lighthouse（移动端）Performance ≥ 90、SEO ≥ 95、Accessibility ≥ 95。
  - [ ] 营销页首屏不加载 three.js、Firebase、amCharts（网络面板确认）。

### 4.3 定价、付费墙与订阅管理

- **做法**：在 Lemon Squeezy 创建 Pro 月付、Pro 年付、早鸟终身版（限量）三个 variant（Holiday 操作）；定价页与升级弹窗在三个时机出现：AI 额度用尽、点击未解锁主题、年度回顾导出 PDF；设置里显示当前套餐、到期日、「管理订阅」（`customerPortalUrl`）；主题可试用 7 天。权益变更后前端实时生效。
- **验收**：
  - [ ] 测试模式下三个入口都能完成购买，支付后 10 秒内无需刷新即解锁。
  - [ ] 取消订阅后设置显示「Pro 有效至 …」，到期后自动变回 Free，用户数据不受影响。
  - [ ] Holiday 用自己的真实支付卡在正式模式购买一次月付并退款，状态正确。

### 4.4 公开主页与分享

- **做法**：公开主页从 `#/p/slug` 改为 `/u/slug` 路径路由（旧链接重定向）；用 Vercel 边缘函数为主页、单书页、阅读卡片输出 `og:title` / `og:image`，预览图动态生成（用户的书房海报 + 年度书量或一句高亮）。公开页只读 `publicProfiles`，不加载登录代码。
- **验收**：
  - [ ] 用 Facebook Sharing Debugger / X Card Validator 检查，主页与阅读卡片链接都能显示正确预览图。
  - [ ] 旧哈希链接跳转到新路径；未公开的主页返回 404。

### 4.5 AI 成本核算（最先做）

- **做法**：用阶段 2 内测期间审计日志中的 token 数，写脚本输出：每个 featureId 的平均成本、每用户每月调用次数的 P50/P90、按拟定价格计算的 AI 成本占收入比例。结果写入 `docs/phase-reports/ai-cost.md`，由 Holiday 定下 `FREE_AI_MONTHLY`、`PRO_AI_MONTHLY_FAIR_USE` 和最终价格。
- **验收**：
  - [ ] 报告中 P90 Pro 用户的月 AI 成本 ≤ 月费的 20%；否则先调低公平使用线或换模型。

### 4.6 运维与监控

- **做法**：Firestore 每日定时导出到 Cloud Storage（保留 30 天）；Google Cloud 预算告警；Sentry 告警规则（新错误、webhook 失败、AI 错误率）；对营销页和 `aiGenerate` 的外部存活监测。
- **验收**：
  - [ ] 从备份恢复到 dev 项目演练一次成功，步骤写入 `docs/runbooks/restore.md`。
  - [ ] 人为触发一次 webhook 签名失败，Holiday 收到告警。

### 4.7 发布

- **做法**：Claude Code 准备发布素材（演示 GIF、截图、中英文介绍、更新日志页）；Holiday 负责渠道投放（如 Product Hunt、小红书、即刻、少数派、相关读书社区）与内测用户转付费邀请。
- **验收**：
  - [ ] 上线后 2 周内的注册、激活（自动 ≥ 3 本书 + 1 条高亮）、付费转化率写入 `docs/phase-reports/phase-4.md`，作为决定主题产出节奏的依据。

### 阶段 4 门槛

- [ ] 4.1–4.7 验收项全部勾选。
- [ ] 一笔真实支付从下单到解锁、取消、到期全程正确，隐私政策与条款已上线。

## 附录

### 验收命令清单

| 用途 | 命令 | 备注 |
| --- | --- | --- |
| 全部静态检查 | `npm run lint && npm run typecheck && npm run typecheck:room && npm run check:entitlements` | 每次提交前 |
| 单元测试 | `npm run test:unit` |  |
| Firestore 规则测试 | `npm run test:rules` | 需要 Firebase 模拟器与 Java；本地没有时以 CI 的 rules-tests 结果为准 |
| 构建与包体积 | `npm run build && npm run size && du -sh dist` | 阶段 1 后 dist < 60MB |
| 端到端与截图 | `npm run test:e2e` | 三个尺寸截图存 `tests/screenshots/phase-N/` |
| 书房传输量 | `node scripts/measure-room-load.mjs` | 阶段 1 新增：输出总字节数与 pageerror 数 |
| 主题自检 | `node scripts/validate-theme.mjs <file.glb>` | 阶段 3 新增 |
| 样式规范 | `npx stylelint "src/**/*.css"` | 阶段 3 新增 |
| 硬编码检查 | `grep -rni sapiens src --exclude-dir=data` | 应为 0 行 |

### 需要 Holiday 亲自完成的事

Claude Code 做不了或不应该做的事项，建议提前安排：

| 阶段 | 事项 | 何时需要 |
| --- | --- | --- |
| 1 | 提供已付费用户名单（如有）；在生产环境运行迁移脚本；部署新的 rules 与云函数 | 1.1–1.4 完成后 |
| 1 | 在 Lemon Squeezy 测试模式走完订阅生命周期 | 1.3 验收 |
| 1 | 决定是否用 `git filter-repo` 清理历史 | 1.7 |
| 1 | 审定隐私政策与服务条款文本（建议请法律专业人士看一遍） | 1.8 |
| 1 | 确认压缩后书房画质 | 1.6 |
| 2 | 选定并开通邮件服务、配置发件域名 DNS | 2.4 之前 |
| 2 | 确认新的导航结构；招募约 20 位内测用户并访谈 5 位 | 2.8、阶段 2 门槛 |
| 3 | 确认 `#styleguide` 视觉；制作并导出两个 Blender 主题（见独立文档） | 3.2、3.5 |
| 3 | 开通 Cloudflare R2（或同类对象存储）并提供访问密钥 | 3.5 |
| 4 | 购买域名；在 Lemon Squeezy 创建正式产品与价格；用真实卡完成一次付款与退款 | 4.1、4.3 |
| 4 | 根据成本报告定最终价格与额度；定稿营销文案；渠道发布 | 4.2、4.5、4.7 |

### 给 Claude Code 的启动提示（可直接复制）

```text
请执行《Marginalia 分阶段优化执行方案》的阶段 1。先读 CLAUDE.md、MARGINALIA_SPEC.md、FEATURES.md 和方案中的「执行规则」。
在新分支 phase-1-stabilize 上按 1.1 → 1.9 的顺序完成，每个任务完成后跑完全部检查再提交，并把每条验收的证据记入 docs/phase-reports/phase-1.md。
遇到需要我决定的事项，写入 docs/open-questions.md 并继续其他任务；不要修改生产环境数据，不要合并到 main。
```
