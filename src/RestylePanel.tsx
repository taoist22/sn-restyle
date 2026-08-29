import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {
  FINE_STEP_MM,
  NATIVE_PEN_SIZES_MM,
  WIDE_SHAPE_MULTIPLIERS,
  formatPenSize,
  millimetresToSdkWidth,
  sdkWidthToMillimetres,
  stepPenMillimetres,
  wideShapeWidth,
} from './sizing';
import {
  PEN_COLOR_LABELS,
  type LassoInfo,
  type PenColor,
  type Preset,
  type RestyleOptions,
  type SizeMode,
} from './types';

interface Props {
  info: LassoInfo;
  presets: (Preset | null)[];
  onApply: (options: RestyleOptions) => void;
  onSavePreset: (index: number, preset: Preset) => void;
  onClearPreset: (index: number) => void;
  onCancel: () => void;
  busy: boolean;
}

const COLORS: PenColor[] = ['black', 'darkGray', 'lightGray', 'ghost'];
const COLOR_SWATCH: Record<PenColor, string> = {
  black: '#000000',
  darkGray: '#9D9D9D',
  lightGray: '#C9C9C9',
  ghost: '#FFFFFF',
};

function presetSizeLabel(preset: Preset): string {
  if (preset.sizeMode === 'wideShape') {
    return preset.wideMultiplier ? `Wide ${preset.wideMultiplier}×` : 'Wide custom';
  }
  return formatPenSize(preset.thickness);
}

export default function RestylePanel({
  info,
  presets,
  onApply,
  onSavePreset,
  onClearPreset,
  onCancel,
  busy,
}: Props) {
  const [selectedColor, setSelectedColor] = useState<PenColor | null>(null);
  const [selectedThickness, setSelectedThickness] = useState(info.avgThickness);
  const [thicknessChanged, setThicknessChanged] = useState(false);
  const [sizeMode, setSizeMode] = useState<SizeMode>('pen');
  const [wideMultiplier, setWideMultiplier] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);

  const geometryOnly = info.strokeCount === 0 && info.geometryCount > 0;
  const selectedMillimetres = sdkWidthToMillimetres(
    sizeMode === 'pen' ? selectedThickness : info.avgThickness,
  );
  const selectionLabel = [
    info.strokeCount > 0
      ? `${info.strokeCount} stroke${info.strokeCount !== 1 ? 's' : ''}`
      : null,
    info.geometryCount > 0
      ? `${info.geometryCount} shape${info.geometryCount !== 1 ? 's' : ''}`
      : null,
  ].filter(Boolean).join(', ');

  function selectPenWidth(width: number) {
    setSelectedThickness(width);
    setThicknessChanged(true);
    setSizeMode('pen');
    setWideMultiplier(null);
    setActivePreset(null);
  }

  function handleStep(direction: -1 | 1) {
    const next = stepPenMillimetres(selectedMillimetres, direction);
    selectPenWidth(millimetresToSdkWidth(next));
  }

  function handleWideShape(multiplier: number) {
    setSelectedThickness(wideShapeWidth(info.avgGeometryWidth, multiplier));
    setThicknessChanged(true);
    setSizeMode('wideShape');
    setWideMultiplier(multiplier);
    setActivePreset(null);
  }

  function handleApplyPreset(index: number) {
    const preset = presets[index];
    if (!preset || (preset.sizeMode === 'wideShape' && !geometryOnly)) {return;}
    setSelectedColor(preset.color);
    if (!info.hasMarkerStroke) {
      setSelectedThickness(preset.thickness);
      setThicknessChanged(true);
      setSizeMode(preset.sizeMode ?? 'pen');
      setWideMultiplier(preset.wideMultiplier ?? null);
    }
    setActivePreset(index);
  }

  const canApply = selectedColor !== null || thicknessChanged;
  const canSave = selectedColor !== null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.title}>Restyle</Text>
        <Text allowFontScaling={false} style={styles.subtitle}>{selectionLabel}</Text>

        <Text allowFontScaling={false} style={styles.sectionLabel}>Presets</Text>
        <View style={styles.presetsColumn}>
          {presets.map((preset, index) => {
            const isActive = activePreset === index;
            const isEmpty = preset === null;
            const isGhost = preset?.color === 'ghost';
            const incompatibleWide = preset?.sizeMode === 'wideShape' && !geometryOnly;
            return (
              <View key={index} style={styles.presetRow}>
                <TouchableOpacity
                  style={[styles.presetSideButton, isEmpty && styles.disabledBorder]}
                  onPress={() => {
                    onClearPreset(index);
                    if (activePreset === index) {setActivePreset(null);}
                  }}
                  disabled={busy || isEmpty}>
                  <Text allowFontScaling={false} style={[styles.presetSideText, isEmpty && styles.disabledText]}>−</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.presetSlot,
                    isActive && styles.presetSlotActive,
                    incompatibleWide && styles.presetSlotDisabled,
                  ]}
                  onPress={() => handleApplyPreset(index)}
                  disabled={busy || isEmpty || incompatibleWide}>
                  {isEmpty ? (
                    <Text allowFontScaling={false} style={styles.disabledText}>—</Text>
                  ) : (
                    <View style={styles.presetContent}>
                      <View style={[
                        styles.presetSwatch,
                        {backgroundColor: COLOR_SWATCH[preset.color]},
                        isGhost && styles.ghostSwatch,
                        isGhost && isActive && styles.ghostSwatchActive,
                      ]} />
                      <Text allowFontScaling={false} style={[styles.presetLabel, isActive && styles.activeText]}>
                        {PEN_COLOR_LABELS[preset.color]}
                      </Text>
                      <Text allowFontScaling={false} style={[styles.presetSize, isActive && styles.activeText]}>
                        {presetSizeLabel(preset)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.presetSideButton, !canSave && styles.disabledBorder]}
                  onPress={() => {
                    onSavePreset(index, {
                      color: selectedColor!,
                      thickness: selectedThickness,
                      sizeMode,
                      wideMultiplier: wideMultiplier ?? undefined,
                    });
                    setActivePreset(index);
                  }}
                  disabled={busy || !canSave}>
                  <Text allowFontScaling={false} style={[styles.presetSideText, !canSave && styles.disabledText]}>+</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <Text allowFontScaling={false} style={styles.sectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {COLORS.map(color => {
            const isSelected = selectedColor === color;
            return (
              <TouchableOpacity
                key={color}
                style={[styles.colorButton, isSelected && styles.colorButtonSelected]}
                onPress={() => {
                  setSelectedColor(previous => previous === color ? null : color);
                  setActivePreset(null);
                }}
                disabled={busy}>
                <View style={[
                  styles.swatch,
                  {backgroundColor: COLOR_SWATCH[color]},
                  color === 'ghost' && styles.ghostSwatch,
                ]} />
                <Text allowFontScaling={false} style={[styles.colorLabel, isSelected && styles.selectedText]}>
                  {PEN_COLOR_LABELS[color]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!info.hasMarkerStroke && (
          <>
            <Text allowFontScaling={false} style={styles.sectionLabel}>Pen size</Text>
            <View style={styles.nativeSizeGrid}>
              {NATIVE_PEN_SIZES_MM.map(mm => {
                const width = millimetresToSdkWidth(mm);
                const isSelected = sizeMode === 'pen' && selectedThickness === width;
                return (
                  <TouchableOpacity
                    key={mm}
                    style={[styles.sizeChip, isSelected && styles.sizeChipSelected]}
                    onPress={() => selectPenWidth(width)}
                    disabled={busy}>
                    <Text allowFontScaling={false} style={[styles.sizeChipText, isSelected && styles.activeText]}>
                      {mm.toFixed(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text allowFontScaling={false} style={styles.sizeHint}>Native choices in millimetres</Text>

            <View style={styles.fineSizeRow}>
              <TouchableOpacity style={styles.stepButton} onPress={() => handleStep(-1)} disabled={busy}>
                <Text allowFontScaling={false} style={styles.stepButtonText}>−</Text>
              </TouchableOpacity>
              <View style={[styles.sizeReadout, thicknessChanged && styles.sizeReadoutChanged]}>
                <Text allowFontScaling={false} style={styles.sizeReadoutValue}>
                  {sizeMode === 'wideShape'
                    ? wideMultiplier
                      ? `Wide ${wideMultiplier}×`
                      : 'Wide custom'
                    : `${selectedMillimetres.toFixed(1)} mm`}
                </Text>
                <Text allowFontScaling={false} style={styles.sizeReadoutLabel}>
                  {sizeMode === 'wideShape'
                    ? 'Relative to selected shape · −/+ returns to pen size'
                    : `Fine adjustment · ${FINE_STEP_MM.toFixed(1)} mm`}
                </Text>
              </View>
              <TouchableOpacity style={styles.stepButton} onPress={() => handleStep(1)} disabled={busy}>
                <Text allowFontScaling={false} style={styles.stepButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {info.hasMixedThickness && !thicknessChanged && (
              <Text allowFontScaling={false} style={styles.mixedNote}>
                Selection contains mixed sizes. The readout starts at their average.
              </Text>
            )}

            {geometryOnly && (
              <View style={styles.wideSection}>
                <Text allowFontScaling={false} style={styles.wideTitle}>Wide Shape</Text>
                <Text allowFontScaling={false} style={styles.wideDescription}>
                  Geometry only. Multiply the selected shape’s saved width. 12× is the tested device maximum.
                </Text>
                <View style={styles.wideRow}>
                  {WIDE_SHAPE_MULTIPLIERS.map(multiplier => {
                    const isSelected = sizeMode === 'wideShape' && wideMultiplier === multiplier;
                    return (
                      <TouchableOpacity
                        key={multiplier}
                        style={[styles.wideButton, isSelected && styles.sizeChipSelected]}
                        onPress={() => handleWideShape(multiplier)}
                        disabled={busy}>
                        <Text allowFontScaling={false} style={[styles.wideButtonText, isSelected && styles.activeText]}>
                          {multiplier}×
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}

        {info.hasMarkerStroke && (
          <Text allowFontScaling={false} style={styles.markerNote}>
            Marker strokes can only be recolored. Geometry made with the marker remains independently resizable.
          </Text>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={busy}>
            <Text allowFontScaling={false} style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.applyButton, !canApply && styles.applyButtonDisabled]}
            onPress={() => onApply({
              color: selectedColor,
              thickness: thicknessChanged ? selectedThickness : null,
            })}
            disabled={busy || !canApply}>
            <Text allowFontScaling={false} style={[styles.applyText, !canApply && styles.applyTextDisabled]}>Apply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
    paddingBottom: 24,
    backgroundColor: 'transparent',
  },
  card: {
    width: '92%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 24,
    gap: 14,
  },
  title: {fontSize: 20, fontWeight: '700', color: '#000000', textAlign: 'center'},
  subtitle: {fontSize: 13, color: '#666666', textAlign: 'center', marginTop: -8},
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: -6,
  },
  presetsColumn: {gap: 8},
  presetRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  presetSideButton: {
    width: 42,
    height: 42,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  presetSideText: {fontSize: 22, color: '#000000', lineHeight: 26},
  presetSlot: {
    flex: 1,
    height: 42,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  presetSlotActive: {backgroundColor: '#000000', borderColor: '#000000'},
  presetSlotDisabled: {opacity: 0.45},
  presetContent: {flexDirection: 'row', alignItems: 'center', gap: 8},
  presetSwatch: {width: 18, height: 18, borderRadius: 3, borderWidth: 1, borderColor: '#AAAAAA'},
  presetLabel: {fontSize: 14, color: '#000000', flex: 1},
  presetSize: {fontSize: 13, color: '#555555', fontWeight: '600'},
  disabledBorder: {borderColor: '#CCCCCC'},
  disabledText: {color: '#CCCCCC'},
  activeText: {color: '#FFFFFF'},
  ghostSwatch: {borderWidth: 1.5, borderColor: '#AAAAAA', borderStyle: 'dashed'},
  ghostSwatchActive: {borderColor: '#FFFFFF'},
  colorRow: {flexDirection: 'row', gap: 8},
  colorButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 4,
    gap: 5,
    backgroundColor: '#FFFFFF',
  },
  colorButtonSelected: {borderColor: '#000000', borderWidth: 2, backgroundColor: '#F0F0F0'},
  swatch: {width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: '#AAAAAA'},
  colorLabel: {fontSize: 11, color: '#555555', textAlign: 'center'},
  selectedText: {color: '#000000', fontWeight: '600'},
  nativeSizeGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  sizeChip: {
    width: 66,
    height: 40,
    borderWidth: 1.5,
    borderColor: '#BBBBBB',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sizeChipSelected: {backgroundColor: '#000000', borderColor: '#000000'},
  sizeChipText: {fontSize: 14, fontWeight: '600', color: '#000000'},
  sizeHint: {fontSize: 11, color: '#777777', marginTop: -8},
  fineSizeRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12},
  stepButton: {
    width: 46,
    height: 46,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  stepButtonText: {fontSize: 22, color: '#000000', lineHeight: 26},
  sizeReadout: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sizeReadoutChanged: {borderColor: '#000000', backgroundColor: '#F0F0F0'},
  sizeReadoutValue: {fontSize: 18, fontWeight: '700', color: '#000000'},
  sizeReadoutLabel: {fontSize: 10, color: '#666666'},
  mixedNote: {fontSize: 12, color: '#555555', fontStyle: 'italic', textAlign: 'center'},
  wideSection: {
    borderWidth: 1.5,
    borderColor: '#777777',
    borderRadius: 10,
    padding: 12,
    gap: 9,
    backgroundColor: '#F7F7F7',
  },
  wideTitle: {fontSize: 14, fontWeight: '700', color: '#000000'},
  wideDescription: {fontSize: 11, color: '#555555', lineHeight: 15},
  wideRow: {flexDirection: 'row', gap: 8},
  wideButton: {
    flex: 1,
    height: 40,
    borderWidth: 1.5,
    borderColor: '#777777',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  wideButtonText: {fontSize: 14, fontWeight: '700', color: '#000000'},
  markerNote: {
    fontSize: 13,
    color: '#333333',
    fontStyle: 'italic',
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  actionRow: {flexDirection: 'row', gap: 12, marginTop: 4},
  cancelButton: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelText: {fontSize: 16, color: '#000000'},
  applyButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  applyButtonDisabled: {backgroundColor: '#CCCCCC', borderWidth: 1.5, borderColor: '#CCCCCC'},
  applyText: {fontSize: 16, fontWeight: '700', color: '#FFFFFF'},
  applyTextDisabled: {color: '#888888'},
});
