#!/usr/bin/env bash
# Pre-commit gate from docs/optimization-plan.md rule 3. Any failure aborts.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run lint
npm run typecheck
npm run typecheck:room
npm run check:entitlements
npm run check:hardcoded
npm run check:paths
npm run check:docs
npm --prefix functions run build
npm run test:unit
npm run test:rules:emu
npm run build
npm run test:e2e
npm run test:e2e:emu
npm run size
du -sh dist
# Room load budget (plan 1.6): <= 12 MB and 0 pageerrors.
mkdir -p test-results
npx vite preview --port 4173 > /dev/null 2>&1 &
PREVIEW_PID=$!
sleep 3
node scripts/measure-room-load.mjs --json > test-results/room-load.json || { kill $PREVIEW_PID; exit 1; }
kill $PREVIEW_PID
node -e "const r=JSON.parse(require('fs').readFileSync('test-results/room-load.json','utf8')); console.log('room load', r.totalMB, 'MB,', r.pageErrors.length, 'pageerrors'); if (r.totalMB > 12 || r.pageErrors.length) process.exit(1)"
rm -f firestore-debug.log
