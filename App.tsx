import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {getLastButtonEvent, installPluginRouter, subscribeToButtonEvents} from './src/pluginRouter';
import RestylePanel from './src/RestylePanel';
import {applyRestyle, getLassoInfo, undoRestyle} from './src/restyleOps';
import {loadPresets, savePresets} from './src/storage';
import type {AppScreen, ElementSnapshot, LassoInfo, PenColor, Preset, RestyleOptions} from './src/types';

installPluginRouter();

// Module-level undo state — persists across plugin close/reopen within the same PluginHost session.
// Cleared on undo, on "new restyle", or on plugin lifecycle stop.
let pendingSnapshot: ElementSnapshot[] | null = null;
let pendingSnapshotContext: {filePath: string; pageNum: number} | null = null;

export default function App() {
  const [screen, setScreen]   = useState<AppScreen>({kind: 'detecting'});
  const [busy, setBusy]       = useState(false);
  const [presets, setPresets] = useState<(Preset | null)[]>([null, null, null, null]);

  const runDetect = useCallback(async () => {
    // If a snapshot is pending, verify it belongs to the current note before showing undo.
    // The PluginHost JS context survives note switches, so onStop may not fire between notes.
    if (pendingSnapshot && pendingSnapshotContext) {
      const pathRes = (await (PluginCommAPI as any).getCurrentFilePath()) as {success: boolean; result?: string} | null;
      const currentPath = pathRes?.result;
      if (!currentPath || currentPath !== pendingSnapshotContext.filePath) {
        pendingSnapshot = null;
        pendingSnapshotContext = null;
      }
    }
    if (pendingSnapshot && pendingSnapshotContext) {
      setScreen({kind: 'undo', snapshot: pendingSnapshot, ...pendingSnapshotContext});
      return;
    }
    setScreen({kind: 'detecting'});
    try {
      const info = await getLassoInfo();
      setScreen({kind: 'panel', info});
    } catch (e) {
      setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Could not read selection'});
    }
  }, []);

  useEffect(() => {
    loadPresets().then(setPresets);

    const pending = getLastButtonEvent();
    if (pending) runDetect();

    const unsub = subscribeToButtonEvents(() => runDetect());

    const lifeSub = PluginManager.addPluginLifeListener({
      onStart() {
        loadPresets().then(setPresets);
      },
      onStop() {
        // Clear undo state when plugin is fully closed — keeps things clean
        pendingSnapshot = null;
        pendingSnapshotContext = null;
        setScreen({kind: 'detecting'});
        setBusy(false);
      },
    });

    return () => {
      unsub();
      lifeSub.remove();
    };
  }, [runDetect]);

  const handleApply = useCallback(
    async (options: RestyleOptions) => {
      if (screen.kind !== 'panel' || busy) return;
      const info: LassoInfo = screen.info;
      setBusy(true);
      setScreen({kind: 'working', message: 'Applying…'});
      try {
        const snapshot = await applyRestyle(info, options);
        if (snapshot.length > 0) {
          // Store snapshot so user can undo on next open
          pendingSnapshot = snapshot;
          pendingSnapshotContext = {filePath: info.filePath, pageNum: info.pageNum};
        }
        PluginManager.closePluginView();
      } catch (e) {
        setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Apply failed'});
      } finally {
        setBusy(false);
      }
    },
    [screen, busy],
  );

  const handleUndo = useCallback(async () => {
    if (screen.kind !== 'undo' || busy) return;
    const {snapshot, filePath, pageNum} = screen;
    setBusy(true);
    setScreen({kind: 'working', message: 'Undoing…'});
    try {
      await undoRestyle(filePath, pageNum, snapshot);
      pendingSnapshot = null;
      pendingSnapshotContext = null;
      PluginManager.closePluginView();
    } catch (e) {
      setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Undo failed'});
    } finally {
      setBusy(false);
    }
  }, [screen, busy]);

  const handleNewRestyle = useCallback(async () => {
    // Discard pending snapshot and run a fresh detect on the current lasso selection
    pendingSnapshot = null;
    pendingSnapshotContext = null;
    setScreen({kind: 'detecting'});
    try {
      const info = await getLassoInfo();
      setScreen({kind: 'panel', info});
    } catch (e) {
      setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Could not read selection'});
    }
  }, []);

  const handleSavePreset = useCallback(
    (index: number, color: PenColor, thickness: number) => {
      const updated = presets.map((p, i) => i === index ? {color, thickness} : p);
      setPresets(updated);
      savePresets(updated);
    },
    [presets],
  );

  const handleClearPreset = useCallback(
    (index: number) => {
      const updated = presets.map((p, i) => i === index ? null : p);
      setPresets(updated);
      savePresets(updated);
    },
    [presets],
  );

  const handleCancel = useCallback(() => {
    PluginManager.closePluginView();
  }, []);

  // ── Render ──

  if (screen.kind === 'detecting') {
    return (
      <View style={styles.centered}>
        <View style={styles.busyCard}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.busyText}>Reading selection…</Text>
        </View>
      </View>
    );
  }

  if (screen.kind === 'working') {
    return (
      <View style={styles.centered}>
        <View style={styles.busyCard}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.busyText}>{screen.message}</Text>
        </View>
      </View>
    );
  }

  if (screen.kind === 'error') {
    return (
      <View style={styles.centered}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not process selection</Text>
          <Text style={styles.errorMessage}>{screen.message}</Text>
        </View>
      </View>
    );
  }

  if (screen.kind === 'undo') {
    const count = screen.snapshot.length;
    return (
      <View style={styles.centered}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Restyle applied</Text>
          <Text style={styles.infoSubtitle}>
            {count} element{count !== 1 ? 's' : ''} changed
          </Text>
          <Text style={styles.infoHint}>Undo is only available this session.</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.undoButton} onPress={handleUndo} disabled={busy}>
              <Text style={styles.undoText}>Undo last</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleNewRestyle} disabled={busy}>
              <Text style={styles.applyText}>New Restyle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (screen.kind === 'panel') {
    // H-element notes: plugin disabled to prevent known position corruption
    if (screen.info.hasHElements) {
      return (
        <View style={styles.centered}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Plugin Disabled</Text>
            <Text style={styles.infoSubtitle}>
              This note contains H (title) elements.
            </Text>
            <Text style={styles.infoHint}>
              Restyling is disabled on notes with H elements to prevent element
              positioning errors. Remove H elements or use a note without them.
            </Text>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <RestylePanel
        info={screen.info}
        presets={presets}
        onApply={handleApply}
        onSavePreset={handleSavePreset}
        onClearPreset={handleClearPreset}
        onCancel={handleCancel}
        busy={busy}
      />
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  busyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 240,
  },
  busyText: {fontSize: 16, color: '#555555'},
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 28,
    alignItems: 'center',
    gap: 10,
    maxWidth: 380,
  },
  errorTitle:   {fontSize: 17, fontWeight: '700', color: '#CC0000'},
  errorMessage: {fontSize: 15, color: '#555555', textAlign: 'center'},
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 28,
    alignItems: 'center',
    gap: 12,
    maxWidth: 400,
    minWidth: 300,
  },
  infoTitle:    {fontSize: 18, fontWeight: '700', color: '#000000'},
  infoSubtitle: {fontSize: 15, color: '#333333', textAlign: 'center'},
  infoHint:     {fontSize: 13, color: '#888888', textAlign: 'center'},
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  undoButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#000000',
    alignItems: 'center',
  },
  undoText: {fontSize: 16, fontWeight: '600', color: '#000000'},
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  applyText: {fontSize: 16, fontWeight: '600', color: '#FFFFFF'},
  cancelButton: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#000000',
    alignItems: 'center',
  },
  cancelText: {fontSize: 16, fontWeight: '600', color: '#000000'},
});
