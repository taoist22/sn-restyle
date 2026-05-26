# Restyle for Supernote



https://github.com/user-attachments/assets/4d5eb459-90ec-4f26-a141-27716d34038a



**Restyle** is a plugin for the Supernote Nomad and Manta that lets you change the ink color and stroke thickness of handwriting you have already written. Lasso any strokes on the page, tap the Restyle button, pick a color and thickness, and apply — the selected strokes are updated in place with no repositioning.

> **Pre-release:** This plugin requires the Supernote beta firmware and is not yet intended for general use.

## Features

- **Four ink colors** — Black, Dark Gray, Light Gray, and Ghost (white / invisible on white paper)
- **Thickness adjustment** — step up or down in 0.1 increments, or type a value directly
- **Lasso any strokes** — works on freehand handwriting anywhere on the page
- **Non-destructive** — strokes stay exactly where they are; only color and thickness change
- **Works on Nomad and Manta**

## Installation

1. Download `Restyle.snplg` from the [latest release](https://github.com/taoist22/sn-restyle/releases).
2. Connect your Supernote to your computer using the Supernote Partner app or Browse & Access.
3. Copy `Restyle.snplg` into the `MyStyle` folder on your device.
4. On your Supernote, open a note, tap the **plugin icon** in the toolbar, go to **Manage Plugins**, tap **Add Plugin**, and select `Restyle`.

## Usage

1. Open a note and lasso the strokes you want to restyle.
2. Tap the **Restyle** button in the lasso toolbar.
3. The plugin reads your selection and shows the Restyle panel.
4. Tap a color swatch to change ink color, and use the **−** / **+** buttons (or type directly) to adjust thickness.
5. Tap **Apply** — the selected strokes are updated and the page reloads.

> **Tip:** You can change color only, thickness only, or both at once. The thickness display shows the current average thickness of your selected strokes as a starting point.

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
