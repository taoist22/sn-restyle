import React, {useState} from 'react';
import {StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {
  THICKNESS_MIN,
  THICKNESS_SCALE,
  THICKNESS_STEP,
  PEN_COLOR_LABELS,
  type LassoInfo,
  type PenColor,
  type RestyleOptions,
} from './types';

interface Props {
  info: LassoInfo;
  onApply: (options: RestyleOptions) => void;
  onCancel: () => void;
  busy: boolean;
}

const COLORS: PenColor[] = ['black', 'darkGray', 'lightGray', 'ghost'];

const COLOR_SWATCH: Record<PenColor, string> = {
  black:     '#000000',
  darkGray:  '#9D9D9D',
  lightGray: '#C9C9C9',
  ghost:     '#FFFFFF',
};

export default function RestylePanel({info, onApply, onCancel, busy}: Props) {
  const [selectedColor, setSelectedColor] = useState<PenColor | null>(null);
  const [thicknessText, setThicknessText] = useState(
    (info.avgThickness / THICKNESS_SCALE).toFixed(1),
  );
  const [thicknessChanged, setThicknessChanged] = useState(false);

  const selectionLabel = [
    info.strokeCount   > 0 ? `${info.strokeCount} stroke${info.strokeCount !== 1 ? 's' : ''}`     : null,
    info.geometryCount > 0 ? `${info.geometryCount} shape${info.geometryCount !== 1 ? 's' : ''}`  : null,
  ].filter(Boolean).join(', ');

  function parseThickness(): number {
    const parsed = parseFloat(thicknessText);
    return isNaN(parsed) || parsed <= 0
      ? info.avgThickness
      : Math.max(THICKNESS_MIN, Math.round(parsed * THICKNESS_SCALE));
  }

  function handleColorPress(color: PenColor) {
    setSelectedColor(prev => (prev === color ? null : color));
  }

  function handleThinner() {
    const next = Math.max(THICKNESS_MIN, parseThickness() - THICKNESS_STEP);
    setThicknessText((next / THICKNESS_SCALE).toFixed(1));
    setThicknessChanged(true);
  }

  function handleThicker() {
    const next = parseThickness() + THICKNESS_STEP;
    setThicknessText((next / THICKNESS_SCALE).toFixed(1));
    setThicknessChanged(true);
  }

  function handleThicknessChange(text: string) {
    setThicknessText(text);
    setThicknessChanged(true);
  }

  function handleApply() {
    onApply({
      color:     selectedColor,
      thickness: thicknessChanged ? parseThickness() : null,
    });
  }

  const canApply = selectedColor !== null || thicknessChanged;

  return (
    <View style={styles.container}>
      <View style={styles.card}>

        <Text style={styles.title}>Restyle</Text>
        <Text style={styles.subtitle}>{selectionLabel}</Text>

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
    justifyContent: 'center',
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
