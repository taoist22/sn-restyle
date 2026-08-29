

https://github.com/user-attachments/assets/3e9c37d2-a545-4307-9edc-18d9fa34041b

# Restyle for Supernote

**Restyle** is a plugin for the Supernote Nomad and Manta that lets you change the ink color and stroke thickness of handwriting and geometry shapes you have already written. Lasso any strokes or shapes on the page, tap the Restyle button, pick a color and thickness, and apply — the selected elements are updated in place with no repositioning.

> **Pre-release:** This plugin requires the Supernote beta firmware and is not yet intended for general use.

## Features

- **Four ink colors** — Black, Dark Gray, Light Gray, and Ghost (white / invisible on white paper)
- **Familiar pen sizes** — choose the same millimetre labels used by Supernote's native size control
- **Fine size adjustment** — move in 0.1 mm steps, including useful in-between sizes such as 1.1, 1.2, 1.3, and 1.4 mm (not available for marker strokes — see Limitations)
- **Use current pen** — copy the active native pen width into Restyle before applying it to existing ink
- **Wide Shape** — enlarge straight-line and other geometry widths by a clear relative multiplier, separately from pen sizing
- **Works on strokes and geometry** — lasso freehand handwriting, drawn shapes, or a mix of both
- **Four user-defined presets** — save your favorite color + thickness combinations for one-tap access
- **In-session undo** — revert your last restyle without leaving the note
- **Non-destructive** — elements stay exactly where they are; only color and thickness change
- **Works on Nomad and Manta**

## Installation

1. Download `Restyle.snplg` from the [latest release](https://github.com/taoist22/sn-restyle/releases).
2. Connect your Supernote to your computer using the Supernote Partner app or Browse & Access.
3. Copy `Restyle.snplg` into the `MyStyle` folder on your device.
4. On your Supernote, open a note, tap the **plugin icon** in the toolbar, go to **Manage Plugins**, tap **Add Plugin**, and select `Restyle`.

## Usage

1. Open a note and lasso the strokes or shapes you want to restyle.
2. Tap the **Restyle** button in the lasso toolbar.
3. The plugin reads your selection and shows the Restyle panel.
4. *(Optional)* Tap a **preset slot** to instantly load a saved color + thickness.
5. Tap a color swatch to set the ink color. Choose a familiar native size, use **−** / **+** for 0.1 mm adjustments, or tap **Use current pen**.
6. Tap **Apply** — the selected elements are updated and the page reloads.

> **Tip:** You can change color only, size only, or both at once. If the selection contains several sizes, Restyle starts at their average and tells you that the selection is mixed.

## Presets

Presets let you save up to four color + thickness combinations for quick access.

- **Apply a preset** — tap the preset slot. The color and thickness fields update to match.
- **Save a preset** — select a color (required), optionally adjust thickness, then tap **+** next to the slot you want to save into.
- **Clear a preset** — tap **−** next to the slot.

Presets are saved permanently and survive closing and reopening the app.

## Undo

After you apply a restyle, the next time you open the Restyle panel in the same session it will show the **Undo** screen instead of the restyle controls.

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
3. In **Wide Shape**, choose **2×**, **4×**, **8×**, or **12×**. These are relative multipliers based on that shape's existing width, not millimetre pen sizes.
4. Optionally choose a color, then tap **Apply**.

This is useful for dividers, emphasis bars, and other broad geometry. A Wide Shape setting can be saved as a preset, but it remains available only for shape-only selections.

## Limitations

### Notes from a different Supernote model ("Different Device")

A note stores the page size of the device it was **created** on. If you open a note made on a different Supernote model (for example, a Nomad note opened on a Manta, or vice‑versa, after syncing), Restyle shows a **Different Device** notice and does nothing on that note.

This is deliberate: restyling relies on rewriting element data, and the page‑size mismatch between models would move your strokes out of place. Restyle that note on the device it was created on, where it works normally.

> Notes with **H (Title) elements** are now fully supported and restyle correctly — the earlier "Plugin Disabled on titled notes" restriction has been removed.

### Marker Strokes

Freehand marker strokes can only have their **color** changed in Restyle — the thickness control is disabled whenever the lasso contains a marker stroke.

This is intentional. The Supernote firmware caps the renderable width of a freehand marker stroke, and writing a thickness past that cap creates a mismatch between the visible stroke and the firmware's internal outline. When that happens the stroke becomes difficult or impossible to lasso again. The Supernote OS itself does not expose a thickness control for marker strokes for the same reason.

**Workaround:** If you need a wider marker-like band, **hold the pen at the end of the stroke** as you draw it. The Supernote converts the result to a straight-line shape, which Restyle can thicken without limits. Other freehand pens (pressure pen, technical pen) are unaffected and can still be thickened normally.

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

## Credits

Plugin icon by [Freepik](https://www.flaticon.com/free-icons/document) — Flaticon.

## License

[MIT](LICENSE)
