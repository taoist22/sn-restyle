import React, {useState} from 'react';
import {StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {
  THICKNESS_MIN,
  THICKNESS_SCALE,
  THICKNESS_STEP,
  PEN_COLOR_LABELS,
  type LassoInfo,
  type PenColor,
  type Preset,
  type RestyleOptions,
} from './types';

interface Props {
  info:           LassoInfo;
  presets:        (Preset | null)[];
  onApply:        (options: RestyleOptions) => void;
  onSavePreset:   (index: number, color: PenColor, thickness: number) => void;
  onClearPreset:  (index: number) => void;
  onCancel:       () => void;
  busy:           boolean;
}

const COLORS: PenColor[] = ['black', 'darkGray', 'lightGray', 'ghost'];

const COLOR_SWATCH: Record<PenColor, string> = {
  black:     '#000000',
  darkGray:  '#9D9D9D',
  lightGray: '#C9C9C9',
  ghost:     '#FFFFFF',
};

export default function RestylePanel({
  info, presets, onApply, onSavePreset, onClearPreset, onCancel, busy,
}: Props) {
  const [selectedColor, setSelectedColor]       = useState<PenColor | null>(null);
  const [thicknessText, setThicknessText]       = useState(
    (info.avgThickness / THICKNESS_SCALE).toFixed(1),
  );
  const [thicknessChanged, setThicknessChanged] = useState(false);
  const [activePreset, setActivePreset]         = useState<number | null>(null);

  const selectionLabel = [
    info.strokeCount   > 0 ? `${info.strokeCount} stroke${info.strokeCount !== 1 ? 's' : ''}`    : null,
    info.geometryCount > 0 ? `${info.geometryCount} shape${info.geometryCount !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(', ');

  function parseThickness(): number {
    const parsed = parseFloat(thicknessText);
    return isNaN(parsed) || parsed <= 0
      ? info.avgThickness
      : Math.max(THICKNESS_MIN, Math.round(parsed * THICKNESS_SCALE));
  }

  function handleColorPress(color: PenColor) {
    setSelectedColor(prev => (prev === color ? null : color));
    setActivePreset(null);
  }

  function handleThinner() {
    const next = Math.max(THICKNESS_MIN, parseThickness() - THICKNESS_STEP);
    setThicknessText((next / THICKNESS_SCALE).toFixed(1));
    setThicknessChanged(true);
    setActivePreset(null);
  }

  function handleThicker() {
    const next = parseThickness() + THICKNESS_STEP;
    setThicknessText((next / THICKNESS_SCALE).toFixed(1));
    setThicknessChanged(true);
    setActivePreset(null);
  }

  function handleThicknessChange(text: string) {
    setThicknessText(text);
    setThicknessChanged(true);
    setActivePreset(null);
  }

  function handleApplyPreset(index: number) {
    const preset = presets[index];
    if (!preset) return;
    setSelectedColor(preset.color);
    setThicknessText((preset.thickness / THICKNESS_SCALE).toFixed(1));
    setThicknessChanged(true);
    setActivePreset(index);
  }

  function handleApply() {
    onApply({
      color:     selectedColor,
      thickness: thicknessChanged ? parseThickness() : null,
    });
  }

  const canApply    = selectedColor !== null || thicknessChanged;
  const canSave     = selectedColor !== null;  // need at least a color to save a preset

  return (
    <View style={styles.container}>
      <View style={styles.card}>

        <Text style={styles.title}>Restyle</Text>
        <Text style={styles.subtitle}>{selectionLabel}</Text>

        {/* Presets */}
        <Text style={styles.sectionLabel}>Presets</Text>
        <View style={styles.presetsColumn}>
          {presets.map((preset, index) => {
            const isActive  = activePreset === index;
            const isEmpty   = preset === null;
            const isGhost   = preset?.color === 'ghost';

            return (
              <View key={index} style={styles.presetRow}>
                {/* Clear button */}
                <TouchableOpacity
                  style={[styles.presetSideButton, isEmpty && styles.presetSideButtonDisabled]}
                  onPress={() => { onClearPreset(index); if (activePreset === index) setActivePreset(null); }}
                  disabled={busy || isEmpty}>
                  <Text style={[styles.presetSideButtonText, isEmpty && styles.presetSideButtonTextDisabled]}>
                    −
                  </Text>
                </TouchableOpacity>

                {/* Slot */}
                <TouchableOpacity
                  style={[
                    styles.presetSlot,
                    isActive && styles.presetSlotActive,
                  ]}
                  onPress={() => handleApplyPreset(index)}
                  disabled={busy || isEmpty}>
                  {isEmpty ? (
                    <Text style={styles.presetEmpty}>—</Text>
                  ) : (
                    <View style={styles.presetContent}>
                      <View style={[
                        styles.presetSwatch,
                        {backgroundColor: COLOR_SWATCH[preset.color]},
                        isGhost && !isActive && styles.presetSwatchGhost,
                        isGhost &&  isActive && styles.presetSwatchGhostActive,
                      ]} />
                      <Text style={[styles.presetLabel, isActive && styles.presetLabelActive]}>
                        {PEN_COLOR_LABELS[preset.color]}
                      </Text>
                      <Text style={[styles.presetThickness, isActive && styles.presetLabelActive]}>
                        {(preset.thickness / THICKNESS_SCALE).toFixed(1)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Save button */}
                <TouchableOpacity
                  style={[styles.presetSideButton, !canSave && styles.presetSideButtonDisabled]}
                  onPress={() => { onSavePreset(index, selectedColor!, parseThickness()); setActivePreset(index); }}
                  disabled={busy || !canSave}>
                  <Text style={[styles.presetSideButtonText, !canSave && styles.presetSideButtonTextDisabled]}>
                    +
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Color row */}
        <Text style={styles.sectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {COLORS.map(color => {
            const isSelected = selectedColor === color;
            const isGhost    = color === 'ghost';
            return (
              <TouchableOpacity
                key={color}
                style={[styles.colorButton, isSelected && styles.colorButtonSelected]}
                onPress={() => handleColorPress(color)}
                disabled={busy}>
                <View
                  style={[
                    styles.swatch,
                    {backgroundColor: COLOR_SWATCH[color]},
                    isGhost && styles.swatchGhost,
                  ]}
                />
                <Text style={[styles.colorLabel, isSelected && styles.colorLabelSelected]}>
                  {PEN_COLOR_LABELS[color]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Thickness row */}
        <Text style={styles.sectionLabel}>Thickness</Text>
        <View style={styles.thicknessRow}>
          <TouchableOpacity style={styles.stepButton} onPress={handleThinner} disabled={busy}>
            <Text style={styles.stepButtonText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.thicknessInput, thicknessChanged && styles.thicknessInputChanged]}
            value={thicknessText}
            onChangeText={handleThicknessChange}
            keyboardType="decimal-pad"
            selectTextOnFocus
            editable={!busy}
          />
          <TouchableOpacity style={styles.stepButton} onPress={handleThicker} disabled={busy}>
            <Text style={styles.stepButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.applyButton, !canApply && styles.applyButtonDisabled]}
            onPress={handleApply}
            disabled={busy || !canApply}>
            <Text style={[styles.applyText, !canApply && styles.applyTextDisabled]}>Apply</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 28,
    minWidth: 360,
    maxWidth: 480,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    marginTop: -8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: -6,
  },

  // ── Presets ──
  presetsColumn: {
    gap: 8,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  presetSideButton: {
    width: 44,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  presetSideButtonDisabled: {
    borderColor: '#CCCCCC',
    backgroundColor: '#FFFFFF',
  },
  presetSideButtonText: {
    fontSize: 22,
    color: '#000000',
    lineHeight: 26,
  },
  presetSideButtonTextDisabled: {
    color: '#CCCCCC',
  },
  presetSlot: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
  },
  presetSlotActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  presetEmpty: {
    fontSize: 16,
    color: '#CCCCCC',
  },
  presetContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  presetSwatch: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#AAAAAA',
  },
  presetSwatchGhost: {
    borderWidth: 1.5,
    borderColor: '#AAAAAA',
    borderStyle: 'dashed',
  },
  presetSwatchGhostActive: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  presetLabel: {
    fontSize: 14,
    color: '#000000',
    flex: 1,
  },
  presetThickness: {
    fontSize: 14,
    color: '#555555',
    fontWeight: '600',
  },
  presetLabelActive: {
    color: '#FFFFFF',
  },

  // ── Color row ──
  colorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colorButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  colorButtonSelected: {
    borderColor: '#000000',
    borderWidth: 2,
    backgroundColor: '#F0F0F0',
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#AAAAAA',
  },
  swatchGhost: {
    borderWidth: 1.5,
    borderColor: '#AAAAAA',
    borderStyle: 'dashed',
  },
  colorLabel: {
    fontSize: 11,
    color: '#555555',
    textAlign: 'center',
  },
  colorLabelSelected: {
    color: '#000000',
    fontWeight: '600',
  },

  // ── Thickness row ──
  thicknessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stepButton: {
    width: 48,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#000000',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  stepButtonText: {
    fontSize: 22,
    color: '#000000',
    lineHeight: 26,
  },
  thicknessInput: {
    width: 80,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    backgroundColor: '#FFFFFF',
  },
  thicknessInputChanged: {
    borderColor: '#000000',
    backgroundColor: '#F0F0F0',
  },

  // ── Action row ──
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
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
  cancelText: {
    fontSize: 16,
    color: '#000000',
  },
  applyButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  applyButtonDisabled: {
    backgroundColor: '#CCCCCC',
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
  },
  applyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  applyTextDisabled: {
    color: '#888888',
  },
});
