# Third-party notices

Restyle's shape recognition is its own (`src/shapeFit.ts`). It reuses code from two MIT-licensed plugins by Charles Cheval.

## supernote-snap

`src/vendor/snap/recognize.ts` and `symbols.ts` are verbatim copies of Snap's files (the arrow-head and axis-tick geometry builders are the parts in use). The shape replacement order (delete the stroke, insert the shape, restore the stroke if insertion fails) follows Snap's flow.

Source: https://github.com/CharlesCheval/supernote-snap

Copyright (c) 2026 Charles Cheval. MIT license; full license in `src/vendor/snap/LICENSE`.

## supernote-palette

`src/vendor/palette/exactfill.ts` and `patterns.ts` are verbatim copies from Palette. They build the gray and white fills and the arrowhead fills.

Source: https://github.com/CharlesCheval/supernote-palette

Copyright (c) 2026 Charles Cheval. MIT license; full license in `src/vendor/palette/LICENSE`.
