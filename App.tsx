import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {getLastButtonEvent, installPluginRouter, subscribeToButtonEvents} from './src/pluginRouter';
import RestylePanel from './src/RestylePanel';
import {applyRestyle, getLassoInfo} from './src/restyleOps';
import type {AppScreen, LassoInfo, RestyleOptions} from './src/types';
// import type {ElementSnapshot} from './src/types';  // reserved for Undo

installPluginRouter();

export default function App() {
  const [screen, setScreen] = useState<AppScreen>({kind: 'detecting'});
  const [busy, setBusy] = useState(false);

  const runDetect = useCallback(async () => {
    setScreen({kind: 'detecting'});
    try {
      const info = await getLassoInfo();
      setScreen({kind: 'panel', info});
    } catch (e) {
      setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Could not read selection'});
    }
  }, []);

  useEffect(() => {
    const pending = getLastButtonEvent();
    if (pending) runDetect();

    const unsub = subscribeToButtonEvents(() => runDetect());

    const lifeSub = PluginManager.addPluginLifeListener({
      onStart() {},
      onStop() {
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
        await applyRestyle(info, options);
        PluginManager.closePluginView();
      } catch (e) {
        setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Apply failed'});
      } finally {
        setBusy(false);
      }
    },
    [screen, busy],
  );

  // const handleUndo = useCallback(async () => {
  //   if (screen.kind !== 'applied' || busy) return;
  //   const {snapshot, filePath, pageNum} = screen;
  //   setBusy(true);
  //   setScreen({kind: 'working', message: 'Undoing…'});
  //   try {
  //     await undoRestyle(filePath, pageNum, snapshot);
  //     PluginManager.closePluginView();
  //   } catch (e) {
  //     setScreen({kind: 'error', message: e instanceof Error ? e.message : 'Undo failed'});
  //   } finally {
  //     setBusy(false);
  //   }
  // }, [screen, busy]);

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

  if (screen.kind === 'panel') {
    return (
      <RestylePanel
        info={screen.info}
        onApply={handleApply}
        onCancel={handleCancel}
        busy={busy}
      />
    );
  }

  // if (screen.kind === 'applied') {
  //   return (
  //     <AppliedView
  //       snapshot={screen.snapshot}
  //       onUndo={handleUndo}
  //       onDone={handleCancel}
  //       busy={busy}
  //     />
  //   );
  // }

  return null;
}

// ── Applied confirmation view — reserved for Undo ─────────────────────────────
// function AppliedView({
//   snapshot,
//   onUndo,
//   onDone,
//   busy,
// }: {
//   snapshot: ElementSnapshot[];
//   onUndo: () => void;
//   onDone: () => void;
//   busy: boolean;
// }) {
//   const count = snapshot.length;
//   return (
//     <View style={styles.centered}>
//       <View style={styles.appliedCard}>
//         <Text style={styles.appliedTitle}>Changes applied</Text>
//         <Text style={styles.appliedSubtitle}>
//           {count} element{count !== 1 ? 's' : ''} restyled
//         </Text>
//         <View style={styles.actionRow}>
//           <TouchableOpacity style={styles.undoButton} onPress={onUndo} disabled={busy}>
//             <Text style={styles.undoText}>Undo</Text>
//           </TouchableOpacity>
//           <TouchableOpacity style={styles.doneButton} onPress={onDone} disabled={busy}>
//             <Text style={styles.doneText}>Done</Text>
//           </TouchableOpacity>
//         </View>
//       </View>
//     </View>
//   );
// }

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
  // appliedCard, appliedTitle, appliedSubtitle, undoButton, undoText, doneButton, doneText
  // — reserved for Undo/AppliedView when re-enabled
});
