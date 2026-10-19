#!/usr/bin/env bash
# Pre-commit gate from docs/optimization-plan.md rule 3. Any failure aborts.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run lint
npm run typecheck
npm run typecheck:room
npm run check:entitlements
npm run check:hardcoded
npm --prefix functions run build
npm run test:unit
npm run test:rules:emu
npm run build
npm run test:e2e:emu
npm run size
du -sh dist
rm -f firestore-debug.log
