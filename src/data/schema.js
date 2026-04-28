/* ==========================================================================
   Marginalia · Data Schema (JSDoc type definitions)
   --------------------------------------------------------------------------
   This file is documentation only — no runtime code. It defines the shape
   of data objects used throughout the app so any file can reference it.
   ========================================================================== */

/**
 * @typedef {'fiction'|'science'|'sociology'|'travel'|'essay'} BookType
 *   fiction    → character map, story timeline
 *   science    → mind map, concept graph, chapter outline
 *   sociology  → concept cards, argument breakdown, cross-book links
 *   travel     → geographic map, cultural background
 *   essay      → action list, quotes, personal reflection
 */

/**
 * @typedef {'reading'|'finished'|'wishlist'} ReadingStatus
 */

/**
 * @typedef BookCover
 * @property {string}  bg         CSS color — cover background
 * @property {string}  text       CSS color — cover text
 * @property {string}  font       CSS font-family
 * @property {number}  [weight]   CSS font-weight
 * @property {string}  [art]      SVG art id (e.g. 'sapiens')
 * @property {string}  [image]    URL to real cover image (overrides generated cover)
 */

/**
 * @typedef BookMeta
 * @property {string}  [publisher]
 * @property {string}  [edition]
 * @property {number}  [pages]
 * @property {string}  [startedAt]     ISO date string
 * @property {string}  [finishedAt]    ISO date string
 * @property {number}  [readingHours]
 */

/**
 * @typedef GeoPoint
 * @property {string}  country    ISO-2 country code, e.g. 'CN'
 * @property {string}  [province] e.g. 'CN-37' (for map drilldown)
 * @property {string}  [city]
 */

/**
 * @typedef BookGeo
 * @property {GeoPoint} [authorOrigin]
 * @property {GeoPoint} [contentLocation]
 * @property {GeoPoint} [readerLocation]
 */

/**
 * @typedef Highlight
 * @property {number|string} id
 * @property {number}        page
 * @property {string}        chapter
 * @property {'concept'|'argument'|'action'} kind
 * @property {string}        quote
 * @property {string}        [conceptId]
 * @property {string}        [annotation]
 */

/**
 * @typedef Action
 * @property {string}  id
 * @property {string}  text
 * @property {'todo'|'doing'|'done'} status
 * @property {string}  [tag]
 */

/**
 * @typedef BookConcept
 * @property {string}   id
 * @property {string}   name
 * @property {string[]} [aliases]
 * @property {string}   contextTag
 * @property {'core-thesis'|'supports'|'questions'|'contrasts'|'extends'|'action-trigger'} relationType
 * @property {number}   strength         0–1
 * @property {string}   description
 * @property {Array<number|string>} [highlightIds]
 * @property {string[]} [actionIds]
 * @property {string}   [readerUnderstanding]
 */

/**
 * @typedef Book
 * @property {string}       id              stable slug, e.g. 'sapiens'
 * @property {string}       title
 * @property {string}       [titleZh]
 * @property {string}       author
 * @property {string}       [authorZh]
 * @property {number}       year            publication year (negative = BCE)
 * @property {ReadingStatus} status
 * @property {BookType}     [bookType]
 * @property {number|null}  rating          0–5
 * @property {string[]}     tags
 * @property {BookCover}    cover
 * @property {BookMeta}     [meta]
 * @property {GeoPoint}     [location]
 * @property {BookGeo}      [geo]
 * @property {string}       [summary]
 * @property {object}       [insight]
 * @property {Highlight[]}  [highlights]
 * @property {object[]}     [cultural]
 * @property {object}       [mindmap]
 * @property {object[]}     [connections]
 * @property {Action[]}     [actions]
 * @property {{concepts: BookConcept[], suggestedConcepts?: BookConcept[]}} [graph]
 * @property {object}       [context]       reader personal context
 * @property {object}       [notes]         user-authored notes (Firestore-synced)
 * @property {object}       [ai]            AI-generated content per type
 */
