# ArchiPanel basic image workflow

## Completion scope
Users can create a board, add PNG/JPEG/WebP (25MB and 40 million pixels per image), edit the composition, save a portable `.archipanel` including original bytes (100MB total), reopen as an independent copy, and share a current-view PNG. IndexedDB autosave stays on the same browser/device. Download a backup before clearing site data.

## Validation
- Frontend: 34 tests, TypeScript and production build passed.
- Browser: local image upload, archive download/reopen and PNG output exercised; desktop 1440px and mobile 375px inspected.
- Archive contents preserve source bytes. Reopen assigns new project/asset identities so imported work cannot overwrite existing local work.
- Python baseline: 28 passed, 8 optional-dependency skips. CI rechecks backend/container.

## Hosting and operation
Static build: `cd web; pnpm install --frozen-lockfile; VITE_STATIC_MODE=true pnpm build` (PowerShell: set `$env:VITE_STATIC_MODE='true'` first). Publish `web/dist` on existing Render static hosting. No server or AI calls in basic image flow. Do not instantiate the paid Docker+disk blueprint in render.yaml.

Static mode disables server sample/PSD/analysis/print controls. PDF import, font inspection and high resolution print still require the full local server; a screen PNG is not a print-ready PDF. Imported HTML and other advanced local workflows are outside the validated basic scope. Undo/redo is available during editing. If output fails, inputs remain in the browser; retry or save an archive. Browser storage is not cloud backup.

## Cost and service limits
Existing Render Hobby workspace: no card, current charges $0; included monthly 5GB bandwidth, 500 pipeline minutes, 25 services, shared 750 free instance hours (observed 2026-09-22). Static hosting adds no instance hours. Planning assumption: 1,000 cold page loads × about 0.35MB compressed scripts ≈350MB/month, plus browser-local files that are not uploaded. Estimate new cost $0 within free allowances; check aggregate usage, do not enable paid overages. No uptime/SLA promise.

## Recovery and next evidence
Rollback the merge via a revert PR or redeploy the prior successful Render build; preserve browser databases and downloaded archives. Hypothesis: architecture students may pay for consistent reusable templates and print checks. This release has no customer/payment evidence; test five real submissions and compare time/errors before proposing a price.
