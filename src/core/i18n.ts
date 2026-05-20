// Marginalia · i18n string registry
// Source language: en. All new strings go into `en` first.
// Other locales fall back to `en` for any missing key.
// To update translations: edit `en`, then run `npm run i18n:sync`.

// ── Locale data ───────────────────────────────────────────────────────────────

const locales: Record<string, Record<string, string>> = {
  en: {
    // Nav
    'nav.shelf':     'Shelf',
    'nav.library':   'Library',
    'nav.map':       'Map',
    'nav.graph':     'Graph',
    'nav.book':      'Book',

    // Status labels
    'status.reading':          'Reading',
    'status.finished':         'Finished',
    'status.want':             'To Read',
    'status.confirmed-later':  'Confirm Later',
    'status.wishlist':         'To Read',

    // New Entry dialog
    'new-entry.title':                  'Add Book',
    'new-entry.spine-color':            'Spine Color',
    'new-entry.style':                  'Style',
    'new-entry.thickness':              'Thickness',
    'new-entry.autofill-label':         'Auto-fill from lookup',
    'new-entry.isbn-placeholder':       'ISBN — paste to auto-fill',
    'new-entry.isbn-btn':               'Lookup',
    'new-entry.field.title':            'Title',
    'new-entry.field.author':           'Author',
    'new-entry.field.status':           'Status',
    'new-entry.field.language':         'Language',
    'new-entry.field.book-type':        'Book Type',
    'new-entry.field.book-type-hint':   '— determines AI features',
    'new-entry.field.origin':           'Country / Origin',
    'new-entry.field.origin-placeholder': 'e.g. Japan, United States',
    'new-entry.field.tags':             'Tags',
    'new-entry.field.tags-placeholder': 'e.g. Fiction, History, Philosophy',
    'new-entry.field.tags-hint':        'Separate with commas',
    'new-entry.field.link':             'External Link',
    'new-entry.field.link-placeholder': 'Douban / Amazon URL',
    'new-entry.btn.open':               'Open',
    'new-entry.btn.add':                'Add to library',
    'new-entry.btn.cancel':             'Cancel',
    'new-entry.btn.upload-cover':       'Upload Cover',
    'new-entry.btn.change-cover':       'Change Cover',
    'new-entry.cover-placeholder':      'Cover',
    'new-entry.sentiment-hint':         'Choose colors that capture how this book makes you feel — not just its cover.',
    'new-entry.book-type.nonfiction':   'Nonfiction — history, science, biography',
    'new-entry.book-type.fiction':      'Fiction — novels, literary fiction',
    'new-entry.book-type.social':       'Social Science — philosophy, sociology, economics',
    'new-entry.book-type.essay':        'Essay / Self-help — personal essays, self-help',
    'new-entry.book-type.travel':       'Travel — travel writing, cultural reportage',
    'new-entry.lang.en':                'English',
    'new-entry.lang.zh':                'Chinese',
    'new-entry.lang.other':             'Other',

    // Shelf view
    'shelf.empty':                    'No books yet.',
    'shelf.btn.mark-want':            'Mark as to read',
    'shelf.btn.mark-reading':         'Mark as reading',
    'shelf.btn.mark-finished':        'Mark as finished',
    'shelf.btn.create-notes':         'Create Notes',
    'shelf.btn.open-detail':          'Open Detail',
    'shelf.section.cultural':         'Cultural Background',
    'shelf.section.next':             'To Do Next',
    'shelf.filter.all':               'All',
    'shelf.filter.reading':           'Reading',
    'shelf.filter.finished':          'Finished',
    'shelf.filter.to-read':           'To Read',
    'shelf.stat.vs-last-year':        '↗ +3 vs last year',
    'shelf.stat.this-month':          '↗ +12 this month',

    // Library 2D / shelf wall
    'library.empty':                  'Your library will appear here once you add books.',
    'library.shelf-rename-prompt':    'Rename shelf',
    'library.group.reading':          'Reading',
    'library.group.want':             'To Read',
    'library.group.finished':         'Finished',
    'library.group.confirmed-later':  'Confirm Later',

    // Map view
    'map.fit':                        'Fit',
    'map.empty':                      'No mapped books yet',
    'map.cultural-background':        'Cultural background',
    'map.historical-context':         'Historical context',
    'map.starter-reading':            'Starter reading',
    'map.no-signal':                  'No clear literary signal yet',
    'map.no-voices':                  'No mapped voices yet',
    'map.region.books':               'Books',
    'map.region.culture':             'Culture',
    'map.region.history':             'History',
    'map.region.keywords':            'Keywords',
    'map.region.starter':             'Starter',

    // Action items panel
    'actions.title':                  'Action Items',
    'actions.empty':                  'No open actions yet.',
    'actions.placeholder':            'Add an action from this book…',
    'actions.btn.add':                'Add',
    'actions.btn.mark-done':          'Mark done',
    'actions.btn.archive':            'Archive',
    'actions.snooze.label':           'Snooze 30 days',

    // Action notifications
    'notif.title':                    'Action Reminders',
    'notif.btn.open':                 'Open',
    'notif.btn.dismiss':              'Dismiss',
    'notif.btn.dismiss-all':          'Dismiss all',
    'notif.btn.close':                'Dismiss',
    'notif.tier.90':                  '90-day review — keep or archive?',
    'notif.tier.30':                  '30-day check-in — still meaningful?',
    'notif.tier.7':                   '7-day reminder — memory still fresh',

    // Public profile
    'profile.loading':                'Loading profile…',
    'profile.not-found.title':        'Profile not found',
    'profile.not-found.body':         'No reader has claimed this handle yet.',
    'profile.private.body':           'This profile is private.',
    'profile.error.title':            'Something went wrong',
    'profile.back-to-shelf':          'Back to search',
    'profile.section.shelf':          'Reading shelf',
    'profile.empty.books':            'No books shared yet.',
    'profile.stat.books':             'books',
    'profile.stat.read':              'read',

    // Profile settings
    'profile-settings.heading':                    'Public Profile',
    'profile-settings.label.url':                  'Profile URL',
    'profile-settings.slug.placeholder':           'your-handle',
    'profile-settings.slug.btn-save':              'Save',
    'profile-settings.slug.checking':             'Checking…',
    'profile-settings.slug.available':             'Available',
    'profile-settings.slug.taken':                 'Already taken',
    'profile-settings.slug.taken-choose-another':  'Already taken — choose another',
    'profile-settings.slug.invalid':               'Letters, numbers, and hyphens only (3–32 chars)',
    'profile-settings.slug.reserved':              'This slug is reserved',
    'profile-settings.slug.unavailable':           'Unavailable',
    'profile-settings.slug.saving':                'Saving…',
    'profile-settings.slug.saved':                 'Saved',
    'profile-settings.slug.save-failed':           'Save failed — try again',
    'profile-settings.label.public':               'Public profile',
    'profile-settings.hint.public':                'When on, your profile is visible to anyone with the link.',
    'profile-settings.subheading.books':           'Books on your profile',
    'profile-settings.hint.books':                 'Choose which books appear on your public page.',
    'profile-settings.empty.books':                'No books yet.',
    'profile-settings.gate.msg':                   'Public profiles are not available on your current plan.',
    'profile-settings.loading':                    'Loading…',

    // Language switcher (in profile settings)
    'profile-settings.label.language':             'Display language',
    'profile-settings.lang.en':                    'English',
    'profile-settings.lang.zh-CN':                 '中文',

    // Export
    'export.btn.json':    'Export JSON',
    'export.btn.markdown': 'Export Markdown',
    'export.upgrade':     'Upgrade to export',

    // Common
    'common.untitled':   'Untitled',
    'common.save':       'Save',
    'common.cancel':     'Cancel',
    'common.delete':     'Delete',
    'common.open':       'Open',
    'common.close':      'Close',
    'common.loading':    'Loading…',
    'common.error':      'Something went wrong',
    'common.retry':      'Try again',
  },

  'zh-CN': {
    // Nav
    'nav.shelf':     '书架',
    'nav.library':   '书房',
    'nav.map':       '阅读地图',
    'nav.graph':     '概念图',
    'nav.book':      '书目',

    // Status labels
    'status.reading':          '阅读中',
    'status.finished':         '已读',
    'status.want':             '想读',
    'status.confirmed-later':  '稍后确认',
    'status.wishlist':         '想读',

    // New Entry dialog
    'new-entry.title':                  '添加书目',
    'new-entry.spine-color':            '书脊颜色',
    'new-entry.style':                  '样式',
    'new-entry.thickness':              '厚度',
    'new-entry.autofill-label':         '通过检索自动填写',
    'new-entry.isbn-placeholder':       'ISBN — 粘贴后自动填写',
    'new-entry.isbn-btn':               '查询',
    'new-entry.field.title':            '书名',
    'new-entry.field.author':           '作者',
    'new-entry.field.status':           '状态',
    'new-entry.field.language':         '语言',
    'new-entry.field.book-type':        '书籍类型',
    'new-entry.field.book-type-hint':   '— 决定可用的 AI 功能',
    'new-entry.field.origin':           '国家 / 来源地',
    'new-entry.field.origin-placeholder': '如：日本、美国',
    'new-entry.field.tags':             '标签',
    'new-entry.field.tags-placeholder': '如：小说、历史、哲学',
    'new-entry.field.tags-hint':        '用逗号分隔',
    'new-entry.field.link':             '外部链接',
    'new-entry.field.link-placeholder': '豆瓣 / Amazon 链接',
    'new-entry.btn.open':               '打开',
    'new-entry.btn.add':                '加入书库',
    'new-entry.btn.cancel':             '取消',
    'new-entry.btn.upload-cover':       '上传封面',
    'new-entry.btn.change-cover':       '更换封面',
    'new-entry.cover-placeholder':      '封面',
    'new-entry.sentiment-hint':         '选择能传达这本书给你感受的颜色，而不只是封面原色。',
    'new-entry.book-type.nonfiction':   '非虚构 — 历史、科学、传记',
    'new-entry.book-type.fiction':      '虚构 — 小说、文学作品',
    'new-entry.book-type.social':       '社会科学 — 哲学、社会学、经济学',
    'new-entry.book-type.essay':        '随笔 / 自助 — 个人随笔、自我提升',
    'new-entry.book-type.travel':       '游记 — 旅行写作、文化报道',
    'new-entry.lang.en':                '英语',
    'new-entry.lang.zh':                '中文',
    'new-entry.lang.other':             '其他',

    // Shelf view
    'shelf.empty':                    '还没有书目。',
    'shelf.btn.mark-want':            '标记为想读',
    'shelf.btn.mark-reading':         '标记为阅读中',
    'shelf.btn.mark-finished':        '标记为已读',
    'shelf.btn.create-notes':         '创建笔记',
    'shelf.btn.open-detail':          '查看详情',
    'shelf.section.cultural':         '文化背景',
    'shelf.section.next':             '下一步行动',
    'shelf.filter.all':               '全部',
    'shelf.filter.reading':           '阅读中',
    'shelf.filter.finished':          '已读',
    'shelf.filter.to-read':           '想读',
    'shelf.stat.vs-last-year':        '↗ 比去年多 3 本',
    'shelf.stat.this-month':          '↗ 本月新增 12 条',

    // Library 2D / shelf wall
    'library.empty':                  '添加书目后，书库将在这里显示。',
    'library.shelf-rename-prompt':    '重命名书架',
    'library.group.reading':          '阅读中',
    'library.group.want':             '想读',
    'library.group.finished':         '已读',
    'library.group.confirmed-later':  '稍后确认',

    // Map view
    'map.fit':                        '适应',
    'map.empty':                      '暂无定位书目',
    'map.cultural-background':        '文化背景',
    'map.historical-context':         '历史语境',
    'map.starter-reading':            '入门书单',
    'map.no-signal':                  '暂无明确文学脉络',
    'map.no-voices':                  '暂无关联作者',
    'map.region.books':               '书目',
    'map.region.culture':             '文化',
    'map.region.history':             '历史',
    'map.region.keywords':            '关键词',
    'map.region.starter':             '入门',

    // Action items panel
    'actions.title':                  '行动清单',
    'actions.empty':                  '还没有待办行动。',
    'actions.placeholder':            '从这本书中添加行动…',
    'actions.btn.add':                '添加',
    'actions.btn.mark-done':          '标记完成',
    'actions.btn.archive':            '归档',
    'actions.snooze.label':           '延后 30 天',

    // Action notifications
    'notif.title':                    '行动提醒',
    'notif.btn.open':                 '打开',
    'notif.btn.dismiss':              '忽略',
    'notif.btn.dismiss-all':          '全部忽略',
    'notif.btn.close':                '忽略',
    'notif.tier.90':                  '90 天回顾 — 保留还是归档？',
    'notif.tier.30':                  '30 天复盘 — 还有意义吗？',
    'notif.tier.7':                   '7 天提醒 — 记忆尚鲜',

    // Public profile
    'profile.loading':                '正在加载主页…',
    'profile.not-found.title':        '未找到主页',
    'profile.not-found.body':         '该用户名尚未被认领。',
    'profile.private.body':           '该主页为私密状态。',
    'profile.error.title':            '出错了',
    'profile.back-to-shelf':          '返回搜索',
    'profile.section.shelf':          '阅读书架',
    'profile.empty.books':            '暂无共享书目。',
    'profile.stat.books':             '本书',
    'profile.stat.read':              '已读',

    // Profile settings
    'profile-settings.heading':                    '公开主页',
    'profile-settings.label.url':                  '主页链接',
    'profile-settings.slug.placeholder':           '你的用户名',
    'profile-settings.slug.btn-save':              '保存',
    'profile-settings.slug.checking':             '检查中…',
    'profile-settings.slug.available':             '可用',
    'profile-settings.slug.taken':                 '已被使用',
    'profile-settings.slug.taken-choose-another':  '已被使用，请换一个',
    'profile-settings.slug.invalid':               '仅限字母、数字和连字符（3–32 位）',
    'profile-settings.slug.reserved':              '该用户名已被保留',
    'profile-settings.slug.unavailable':           '不可用',
    'profile-settings.slug.saving':                '保存中…',
    'profile-settings.slug.saved':                 '已保存',
    'profile-settings.slug.save-failed':           '保存失败，请重试',
    'profile-settings.label.public':               '公开主页',
    'profile-settings.hint.public':                '开启后，任何人通过链接均可访问你的主页。',
    'profile-settings.subheading.books':           '主页展示的书目',
    'profile-settings.hint.books':                 '选择出现在公开主页上的书目。',
    'profile-settings.empty.books':                '还没有书目。',
    'profile-settings.gate.msg':                   '当前套餐不支持公开主页功能。',
    'profile-settings.loading':                    '加载中…',

    // Language switcher
    'profile-settings.label.language':             '显示语言',
    'profile-settings.lang.en':                    'English',
    'profile-settings.lang.zh-CN':                 '中文',

    // Export
    'export.btn.json':    '导出 JSON',
    'export.btn.markdown': '导出 Markdown',
    'export.upgrade':     '升级以导出',

    // Common
    'common.untitled':   '无标题',
    'common.save':       '保存',
    'common.cancel':     '取消',
    'common.delete':     '删除',
    'common.open':       '打开',
    'common.close':      '关闭',
    'common.loading':    '加载中…',
    'common.error':      '出错了',
    'common.retry':      '重试',
  },
};

// ── Language resolution ───────────────────────────────────────────────────────

// Active locale — set by setLanguage() when the user changes their preference
// or when auth loads their saved settings from Firestore.
let _currentLang = 'en';

/**
 * Update the active UI language. Called by auth on sign-in and by the
 * language switcher when the user changes their preference.
 */
export function setLanguage(lang: string): void {
  if (!locales[lang]) return;
  _currentLang = lang;
}

function getCurrentLanguage(): string {
  return _currentLang;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the translated string for `key` in the current UI language.
 * Falls back: currentLocale[key] → en[key] → key literal.
 */
export function t(key: string): string {
  const lang = getCurrentLanguage();
  return locales[lang]?.[key] ?? locales['en'][key] ?? key;
}

/**
 * Returns all locale keys for the given locale (for the sync script).
 */
export function getLocaleKeys(locale: string): Record<string, string> {
  return locales[locale] ?? {};
}

/**
 * Returns the list of supported locale codes.
 */
export function getSupportedLocales(): string[] {
  return Object.keys(locales);
}

/**
 * Returns the English source strings (used by the sync script as the baseline).
 */
export function getEnStrings(): Record<string, string> {
  return locales['en'];
}
