# Approved title opening — review package

This directory is a separate, portable snapshot of the publicly served AIPPO Kids title HTML retrieved on 2026-10-15. It does not replace the adult React WelcomePage or the newer `/kids` learning implementation. Deployment and domain changes require the orchestrator's separate release step.

Changes are limited to the title layout, original asset references, and an optional opening. Existing title start / guest / login / settings handlers remain connected to the original application. This snapshot retains its existing authentication API paths and older learning implementation; passing the title tests does not certify those as equivalent to the newer Kids branch.

## Media provenance

- Original upload retained unchanged: `Creating_animated_opening_for_ch…_20261015201252.mp4`.
- Original SHA-256: `d835563458c70ab11a5dc272a3e1c60ed66abd4b682d23f940d00087dea62e89`.
- Derived `media/aippo-opening-v1.mp4`: H.264, 512×910, 4.000 seconds, video only, no audio stream, faststart, CRF26, 742220 bytes.
- `assets/title/approved-cover.jpeg` is the original approved cover fetched from the public title deployment; it was not redrawn or cropped.
- Existing official Po and brand files are copied as assets, not redesigned.

## Behaviour

- First local-device/browser visit only, not once per account across devices. A versioned local marker is written before playback. Existing local guardian acceptance or completed learning also suppresses automatic playback. A cookie-only signed-in account on a new browser can still see the opening before session resolution; there is no all-signed-in-users suppression guarantee.
- Reduced motion, data saving, or inaccessible marker storage suppresses automatic video loading. Manual replay remains optional.
- Video is muted and inline, not looped. Skip is present immediately, at least 44px high. Escape also dismisses. Keyboard focus stays on skip while the title is inert.
- The overlay lives outside the application's render target so session-check rerenders do not restart playback.
- Error, autoplay rejection, media end, or departure from the title restores title controls. Loading/stall timeout is 1200ms, absolute upper bound 5500ms including loading. There is no mandatory wait before skip.
- Narrow portrait uses full-frame fitting only between aspect ratios 171/320 and 189/320 (within five percent of 9:16). Taller screens preserve the art's aspect ratio with surrounding background above/below. Edge controls are not cropped. Tablet/landscape does not use this stretching rule.
- Landscape keeps the complete artwork contained and uses a separate visible four-button HTML operation column; image-based hit targets are disabled there.

## Verification at handoff

- `tests/titleOpening.test.ts`: 12 / 12 passed, including DOM/media-event cases and an aspect-policy consistency check. The aspect test is not a real rendered geometry check.
- ESLint and TypeScript passed at handoff.
- Browser geometry, real video playback, and actual phone use are separate gates. Browser tests were prepared by another reviewer and were not executed by this implementation agent.
- No deployment, main-branch merge, or production change was performed by this agent.
