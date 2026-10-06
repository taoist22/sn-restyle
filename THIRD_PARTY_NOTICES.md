# Third-party notices

The recognition functions in `src/vendor/supernote-snap/recognize.ts` and `axes.ts` are adapted from Charles Cheval’s supernote-snap, commit d0275ea17b8e34c9cd08d0a0e05856954401c33c. Brace and square-root dependencies were removed; rectangle, circle, resampling, direction snapping, arrow and coordinate axes functions are retained. Coordinate axes use Snap’s arrowhead/tick construction and default spacing and width proportions.

Source: https://github.com/CharlesCheval/supernote-snap

Copyright (c) 2026 Charles Cheval. MIT license; full license included in `src/vendor/supernote-snap/LICENSE`.

Shape recognition is Restyle's own (`src/shapeFit.ts`). Snap's arrow and axis-tick geometry builders are used from `src/vendor/snap/recognize.ts` and `symbols.ts` (verbatim copies, MIT, license in `src/vendor/supernote-snap/LICENSE`). The older adapted copies in `src/vendor/supernote-snap/` are used only by the legacy recovery code in `src/cleanupOps.ts`.

The gray fill of circles and rectangles uses `src/vendor/palette/exactfill.ts` and `patterns.ts`, verbatim copies from Charles Cheval's supernote-palette.

Source: https://github.com/CharlesCheval/supernote-palette

Copyright (c) 2026 Charles Cheval. MIT license; full license included in `src/vendor/palette/LICENSE`.
