/* ==========================================================================
   Marginalia · Seed data — Sapiens: A Brief History of Humankind
   --------------------------------------------------------------------------
   One file per book. This is hand-authored mock content used until real
   user data is imported from Notion / Firestore.
   bookType: 'science' → AI modules: mind map, concept graph, chapter outline
   ========================================================================== */

window.__SEED_SAPIENS = {
  id: 'sapiens',
  bookType: 'science',
  title: 'Sapiens: A Brief History of Humankind',
  titleZh: '人类简史',
  author: 'Yuval Noah Harari',
  authorZh: '尤瓦尔·赫拉利',
  year: 2011,
  status: 'finished',
  rating: 4,
  tags: ['人类学', '宏观历史', '认知革命', '叙事'],
  cover: {
    bg:     '#14263e',
    text:   '#e8dfc8',
    font:   "'Bodoni Moda', serif",
    weight: 700,
    art:    'sapiens',
    image:  'assets/covers/sapiens-real.jpg'
  },
  meta: {
    publisher:    '中信出版社',
    edition:      '2014 简体版',
    pages:        440,
    startedAt:    '2024-09-14',
    finishedAt:   '2024-10-08',
    readingHours: 18
  },
  location: {
    country: 'IL',
    city:    'Jerusalem'
  },
  geo: {
    authorOrigin:    { country: 'IL', city: 'Jerusalem' },
    contentLocation: { country: 'IL', city: 'Jerusalem' },
    readerLocation:  { country: 'CN', city: 'Beijing' }
  },
  summary: '横跨进化生物学、认知人类学、历史学与哲学的一部宏大叙事。以以色列学者视角赋予该书对「集体虚构」的特殊敏感。',
  insight: {
    oneLiner:         '人类通过共同虚构建立大规模协作，但协作规模的增长不等于个体幸福提升。',
    answeredQuestion: '为什么素不相识的人类可以在国家、货币、宗教等抽象体系中长期协作。',
    coreQuestion:     '当文明增长无法转化为幸福时，我们还应如何定义进步？',
    integration:      '这本书最有价值的不是"答案"，而是框架：把神话、制度、市场都视为互主观现实。用这个框架反看工作、身份与成功叙事，会看到哪些欲望来自社会脚本，哪些来自真实体验。',
    agree: [
      '"互主观现实"是解释现代制度运作的高效模型。',
      '科学革命的关键是承认无知，而不是捍卫既有答案。'
    ],
    doubt: [
      '农业革命"最大骗局"论过于单线，低估了不同地区的历史差异。',
      '对帝国与资本主义的评价有时过于功能主义，伦理维度不足。'
    ],
    pursue: [
      '继续对照《枪炮、病菌与钢铁》验证地理决定论边界。',
      '建立自己的"集体叙事清单"，定期检查哪些叙事正在主导决策。'
    ]
  },
  connections: [
    {
      title:    '枪炮、病菌与钢铁',
      author:   'Jared Diamond',
      relation: '方法论前史：同样用跨学科视角解释文明差异，但实证力度更强。',
      type:     'methodology'
    },
    {
      title:    '思考，快与慢',
      author:   'Daniel Kahneman',
      relation: '微观补充：从认知偏差层面解释"虚构为何能被集体相信"。',
      type:     'cognitive layer'
    },
    {
      title:    '今日简史',
      author:   'Yuval Noah Harari',
      relation: '问题续篇：把《人类简史》的宏观叙事推到 AI、算法与伦理未来。',
      type:     'follow-up'
    }
  ],
  highlights: [
    {
      id: 1, page: 27, chapter: '第二章 · 知识之树', kind: 'concept',
      quote:     '历史从人类学会说谎那天开始。',
      conceptId: 'fictional-thinking',
      annotation: '「说谎」在此暗指虚构能力，而非道德判断。赫拉利化用维柯（Vico）的《以诗性智性创造历史》传统，以及尼采「人是会编故事的动物」的论断。虚构能力是有论述性的人类天赋，它既是文明的基础，也是政治、欺骗与意识形态形成压迫的根源。'
    },
    {
      id: 2, page: 87, chapter: '第五章 · 历史上最大的骗局', kind: 'argument',
      quote:     '农业革命是历史上最大的骗局。小麦并没有让人类的生活变得更好，却让更多的人挤在更小的空间里。',
      conceptId: 'agricultural-revolution',
      annotation: '这是对马歇尔·萨林斯（Marshall Sahlins）《原始富裕社会》论调的通俗化表达。萨林斯在 1972 年的《石器时代经济学》中提出：狩猎采集者每天工作 3–5 小时即可满足需求，拥有大量休闲时间。这一论断挑战了进步主义历史叙事，但也回避了人类学的质疑（样本偏差、寿命短期等因素未被充分考虑）。'
    },
    {
      id: 3, page: 179, chapter: '第八章 · 金钱的味道', kind: 'concept',
      quote:     '金钱是迄今为止人类发明的最普遍、最有效率的互信系统。',
      conceptId: 'intersubjective-reality',
      annotation: '此处「互信系统」（inter-subjective trust system）是赫拉利的核心概念框架。不是「主观」（仅存在于个人意识），也不是「客观」（独立于人类意识存在），而是「互主观」（inter-subjective）—— 存在于人们共同相信的集体意识中。货币、法律、国家均属此类。这一分类源自现象学传统，可追溯至胡塞尔与梅洛-庞蒂。'
    },
    {
      id: 4, page: 259, chapter: '第十四章 · 发现自己的无知', kind: 'action',
      quote:     '科学革命的核心，不是某一项具体发现，而是发现了自己的无知。',
      conceptId: 'scientific-revolution',
      annotation: '苏格拉底「我只知道我不知道」的认识论立场在这里得到宏观历史维度的延伸。赫拉利将其与卡尔·波普尔的「可证伪性」原则相连：科学的本质是承认一切知识可能被推翻的可能。这与传统宗教和帝国经书已完备的「封闭知识体系」形成对照——后者以权威与稳定性文本为目标，而非追问其局限。'
    }
  ],
  cultural: [
    { tag: '认知革命', term: '虚构能力 (Fictional Thinking)', conceptId: 'fictional-thinking',
      body: '约 7 万年前，智人获得了创造并相信「不存在之物」的能力，如神话、国家、货币。这一跃迁使大规模社会协作成为可能，也使其他人种动物从未突破 150 人的邓巴数量限制。',
      ref: '第 2–4 章' },
    { tag: '农业革命', term: '历史最大骗局', conceptId: 'agricultural-revolution',
      body: '赫拉利认为农业革命对大多数人类个体而言是生活质量的倒退：更长的劳动时间、更单调的饮食、更高的疫病风险。但它是物种数量的胜利引擎。「成功的物种、未必等于幸福的个体」。',
      ref: '第 5–8 章' },
    { tag: '帝国主义', term: '互联网之前的全球化', conceptId: 'imperial-globalization',
      body: '书中将帝国视为人类融合的主要驱动力。帝国徐徐而同时传播了法律、语言与文化，形成了今天我们所说的「全球文明」——这是对帝国主义的去政治化常识解读，需要结合批判理论保持警觉。',
      ref: '第 11 章' },
    { tag: '科学革命', term: '承认无知的革命', conceptId: 'scientific-revolution',
      body: '现代科学的核心突破并非某项发现，而是一种认识论态度：承认「我们不知道」，并将这种无知转化为研究动力。这与中世纪「经书已完备」的知识封闭心态形成鲜明对比。',
      ref: '第 14–15 章' },
    { tag: '历史哲学', term: '邓巴数 (Dunbar\'s Number)', conceptId: 'dunbar-number',
      body: '英国人类学家罗宾·邓巴提出的认知上限概念：灵长类动物因数目质容量，稳定社交网络上限约 150 人。智人超越此限制依靠的是共同虚构（神话、法律、货币），而非生物性脑容量提升。',
      ref: '第 2 章' },
    { tag: '消费主义', term: '幸福迷思', conceptId: 'happiness-myth',
      body: '现代经济以「欲望再生产」为引擎——满足一个欲望立刻催生新欲望。赫拉利更倾佛教视角：苦来源于对欲望的执着，而非欲望本身。这一论点续《今日简史》中对冥想的推崇一脉相承。',
      ref: '第 19 章' }
  ],
  mindmap: {
    title:    'Sapiens Knowledge Structure',
    subtitle: '概念地图 + 时间线 + 论证骨架',
    timeline: [
      { era: '宇宙与生命', items: [
        { year: '135亿年前', title: '大爆炸，宇宙诞生', tags: ['物质·能量·时间·空间', '物理学起点'] },
        { year: '38亿年前',  title: '地球出现有机体', tags: ['生物学诞生', '自然选择开始运作'] }
      ]},
      { era: '人属史前', items: [
        { year: '250万年前',      title: '早期人属出现于东非',           tags: ['多种人类共存'] },
        { year: '80万年前',       title: '人类开始用火',                tags: ['烹饪', '食物链跃升'] },
        { year: '50万～20万年前', title: '尼安德特人兴起，智人出现',     tags: ['多人种并存'] }
      ]},
      { era: '认知革命', items: [
        { year: '7万年前',           title: '虚构语言出现',                 tags: ['偶然基因突变', '陌生人大规模协作'] },
        { year: '3.2万年前',         title: '施泰德狮人雕像',               tags: ['艺术与象征'] },
        { year: '4.5万～1.6万年前',  title: '智人扩张全球，尼安德特人灭绝', tags: ['大型动物灭绝潮'] }
      ]},
      { era: '农业革命', items: [
        { year: '前9500～8500年', title: '农业在多地独立诞生',          tags: ['中东·中国·中美洲'] },
        { year: '前9000年',      title: '哥贝克力石阵建造',            tags: ['宗教可能先于农业'] },
        { year: '前5000～1776年', title: '城市·帝国·文字秩序形成',    tags: ['文字先用于账目'] }
      ]},
      { era: '融合统一与科学革命', items: [
        { year: '前600年',        title: '铸币普及，金钱体系成型',     tags: ['普世信念体系'] },
        { year: '前550年～700年', title: '帝国与世界宗教扩张',          tags: ['统一人类秩序'] },
        { year: '1492年',         title: '地理大发现触发全球扩张',     tags: ['科学与征服联姻'] },
        { year: '1700～1850年',   title: '工业革命',                    tags: ['热能→动能', '时间标准化'] },
        { year: '1945年～今',     title: '核时代与全球化',              tags: ['首次具备自我毁灭能力'] },
        { year: '21世纪',         title: '生物工程与 AI 时代',          tags: ['自然选择→智能设计'] }
      ]}
    ],
    revolutions: [
      {
        id: 'cog', title: '认知革命', period: '约 7 万年前',
        thesis: '偶然基因突变改变了大脑连接方式，智人首次能谈论并传播「不存在之物」。',
        branches: [
          { label: '触发机制', items: ['偶然基因突变', '大脑连接改变', '7 万年前爆发'] },
          { label: '虚构语言', items: ['谈论不存在的事', '传播集体神话', '陌生人大规模协作'] },
          { label: '历史证据', items: ['施泰德狮人', '拉斯科壁画', '贸易与宗教出现'] },
          { label: '深远影响', items: ['尼安德特人灭绝', '智人扩张全球', '大型动物灭绝潮'] }
        ],
        points: [
          '人类统治地球的关键不是肌肉，而是共享虚构的能力。',
          '认知失调并非缺陷，而是复杂文化得以运作的机制。',
          '从认知革命起，人类已经开始重塑乃至破坏生态系统。'
        ],
        chapters: ['第 1 章 没什么特别的动物', '第 2 章 知善恶树', '第 3 章 亚当和夏娃的一天', '第 4 章 毁天灭地的人类洪水']
      },
      {
        id: 'agri', title: '农业革命', period: '约 1.2 万年前',
        thesis: '农业让人口扩张，但多数个体更辛苦、更脆弱；赫拉利将其称为「史上最大骗局」。',
        branches: [
          { label: '驯化地点', items: ['中东：小麦与山羊', '中国：稻米与猪', '中美洲：玉米与豆'] },
          { label: '骗局本质', items: ['小麦分布爆发式扩张', '农民劳动更重', '奢侈陷阱难以回头'] },
          { label: '新型秩序', items: ['想象秩序支撑帝国', '文字先用于账目', '等级制度固化'] },
          { label: '神圣干预', items: ['哥贝克力石阵', '宗教或先于农业', '神圣动力推动定居'] }
        ],
        points: [
          '从演化视角看，真正的赢家可能是被种植的作物，而非人类。',
          '每一次产量提升都可能反过来加剧人口与劳动压力。',
          '农业是官僚、税收、法典与阶级秩序的大规模起点。'
        ],
        chapters: ['第 5 章 史上最大骗局', '第 6 章 盖起金字塔', '第 7 章 记忆过载', '第 8 章 历史从无正义']
      },
      {
        id: 'uni', title: '人类融合统一', period: '公元前后数百年',
        thesis: '金钱、帝国、宗教三股力量把彼此隔绝的人群纳入同一套全球系统。',
        branches: [
          { label: '金钱', items: ['普世信念体系', '去道德化交换', '信用即未来虚构'] },
          { label: '帝国', items: ['摧毁者与创造者', '努曼西亚悖论', '文化遗产超越帝国'] },
          { label: '宗教', items: ['超人类合法性', '普世性与推广性', '泛神论到一神论'] },
          { label: '历史偶然', items: ['马后炮谬误', '二级混沌系统', '最不可能者成真'] }
        ],
        points: [
          '金钱是跨文明运行效率最高的信念系统。',
          '帝国并不只留下暴力，也留下语言、法制与基础设施网络。',
          '历史没有剧本，偶然事件常常决定文明路径。'
        ],
        chapters: ['第 9 章 历史的方向', '第 10 章 金钱的味道', '第 11 章 帝国的愿景', '第 12 章 宗教的法则', '第 13 章 成功的秘密']
      },
      {
        id: 'sci', title: '科学革命', period: '约 500 年前至今',
        thesis: '承认无知、实验观察与数学建模联手，把知识转化成生产力与统治力。',
        branches: [
          { label: '核心突破', items: ['从承认无知出发', '观察·数学·实验', '知识=技术=权力'] },
          { label: '科学与帝国', items: ['地图留白激发探索', '库克远征联姻', '科学即征服工具'] },
          { label: '资本主义', items: ['信用是未来虚构', '银行放贷机制', '股份公司模式'] },
          { label: '工业革命', items: ['热能转动能', '消费主义诞生', '时间被商品化'] }
        ],
        points: [
          '科学革命不是某个答案，而是一种持续提问的方法。',
          '资本主义与帝国扩张在近代历史中长期共生。',
          '工业体系改写了能源结构、社会节律与人的欲望结构。'
        ],
        chapters: ['第 14 章 发现自己的无知', '第 15 章 科学与帝国的联姻', '第 16 章 资本主义教条', '第 17 章 工业的巨轮', '第 18 章 一场永远的革命', '第 19 章 幸福快乐的日子？', '第 20 章 智人末日']
      }
    ],
    ideas: [
      { title: '虚构的力量', body: '国家、金钱、人权、公司都属于集体虚构。只要被共同相信，它们就比物理实体更有组织力。' },
      { title: '农业的代价', body: '农业让人口与权力结构复杂化，但同时带来更重劳动、单一饮食与更高疾病暴露。' },
      { title: '想象秩序',   body: '法典、等级、制度并非自然发现，而是社会共同维护的叙事结构。' },
      { title: '无知的革命', body: '现代科学从「我不知道」出发，把未知当作可以系统推进的任务。' },
      { title: '金钱故事',   body: '金钱是最普遍的跨文化信任媒介，压缩了价值交换的摩擦。' },
      { title: '统一方向',   body: '历史总体从分散走向连接，但整合规模扩大并不自动意味着幸福提升。' }
    ],
    happiness: {
      question: '所有革命和进步，真的让人类更快乐了吗？',
      views: [
        { title: '进步论',   body: '能力上升通常带来福祉提升，历史是累积改进。' },
        { title: '退步论',   body: '文明把人从自然状态拉远，也引入新的焦虑和异化。' },
        { title: '微妙立场', body: '现代进步真实存在，但代价常转嫁给其他物种与生态系统。' }
      ],
      verdict: '幸福问题没有简单答案，但若增长不能转化为幸福，现代叙事的核心前提就会被反问。'
    },
    futurePaths: [
      { title: '生物工程', badge: '基因治疗 · CRISPR',      details: ['直接改写 DNA，突破传统物种边界', '风险是形成生物学意义上的阶层分化'] },
      { title: '仿生工程', badge: '脑机接口 · 人机融合',    details: ['身体能力可被人工组件增强与替代', '边界问题：半机械人是否仍是传统意义的人类'] },
      { title: '无机生命', badge: 'AI · 奇异点 · 意识上传', details: ['若 AI 超越人类智慧，历史主体可能改变', '若意识可复制，死亡与个体性的定义将重写'] }
    ]
  },
  actions: [
    { id: 'a1', text: '重读第二章「知识之树」，整理「虚构能力」的论证逻辑链，写成一页笔记',                                                                                                   status: 'done',  tag: '已完成' },
    { id: 'a2', text: '找到《石器时代经济学》，重读萨林斯对「原始富裕社会」的论证，与赫拉利对比',                                                                                            status: 'done',  tag: '已完成' },
    { id: 'a3', text: '用「互主观现实」框架重新审视手机职业选择：哪些「重要感」来自集体叙事，哪些来自真实体验？写成一篇私人日志',                                                             status: 'todo',  tag: '待执行' },
    { id: 'a4', text: '重读《今日简史》第八九章「冥想」，测试赫拉利自己是否真的践行了佛教幸福论',                                                                                            status: 'todo',  tag: '待执行' },
    { id: 'a5', text: '与朋友讨论：如果金钱是集体虚构，我们为什么还要工作？整理讨论结果',                                                                                                    status: 'todo',  tag: '待执行' },
    { id: 'a6', text: '每次刷 Feed 超过 15 分钟后，停下来问自己：「此刻什么欲望被激活？这个欲望是我的还是算法的？」持续一周记录',                                                            status: 'doing', tag: '进行中' }
  ],
  graph: {
    concepts: [
      {
        id: 'fictional-thinking', name: '虚构能力',
        aliases: ['Fictional Thinking', 'Collective Fiction'],
        contextTag: '认知革命', relationType: 'core-thesis', strength: 1,
        description: '陌生人大规模协作并不靠血缘延展，而靠被共同相信的虚构对象来组织。',
        highlightIds: [1], actionIds: ['a1', 'a5'],
        readerUnderstanding: '这是这本书最核心的入口。它把神话、公司、货币、国家都压回"被共同维持的故事"这一层。'
      },
      {
        id: 'agricultural-revolution', name: '农业革命',
        aliases: ['历史最大骗局'],
        contextTag: '农业革命', relationType: 'questions', strength: 0.9,
        description: '农业在物种规模上是成功的，但在个体幸福和劳动负担上可能是一场反讽式进步。',
        highlightIds: [2], actionIds: ['a2'],
        readerUnderstanding: '我不会把"最大骗局"当成定论，更把它当成对进步叙事的一次必要反问。'
      },
      {
        id: 'intersubjective-reality', name: '互主观现实',
        aliases: ['Inter-subjective Reality', '互信系统'],
        contextTag: '历史哲学', relationType: 'core-thesis', strength: 0.96,
        description: '真正支撑制度运转的并非客观实体，而是被大量人共同相信并持续执行的抽象秩序。',
        highlightIds: [3], actionIds: ['a3', 'a5'],
        readerUnderstanding: '这是我后来反看工作、身份、金钱与成功脚本时最常调用的概念。'
      },
      {
        id: 'scientific-revolution', name: '科学革命',
        aliases: ['承认无知'],
        contextTag: '科学革命', relationType: 'supports', strength: 0.84,
        description: '现代科学真正改变历史的不是具体发现，而是承认未知并系统推进未知的姿态。',
        highlightIds: [4],
        readerUnderstanding: '相比"科学带来技术"，我更在意它把无知从羞耻变成方法。'
      },
      {
        id: 'happiness-myth', name: '幸福迷思',
        aliases: ['欲望再生产'],
        contextTag: '消费主义', relationType: 'action-trigger', strength: 0.88,
        description: '文明增长和欲望扩张并不自动导向幸福，反而可能持续制造新的不满足。',
        actionIds: ['a4', 'a6'],
        readerUnderstanding: '它把宏观历史问题压回我的日常生活：为什么效率更高、选择更多，却不更轻松。'
      },
      {
        id: 'dunbar-number', name: '邓巴数',
        aliases: ['Dunbar Number'],
        contextTag: '历史哲学', relationType: 'supports', strength: 0.68,
        description: '稳定社交网络存在生物学上限，而文明通过共同虚构暂时跨过了这个上限。',
        readerUnderstanding: '它让我更清楚制度并不是"自然长大"的，而是为了越过认知上限而发明的脚手架。'
      }
    ],
    suggestedConcepts: [
      {
        id: 'collective-narratives', name: '集体叙事',
        aliases: ['Shared Narratives'],
        contextTag: '叙事', relationType: 'supports', strength: 0.58,
        description: 'AI 认为你已经在多处把工作、身份和成功理解为社会脚本，值得单列成概念。',
        actionIds: ['a3', 'a5'],
        rationale: '你的结论部分反复把制度、身份与成功解释为"社会脚本"，这可能已经超出单一书籍摘要。'
      },
      {
        id: 'progress-myth', name: '进步叙事',
        aliases: ['Myth of Progress'],
        contextTag: '历史哲学', relationType: 'questions', strength: 0.52,
        description: 'AI 认为这本书持续在挑战"增长等于更好"的默认叙事。',
        rationale: '农业革命、幸福问题与消费主义几处笔记都在反问进步是否真的转化为更好的生活。'
      }
    ]
  },
  context: {
    place:     '北京 · 朝阳区书房 · 主要在家里的书桌上读，星期日间，下午有阳光。偶尔在咖啡馆里读，但总觉得效果差——这本书需要静下来吸收，不适合碎片时间。最佳状态是在周末早晨，咖啡还没冷掉，手机没打开。',
    mood:      '过渡期的不确定感。那段时间正在重新思考工作的意义，从一个项目结束到下一个开始之间的空白期——觉得自己在一个大叙事的缝隙里，有时失重。赫拉利的宏观视角恰恰对应着某种新意：人类的整个历史都是偶然加加偶然的结果，没有一个必然的剧本在等待。',
    moodTags:  ['困惑', '好奇', '寻找意义'],
    life:      '2024 年秋 · 30 岁。同辈中部分人，父母开始催婚了，朋友们开始买房，公司在裁员季边缘。这本书让我意识到，「三十岁应该怎样」本身就是一个文化虚构，是同温层社会反映的生命周期叙事。有点哑然失笑，又有点解脱。',
    lifeTags:  ['30 岁', '职业迷茫', '北京秋天']
  }
};
