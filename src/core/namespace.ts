// Single M namespace root. All migrated globals are registered here.
// See namespace.types.ts for branch type definitions.
import type { MarginaliaRoot } from './namespace.types.ts';

export const M: MarginaliaRoot = {
  data: {},
  services: {},
  store: {},
  ai: {},
  ui: {},
  views: {},
};
