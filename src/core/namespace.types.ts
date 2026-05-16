// Type definitions for the M namespace root.
// Each branch mirrors a layer of the app; globals are added here as they're migrated.

export interface MarginaliaData {
  BOOK_TYPES: Record<string, unknown>;
  BookTypes: unknown;
  BOOKS: unknown;
  BOOKLIST_CURATED: unknown;
  __SEED_SAPIENS: unknown;
}

export interface MarginaliaServices {
  MARGINALIA_FIREBASE: unknown;
  MarginaliaAuth: unknown;
  MarginaliaBooksCloud: unknown;
  MarginaliaStorage: unknown;
}

export interface MarginaliaStore {
  NotesStore: unknown;
  BooksStore: unknown;
  EntitlementsStore: unknown;
  MarginaliaGraph: unknown;
}

export interface MarginaliaAINamespace {
  MarginaliaAI: unknown;
  AIGenerateUI: unknown;
  AIFeatureRegistry: unknown;
}

export interface MarginaliaUI {
  PanelRegistry: unknown;
  PanelManager: unknown;
  SpineCard: unknown;
  NewEntry: unknown;
  KindleImport: unknown;
  renderPrimaryHeader: unknown;
  renderUnifiedPanelHeader: unknown;
  renderToolPageShell: unknown;
  openConceptDrawer: unknown;
  closeConceptDrawer: unknown;
}

export interface MarginaliaViews {
  [key: string]: unknown;
}

export interface MarginaliaRoot {
  data: Partial<MarginaliaData>;
  services: Partial<MarginaliaServices>;
  store: Partial<MarginaliaStore>;
  ai: Partial<MarginaliaAINamespace>;
  ui: Partial<MarginaliaUI>;
  views: MarginaliaViews;
}
