export interface ReadingIdentityArchetype {
  title: string;
  titleZh?: string;
  summary: string;
  summaryZh?: string;
}

export interface ReadingIdentityAxis {
  key: string;
  label: string;
  opposite: string;
  score: number;
  evidence?: string[];
}

export interface ReadingIdentityBehaviorEntry {
  key: string;
  label: string;
  value: string;
  rationale: string;
  signal?: string;
  confidence?: number;
  metrics?: Record<string, number | string>;
}

export interface ReadingIdentityPoeticProjection {
  ifYouWereABook: string;
  shelfSmell?: string;
  readingWeather?: string;
}

export interface ReadingIdentityProvenance {
  bookCount: number;
  highlightCount: number;
  sourceWindow?: string;
  promptVersion?: string;
  model?: string;
}

export interface ReadingIdentityResult {
  yearScope: string;
  generatedAt: string;
  version: string;
  archetype: ReadingIdentityArchetype;
  axes: ReadingIdentityAxis[];
  behaviorProfile: ReadingIdentityBehaviorEntry[];
  poeticProjection: ReadingIdentityPoeticProjection;
  provenance: ReadingIdentityProvenance;
}

export interface ReadingIdentityVariant {
  archetype: ReadingIdentityArchetype;
  poeticProjection: ReadingIdentityPoeticProjection;
}
