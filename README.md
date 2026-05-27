# Restyle for Supernote

**Restyle** is a plugin for the Supernote Nomad and Manta that lets you change the ink color and stroke thickness of handwriting and geometry shapes you have already written. Lasso any strokes or shapes on the page, tap the Restyle button, pick a color and thickness, and apply — the selected elements are updated in place with no repositioning.

> **Pre-release:** This plugin requires the Supernote beta firmware and is not yet intended for general use.

## Features

- **Four ink colors** — Black, Dark Gray, Light Gray, and Ghost (white / invisible on white paper)
- **Thickness adjustment** — step up or down in 0.1 increments, or type a value directly
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
5. Tap a color swatch to set the ink color, and use the **−** / **+** buttons (or type directly) to adjust thickness.
6. Tap **Apply** — the selected elements are updated and the page reloads.

> **Tip:** You can change color only, thickness only, or both at once. The thickness field shows the average thickness of your selected strokes as a starting point.

## Presets

Presets let you save up to four color + thickness combinations for quick access.

- **Apply a preset** — tap the preset slot. The color and thickness fields update to match.
- **Save a preset** — select a color (required), optionally adjust thickness, then tap **+** next to the slot you want to save into.
- **Clear a preset** — tap **−** next to the slot.

Presets are saved permanently and survive closing and reopening the app.

## Undo

After you apply a restyle, the next time you open the Restyle panel in the same session it will show the **Undo** screen instead of the restyle controls.

- Tap **Undo** to revert all changed elements back to their original color and thickness.
- Tap **New Restyle** to discard the undo history and restyle a new selection.

> **Important:** Undo is only available within the same session. If you close the note and reopen it, the undo option will no longer be available.

## Creating a Header Background

You can use Restyle to create a wide colored band that acts as a header background behind your text. This is a manual workflow — the plugin doesn't insert new elements, but it can transform any stroke into a thick wide band.

1. Using the marker pen, draw a single horizontal stroke across the area where you want the header background.
2. Lasso that stroke.
3. Open Restyle and choose the color you want for the background (Ghost gives an invisible-ink effect on white paper; Light Gray or Dark Gray give a visible band).
4. Set the thickness to **100 or higher** — this is what creates the wide band effect.
5. Tap **Apply**.
6. Write your header text anywhere on the page, then move it on top of the band.

> **Tip:** Save your preferred background color and thickness as a preset so you can apply this look in one tap next time.

## Limitations

### Notes with H (Title) Elements

If your note contains any **H elements** (outline/title markers, created by the Supernote title feature), the Restyle plugin will show a **Plugin Disabled** message and cannot be used on that note.

This restriction exists because the Supernote firmware renumbers note elements when a title is present, which can cause restyled strokes to move or disappear. Until this firmware behavior is resolved, Restyle is disabled on any note that contains H elements.

**Workaround:** Use a note that does not contain H elements. If you need to add a visual header to a note, see the header background technique above.

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Yarn

### Build

```bash
yarn install
./buildPlugin.sh
```

The plugin file will be generated at `build/outputs/Restyle.snplg`.

## Credits

Plugin icon by [Freepik](https://www.flaticon.com/free-icons/document) — Flaticon.

## License

[MIT](LICENSE)
