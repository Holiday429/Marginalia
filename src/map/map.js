/* ==========================================================================
   Marginalia · Reading Map view
   Globe projection (geoOrthographic) — spin in any direction, click to highlight.
   ========================================================================== */

let __mapChart       = null;
let __mapBooted      = false;
let __mapWorldSeries = null;
let __mapChinaSeries = null;
let __mapInChina     = false;
let __mapFocusedCountryId = null;
let __mapActivePoly  = null;
let __mapRoot        = null;
let __mapGoWorldFn   = null;
let __mapPanelState  = null;
let __mapHoverCountryId = null;
let __mapPointer    = { x: 0, y: 0 };
let __mapGeoMode    = 'all';

/* ── Book data ──────────────────────────────────────────────────────────── */

const MAP_BOOKS = [
  { id:"b1",  title:"Dream of the Red Chamber",      author:"Cao Xueqin",       bg:"#6b3020", text:"#f2e0c8", loc:"CN", province:"CN-11", city:"Beijing / Nanjing", year:1791, tags:["Classic","Family"] },
  { id:"b2",  title:"The Three-Body Problem",        author:"Liu Cixin",        bg:"#1c3550", text:"#8eb8d4", loc:"CN", province:"CN-11", city:"Beijing",           year:2008, tags:["Sci-fi","Trilogy"] },
  { id:"b3",  title:"Wild Swans",                    author:"Jung Chang",       bg:"#3e2214", text:"#e4c08a", loc:"CN", province:"CN-51", city:"Yibin, Sichuan",    year:1991, tags:["Memoir","Women"] },
  { id:"b4",  title:"Wolf Totem",                    author:"Jiang Rong",       bg:"#324820", text:"#bcd4a0", loc:"CN", province:"CN-15", city:"Inner Mongolia",    year:2004, tags:["Fiction","Nature"] },
  { id:"b5",  title:"Raise the Red Lantern",         author:"Su Tong",          bg:"#7a2e18", text:"#f0d0a8", loc:"CN", province:"CN-14", city:"Shanxi",            year:1990, tags:["Novella","Power"] },
  { id:"b6",  title:"Soul Mountain",                 author:"Gao Xingjian",     bg:"#24402e", text:"#a0c8ae", loc:"CN", province:"CN-42", city:"Wuhan / Rivers",   year:1990, tags:["Nobel","Journey"] },
  { id:"b7",  title:"Balzac & the Seamstress",       author:"Dai Sijie",        bg:"#5a3018", text:"#e0b88a", loc:"CN", province:"CN-43", city:"Phoenix, Hunan",   year:2000, tags:["Coming-of-age"] },
  { id:"b8",  title:"Fortress Besieged",             author:"Qian Zhongshu",    bg:"#2e2010", text:"#e4c08a", loc:"CN", province:"CN-31", city:"Shanghai",          year:1947, tags:["Satire","Comedy"] },
  { id:"b10", title:"Rickshaw Boy",                  author:"Lao She",          bg:"#301808", text:"#dcb880", loc:"CN", province:"CN-11", city:"Beijing",           year:1936, tags:["Classic","Labour"] },
  { id:"b11", title:"Red Sorghum",                   author:"Mo Yan",           bg:"#601408", text:"#ecc0a0", loc:"CN", province:"CN-37", city:"Gaomi, Shandong",  year:1987, tags:["Nobel","War"] },
  { id:"b13", title:"Border Town",                   author:"Shen Congwen",     bg:"#304e28", text:"#b0d098", loc:"CN", province:"CN-43", city:"Fenghuang, Hunan", year:1934, tags:["Pastoral","Romance"] },
  { id:"b14", title:"The Analects",                  author:"Confucius",        bg:"#181008", text:"#dcc060", loc:"CN", province:"CN-37", city:"Qufu, Shandong",   year:-479, tags:["Philosophy","Classic"] },
  { id:"b15", title:"1984",                          author:"George Orwell",    bg:"#141414", text:"#c03030", loc:"GB", city:"London",            year:1949, tags:["Dystopia"] },
  { id:"b16", title:"Mrs Dalloway",                  author:"Virginia Woolf",   bg:"#58705a", text:"#d8e8d0", loc:"GB", city:"London",            year:1925, tags:["Modernist"] },
  { id:"b17", title:"Wuthering Heights",             author:"Emily Brontë",     bg:"#201828", text:"#c8c0d8", loc:"GB", city:"Yorkshire",         year:1847, tags:["Gothic"] },
  { id:"b18", title:"Middlemarch",                   author:"George Eliot",     bg:"#482c18", text:"#e4c080", loc:"GB", city:"English Midlands",  year:1872, tags:["Victorian"] },
  { id:"b19", title:"Les Misérables",                author:"Victor Hugo",      bg:"#142818", text:"#90c09a", loc:"FR", city:"Paris",             year:1862, tags:["Epic","Revolution"] },
  { id:"b20", title:"In Search of Lost Time",        author:"Marcel Proust",    bg:"#483428", text:"#d8c0a0", loc:"FR", city:"Paris",             year:1913, tags:["Modernist","Memory"] },
  { id:"b21", title:"War and Peace",                 author:"Leo Tolstoy",      bg:"#141430", text:"#9090c8", loc:"RU", city:"Moscow",            year:1869, tags:["Epic"] },
  { id:"b22", title:"The Master and Margarita",      author:"Mikhail Bulgakov", bg:"#2c0838", text:"#c898d8", loc:"RU", city:"Moscow",            year:1967, tags:["Magic realism"] },
  { id:"b23", title:"Crime and Punishment",          author:"F. Dostoevsky",    bg:"#220614", text:"#c88888", loc:"RU", city:"St Petersburg",     year:1866, tags:["Psychological"] },
  { id:"b24", title:"The Tale of Genji",             author:"Murasaki Shikibu", bg:"#582848", text:"#e0b0c8", loc:"JP", city:"Kyoto",             year:1008, tags:["Classic"] },
  { id:"b25", title:"Norwegian Wood",                author:"Haruki Murakami",  bg:"#18301a", text:"#88c088", loc:"JP", city:"Tokyo",             year:1987, tags:["Contemporary"] },
  { id:"b26", title:"Snow Country",                  author:"Yasunari Kawabata",bg:"#3e4e5a", text:"#c8d8e8", loc:"JP", city:"Niigata",           year:1948, tags:["Nobel"] },
  { id:"b27", title:"The Great Gatsby",              author:"F.S. Fitzgerald",  bg:"#701e10", text:"#f4e0b0", loc:"US", city:"Long Island, NY",   year:1925, tags:["Jazz Age"] },
  { id:"b28", title:"Moby-Dick",                     author:"Herman Melville",  bg:"#081828", text:"#70a8c0", loc:"US", city:"Nantucket",         year:1851, tags:["Epic","Sea"] },
  { id:"b29", title:"Blood Meridian",                author:"Cormac McCarthy",  bg:"#480e08", text:"#d88860", loc:"US", city:"Texas border",      year:1985, tags:["Western"] },
  { id:"b30", title:"The God of Small Things",       author:"Arundhati Roy",    bg:"#224218", text:"#a0d080", loc:"IN", city:"Kerala",            year:1997, tags:["Booker"] },
  { id:"b31", title:"Midnight's Children",           author:"Salman Rushdie",   bg:"#643e08", text:"#ecc050", loc:"IN", city:"Bombay",            year:1981, tags:["Booker"] },
  { id:"b32", title:"One Hundred Years of Solitude", author:"García Márquez",   bg:"#283e18", text:"#a0d870", loc:"CO", city:"Macondo",           year:1967, tags:["Nobel","Magic realism"] },
  { id:"b33", title:"The Trial",                     author:"Franz Kafka",      bg:"#181820", text:"#9090a8", loc:"CZ", city:"Prague",            year:1925, tags:["Modernist","Absurd"] },
  { id:"b34", title:"The Book of Disquiet",          author:"Fernando Pessoa",  bg:"#283040", text:"#98a8c0", loc:"PT", city:"Lisbon",            year:1982, tags:["Modernist"] },
  { id:"b35", title:"Things Fall Apart",             author:"Chinua Achebe",    bg:"#482e08", text:"#e4b060", loc:"NG", city:"Igboland",          year:1958, tags:["Classic","Colonialism"] },
  { id:"b36", title:"The Name of the Rose",          author:"Umberto Eco",      bg:"#200e04", text:"#c89848", loc:"IT", city:"Apennine abbey",    year:1980, tags:["Mystery","Medieval"] },
  { id:"b37", title:"The House of the Spirits",      author:"Isabel Allende",   bg:"#3e1020", text:"#d88888", loc:"CL", city:"Santiago",          year:1982, tags:["Magic realism"] },
  { id:"b38", title:"The Iliad",                     author:"Homer",            bg:"#604808", text:"#f4d040", loc:"GR", city:"Troy / Mycenae",    year:-750, tags:["Epic","Ancient"] },
];

const MAP_MODE_META = {
  authorOrigin: {
    label: 'Author Origin',
    short: 'Author',
    empty: 'No author-origin books in this region yet.',
  },
  contentLocation: {
    label: 'Content Location',
    short: 'Content',
    empty: 'No content-location books in this region yet.',
  },
  readerLocation: {
    label: 'Reader Anchor',
    short: 'Reader',
    empty: 'No reader-anchor books in this region yet.',
  }
};

const MAP_TAB_META = [
  { id: 'books',    label: 'Books' },
  { id: 'culture',  label: 'Culture' },
  { id: 'history',  label: 'History' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'starter',  label: 'Starter' },
];

const REGION_PROFILES = {
  CN: {
    culture: '中国文学的阅读入口，不只是“朝代更替”或“历史事件”，而是制度秩序、家庭伦理、地方经验与现代化断裂的长期共振。很多中国文本会把私人命运放在大历史压力之下推进，人物的情感、责任与选择常常同时被家族结构、礼法传统和国家叙事牵引。作为 demo，可以把它理解成一种“多尺度叙事训练”：同一部作品里，个体心理、社会阶层、城乡空间与文明记忆会在同一条线里交错出现。',
    history: [
      '帝制传统、士大夫文化与经典教育长期塑造了“何为正统、何为修身”的阅读背景。',
      '晚清到二十世纪的剧烈转型，使现代中国写作天然带着制度变迁、知识断裂与身份重组的焦虑。',
      '地方书写很重要。北京、上海、西南、边疆与乡土叙事常常代表不同的现代经验。',
      '五四以来的语言转向（文言到白话）不仅改变表达形式，也改变了“谁能说话、如何说话”的文学政治。',
      '改革开放后的城市化与市场化，让代际记忆、阶层流动和地方失语成为新一代叙事的核心张力。',
      '当代中国科幻把国家发展、技术乌托邦与文明危机并置，形成与现实主义并行的第二叙事通道。'
    ],
    keywords: ['家国叙事', '礼法秩序', '地方经验', '现代性断裂', '乡土中国', '城市化焦虑', '知识分子伦理', '革命记忆', '代际创伤', '历史叙事', '技术想象', '文明尺度'],
    starters: [
      {
        title: '红楼梦',
        author: '曹雪芹',
        note: '先建立“中国叙事”的母体：家族结构、礼法秩序、情感伦理与衰败意识。',
        type: 'Classic Baseline',
        cover: 'assets/covers/红楼梦.jpg',
      },
      {
        title: '活着',
        author: '余华',
        note: '把宏大历史压回个体命运，最适合作为现代中国经验的第一入口。',
        type: 'Modern Entry',
        cover: 'assets/covers/活着.jpg',
      },
      {
        title: '边城',
        author: '沈从文',
        note: '补上地方经验与乡土审美，理解现代化来临前后的伦理与节奏变化。',
        type: 'Regional Lens',
        cover: 'assets/covers/边城.jpg',
      },
      {
        title: '三体',
        author: '刘慈欣',
        note: '进入中国科幻路径：国家叙事、技术想象与文明尺度在同一框架里展开。',
        type: 'Sci-fi axis',
        cover: 'assets/covers/三体.jpg',
      }
    ],
    hover: {
      dna: ['家国同构', '礼法与人情', '现代化断裂'],
      voices: ['鲁迅', '余华'],
      entry: {
        title: '活着',
        reason: '从个体命运切入，快速建立近现代中国社会感受。',
      },
      cue: '如果只把中国文学读成“历史故事”，会错过它真正的强度。先看家庭伦理、地方经验与国家叙事如何在同一人物身上拉扯。'
    }
  },
  GB: {
    culture: '英国阅读语境很适合进入“阶层如何长进日常”的问题：礼仪、教育、婚姻、财产、工业化和帝国余波，常常比宏大口号更深地嵌在人物行动里。',
    history: [
      '从乡绅社会到工业社会，英国文学反复处理阶层流动与制度惯性的矛盾。',
      '伦敦既是现代都市样本，也是帝国中心的精神投影。',
      '现代主义在英国往往表现为内心时间、意识流与战后失序感。'
    ],
    keywords: ['阶层秩序', '都市现代性', '经验主义', '内心时间', '帝国余波'],
    starters: [
      { title: 'Pride and Prejudice', author: 'Jane Austen', note: '从婚姻与礼仪切入阶层社会。' },
      { title: 'Mrs Dalloway', author: 'Virginia Woolf', note: '进入现代都市与意识流。' },
      { title: 'The Road to Wigan Pier', author: 'George Orwell', note: '补足工业社会与阶层观察。' }
    ]
  },
  FR: {
    culture: '法国常是“思想先于立场显形”的阅读现场。城市、沙龙、革命、世俗化与知识分子传统，让文本天然带着论辩感与形式自觉。',
    history: [
      '革命传统让政治、人民与公共空间成为文学和思想写作的长期母题。',
      '巴黎不仅是地理中心，也常是欲望、记忆与现代感官经验的浓缩器。',
      '法国文学与哲学之间的边界较薄，叙事经常同时在做思想实验。'
    ],
    keywords: ['革命传统', '知识分子', '世俗化', '都市感官', '记忆书写'],
    starters: [
      { title: 'Les Misérables', author: 'Victor Hugo', note: '宏大历史与个人伦理同时进入。' },
      { title: 'The Stranger', author: 'Albert Camus', note: '存在主义入口足够轻。' },
      { title: 'Swann’s Way', author: 'Marcel Proust', note: '从记忆与感知打开法国现代性。' }
    ]
  },
  RU: {
    culture: '俄罗斯阅读入口通常不是“情节”，而是极端处境中的精神强度。宗教、苦难、帝国广度与知识分子自我审判，会把人物推向伦理和存在的边界。',
    history: [
      '十九世纪俄罗斯文学几乎承担了哲学和社会批判的双重角色。',
      '从沙俄到苏联，国家权力与个体灵魂的张力是持续母题。',
      '大城市与边疆、宫廷与地下室，经常构成俄国叙事的尺度反差。'
    ],
    keywords: ['苦难意识', '灵魂审判', '帝国尺度', '知识分子', '宗教伦理'],
    starters: [
      { title: 'Crime and Punishment', author: 'Fyodor Dostoevsky', note: '最直接进入精神压力场。' },
      { title: 'The Death of Ivan Ilyich', author: 'Leo Tolstoy', note: '短篇更适合第一本。' },
      { title: 'The Master and Margarita', author: 'Mikhail Bulgakov', note: '进入苏联语境下的荒诞与讽刺。' }
    ]
  },
  JP: {
    culture: '日本文本常擅长处理留白、感受密度与关系中的微小位移。读日本文学，常不是追求“说了什么”，而是追踪“没有说透的部分”。',
    history: [
      '宫廷传统、物哀审美与近代化冲击共同塑造了日本叙事的细部感。',
      '战后文学尤其关注个体疏离、城市孤独与消费社会下的空心化。',
      '地方与季节感很重要，景物往往不是背景，而是情绪结构的一部分。'
    ],
    keywords: ['物哀', '留白', '都市孤独', '关系微差', '季节感'],
    starters: [
      { title: 'The Tale of Genji', author: 'Murasaki Shikibu', note: '看传统审美的源头。' },
      { title: 'Snow Country', author: 'Yasunari Kawabata', note: '短而纯，适合作为质感入口。' },
      { title: 'Norwegian Wood', author: 'Haruki Murakami', note: '现代读者最容易进入的门。' }
    ]
  },
  US: {
    culture: '美国写作很适合观察“个人神话如何与制度现实碰撞”。移动性、边疆想象、种族结构、资本逻辑与自我发明欲，会在很多文本里同时出现。',
    history: [
      '从建国叙事到资本扩张，美国文学长期围绕成功、自由与暴力的代价展开。',
      '城市、郊区、公路和边境是高频场景，空间本身就代表价值观冲突。',
      '二十世纪以后，消费文化与身份政治不断重写“美国梦”的内容。'
    ],
    keywords: ['美国梦', '边疆神话', '资本逻辑', '身份政治', '流动性'],
    starters: [
      { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', note: '美国梦的明亮表面与空心内核。' },
      { title: 'Beloved', author: 'Toni Morrison', note: '补足被主流叙事压住的历史。' },
      { title: 'Moby-Dick', author: 'Herman Melville', note: '从史诗尺度理解美国执念。' }
    ]
  },
  IN: {
    culture: '印度阅读入口通常要同时接受多重时间层叠：宗教、殖民、语言、多民族与后殖民现代国家并行存在，文本往往天然复杂且多声部。',
    history: [
      '殖民经验让英语写作在印度既是表达工具，也是权力历史的残留。',
      '家族、宗教与国家形成常常不是分开的线，而是同一张网。',
      '城市与地方、现代法治与传统共同体之间的摩擦，会反复返回小说现场。'
    ],
    keywords: ['后殖民', '多语言', '家族叙事', '宗教政治', '民族国家'],
    starters: [
      { title: 'The God of Small Things', author: 'Arundhati Roy', note: '从家庭和地方进入大结构。' },
      { title: 'Midnight’s Children', author: 'Salman Rushdie', note: '国家历史与个人身体绑在一起。' },
      { title: 'India After Gandhi', author: 'Ramachandra Guha', note: '历史背景补得很快。' }
    ]
  },
  IL: {
    culture: '以色列相关写作很适合作为“历史压强如何进入现实感”的入口。宗教传统、国家建立、战争记忆与现代科技社会常并置出现。',
    history: [
      '圣经传统与现代民族国家建构在这里持续叠加，时间感非常厚。',
      '安全、边界与身份问题会把公共议题直接压到个人生活层面。',
      '很多以色列作者天然擅长在宏观历史和日常伦理之间快速切换。'
    ],
    keywords: ['国家建构', '历史压强', '宗教世俗', '边界政治', '记忆伦理'],
    starters: [
      { title: 'Sapiens', author: 'Yuval Noah Harari', note: '从宏观历史视角看以色列知识语境。' },
      { title: 'A Tale of Love and Darkness', author: 'Amos Oz', note: '国家建立与家庭记忆并看。' },
      { title: 'To the End of the Land', author: 'David Grossman', note: '进入战争与私人关系。' }
    ]
  }
};

function deriveMapGeo(book) {
  const detail = window.BOOK_BY_ID?.[book.id];
  const detailGeo = detail?.geo || {};
  const fallbackCountry = book.loc || detail?.location?.country || null;
  const fallbackProvince = book.province || detail?.location?.province || null;
  const fallbackCity = book.city || detail?.location?.city || null;
  const contextPlace = detail?.context?.place || '';
  const readerCountry = /(北京|中国|Shanghai|Beijing)/i.test(contextPlace) ? 'CN' : null;

  return {
    authorOrigin: detailGeo.authorOrigin || (fallbackCountry ? {
      country: fallbackCountry,
      province: fallbackProvince,
      city: fallbackCity
    } : null),
    contentLocation: detailGeo.contentLocation || (fallbackCountry ? {
      country: fallbackCountry,
      province: fallbackProvince,
      city: fallbackCity
    } : null),
    readerLocation: detailGeo.readerLocation || (readerCountry ? {
      country: readerCountry,
      city: contextPlace
    } : null),
  };
}

function buildMapLibrary(seedBooks) {
  return seedBooks.map(book => {
    const detail = window.BOOK_BY_ID?.[book.id];
    const coverImage = detail?.cover?.image || null;
    return {
      ...book,
      coverImage,
      geo: deriveMapGeo(book),
    };
  });
}

function buildGeoBuckets(books) {
  const buckets = {
    authorOrigin: { countries: {}, provinces: {} },
    contentLocation: { countries: {}, provinces: {} },
    readerLocation: { countries: {}, provinces: {} },
    allCountries: new Set(),
  };

  books.forEach(book => {
    Object.keys(MAP_MODE_META).forEach(mode => {
      const geo = book.geo?.[mode];
      if (!geo?.country) return;
      (buckets[mode].countries[geo.country] = buckets[mode].countries[geo.country] || []).push(book);
      buckets.allCountries.add(geo.country);
      if (geo.province) {
        (buckets[mode].provinces[geo.province] = buckets[mode].provinces[geo.province] || []).push(book);
      }
    });
  });

  return buckets;
}

const MAP_LIBRARY = buildMapLibrary(MAP_BOOKS);
const MAP_GEO = buildGeoBuckets(MAP_LIBRARY);

window.mapAddBook = function(spineEntry) {
  if (!spineEntry?.loc) return;
  const entry = {
    id:    spineEntry.id,
    title: spineEntry.title,
    author: spineEntry.author,
    bg:    spineEntry.bg || spineEntry.spine || '#3a3a3a',
    text:  spineEntry.text || '#e8dfc8',
    loc:   spineEntry.loc,
    year:  new Date().getFullYear(),
    tags:  [],
    coverImage: null,
    geo: {
      authorOrigin:    { country: spineEntry.loc },
      contentLocation: { country: spineEntry.loc },
      readerLocation:  null,
    },
  };
  MAP_LIBRARY.push(entry);
  MAP_BOOKS.push(entry);
  // Insert into live geo buckets
  ['authorOrigin', 'contentLocation'].forEach(mode => {
    const countryId = spineEntry.loc;
    if (!MAP_GEO[mode].countries[countryId]) MAP_GEO[mode].countries[countryId] = [];
    MAP_GEO[mode].countries[countryId].push(entry);
    MAP_GEO.allCountries.add(countryId);
  });
};

function activeCountryMap() {
  if (__mapGeoMode === 'all') return mergedCountryMap();
  return MAP_GEO[__mapGeoMode].countries;
}

function activeProvinceMap() {
  if (__mapGeoMode === 'all') return mergedProvinceMap();
  return MAP_GEO[__mapGeoMode].provinces;
}

function activeCountries() {
  return new Set(Object.keys(activeCountryMap()));
}

function activeCountryBooks(countryId) {
  return activeCountryMap()[countryId] || [];
}

function activeProvinceBooks(provinceId) {
  return activeProvinceMap()[provinceId] || [];
}

function allCountryBooks(countryId) {
  const map = new Map();
  Object.keys(MAP_MODE_META).forEach(mode => {
    const list = MAP_GEO[mode].countries[countryId] || [];
    list.forEach(book => map.set(book.id, book));
  });
  return Array.from(map.values());
}

function allProvinceBooks(provinceId) {
  const map = new Map();
  Object.keys(MAP_MODE_META).forEach(mode => {
    const list = MAP_GEO[mode].provinces[provinceId] || [];
    list.forEach(book => map.set(book.id, book));
  });
  return Array.from(map.values());
}

function modeMaxCount(kind = 'country') {
  const scope = kind === 'province' ? activeProvinceMap() : activeCountryMap();
  const counts = Object.values(scope).map(list => list.length);
  return Math.max(1, ...counts, 0);
}

function mergedCountryMap() {
  const merged = {};
  Object.keys(MAP_MODE_META).forEach(mode => {
    Object.entries(MAP_GEO[mode].countries).forEach(([countryId, books]) => {
      const map = (merged[countryId] = merged[countryId] || new Map());
      books.forEach(book => map.set(book.id, book));
    });
  });
  return Object.fromEntries(Object.entries(merged).map(([k, map]) => [k, Array.from(map.values())]));
}

function mergedProvinceMap() {
  const merged = {};
  Object.keys(MAP_MODE_META).forEach(mode => {
    Object.entries(MAP_GEO[mode].provinces).forEach(([provinceId, books]) => {
      const map = (merged[provinceId] = merged[provinceId] || new Map());
      books.forEach(book => map.set(book.id, book));
    });
  });
  return Object.fromEntries(Object.entries(merged).map(([k, map]) => [k, Array.from(map.values())]));
}

/* ── Country colour palette ─────────────────────────────────────────────── */

const PALETTE = [
  '#5c3d4a','#3d4f5c','#4a5c3d','#5c4a3d','#3d3d5c',
  '#5c3d3d','#3d5c4a','#5c503d','#4a3d5c','#3d5c5c',
  '#5c4e3d','#3d4a5c','#523d5c','#3d5c3d','#5c3d50',
  '#455c3d','#5c453d','#3d4c5c','#4c5c3d','#5c3d45',
];

const COUNTRY_COLOR = {
  US:'#4a5c3d', CA:'#3d4f5c', MX:'#5c4a3d',
  GT:'#4a3d5c', BZ:'#3d5c4a', HN:'#5c3d4a', SV:'#3d5c3d',
  NI:'#5c503d', CR:'#3d4a5c', PA:'#5c4e3d',
  CU:'#4a5c3d', JM:'#3d3d5c', HT:'#5c3d3d', DO:'#3d5c5c',
  CO:'#3d5c4a', VE:'#5c3d3d', GY:'#4a3d5c', SR:'#3d5c3d',
  EC:'#5c4a3d', PE:'#3d4f5c', BR:'#4c5c3d', BO:'#5c503d',
  PY:'#3d4a5c', CL:'#5c3d4a', AR:'#3d5c5c', UY:'#5c4e3d',
  PT:'#4a3d5c', ES:'#3d5c4a', FR:'#5c3d4a', GB:'#3d3d5c',
  IE:'#5c4a3d', NL:'#3d5c3d', BE:'#5c3d3d', LU:'#4a5c3d',
  CH:'#3d4f5c', DE:'#5c503d', AT:'#3d4a5c', DK:'#5c4e3d',
  SE:'#4a3d5c', NO:'#3d5c4a', FI:'#5c3d4a',
  IT:'#5c3d50', GR:'#3d4c5c', AL:'#5c453d', RS:'#4c5c3d',
  HR:'#5c3d45', BA:'#455c3d', SI:'#5c453d', ME:'#3d4a5c',
  MK:'#5c4e3d', BG:'#3d5c3d', RO:'#5c3d3d',
  PL:'#3d4f5c', CZ:'#5c4a3d', SK:'#4a3d5c', HU:'#3d5c3d',
  UA:'#5c503d', BY:'#3d3d5c', MD:'#5c3d4a',
  LT:'#3d5c4a', LV:'#5c4e3d', EE:'#4a5c3d',
  RU:'#3d4a5c', KZ:'#5c4a3d', UZ:'#3d5c3d', TM:'#5c3d3d',
  KG:'#4a3d5c', TJ:'#3d5c5c', AF:'#5c503d',
  TR:'#5c3d4a', SY:'#3d4f5c', LB:'#5c4e3d', IL:'#4a3d5c',
  JO:'#3d5c4a', IQ:'#5c3d3d', IR:'#4c5c3d', SA:'#5c453d',
  YE:'#3d4a5c', OM:'#5c4e3d', AE:'#4a5c3d', QA:'#3d3d5c',
  KW:'#5c4a3d', BH:'#3d5c3d',
  PK:'#5c3d4a', IN:'#4a5c3d', BD:'#3d4f5c', NP:'#5c4a3d',
  LK:'#4a3d5c', MM:'#3d5c4a', TH:'#5c3d50',
  VN:'#3d4c5c', KH:'#5c453d', LA:'#4c5c3d', MY:'#5c3d45',
  SG:'#455c3d', ID:'#5c4a3d', PH:'#3d5c3d', TL:'#5c3d3d',
  CN:'#4a3d5c', MN:'#3d5c4a', KP:'#5c503d', KR:'#3d3d5c',
  JP:'#5c3d4a', TW:'#3d4a5c',
  NG:'#5c4e3d', GH:'#4a5c3d', CI:'#3d4f5c', SN:'#5c4a3d',
  ML:'#4a3d5c', BF:'#3d5c3d', NE:'#5c3d3d', CM:'#3d5c5c',
  TD:'#5c503d', SD:'#3d4a5c', SS:'#5c4e3d', ET:'#4a5c3d',
  SO:'#3d3d5c', KE:'#5c4a3d', TZ:'#4a3d5c', UG:'#3d5c4a',
  RW:'#5c3d4a', BI:'#3d4f5c', CD:'#5c4e3d', CG:'#4c5c3d',
  GA:'#5c453d', AO:'#3d4a5c', ZM:'#5c3d45', ZW:'#455c3d',
  MZ:'#5c4a3d', MW:'#3d5c3d', MG:'#5c3d3d', ZA:'#3d4c5c',
  NA:'#5c503d', BW:'#4a3d5c', LS:'#3d5c5c', SZ:'#5c4e3d',
  MA:'#4a5c3d', DZ:'#3d4f5c', TN:'#5c3d4a', LY:'#4a3d5c',
  EG:'#3d5c4a', MR:'#5c4e3d',
  AU:'#3d3d5c', NZ:'#5c3d4a', PG:'#4a5c3d', FJ:'#3d5c3d',
};

const BOOK_COLOR_BOOST = {
  CN:'#6a547a', GB:'#4a5a7a', FR:'#4a6a5a', RU:'#4a4a7a',
  JP:'#7a4a6a', US:'#5a7a4a', IN:'#7a6a4a', CO:'#4a7a5a',
  GR:'#4a6a8a', CZ:'#5a5a7a', PT:'#5a4a7a', NG:'#7a5a4a',
  IT:'#7a4a6a', CL:'#6a4a5a',
};
const REGION_NAME_FORMATTER = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

const DIMMED_FILL        = '#1e2026';
const WATER_FILL         = '#1a1714';
const HOVER_STROKE       = '#c4903a';
const HOVER_STROKE_WIDTH = 1.5;
const HEAT_MODE_COLORS = {
  authorOrigin: {
    low: '#2f3f66',
    high: '#7ba5ff',
  },
  contentLocation: {
    low: '#4d3f2d',
    high: '#c4903a',
  },
  readerLocation: {
    low: '#2f4a3b',
    high: '#7cc9a1',
  },
};

function countryFill(id) {
  if (__mapGeoMode === 'all') {
    const hasBooks = activeCountryBooks(id).length > 0;
    if (hasBooks && BOOK_COLOR_BOOST[id]) return BOOK_COLOR_BOOST[id];
    return COUNTRY_COLOR[id] || PALETTE[Math.abs(hashStr(id)) % PALETTE.length];
  }
  const count = activeCountryBooks(id).length;
  const max = modeMaxCount('country');
  return heatColorForCount(count, max);
}

function provinceFill(id) {
  if (__mapGeoMode === 'all') {
    const base = PALETTE[Math.abs(hashStr(id)) % PALETTE.length];
    return activeProvinceBooks(id).length ? brighten(base, 18) : base;
  }
  const count = activeProvinceBooks(id).length;
  const max = modeMaxCount('province');
  return heatColorForCount(count, max, 0.7);
}

function heatColorForCount(count, maxCount, minT = 0.42) {
  if (count <= 0) return DIMMED_FILL;
  const scale = Math.max(0, Math.min(1, count / Math.max(1, maxCount)));
  const tone = minT + (1 - minT) * Math.pow(scale, 0.75);
  const palette = HEAT_MODE_COLORS[__mapGeoMode] || HEAT_MODE_COLORS.contentLocation;
  return mixHexColor(palette.low, palette.high, tone);
}

function mixHexColor(fromHex, toHex, t) {
  const a = hexToRgb(fromHex);
  const b = hexToRgb(toHex);
  const mix = (x, y) => Math.round(x + (y - x) * t);
  return rgbToHex(mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b));
}

function hexToRgb(hex) {
  const s = hex.replace('#', '');
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function mapTopPadding(forChina = false) {
  const subheaderRect = document.querySelector('#view-map .map-subheader')?.getBoundingClientRect();
  const isMobile = window.innerWidth <= 980;
  if (forChina) return isMobile ? 18 : 12;
  const fallback = isMobile ? 214 : 154;
  const areaTop = subheaderRect ? Math.round(subheaderRect.bottom + (isMobile ? 12 : 14)) : fallback;
  return areaTop;
}

function mapBottomPadding(forChina = false) {
  const isMobile = window.innerWidth <= 980;
  if (forChina) return isMobile ? 18 : 12;
  return isMobile ? 22 : 16;
}

function applyMapTopPadding(forChina = __mapInChina) {
  if (!__mapChart) return;
  __mapChart.set('paddingTop', mapTopPadding(forChina));
  __mapChart.set('paddingBottom', mapBottomPadding(forChina));
}

function setMapInteractionMode(mode = 'world') {
  if (!__mapChart) return;
  if (mode === 'world') {
    __mapChart.setAll({
      panX: 'rotateX',
      panY: 'translateY',
    });
    return;
  }
  __mapChart.setAll({
    panX: 'translateX',
    panY: 'translateY',
  });
}

/* ── Lifecycle ─────────────────────────────────────────────────────────── */

function initMap() {
  document.getElementById('view-map').innerHTML = mapShellHTML();
  bindMapShellEvents();
}

function enterMap() {
  if (__mapBooted) return;
  if (typeof am5 === 'undefined' || typeof am5map === 'undefined') {
    waitForAmCharts(bootMap);
  } else {
    bootMap();
  }
}

function waitForAmCharts(cb, attempt = 0) {
  if (typeof am5 !== 'undefined' && typeof am5map !== 'undefined' &&
      typeof am5geodata_worldLow !== 'undefined' &&
      typeof am5geodata_chinaHigh !== 'undefined') {
    cb(); return;
  }
  if (attempt > 100) { console.warn('[map] amCharts failed to load'); return; }
  setTimeout(() => waitForAmCharts(cb, attempt + 1), 80);
}

/* ── DOM scaffold ──────────────────────────────────────────────────────── */

function mapShellHTML() {
  const total     = MAP_LIBRARY.length;
  const countries = activeCountries().size;
  const sharedHeader = typeof window.renderPrimaryHeader === 'function'
    ? window.renderPrimaryHeader('map', { actionLabel: '↩ Back', actionId: 'mapWorldBtn' })
    : '';
  return `
    <div class="shared-header-wrap">
      ${sharedHeader}
    </div>

    <div class="map-subheader">
      <div class="map-geo-filters" id="mapGeoFilters"></div>
      <div class="map-header-right">
        <div class="map-chip"><strong id="mapBooksCount">${total}</strong> books mapped</div>
        <div class="map-chip"><strong id="mapCountriesCount">${countries}</strong> countries</div>
      </div>
      <div class="map-breadcrumb" id="mapBreadcrumb" hidden></div>
    </div>

    <div id="mapChart"></div>

    <div class="map-zoom">
      <div class="map-zoom-btn" id="mapZoomIn">+</div>
      <div class="map-zoom-btn" id="mapZoomOut">−</div>
      <div class="map-zoom-sep"></div>
      <div class="map-zoom-btn map-zoom-fit" id="mapZoomHome">Fit</div>
    </div>

    <div class="map-hint" id="mapHint">Hover for a hint · click to open regional context</div>

    <!-- Hover tooltip -->
    <div class="map-tooltip" id="mapTooltip">
      <span class="map-tooltip-name" id="mapTooltipName"></span>
      <span class="map-tooltip-count" id="mapTooltipCount"></span>
    </div>

    <div class="map-hover-stage" id="mapHoverStage"></div>

    <!-- Side panel -->
    <div class="map-panel" id="mapPanel">
      <div class="map-panel-head">
        <div class="map-panel-place" id="mapPanelPlace">—</div>
        <div class="map-panel-sub"   id="mapPanelSub">—</div>
        <div class="map-panel-close" id="mapPanelClose">×</div>
      </div>
      <div class="map-panel-tabs" id="mapPanelTabs"></div>
      <div class="map-panel-body" id="mapPanelBody"></div>
    </div>
  `;
}

function bindMapShellEvents() {
  document.getElementById('mapPanelClose').addEventListener('click', closePanel);
  renderGlobalGeoFilters();
  const worldBtn = document.getElementById('mapWorldBtn');
  if (worldBtn) {
    worldBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (typeof __mapGoWorldFn === 'function') {
        __mapGoWorldFn();
        return;
      }
      if (__mapChart) __mapChart.goHome();
      closePanel();
      resetWorldFills(__mapWorldSeries);
    });
  }

  const tooltip = document.getElementById('mapTooltip');
  document.addEventListener('mousemove', e => {
    __mapPointer = { x: e.clientX, y: e.clientY };
    const tw = 220, th = 44;
    let lx = e.clientX + 16;
    let ly = e.clientY - 12;
    if (lx + tw > window.innerWidth)  lx = e.clientX - tw - 8;
    if (ly + th > window.innerHeight) ly = e.clientY - th - 8;
    tooltip.style.left = lx + 'px';
    tooltip.style.top  = ly + 'px';
  });
}

function renderGlobalGeoFilters() {
  const wrap = document.getElementById('mapGeoFilters');
  if (!wrap) return;
  wrap.innerHTML = '';
  Object.entries(MAP_MODE_META).forEach(([mode, meta]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-geo-btn' + (mode === __mapGeoMode ? ' active' : '');
    button.textContent = meta.label;
    button.addEventListener('click', () => setGeoMode(mode === __mapGeoMode ? 'all' : mode));
    wrap.appendChild(button);
  });
}

function updateSubheaderCounts() {
  const countriesEl = document.getElementById('mapCountriesCount');
  if (countriesEl) countriesEl.textContent = String(activeCountries().size);
}

/* ── amCharts boot ─────────────────────────────────────────────────────── */

function bootMap() {
  __mapBooted = true;

  const root = am5.Root.new('mapChart');
  __mapRoot  = root;
  root.setThemes([am5themes_Animated.new(root)]);
  if (root._logo) root._logo.dispose();

  const chart = root.container.children.push(
    am5map.MapChart.new(root, {
      panX:       'rotateX',
      panY:       'translateY',
      projection: am5map.geoNaturalEarth1(),
      wheelY:     'zoom',
      pinchZoom:  true,
    })
  );
  __mapChart = chart;

  /* Water background */
  chart.chartContainer.children.unshift(am5.Rectangle.new(root, {
    width:  am5.percent(100),
    height: am5.percent(100),
    fill:   am5.color(WATER_FILL),
  }));

  /* ── World polygon series ── */
  const worldSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
    geoJSON: am5geodata_worldLow,
    exclude: ['AQ'],
  }));
  __mapWorldSeries = worldSeries;

  worldSeries.mapPolygons.template.setAll({
    interactive:     true,
    cursorOverStyle: 'pointer',       // pointer for ALL countries
    fill:            am5.color('#2a2f3a'),
    stroke:          am5.color('#16191f'),
    strokeWidth:     0.4,
    nonScalingStroke:true,
    tooltipText:     '{name}',        // use amCharts native name lookup
  });

  /* Suppress the amCharts tooltip visually — we render our own */
  const hiddenTooltip = am5.Tooltip.new(root, { forceHidden: true });
  worldSeries.mapPolygons.template.set('tooltip', hiddenTooltip);

  worldSeries.mapPolygons.template.states.create('hover', {
    stroke:      am5.color(HOVER_STROKE),
    strokeWidth: HOVER_STROKE_WIDTH,
  });

  /* Paint each country */
  worldSeries.events.on('datavalidated', () => {
    repaintWorldFills(worldSeries);
  });

  /* Tooltip — show name on any country, book count if available */
  const tooltip  = document.getElementById('mapTooltip');
  const tipName  = document.getElementById('mapTooltipName');
  const tipCount = document.getElementById('mapTooltipCount');

  worldSeries.mapPolygons.template.events.on('pointerover', ev => {
    const id    = ev.target.dataItem.get('id');
    const name  = getPolyName(ev.target);
    const count = activeCountryBooks(id).length;
    if (!__mapFocusedCountryId && !__mapInChina) {
      tooltip.classList.remove('visible');
      showHoverPreview(id, name, ev.target);
      return;
    }
    tipName.textContent  = name;
    tipCount.textContent = count > 0 ? `· ${count} book${count !== 1 ? 's' : ''}` : '';
    tooltip.classList.add('visible');
  });
  worldSeries.mapPolygons.template.events.on('pointerout', () => {
    tooltip.classList.remove('visible');
    if (!__mapFocusedCountryId && !__mapInChina) clearHoverPreview();
  });

  /* Click */
  worldSeries.mapPolygons.template.events.on('click', ev => {
    const id   = ev.target.dataItem.get('id');
    const name = getPolyName(ev.target);
    tooltip.classList.remove('visible');
    document.getElementById('mapHint').classList.remove('show');

    if (id === 'CN') { drillChina(); return; }

    clearHoverPreview();
    focusCountry(ev.target, id, name);

    dimAllExcept(worldSeries, ev.target, id);
    openCountryPanel(id, name);
  });

  /* ── China province series ── */
  const chinaSeries = chart.series.push(am5map.MapPolygonSeries.new(root, {
    geoJSON: am5geodata_chinaHigh,
    visible: false,
  }));
  __mapChinaSeries = chinaSeries;

  chinaSeries.mapPolygons.template.setAll({
    interactive:     true,
    cursorOverStyle: 'pointer',
    fill:            am5.color('#3d3220'),
    stroke:          am5.color('#2a2218'),
    strokeWidth:     0.4,
    nonScalingStroke:true,
    tooltipText:     '{name}',
  });
  chinaSeries.mapPolygons.template.set('tooltip', am5.Tooltip.new(root, { forceHidden: true }));
  chinaSeries.mapPolygons.template.states.create('hover', {
    stroke:      am5.color(HOVER_STROKE),
    strokeWidth: HOVER_STROKE_WIDTH,
  });

  chinaSeries.events.on('datavalidated', () => {
    repaintChinaFills(chinaSeries);
  });

  chinaSeries.mapPolygons.template.events.on('pointerover', ev => {
    const id    = ev.target.dataItem.get('id');
    const name  = getPolyName(ev.target);
    const count = activeProvinceBooks(id).length;
    if (__mapGeoMode === 'all') {
      tipName.textContent  = name;
      tipCount.textContent = count > 0 ? `· ${count} book${count !== 1 ? 's' : ''}` : '';
      tooltip.classList.add('visible');
      return;
    }
    tooltip.classList.remove('visible');
    if (!count) {
      clearHoverPreview();
      return;
    }
    showHoverTitleCloud(activeProvinceBooks(id), ev.target, {
      emptyText: '',
      max: 8,
      className: 'map-hover-title map-hover-title-heat',
      radiusBase: 148,
      radiusStep: 20,
      width: 198,
      height: 30,
    });
  });
  chinaSeries.mapPolygons.template.events.on('pointerout', () => {
    tooltip.classList.remove('visible');
    if (__mapGeoMode !== 'all') clearHoverPreview();
  });

  chinaSeries.mapPolygons.template.events.on('click', ev => {
    const id   = ev.target.dataItem.get('id');
    const name = getPolyName(ev.target);
    tooltip.classList.remove('visible');

    /* Dim all other provinces */
    chinaSeries.mapPolygons.each(p => {
      p.set('fill', am5.color(p === ev.target ? brighten('#5a4828', 28) : DIMMED_FILL));
    });

    const books = allProvinceBooks(id);
    openProvincePanel(id, name, books);
  });

  /* ── Drill / back ── */

  /* After the panel slides in (450ms), re-zoom to fit China in the narrowed
     chart area. zoomToGeoPoint level 5 fills ~66% of the viewport well.
     A second pass at 900ms catches any remaining resize lag. */
  function fitChina() {
    const doZoom = () => {
      applyMapTopPadding(true);
      chart.zoomToGeoPoint({ longitude: 104, latitude: 35.5 }, 4.5, true);
    };
    setTimeout(doZoom, 500);
  }

  function resetWorldHome() {
    applyMapTopPadding(false);
    setMapInteractionMode('world');
    const doHome = () => chart.goHome();
    setTimeout(doHome, 20);
    setTimeout(doHome, 200);
    setTimeout(doHome, 520);
  }

  function fitCountry(poly) {
    const di = poly?.dataItem;
    if (!di) return;
    const doZoom = () => worldSeries.zoomToDataItem(di);
    setTimeout(doZoom, 120);
    setTimeout(doZoom, 620);
  }

  function focusCountry(poly, id, name) {
    __mapInChina = false;
    __mapFocusedCountryId = id;
    chinaSeries.hide();
    worldSeries.show();
    setMapInteractionMode('detail');
    applyMapTopPadding(false);
    setBreadcrumb('country', name, goWorld);
    fitCountry(poly);
  }

  function drillChina() {
    if (__mapInChina) return;
    clearHoverPreview();
    __mapInChina = true;
    __mapFocusedCountryId = 'CN';
    worldSeries.hide();
    chinaSeries.show();
    setMapInteractionMode('detail');
    setBreadcrumb('china', 'China', goWorld);
    openCountryPanel('CN', 'China');
    fitChina();
  }

  function goWorld() {
    __mapInChina = false;
    __mapFocusedCountryId = null;
    clearHoverPreview();
    chinaSeries.hide();
    worldSeries.show();
    setBreadcrumb('world', 'World', null);
    closePanel();
    resetWorldFills(worldSeries);
    resetWorldHome();
  }
  __mapGoWorldFn = goWorld;

  window.__setMapGeoMode = (mode) => {
    __mapGeoMode = mode;
    renderGlobalGeoFilters();
    updateSubheaderCounts();
    repaintWorldFills(worldSeries);
    repaintChinaFills(chinaSeries);
    if (__mapFocusedCountryId && __mapActivePoly && !__mapInChina) {
      dimAllExcept(worldSeries, __mapActivePoly, __mapFocusedCountryId);
    }
    if (__mapPanelState?.type === 'country') {
      openCountryPanel(__mapPanelState.countryId, __mapPanelState.placeLabel);
    }
    if (__mapPanelState?.type === 'province') {
      openProvincePanel(__mapPanelState.provinceId, __mapPanelState.placeLabel);
    }
    clearHoverPreview();
  };

  document.getElementById('mapZoomIn').addEventListener('click',  () => chart.zoomIn());
  document.getElementById('mapZoomOut').addEventListener('click', () => chart.zoomOut());
  document.getElementById('mapZoomHome').addEventListener('click', () => {
    if (__mapInChina) {
      fitChina();
    } else if (__mapFocusedCountryId) {
      goWorld();
    } else {
      resetWorldHome();
      closePanel();
      resetWorldFills(worldSeries);
    }
  });

  applyMapTopPadding();
  let mapResizeTimer = null;
  window.addEventListener('resize', () => {
    if (mapResizeTimer) clearTimeout(mapResizeTimer);
    mapResizeTimer = setTimeout(() => {
      applyMapTopPadding();
      if (__mapInChina) fitChina();
    }, 120);
  });

  chart.appear(800, 100);

  const hint = document.getElementById('mapHint');
  setTimeout(() => hint.classList.add('show'),    1800);
  setTimeout(() => hint.classList.remove('show'), 6500);
}

/* ── Fill helpers ───────────────────────────────────────────────────────── */

function dimAllExcept(series, activePoly, activeId) {
  series.mapPolygons.each(poly => {
    const id = poly.dataItem.get('id');
    poly.set('fill', am5.color(
      poly === activePoly
        ? countryFill(id)
        : DIMMED_FILL
    ));
  });
  __mapActivePoly = activePoly;
}

function resetWorldFills(series) {
  repaintWorldFills(series);
  __mapActivePoly = null;
}

function repaintWorldFills(series = __mapWorldSeries) {
  if (!series) return;
  series.mapPolygons.each(poly => {
    const id = poly.dataItem.get('id');
    poly.set('fill', am5.color(countryFill(id)));
  });
}

function repaintChinaFills(series = __mapChinaSeries) {
  if (!series) return;
  series.mapPolygons.each(poly => {
    const id = poly.dataItem.get('id');
    poly.set('fill', am5.color(provinceFill(id)));
  });
}

function setGeoMode(mode) {
  const isValid = mode === 'all' || !!MAP_MODE_META[mode];
  if (!isValid || mode === __mapGeoMode) return;
  if (typeof window.__setMapGeoMode === 'function') {
    window.__setMapGeoMode(mode);
  } else {
    __mapGeoMode = mode;
    renderGlobalGeoFilters();
    updateSubheaderCounts();
  }
}

function clearHoverPreview() {
  __mapHoverCountryId = null;
  const stage = document.getElementById('mapHoverStage');
  if (stage) stage.innerHTML = '';
  if (!__mapFocusedCountryId && !__mapInChina) resetWorldFills(__mapWorldSeries);
}

function showHoverPreview(countryId, countryName, activePoly) {
  __mapHoverCountryId = countryId;
  if (__mapGeoMode === 'all') {
    showHoverPreviewRich(countryId, countryName, activePoly);
    return;
  }
  const books = activeCountryBooks(countryId);
  if (!books.length) {
    clearHoverPreview();
    return;
  }
  showHoverTitleCloud(books, activePoly, {
    emptyText: '',
    max: 8,
    className: 'map-hover-title map-hover-title-heat',
    radiusBase: 154,
    radiusStep: 22,
    width: 198,
    height: 30,
  });
}

function showHoverPreviewRich(countryId, countryName, activePoly) {
  dimAllExcept(__mapWorldSeries, activePoly, countryId);

  const stage = document.getElementById('mapHoverStage');
  if (!stage) return;

  const anchor = getHoverAnchorPoint(activePoly);
  const content = buildHoverMetaContent(countryId, countryName);
  const metaNodes = buildHoverMetaNodes(anchor, countryName, content);

  const keepOut = {
    x: anchor.x - 108,
    y: anchor.y - 68,
    w: 216,
    h: 136,
  };
  const laidOut = layoutHoverMetaNodes(metaNodes, anchor, keepOut);
  const nodesHtml = laidOut.map(node =>
    `<div class="${node.wrapperClass || 'map-hover-meta'} ${node.cls || ''}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px">${node.html}</div>`
  );

  stage.innerHTML = nodesHtml.join('');
}

function showHoverTitleCloud(books, activePoly, options = {}) {
  const stage = document.getElementById('mapHoverStage');
  if (!stage) return;
  const anchor = getHoverAnchorPoint(activePoly);
  const nodes = buildHoverTitles(anchor, books, options);
  stage.innerHTML = nodes.join('');
}

function hoverViewportBounds() {
  const panelOffset = document.body.classList.contains('map-panel-open') ? 540 : 0;
  return {
    left: 22,
    right: window.innerWidth - panelOffset - 22,
    top: hoverSafeTop(),
    bottom: window.innerHeight - 24,
  };
}

function getHoverAnchorPoint(poly) {
  const chartRect = document.getElementById('mapChart')?.getBoundingClientRect();
  const spriteX = poly?.get?.('x');
  const spriteY = poly?.get?.('y');
  const fromPoly = Number.isFinite(spriteX) && Number.isFinite(spriteY) && chartRect
    ? { x: chartRect.left + spriteX, y: chartRect.top + spriteY }
    : null;

  const bounds = hoverViewportBounds();
  const p = fromPoly || __mapPointer;
  return {
    x: Math.max(bounds.left + 118, Math.min(p.x, bounds.right - 118)),
    y: Math.max(bounds.top + 52, Math.min(p.y, bounds.bottom - 152)),
  };
}

function clampHoverNode(x, y, width, height) {
  const bounds = hoverViewportBounds();
  return {
    x: Math.max(bounds.left, Math.min(x, bounds.right - width)),
    y: Math.max(bounds.top, Math.min(y, bounds.bottom - height)),
  };
}

function hoverSafeTop() {
  const subheaderRect = document.querySelector('#view-map .map-subheader')?.getBoundingClientRect();
  return subheaderRect ? Math.round(subheaderRect.bottom + 12) : 132;
}

function getHoverAnchorZone(anchor) {
  const bounds = hoverViewportBounds();
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const relX = (anchor.x - bounds.left) / width;
  const relY = (anchor.y - bounds.top) / height;
  return {
    horizontal: relX < 0.3 ? 'left' : relX > 0.7 ? 'right' : 'center',
    vertical: relY < 0.36 ? 'top' : relY > 0.68 ? 'bottom' : 'middle',
  };
}

function mirrorAngles(angles) {
  return angles.map(angle => {
    const mirrored = 180 - angle;
    return mirrored > 180 ? mirrored - 360 : mirrored;
  });
}

function uniqueCompact(values, max = Infinity) {
  const out = [];
  const seen = new Set();
  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out.slice(0, max);
}

function buildHoverMetaContent(countryId, countryName) {
  const profile = buildRegionContext(countryId, countryName);
  const hover = profile.hover || {};
  const books = allCountryBooks(countryId);
  const keywordText = uniqueCompact(
    Array.isArray(hover.dna) && hover.dna.length ? hover.dna : (profile.keywords || []),
    3
  ).join(' · ') || 'No clear literary signal yet';

  const voices = uniqueCompact([
    ...(hover.voices || []),
    ...(profile.starters || []).map(item => item?.author),
    ...books.map(book => book?.author),
  ], 2);
  const voiceText = voices.join(' · ') || 'No mapped voices yet';

  const hoverEntry = hover.entry && typeof hover.entry === 'object' ? hover.entry : null;
  const starter =
    (hoverEntry?.title ? {
      title: hoverEntry.title,
      note: hoverEntry.reason || '',
      author: hoverEntry.author || '',
    } : null) ||
    (profile.starters || []).find(item => item?.title) ||
    (books[0] ? {
      title: books[0].title,
      note: `Start with a short work to enter ${countryName}'s literary context.`,
      author: books[0].author,
    } : null);

  const entryTitle = truncateText(starter?.title || `One representative work`, 38);
  const entryReason = truncateText(
    starter?.note || `Use one concise text to enter ${countryName}'s reading atmosphere.`,
    52
  );

  return {
    keywordText,
    voiceText,
    entryTitle,
    entryReason,
    cueText: truncateText(String(hover.cue || profile.culture || ''), 84),
  };
}

function buildHoverSlotTemplates(zone) {
  const yBias = zone.vertical === 'top' ? 56 : (zone.vertical === 'bottom' ? -56 : 0);
  const centerTemplate = {
    country: [{ dx: 0, dy: -86 }, { dx: 0, dy: 84 }],
    dna: [{ dx: -218, dy: -154 }, { dx: -226, dy: 92 }, { dx: 214, dy: -154 }],
    voices: [{ dx: 218, dy: -154 }, { dx: 226, dy: 92 }, { dx: -214, dy: -154 }],
    entry: [{ dx: -214, dy: 92 }, { dx: -214, dy: -154 }, { dx: 214, dy: 92 }],
    cue: [{ dx: 214, dy: 92 }, { dx: 214, dy: -154 }, { dx: -214, dy: 92 }],
  };
  const edgeTemplate = {
    country: [{ dx: 142, dy: -78 }, { dx: 160, dy: 84 }],
    dna: [{ dx: 238, dy: -138 }, { dx: 282, dy: -8 }, { dx: 242, dy: 114 }],
    voices: [{ dx: 328, dy: -20 }, { dx: 282, dy: -8 }, { dx: 330, dy: 104 }],
    entry: [{ dx: 242, dy: 114 }, { dx: 282, dy: -8 }, { dx: 238, dy: -138 }],
    cue: [{ dx: 352, dy: 100 }, { dx: 352, dy: -128 }, { dx: 328, dy: 24 }],
  };

  const base = zone.horizontal === 'center' ? centerTemplate : edgeTemplate;
  const side = zone.horizontal === 'right' ? -1 : 1;
  const isCenter = zone.horizontal === 'center';
  return Object.fromEntries(
    Object.entries(base).map(([key, list]) => [
      key,
      list.map(slot => ({
        dx: isCenter ? slot.dx : slot.dx * side,
        dy: slot.dy + yBias,
      })),
    ])
  );
}

function slotsToHoverCandidates(anchor, slots, width, height) {
  return (slots || []).map(slot => ({
    x: anchor.x + slot.dx - width / 2,
    y: anchor.y + slot.dy - height / 2,
  }));
}

function buildHoverMetaNodes(anchor, countryName, content) {
  const zone = getHoverAnchorZone(anchor);
  const slotMap = buildHoverSlotTemplates(zone);

  return [
    {
      wrapperClass: 'map-hover-country-name',
      width: 168,
      height: 46,
      candidates: slotsToHoverCandidates(anchor, slotMap.country, 168, 46),
      html: `<span>${escapeHTML(countryName)}</span>`,
    },
    {
      cls: 'map-hover-meta-dna',
      width: 198,
      height: 74,
      candidates: slotsToHoverCandidates(anchor, slotMap.dna, 198, 74),
      html: `
        <div class="map-hover-meta-kicker">literary dna</div>
        <div class="map-hover-meta-text">${escapeHTML(content.keywordText)}</div>
      `,
    },
    {
      cls: 'map-hover-meta-voices',
      width: 194,
      height: 74,
      candidates: slotsToHoverCandidates(anchor, slotMap.voices, 194, 74),
      html: `
        <div class="map-hover-meta-kicker">representative voices</div>
        <div class="map-hover-meta-text">${escapeHTML(content.voiceText)}</div>
      `,
    },
    {
      cls: 'map-hover-meta-entry',
      width: 212,
      height: 94,
      candidates: slotsToHoverCandidates(anchor, slotMap.entry, 212, 94),
      html: `
        <div class="map-hover-meta-kicker">entry work</div>
        <div class="map-hover-meta-entry-title">${escapeHTML(content.entryTitle)}</div>
        <div class="map-hover-meta-entry-note">${escapeHTML(content.entryReason)}</div>
      `,
    },
    {
      cls: 'map-hover-meta-cue',
      width: 230,
      height: 108,
      candidates: slotsToHoverCandidates(anchor, slotMap.cue, 230, 108),
      html: `
        <div class="map-hover-meta-kicker">context cue</div>
        <div class="map-hover-meta-text">${escapeHTML(content.cueText)}</div>
      `,
    },
  ];
}

function layoutHoverMetaNodes(nodes, anchor, keepOut) {
  const placed = [];
  return nodes.map(node => {
    const rawCandidates = (node.candidates || []).map(c => ({
      x: Number.isFinite(c.x) ? c.x : anchor.x + (c.dx || 0),
      y: Number.isFinite(c.y) ? c.y : anchor.y + (c.dy || 0),
      w: node.width,
      h: node.height,
    }));
    const fallback = rawCandidates.length ? rawCandidates : [{
      x: anchor.x + 120,
      y: anchor.y - 80,
      w: node.width,
      h: node.height,
    }];

    let chosen = null;
    for (const candidate of fallback) {
      const rect = clampHoverRect(candidate);
      if (rectsOverlap(rect, keepOut, 12)) continue;
      if (placed.some(prev => rectsOverlap(rect, prev, 12))) continue;
      chosen = rect;
      break;
    }
    if (!chosen) {
      chosen = pickLeastOverlapRect(fallback, keepOut, placed);
    }
    placed.push(chosen);
    return { ...node, x: chosen.x, y: chosen.y };
  });
}

function clampHoverRect(rect) {
  const pos = clampHoverNode(rect.x, rect.y, rect.w, rect.h);
  return { ...rect, x: pos.x, y: pos.y };
}

function pickLeastOverlapRect(candidates, keepOut, placed) {
  let best = clampHoverRect(candidates[0]);
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach(candidate => {
    const rect = clampHoverRect(candidate);
    const score =
      overlapArea(rect, keepOut) * 3 +
      placed.reduce((sum, prev) => sum + overlapArea(rect, prev), 0);
    if (score < bestScore) {
      best = rect;
      bestScore = score;
    }
  });
  return best;
}

function rectsOverlap(a, b, pad = 0) {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function buildHoverTitles(anchor, books, options = {}) {
  const {
    max = 8,
    emptyText = 'No mapped books yet',
    className = 'map-hover-title',
    radiusBase = 188,
    radiusStep = 34,
    width = 204,
    height = 32,
  } = options;
  const list = books.slice(0, max);
  if (!list.length) {
    if (!emptyText) return [];
    const pos = clampHoverNode(anchor.x - 86, anchor.y + 122, 190, 32);
    return [`<div class="${className} is-empty" style="left:${pos.x}px;top:${pos.y}px">${escapeHTML(emptyText)}</div>`];
  }

  const zone = getHoverAnchorZone(anchor);
  const angles = zone.horizontal === 'center'
    ? [-135, -35, 135, 35, -90, 90, -10, 170]
    : zone.horizontal === 'left'
      ? [-56, -18, 18, 54, -88, 88, 124, -124]
      : mirrorAngles([-56, -18, 18, 54, -88, 88, 124, -124]);
  return list.map((book, index) => {
    const angle = angles[index % angles.length] * Math.PI / 180;
    const radius = radiusBase + (index % 3) * radiusStep;
    const x = anchor.x + Math.cos(angle) * radius;
    const y = anchor.y + Math.sin(angle) * radius;
    const pos = clampHoverNode(x - width / 2, y - height / 2, width, height);
    const rot = (index % 2 === 0 ? -1 : 1) * (6 + (index % 3) * 2);
    return `<div class="${className}" style="left:${pos.x}px;top:${pos.y}px;transform:rotate(${rot}deg)">${escapeHTML(book.title)}</div>`;
  });
}

function brighten(hex, amount) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  return '#' + [r,g,b].map(v => Math.min(255,v+amount).toString(16).padStart(2,'0')).join('');
}

/* ── Panel ──────────────────────────────────────────────────────────────── */

function openCountryPanel(countryId, name) {
  const books = allCountryBooks(countryId);

  __mapPanelState = {
    type: 'country',
    countryId,
    regionLabel: name,
    placeLabel: name,
    filterMode: __mapGeoMode,
    activeTab: 'books',
    books,
    context: buildRegionContext(countryId, name),
    showProvinceLabels: countryId !== 'CN',
  };

  renderPanel();
}

function openProvincePanel(provinceId, name, books = allProvinceBooks(provinceId)) {
  const provinceName = PROV_NAMES[provinceId] || name;
  const parentCountryId = inferProvinceCountry(provinceId, books);
  const parentCountryLabel = countryLabelFromId(parentCountryId);
  __mapPanelState = {
    type: 'province',
    countryId: parentCountryId,
    provinceId,
    regionLabel: provinceName,
    placeLabel: `${parentCountryLabel} > ${provinceName}`,
    filterMode: __mapGeoMode,
    activeTab: 'books',
    books,
    context: buildRegionContext(parentCountryId, provinceName),
    showProvinceLabels: false,
  };

  renderPanel();
}

function renderPanel() {
  const panelEl = document.getElementById('mapPanel');
  if (!panelEl || !__mapPanelState) return;

  document.getElementById('mapPanelPlace').textContent = __mapPanelState.placeLabel;
  const subEl = document.getElementById('mapPanelSub');
  const subtitle = buildPanelSubtitle(__mapPanelState);
  subEl.textContent = subtitle;
  subEl.classList.toggle('is-empty', !subtitle);

  renderPanelTabs();
  renderPanelBody();

  panelEl.classList.add('open');
  document.body.classList.add('map-panel-open');
}

function closePanel() {
  __mapPanelState = null;
  const panelEl = document.getElementById('mapPanel');
  panelEl.classList.remove('open');
  document.body.classList.remove('map-panel-open');
}

function renderPanelTabs() {
  const container = document.getElementById('mapPanelTabs');
  if (!container || !__mapPanelState) return;
  container.innerHTML = '';

  MAP_TAB_META.forEach(tab => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-tab-btn' + (tab.id === __mapPanelState.activeTab ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      __mapPanelState.activeTab = tab.id;
      renderPanelBody();
      renderPanelTabs();
    });
    container.appendChild(btn);
  });
}

function renderPanelBody() {
  const container = document.getElementById('mapPanelBody');
  if (!container || !__mapPanelState) return;

  if (__mapPanelState.activeTab === 'books') {
    renderPanelBooks(__mapPanelState.books || [], {
      showProvinceLabels: __mapPanelState.showProvinceLabels,
      filterMode: __mapPanelState.filterMode,
    });
    return;
  }

  const ctx = __mapPanelState.context;
  if (__mapPanelState.activeTab === 'culture') {
    container.innerHTML = `
      <section class="map-copy-card">
        <div class="map-copy-kicker">Cultural background</div>
        <p>${escapeHTML(ctx.culture)}</p>
      </section>
    `;
    return;
  }

  if (__mapPanelState.activeTab === 'history') {
    container.innerHTML = ctx.history.map(item => `
      <section class="map-copy-card">
        <div class="map-copy-kicker">Historical context</div>
        <p>${escapeHTML(item)}</p>
      </section>
    `).join('');
    return;
  }

  if (__mapPanelState.activeTab === 'keywords') {
    container.innerHTML = `
      <section class="map-copy-card">
        <div class="map-copy-kicker">Literary / thought keywords</div>
        <div class="map-keyword-grid">
          ${ctx.keywords.map(word => `<span class="map-keyword-chip">${escapeHTML(word)}</span>`).join('')}
        </div>
        <p class="map-copy-note">${escapeHTML(buildKeywordNarrative(__mapPanelState.regionLabel, ctx.keywords))}</p>
      </section>
    `;
    return;
  }

  if (__mapPanelState.activeTab === 'starter') {
    const starterList = buildStarterList(__mapPanelState);
    container.innerHTML = `
      <div class="map-starter-list">
        ${starterList.map((item, index) => `
          <article class="map-starter-item${index === 0 ? ' first' : ''}">
            <div class="map-starter-cover${item.cover ? ' has-image' : ''}">
              ${item.cover
                ? `<img src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover">`
                : `<span class="map-starter-cover-fallback">${escapeHTML((item.title || '').slice(0, 2) || '书')}</span>`
              }
            </div>
            <div class="map-starter-copy">
              <div class="map-copy-kicker">${escapeHTML(item.type || 'Starter reading')}</div>
              <h4>${escapeHTML(item.title)}</h4>
              ${item.author ? `<div class="map-starter-author">${escapeHTML(item.author)}</div>` : ''}
              <p>${escapeHTML(item.note)}</p>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }
}

function renderPanelBooks(books, { showProvinceLabels = true } = {}) {
  const container = document.getElementById('mapPanelBody');
  if (!container || !__mapPanelState) return;
  if (!books.length) {
    const modeMeta = MAP_MODE_META[__mapPanelState.filterMode];
    container.innerHTML = `
      <div class="map-panel-empty">
        <strong>${escapeHTML(modeMeta?.label || 'All Locations')}</strong>
        <span>${escapeHTML(modeMeta?.empty || 'No mapped books in this region yet.')}</span>
      </div>
    `;
    return;
  }
  container.innerHTML = '';

  const groups = showProvinceLabels
    ? Object.entries(books.reduce((acc, b) => {
      const key = inferProvinceKey(b);
      (acc[key] = acc[key] || []).push(b);
      return acc;
    }, {}))
    : [['__all', books]];

  groups.forEach(([prov, list]) => {
    if (showProvinceLabels && groups.length > 1 && prov !== '__none') {
      const lbl = document.createElement('div');
      lbl.className = 'mb-province-label';
      lbl.textContent = buildProvincePathLabel(prov, list);
      container.appendChild(lbl);
    }
    list.forEach(b => container.appendChild(renderBookRow(b)));
  });
}

function renderBookRow(b) {
  const row = document.createElement('div');
  row.className = 'mb-row';
  const yearLabel = b.year > 0 ? b.year : Math.abs(b.year) + ' BCE';
  const coverMarkup = b.coverImage
    ? `<div class="mb-mini-cover has-image"><img src="${escapeHTML(b.coverImage)}" alt="${escapeHTML(b.title)} cover"></div>`
    : `<div class="mb-mini-cover" style="background:${b.bg};color:${b.text}"><div class="mb-mini-title">${escapeHTML(b.title)}</div></div>`;

  row.innerHTML = `
    ${coverMarkup}
    <div class="mb-info">
      <div class="mb-info-title">${escapeHTML(b.title)}</div>
      <div class="mb-info-author">${escapeHTML(b.author)}</div>
      <div class="mb-info-meta">
        <span class="mb-info-year">${yearLabel}</span>
        ${b.tags.slice(0,2).map(t=>`<span class="mb-info-tag">${escapeHTML(t)}</span>`).join('')}
      </div>
    </div>
    <div class="mb-arrow">→</div>`;
  row.addEventListener('click', () => {
    if (window.BOOK_BY_ID?.[b.id]) App.show('book', { id: b.id });
  });
  return row;
}

function inferProvinceKey(book) {
  return (
    book.geo?.contentLocation?.province ||
    book.geo?.authorOrigin?.province ||
    book.geo?.readerLocation?.province ||
    book.province ||
    '__none'
  );
}

function buildPanelSubtitle(state) {
  if (state.type === 'province') return '';
  const total = state.books.length;
  const modeLabel = state.filterMode === 'all'
    ? 'All Locations'
    : (MAP_MODE_META[state.filterMode]?.label || 'Current Mode');
  return `${total} books in ${modeLabel.toLowerCase()} · culture + history + entry routes`;
}

function buildProvincePathLabel(provinceId, books) {
  const countryId = inferProvinceCountry(provinceId, books);
  return `${countryLabelFromId(countryId)} > ${PROV_NAMES[provinceId] || provinceId}`;
}

function inferProvinceCountry(provinceId, books = []) {
  const counts = {};
  const note = (countryId) => {
    if (!countryId) return;
    counts[countryId] = (counts[countryId] || 0) + 1;
  };
  books.forEach(book => {
    const geos = Object.values(book.geo || {});
    geos.forEach(geo => {
      if (!geo?.province || geo.province !== provinceId) return;
      note(geo.country || book.loc);
    });
    if (book.province === provinceId) note(book.loc);
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return top;
  if (provinceId.startsWith('CN-')) return 'CN';
  return __mapPanelState?.countryId || 'CN';
}

function countryLabelFromId(countryId) {
  if (!countryId) return 'World';
  const label = REGION_NAME_FORMATTER?.of(countryId);
  return label || countryId;
}

function buildRegionContext(countryId, label) {
  const profile = REGION_PROFILES[countryId];
  if (profile) return profile;
  return {
    culture: `${label} 目前还没有落入你的书单，但它依然适合作为“文化盲区入口”来读。先别急着找代表作，先问这个地区的语言、国家形成、宗教结构和城市经验怎样塑造了它的问题意识。`,
    history: [
      `${label} 的阅读通常值得先补一条简短历史线：国家形成、殖民或战争经验、现代化节奏。`,
      `优先寻找能把地方日常和大结构连起来的作品：小说、回忆录、历史随笔通常比纯理论更好进入。`,
      `把它当成“语境训练”而不是知识清单，会更快建立阅读抓手。`
    ],
    keywords: ['国家形成', '地方经验', '语言层次', '历史记忆', '宗教与世俗', '现代化节奏'],
    starters: [
      { title: '先读一部地区小说', note: `用人物关系进入 ${label} 的日常秩序与情感结构。`, type: 'Path 01' },
      { title: '再补一本历史概述', note: `把 ${label} 的制度转型、战争或殖民线索串起来。`, type: 'Path 02' },
      { title: '最后看回忆录或思想随笔', note: '让个人经验把抽象历史重新压回现实。', type: 'Path 03' }
    ]
  };
}

function buildKeywordNarrative(label, keywords) {
  return `${label} 这条阅读线不一定先求“完整”，先抓住 ${keywords.slice(0, 3).join(' / ')} 这几个词，通常就能更快进入地区语境。`;
}

function buildStarterList(state) {
  const starters = [...(state.context.starters || [])];
  if (state.countryId === 'CN' && state.type === 'country') {
    return starters.slice(0, 4);
  }
  const books = state.books || [];
  const modeLabel = state.filterMode === 'all'
    ? 'all locations'
    : (MAP_MODE_META[state.filterMode]?.label.toLowerCase() || 'current mode');
  books.slice(0, 2).forEach(book => {
    starters.unshift({
      title: book.title,
      author: book.author,
      note: `Already mapped in ${modeLabel}. Start here directly.`,
      type: 'Mapped Now'
    });
  });
  return starters.slice(0, 4);
}

/* ── Misc ───────────────────────────────────────────────────────────────── */

const PROV_NAMES = {
  'CN-11':'Beijing',     'CN-12':'Tianjin',      'CN-13':'Hebei',
  'CN-14':'Shanxi',      'CN-15':'Inner Mongolia','CN-21':'Liaoning',
  'CN-22':'Jilin',       'CN-23':'Heilongjiang',  'CN-31':'Shanghai',
  'CN-32':'Jiangsu',     'CN-33':'Zhejiang',      'CN-34':'Anhui',
  'CN-35':'Fujian',      'CN-36':'Jiangxi',       'CN-37':'Shandong',
  'CN-41':'Henan',       'CN-42':'Hubei',         'CN-43':'Hunan',
  'CN-44':'Guangdong',   'CN-45':'Guangxi',       'CN-46':'Hainan',
  'CN-50':'Chongqing',   'CN-51':'Sichuan',       'CN-52':'Guizhou',
  'CN-53':'Yunnan',      'CN-54':'Tibet',          'CN-61':'Shaanxi',
  'CN-62':'Gansu',       'CN-63':'Qinghai',       'CN-64':'Ningxia',
  'CN-65':'Xinjiang',
};

function setBreadcrumb(level, label, worldClickFn) {
  const el = document.getElementById('mapBreadcrumb');
  if (level === 'world') {
    el.innerHTML = `<span class="crumb active">🌐 World</span>`;
  } else {
    el.innerHTML = `<span class="crumb crumb-link" id="crumbWorld">🌐 World</span>
      <span class="crumb-sep">›</span>
      <span class="crumb active">${escapeHTML(label)}</span>`;
    if (worldClickFn) {
      document.getElementById('crumbWorld').addEventListener('click', worldClickFn);
    }
  }
}

/* amCharts 5 stores GeoJSON properties under dataItem.dataContext.
   The 'name' key is NOT promoted to dataItem.get('name') — read it
   directly from the feature properties instead. */
function getPolyName(polygon) {
  const di = polygon.dataItem;
  if (!di) return '';
  // Primary path: GeoJSON feature properties
  const ctx = di.dataContext;
  if (ctx?.properties?.name) return ctx.properties.name;
  // Fallback paths used in some amCharts builds
  if (ctx?.name)             return ctx.name;
  if (di.get?.('name'))      return di.get('name');
  return '';
}

function truncateText(text, maxChars) {
  const raw = String(text || '').trim();
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars - 1).trimEnd() + '…';
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[ch]);
}
