# Restyle device test matrix

This test build intentionally keeps the existing plugin version. Do not publish it until the SDK-width-to-millimetre calibration is confirmed on real hardware.

## Native-style pen sizing

- On both Nomad and Manta, draw native ink at 0.3, 1.0, 1.5, and 2.0 mm. Lasso each sample and confirm Restyle reports the matching number.
- Draw with a calligraphy-style pen at 1.0 mm. Apply 1.1, 1.2, 1.3, and 1.4 mm to separate copies and confirm every result is visually distinct.
- Close and reopen the note. Confirm all modified sizes persist and remain lassoable.
- Select a native pen width, tap **Use current pen**, apply it, and confirm the result matches native ink at that setting.
- Lasso strokes with different widths. Confirm Restyle identifies the mixed selection and starts from its average.
- Confirm Undo restores the exact original width and color.

## Wide Shape

- Create a straight-line geometry by holding at the end of the stroke, then confirm Wide Shape offers 2×, 4×, 8×, and 12×.
- Apply each multiplier to identical shapes and confirm the widths grow proportionally.
- Confirm the active readout says **Wide N×**, never a millimetre value.
- Confirm Wide Shape is absent for freehand-only and mixed stroke/shape selections.
- Save and apply a Wide Shape preset. Confirm it is disabled for incompatible selections.
- Confirm all widened shapes remain lassoable after saving and reopening the note.

## Regression and safety

- Change only color, only size, and both together on handwriting and geometry.
- Confirm marker selections expose color only and remain lassoable.
- Test notes containing titles and links; confirm unrelated elements remain unchanged.
- Reopen Restyle repeatedly on the same page to exercise cached element retrieval.
- Open a note created on the other Supernote model and confirm Restyle blocks modification with the Different Device notice.
- Confirm Apply follows save, reload, modify, reload without stale lasso content or duplicated elements.
