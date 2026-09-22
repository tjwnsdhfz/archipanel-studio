# ArchiPanel basic image workflow

## Completion scope
Users can create a board, add PNG/JPEG/WebP (25MB and 40 million pixels per image), edit the composition, save a portable `.archipanel` including original bytes (100MB total), reopen as an independent copy, and share a 2,400px long-edge PNG. IndexedDB autosave stays on the same browser/device. Download a backup before clearing site data.

## Validation
- Frontend: 37 tests, TypeScript and production build passed.
- Browser: local image upload, archive download/reopen and PNG output exercised; desktop 1440px and mobile 375px inspected.
- Archive contents preserve source bytes. Reopen assigns new project/asset identities so imported work cannot overwrite existing local work.
- Python baseline: 28 passed, 8 optional-dependency skips. CI rechecks backend/container.

## Hosting and operation
Static build: `cd web; pnpm install --frozen-lockfile; VITE_STATIC_MODE=true pnpm build` (PowerShell: set `$env:VITE_STATIC_MODE='true'` first). Publish `web/dist` on existing Render static hosting. No server or AI calls in basic image flow. Do not instantiate the paid Docker+disk blueprint in render.yaml.

Static mode disables server sample/PSD/analysis/print controls. PDF import, font inspection and high resolution print still require the full local server; a share PNG is not a print-ready PDF. Imported HTML and other advanced local workflows are outside the validated basic scope. Undo/redo is available during editing. If output fails, inputs remain in the browser; retry or save an archive. Browser storage is not cloud backup.

## Cost and service limits
Existing Render Hobby workspace: no card, current charges $0; included monthly 5GB bandwidth, 500 pipeline minutes, 25 services, shared 750 free instance hours (observed 2026-09-22). Static hosting adds no instance hours. Planning assumption: 1,000 cold page loads × about 0.35MB compressed scripts ≈350MB/month, plus browser-local files that are not uploaded. Estimate new cost $0 within free allowances; check aggregate usage, do not enable paid overages. No uptime/SLA promise.

## Recovery and next evidence
Rollback the merge via a revert PR or redeploy the prior successful Render build; preserve browser databases and downloaded archives. Hypothesis: architecture students may pay for consistent reusable templates and print checks. This release has no customer/payment evidence; test five real submissions and compare time/errors before proposing a price.

## 2,400px share PNG
The share export renders the current Fabric board at a fixed 2,400px long edge (at most 5.76 megapixels), independent of phone/desktop viewport and device pixel ratio. Original image blobs are used. Guides and selection controls are omitted. Missing or unreadable images block export; incomplete output is not silently downloaded. This remains an RGB sharing image, not a specified-DPI print deliverable. Verified local mobile output: 1699 × 2400 pixels. Unit suite now has 37 passing tests.
