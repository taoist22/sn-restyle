# Restyle device test matrix

Use this matrix for the v0.6.0-beta release candidate and future sizing regressions. Confirm SDK-width-to-millimetre calibration on real Nomad and Manta hardware whenever firmware behavior changes.

## Native-style pen sizing

- On both Nomad and Manta, draw native ink at 0.3, 1.0, 1.5, and 2.0 mm. Lasso each sample and confirm Restyle reports the matching number.
- Draw with a calligraphy-style pen at 1.0 mm. Apply 1.1, 1.2, 1.3, and 1.4 mm to separate copies and confirm every result is visually distinct.
- Close and reopen the note. Confirm all modified sizes persist and remain lassoable.
- Lasso strokes with different widths. Confirm Restyle identifies the mixed selection and starts from its average.
- Confirm Undo restores the exact original width and color.

## Wide Shape

- Create a straight-line geometry by holding at the end of the stroke, then confirm Wide Shape offers 2×, 4×, 8×, and 12×.
- Apply each multiplier to identical shapes and confirm the widths grow proportionally.
- Confirm 12× renders and persists as the maximum stable Wide Shape setting.
- Stretch a widened line with the native lasso. Confirm its length persists and its temporary preview thickness returns to the saved Wide Shape width after deselection.
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
- Confirm multi-element Apply follows save, reload, modify, reload without stale lasso content or duplicated elements. Single-shape styling uses the lasso path.

## Shapes, fill and axes

- On duplicate notes, test Auto and each button on rough strokes: line, rectangle, circle, arrow, axes, diamond, rounded box, parallelogram, triangle, elbow arrow. Repeat several times and close/reopen the plugin between runs.
- Auto must still return circles as circles and rectangles as rectangles, leave scribble as ink, and read an L as axes.
- Arrows drawn with a second pass over the tip, a pen-down hook, and in all four directions. Check thin and thick pens: the head must be solid with no stripes or white band.
- Fill (light gray, dark gray, white) on a new shape and on an existing circle or rectangle; narrow triangles included. No white band against the outline; white hides the ruled template lines; the outline stays crisp.
- Wide 2×–12× on a new shape, with and without fill.
- Axes: default zero ranges disable Apply; ranges such as x −3…5, y −2…4, step 1/2/5; arrowheads none, + ends, both ends; page-fit at the largest ranges; ticks clear of arrowheads.
- Elbow arrow with and without a drawn head, short leg first; native move and resize afterwards.
- Straight lines (inserted as `straightLine`) insert and persist.
- Lasso, move, then restyle a single shape; and lasso a moved selection of strokes (the guard should ask for a re-lasso).
- Failure paths: a stroke that is not recognized stays untouched with a message; a failed insertion restores the stroke. Nothing nearby (titles, links, other ink) changes.
- Tabs: opens on Shape for one stroke or one circle/rectangle, otherwise Style; Apply and Cancel stay visible on both.
- Record device model, firmware and SDK 0.1.65 with any failure. Do not push, tag or release until the user confirms the trial works.

## Local verification

Geometry fixtures and simulated SDK failure tests cover skipped insertion, durable-backup failure, partial deletion, restoration ordering, edited geometry, stale operations, changed page and UUID recreation. These tests cannot establish real firmware identity, rendering, cache or native undo behavior.

## 0.6.1-beta stroke-data retry

- Retest the three-stroke arrow that produced “Incomplete stroke data”.
- Verify the panel title shows Restyle 0.6.1-beta.
- If backup still fails, capture the field and item number in the error. No ink should be replaced.
- Check successful Arrow cleanup followed by Undo restores the original strokes.
- Check the Retry / Recovery button is a normal button, not stretched vertically.

## 0.6.2-beta recognition record compatibility

- Retest Arrow on the original device after the 0.6.1 recognPoints failure.
- Verify the panel title shows Restyle 0.6.2-beta.
- Check Apply then Undo restores the shaft and both original head strokes.
- Cleanup preserves recognition records using native lowercase x/y/flag keys; incomplete or invalid records must still stop before any replacement.

## 0.6.3-beta explicit Arrow fitting

- Confirm panel title 0.6.3-beta and explicitly choose Arrow.
- Retest the curved/retraced drawing that reached recognition but was rejected.
- Test separate curved head arms, one curved V head, and one continuous retraced arrow.
- Test Apply then Undo on a duplicate note.
- Auto retains its original strict confidence thresholds; explicit Arrow tolerates roughness but still rejects missing heads and unrelated extra strokes.

## 0.6.5-beta native readback

- Retest the Arrow that appeared correctly and was then rolled back in 0.6.4.
- Verify the panel shows 0.6.5-beta and Apply Arrow.
- Verify original ink is replaced, then Undo restores it.
- Creation readback compares visible paths with a 2-pixel tolerance rather than exact serialized payloads. Native pen metadata is retained as returned. Wrong location, missing head and wrong color remain rejection cases.

## 0.6.6-beta live page replacement and recovery

- Device reports against 0.6.5: circle disappeared after failed replacement; arrow remained visible but could not be lassoed or erased. Treat 0.6.5 cleanup as unsafe. These failures are not resolved on hardware yet.
- Install 0.6.6 over the existing plugin; preserve private recovery storage. Test only fresh duplicate notes.
- Verify Circle and a shaft + two separate head strokes in Arrow and Auto. Close the plugin, lasso/move and erase the output, then reopen the note and check persistence.
- Undo on the same page restores all original strokes. Repeat after plugin restart and with identical neighboring ink.
- Cleanup now uses live deletion/restoration, saves before file readback, allows reindexed UUIDs/numbers, and retains the previous recovery backup. Native inserted objects are not blanket-recycled after cleanup.
- Local mocks separate live and saved note state, refresh UUIDs on every read and renumber elements on deletion; verify partial-deletion rollback and three-stroke recovery. Hardware cache ownership, redraw, erasure and persistence remain device checks.
- The official insertion API requires live page display dimensions. Zoom/display-size mismatches stop cleanup or restoration before ink mutation.
- Existing 0.6.5 journals are accepted, but a journal erased by the old version cannot be recreated from screenshots.

## 0.6.7-beta axes and shape restyling

- On a fresh duplicate note, draw an L (top → origin → right) or two separate perpendicular strokes meeting at the origin. Lasso and choose Axes, then Apply Axes. Repeat with reversed stroke order/direction and Auto.
- Check two arrowheads and evenly spaced, thinner tick marks. Lasso the whole group and move it; erase/reopen and check persistence. Short axes may have no ticks if there is insufficient room before the arrowhead.
- Undo axes restores all original strokes and removes all generated pieces. Test with nearby unrelated ink and after a plugin restart.
- Re-lasso a cleaned circle, rectangle and arrow. Choose Keep drawing and change shade alone, width alone and both. Apply must not report a false failure when the host replaces its lasso selection.
- The single-shape path now follows Palette: preserve the lasso via showLassoAfterInsert and accept the documented native success boolean, rather than immediately re-reading a potentially stale lasso. Check native Undo and plugin Undo, then save/reopen and verify the style persisted.
- Select all axes pieces and restyle them together; this uses the existing title-safe multi-element path. Test nearby titles/links.
- New local tests cover Axes/Auto fitting, reversed/multi-stroke axes, partial axes insertion rollback, multi-output recovery with changing IDs, successful styling with unavailable lasso readback, native styling refusal and undo after UUID recreation. Hardware behavior remains unverified until these device checks pass.
