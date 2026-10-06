import {applySnapCleanup} from './src/snapCleanup';
import {hasFill} from './src/fillShapes';
import {insertFill, planFill} from './src/fillOps';
import {captureOperation, invalidateOperations, runExclusive} from './src/operationSession';
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {getLastButtonEvent, installPluginRouter, subscribeToButtonEvents} from './src/pluginRouter';
import RestylePanel from './src/RestylePanel';
import {applyRestyle, getLassoInfo, undoRestyle, StyleRecoveryError} from './src/restyleOps';
import {loadPresets, savePresets} from './src/storage';
import {ensureFileReadPermission, ensureFileWritePermission} from './src/pluginPermissions';
import type {AppScreen, ElementSnapshot, LassoInfo, Preset, RestyleOptions} from './src/types';

installPluginRouter();

// Module-level undo state — persists across plugin close/reopen within the same PluginHost session.
// Cleared on undo, on "new restyle", or on plugin lifecycle stop.
let pendingSnapshot: ElementSnapshot[] | null = null;
let pendingSnapshotContext: {filePath: string; pageNum: number} | null = null;

function selectionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Cannot read lasso elements' || message === 'No strokes or geometry in selection') {
    return 'Lasso a handwriting stroke or shape first, then open Restyle again.';
  }
  return message || 'Could not read the current selection.';
}

export default function App() {
  const [screen, setScreen]   = useState<AppScreen>({kind: 'detecting'});
  const [busy, setBusy]       = useState(false);
  const [presets, setPresets] = useState<(Preset | null)[]>([null, null, null, null]);

  const runDetect = useCallback(async () => {
    invalidateOperations();
    const live = captureOperation();
    // If a snapshot is pending, verify it belongs to the current note before showing undo.
    // The PluginHost JS context survives note switches, so onStop may not fire between notes.
    if (pendingSnapshot && pendingSnapshotContext) {
      const pathRes = (await PluginCommAPI.getCurrentFilePath()) as {success: boolean; result?: string} | null;
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
      if (!await ensureFileReadPermission()) {
        throw new Error('File read permission is required. Reopen Restyle and allow access when prompted.');
      }
      const info = await getLassoInfo();
      live();
      setScreen({kind: 'panel', info});
    } catch (e) {
      setScreen({kind: 'error', message: selectionErrorMessage(e)});
    }
  }, []);

  useEffect(() => {
    loadPresets().then(setPresets);

    const pending = getLastButtonEvent();
    if (pending) {runDetect();}

    const unsub = subscribeToButtonEvents(() => runDetect());

    const lifeSub = PluginManager.registerPluginLifeListener({
      onMsg(message: unknown) {
        const state = typeof message === 'number'
          ? message
          : message && typeof message === 'object' && typeof (message as {state?: unknown}).state === 'number'
            ? (message as {state: number}).state
            : null;
        if (state === 2) {
          loadPresets().then(setPresets);
        } else if (state === 3 || state === 4 || state === 5) {
          invalidateOperations();
          pendingSnapshot = null;
          pendingSnapshotContext = null;
          setScreen({kind: 'detecting'});
          setBusy(false);
        }
      },
    });

    return () => {
      unsub();
      lifeSub.remove();
    };
  }, [runDetect]);

  const handleApply = useCallback(
    async (options: RestyleOptions) => {
      if (screen.kind !== 'panel' || busy) {return;}
      const info: LassoInfo = screen.info;
      const live = captureOperation();
      setBusy(true);
      setScreen({kind: 'working', message: 'Applying…'});
      try {
        if (!await ensureFileWritePermission()) {
          throw new Error('File write permission is required. Reopen Restyle and allow access when prompted.');
        }
        if (options.shape && options.shape !== 'keep') {
          // Snap's flow: one stroke, no staleness guard mid-operation, no journal.
          await runExclusive(() => applySnapCleanup(info, options));
          pendingSnapshot = null; pendingSnapshotContext = null;
          PluginManager.closePluginView();
          return;
        }
        await runExclusive(async () => {
          // Fill is planned before any restyle (it needs the shape as it is now) and inserted after it.
          const fill = hasFill(options) ? await planFill(info, options) : null;
          const snapshot = options.color === null && options.thickness === null ? [] : await applyRestyle(info, options, live);
          if (fill) {await insertFill(fill);}
          if (snapshot.length > 0) {
          // Store snapshot so user can undo on next open
          pendingSnapshot = snapshot;
          pendingSnapshotContext = {filePath: info.filePath, pageNum: info.pageNum};
          }
        });
        live();
        PluginManager.closePluginView();
      } catch (e) {
        if (e instanceof StyleRecoveryError) {pendingSnapshot = e.snapshots; pendingSnapshotContext = {filePath: info.filePath, pageNum: info.pageNum};}
        setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Apply failed'});
      } finally {
        setBusy(false);
      }
    },
    [screen, busy],
  );

  const handleUndo = useCallback(async () => {
    if (screen.kind !== 'undo' || busy) {return;}
    const live = captureOperation();
    setBusy(true);
    setScreen({kind: 'working', message: 'Undoing…'});
    try {
      if (!await ensureFileWritePermission() || !await ensureFileReadPermission()) {throw new Error('File access is required for undo.');}
      await runExclusive(() => undoRestyle(screen.filePath, screen.pageNum, screen.snapshot, live));
      live();
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
    if (busy) {return;}
    invalidateOperations();
    const live = captureOperation();
    pendingSnapshot = null;
    pendingSnapshotContext = null;
    setScreen({kind: 'detecting'});
    try {
      if (!await ensureFileReadPermission()) {
        throw new Error('File read permission is required. Reopen Restyle and allow access when prompted.');
      }
      const info = await getLassoInfo();
      live();
      setScreen({kind: 'panel', info});
    } catch (e) {
      setScreen({kind: 'error', message: selectionErrorMessage(e)});
    }
  }, [busy]);

  const handleSavePreset = useCallback(
    (index: number, preset: Preset) => {
      const updated = presets.map((p, i) => i === index ? preset : p);
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
    invalidateOperations();
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
          <TouchableOpacity style={[styles.undoButton, styles.retryButton]} onPress={runDetect} disabled={busy}>
            <Text style={styles.undoText}>Retry / Recovery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={busy}>
            <Text style={styles.cancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen.kind === 'undo') {
    const count = screen.snapshot.length;
    return (
      <View style={styles.centered}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Last Restyle operation</Text>
          <Text style={styles.infoSubtitle}>
            {count} element{count !== 1 ? 's' : ''} changed
          </Text>
          <Text style={styles.infoHint}>Undo last operation, regardless of the current selection. Available this session.</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.undoButton} onPress={handleUndo} disabled={busy}>
              <Text style={styles.undoText}>Undo last</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleNewRestyle} disabled={busy}>
              <Text style={styles.applyText}>New Restyle</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={busy}>
            <Text style={styles.cancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (screen.kind === 'panel') {
    // Cross-device notes (created on a different Supernote model) corrupt stroke
    // positions under modifyElements — disable rather than silently move strokes.
    if (screen.info.crossDevice) {
      return (
        <View style={styles.centered}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Different Device</Text>
            <Text style={styles.infoSubtitle}>
              This note was created on a different Supernote model.
            </Text>
            <Text style={styles.infoHint}>
              Restyling is disabled here to avoid moving your strokes. Open the
              note on the device it was created on to restyle it.
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
  retryButton: {flex: 0, paddingHorizontal: 24},
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
