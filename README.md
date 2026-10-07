

https://github.com/user-attachments/assets/3e9c37d2-a545-4307-9edc-18d9fa34041b

# Restyle for Supernote

**Restyle** is a plugin for the Supernote Nomad and Manta that lets you change the ink color and stroke thickness of handwriting and geometry shapes you have already written. Lasso any strokes or shapes on the page, open the Restyle lasso action, pick a color and thickness, and apply — the selected elements are updated in place with no repositioning.

> **Pre-release:** This plugin requires the Supernote beta firmware and is not yet intended for general use.

## Shapes, fills and axes

Lasso **one stroke**, open Restyle and use the **Shape** tab. Pick **Auto** or a named shape and tap **Apply**; the stroke is replaced by a clean native shape. **Keep drawing** (the default) does no recognition and leaves ordinary restyling unchanged. Nothing runs in the background while you write.

- **Shapes:** line, rectangle, circle, arrow, axes. **Flowchart:** diamond, rounded box, parallelogram, triangle, elbow arrow.
- **Auto** recognizes arrows, a drawn L (as axes), lines, circles, rectangles, triangles and diamonds. A **named shape** always fits that shape, even from a rough stroke. Parallelogram, rounded box and elbow arrow are button-only.
- **Outline width** (on the Shape tab) has pen-size steps and Wide 2×–12× multipliers, taken from the stroke's own width.
- **Fill:** none, light gray, dark gray or white, for circles, rectangles and the polygon shapes. White hides the page's template lines. The fill is a separate element inside the outline, so lasso both to move them. Choose a fill with a new shape, or lasso an existing circle or rectangle and choose a fill alone.
- **Axes:** set x from/to, y from/to (each range must include 0) and the tick step (1, 2 or 5); optional arrowheads at the + ends or both ends. Size is automatic, centred on the lassoed stroke. Ticks only; write your own labels as text boxes.
- **Arrows** are two pieces: the outline, and a separate head fill. Lasso both to move one.
- The recognizer is Restyle's own (`src/shapeFit.ts`). The replace flow follows Charles Cheval's Snap (delete the stroke, insert the shape, restore the stroke if insertion fails), and the fill method follows his Palette. Both are MIT; see `THIRD_PARTY_NOTICES.md`.

The panel has a **Shape** tab and a **Style** tab with Apply and Cancel always visible. Shapes need exactly one stroke selected. Single native shapes use the lasso geometry styling API; multi-element styling keeps the title-safe save/reload/file-write sequence.

Not built: dashed and dotted lines, filling hand-drawn strokes, multi-stroke shapes, panel controls for the elbow's legs. Shape cleanup is not covered by Restyle's undo; use Supernote's own undo or delete the pieces.

See [TEST_MATRIX.md](TEST_MATRIX.md) for the on-device checks.

## Features

- **Four ink colors** — Black, Dark Gray, Light Gray, and Ghost (white / invisible on white paper)
- **Familiar pen sizes** — choose the same millimetre labels used by Supernote's native size control
- **Fine size adjustment** — move in 0.1 mm steps, including useful in-between sizes such as 1.1, 1.2, 1.3, and 1.4 mm (not available for marker strokes — see Limitations)
- **Wide Shape** — enlarge straight-line and other geometry widths by a clear relative multiplier, separately from pen sizing
- **Works on strokes and geometry** — lasso freehand handwriting, drawn shapes, or a mix of both
- **Clean shapes, fills and axes** — turn one rough stroke into a native shape; gray or white fill; configurable axes
- **Four user-defined presets** — save your favorite color + thickness combinations for one-tap access
- **Undo last operation** — style undo within the session
- **Non-destructive** — elements stay exactly where they are; only color and thickness change
- **Works on Nomad and Manta**

## Installation

1. Download `Restyle.snplg` from the [latest release](https://github.com/taoist22/sn-restyle/releases).
2. Connect your Supernote to your computer using the Supernote Partner app or Browse & Access.
3. Copy `Restyle.snplg` into the `MyStyle` folder on your device.
4. On your Supernote, open a note, tap the **plugin icon** in the toolbar, go to **Manage Plugins**, tap **Add Plugin**, and select `Restyle`.

## Usage

1. Open a note and lasso the strokes or shapes you want to restyle.
2. Open Restyle from the lasso actions:
   - On the **Main layer**, tap **…**, then tap **Restyle** beside its cursive **R** icon.
   - On a **custom layer**, the cursive **R** icon may appear directly on the lasso toolbar instead of inside **…**.
3. The plugin reads your selection and shows the Restyle panel.
4. *(Optional)* Tap a **preset slot** to instantly load a saved color + thickness.
5. Tap a color swatch to set the ink color. Choose a familiar native size or use **−** / **+** for 0.1 mm adjustments.
6. Tap **Apply** — the selected elements are updated and the page reloads.

> **Tip:** You can change color only, size only, or both at once. If the selection contains several sizes, Restyle starts at their average and tells you that the selection is mixed.

## Presets

Presets let you save up to four color + thickness combinations for quick access.

- **Apply a preset** — tap the preset slot. The color and thickness fields update to match.
- **Save a preset** — select a color (required), optionally adjust thickness, then tap **+** next to the slot you want to save into.
- **Clear a preset** — tap **−** next to the slot.

Presets are saved permanently and survive closing and reopening the app.

## Style-only undo

Cleanup uses the separate recovery workflow described above. After you apply a style-only restyle, the next time you open the Restyle panel in the same session it will show the **Undo** screen instead of the restyle controls.

- Tap **Undo** to revert the most recent restyle. All elements that were changed in that operation are restored to their original color and thickness together.
- Tap **New Restyle** to keep the most recent restyle and apply a fresh one to your current selection.

> **What Undo cannot do:**
> - Undo only remembers the **single most recent** restyle. There is no per-element history — once you apply a new restyle or run Undo, the prior state is no longer available.
> - Undo is not selection-aware. If you lasso an older restyled element and open the plugin, the Undo screen will still appear, but tapping it reverts the most recent restyle, not the element you selected.
> - Undo state is cleared when you close the note, close the plugin host, or restart the device.
>
> **To revert an older restyle:** Lasso the element and apply your best estimate of the original color and thickness manually using the restyle controls.

## Wide Shape

Wide Shape is not a callout tool and does not create a background layer or image. It changes the width property of an existing Supernote geometry element. The control appears only when the lasso contains shapes and no freehand strokes.

1. Draw a line and **hold the pen at the end** so Supernote converts it to a straight-line shape.
2. Lasso the shape and open Restyle.
3. In **Wide Shape**, choose **2×**, **4×**, **8×**, or **12×**. These are relative multipliers based on that shape's existing width, not millimetre pen sizes. On current firmware, 12× is the maximum width that renders and persists reliably.
4. Optionally choose a color, then tap **Apply**.

This is useful for dividers, emphasis bars, and other broad geometry. A Wide Shape setting can be saved as a preset, but it remains available only for shape-only selections. Stretching a lasso can change the line's length; its temporarily scaled thickness is only a preview, and Supernote returns to the saved Wide Shape width after deselection.

## Limitations

### Notes from a different Supernote model ("Different Device")

A note stores the page size of the device it was **created** on. If you open a note made on a different Supernote model (for example, a Nomad note opened on a Manta, or vice‑versa, after syncing), Restyle shows a **Different Device** notice and does nothing on that note.

This is deliberate: restyling relies on rewriting element data, and the page‑size mismatch between models would move your strokes out of place. Restyle that note on the device it was created on, where it works normally.

> Notes with **H (Title) elements** are now fully supported and restyle correctly — the earlier "Plugin Disabled on titled notes" restriction has been removed.

### Marker Strokes

Freehand marker strokes can only have their **color** changed in Restyle — the thickness control is disabled whenever the lasso contains a marker stroke.

This is intentional. The Supernote firmware caps the renderable width of a freehand marker stroke, and writing a thickness past that cap creates a mismatch between the visible stroke and the firmware's internal outline. When that happens the stroke becomes difficult or impossible to lasso again. The Supernote OS itself does not expose a thickness control for marker strokes for the same reason.

**Workaround:** If you need a wider marker-like band, **hold the pen at the end of the stroke** as you draw it. Supernote converts the result to a straight-line geometry, which Restyle can widen safely through the tested 12× setting. This avoids the selection-outline problem of oversized freehand marker strokes, but it does not remove the firmware's maximum rendered geometry width. Other freehand pens (pressure pen, technical pen) are unaffected and can still be resized normally.

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Build

```bash
npm ci
npm run typecheck
npm test -- --runInBand
npm run lint -- --max-warnings=0
npm run build
npm run validate:package -- --native
```

The plugin file will be generated at `build/outputs/Restyle.snplg`.

## Inspiration

Shape replacement follows [Charles Cheval’s Snap](https://github.com/CharlesCheval/supernote-snap) and the fills follow his [Palette](https://github.com/CharlesCheval/supernote-palette). Both are MIT licensed. Some of their code is copied unchanged into `src/vendor/`; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Credits

Restyle uses a custom cursive **R** icon designed for clear identification in the compact lasso toolbar.

## License

[MIT](LICENSE)
