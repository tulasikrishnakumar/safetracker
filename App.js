/**
 * SafeTracker — Tracked Device App
 * ══════════════════════════════════
 * OFFLINE-CAPABLE: GPS is read regardless of internet status.
 * When offline  → locations are queued in AsyncStorage (local device storage).
 * When back online → queued locations are automatically uploaded to the server.
 *
 * Tech:
 *  - expo-location          → GPS / background location task
 *  - expo-task-manager      → run background task when app is closed
 *  - @react-native-async-storage/async-storage → offline queue
 *  - @react-native-community/netinfo → detect online/offline state
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Alert,
  Modal, ScrollView, StatusBar, Animated, Switch, AppState,
} from 'react-native';
import * as Location   from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage    from '@react-native-async-storage/async-storage';
import NetInfo         from '@react-native-community/netinfo';

// ─── CONFIGURATION ─────────────────────────────────────────────────────────────
const SERVER_URL        = 'https://safetracker-k5wy.onrender.com'; // ← Permanent Render URL
const DEVICE_ID         = 'device-001';                // ← Unique ID for this device
const LOCATION_TASK     = 'safe-tracker-bg-task';
const QUEUE_STORAGE_KEY = '@safetracker_offline_queue';
const MAX_QUEUE_SIZE    = 2000; // store up to 2000 points (~5.5 hours at 10s intervals)
// ──────────────────────────────────────────────────────────────────────────────

// ─── OFFLINE QUEUE HELPERS ────────────────────────────────────────────────────
async function enqueueLocation(record) {
  try {
    const raw   = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push(record);
    if (queue.length > MAX_QUEUE_SIZE) queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[Queue] Enqueue failed:', e.message);
  }
}

async function flushQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return 0;
    const queue = JSON.parse(raw);
    if (queue.length === 0) return 0;

    // Send as a batch
    const res = await fetch(`${SERVER_URL}/api/location/batch`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ records: queue }),
    });

    if (res.ok) {
      await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
      return queue.length;
    }
    return 0;
  } catch (e) {
    return 0; // still offline or server error
  }
}

async function getQueueSize() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw).length : 0;
  } catch { return 0; }
}

// ─── BACKGROUND TASK (runs even when app is closed) ───────────────────────────
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) { console.error('[BG Task]', error); return; }
  if (!data) return;

  const { locations } = data;
  const loc = locations[0];
  const record = {
    deviceId:  DEVICE_ID,
    latitude:  loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy:  loc.coords.accuracy,
    altitude:  loc.coords.altitude,
    speed:     loc.coords.speed,
    timestamp: loc.timestamp,
    savedAt:   Date.now(),
  };

  // Check connectivity
  const net = await NetInfo.fetch();
  const isOnline = net.isConnected && net.isInternetReachable;

  if (isOnline) {
    // Try to send immediately
    try {
      const res = await fetch(`${SERVER_URL}/api/location`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(record),
      });
      if (!res.ok) throw new Error('Non-OK response');

      // Also try to flush any queued points
      await flushQueue();
      return;
    } catch (_) {
      // Send failed — fall through to queue
    }
  }

  // Save to local queue (offline or send failed)
  await enqueueLocation(record);
});

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [isTracking,   setIsTracking]   = useState(false);
  const [showConsent,  setShowConsent]  = useState(false);
  const [coords,       setCoords]       = useState(null);
  const [isOnline,     setIsOnline]     = useState(true);
  const [queueSize,    setQueueSize]    = useState(0);
  const [fgGranted,    setFgGranted]    = useState(false);
  const [bgGranted,    setBgGranted]    = useState(false);
  const [highAccuracy, setHighAccuracy] = useState(true);
  const [log,          setLog]          = useState([]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const appState  = useRef(AppState.currentState);

  // ── Add to activity log ─────────────────────────────────────────────────────
  const addLog = useCallback((msg) => {
    const t = new Date().toLocaleTimeString();
    setLog(prev => [`[${t}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  // ── Pulse animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isTracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isTracking]);

  // ── Network monitor ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable);
      setIsOnline(online);
      if (online) {
        addLog('🌐 Back online — flushing offline queue…');
        flushQueue().then(n => {
          if (n > 0) addLog(`📤 Sent ${n} queued point${n !== 1 ? 's' : ''} to server.`);
          refreshQueueSize();
        });
      } else {
        addLog('📵 Offline — locations will be stored locally.');
      }
    });
    return () => unsub();
  }, [addLog]);

  // ── AppState: flush queue when app comes to foreground ──────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        refreshQueueSize();
        flushQueue().then(n => {
          if (n > 0) addLog(`📤 Synced ${n} offline point${n !== 1 ? 's' : ''}.`);
          refreshQueueSize();
        });
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [addLog]);

  // ── On mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const fg = await Location.getForegroundPermissionsAsync();
      const bg = await Location.getBackgroundPermissionsAsync();
      setFgGranted(fg.status === 'granted');
      setBgGranted(bg.status === 'granted');

      const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
      setIsTracking(registered);
      if (!registered) setShowConsent(true);
      else addLog('✅ Tracking resumed from previous session.');

      await refreshQueueSize();
    })();
  }, []);

  const refreshQueueSize = async () => {
    const n = await getQueueSize();
    setQueueSize(n);
  };

  // ── Start tracking ──────────────────────────────────────────────────────────
  const startTracking = async () => {
    setShowConsent(false);
    try {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') { addLog('❌ Foreground permission denied.'); return; }
      setFgGranted(true);
      addLog('✅ Foreground permission granted.');

      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg !== 'granted') {
        addLog('⚠️ Background permission denied — foreground only.');
      } else {
        setBgGranted(true);
        addLog('✅ Background permission granted.');
      }

      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
        timeInterval:     10000,  // every 10 seconds
        distanceInterval: 5,      // or every 5 metres
        foregroundService: {
          notificationTitle: '📍 SafeTracker Active',
          notificationBody: 'Location is being shared with your trusted contacts.',
          notificationColor: '#6366f1',
        },
        activityType: Location.ActivityType.Other,
        showsBackgroundLocationIndicator: true,
      });

      setIsTracking(true);
      addLog('🚀 Tracking started.');

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords(loc.coords);
      addLog(`📌 Initial fix: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
    } catch (err) {
      addLog(`❌ ${err.message}`);
      Alert.alert('Error', err.message);
    }
  };

  // ── Stop tracking ───────────────────────────────────────────────────────────
  const stopTracking = () => {
    Alert.alert('Stop Sharing?', 'Your trusted contacts will no longer see your location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop', style: 'destructive', onPress: async () => {
          const reg = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
          if (reg) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
          setIsTracking(false);
          setCoords(null);
          addLog('🛑 Tracking stopped by user.');
        }
      }
    ]);
  };

  // ── Manual sync ─────────────────────────────────────────────────────────────
  const manualSync = async () => {
    if (!isOnline) { addLog('❌ Still offline — cannot sync.'); return; }
    const n = await flushQueue();
    if (n > 0) addLog(`📤 Manually synced ${n} point${n !== 1 ? 's' : ''}.`);
    else addLog('✅ Queue already empty.');
    await refreshQueueSize();
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#020817" />

      {/* ── Consent Modal ─────────────────────────────────────────────────── */}
      <Modal visible={showConsent} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.consentBox}>
            <Text style={s.consentIcon}>🛡️</Text>
            <Text style={s.consentTitle}>Your Consent Matters</Text>
            <ScrollView style={s.consentScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.consentBody}>
                SafeTracker will share your precise GPS coordinates with your designated trusted contacts.
              </Text>
              <View style={s.bulletBox}>
                {[
                  ['📍', 'What is collected', 'Latitude, longitude, accuracy, speed, altitude.'],
                  ['👥', 'Who sees it',       'Only your designated trusted contacts.'],
                  ['🔔', 'Transparency',      'A persistent notification is always visible while tracking is active.'],
                  ['📵', 'Offline mode',      'When internet is off, GPS is still read and locations are stored on your device. They are uploaded automatically when you reconnect.'],
                  ['🛑', 'Your control',      'You can stop sharing at any time from this screen.'],
                ].map(([icon, bold, text]) => (
                  <Text key={bold} style={s.bullet}>
                    {icon}  <Text style={s.bulletBold}>{bold}:</Text> {text}
                  </Text>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={s.agreeBtn} onPress={startTracking}>
              <Text style={s.agreeBtnText}>I Agree &amp; Enable Tracking</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.declineBtn} onPress={() => setShowConsent(false)}>
              <Text style={s.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View>
          <Text style={s.appName}>SafeTracker</Text>
          <Text style={s.appSub}>Transparent · Consensual · Offline-Capable</Text>
        </View>
        {/* Online / Offline badge */}
        <View style={[s.netBadge, { borderColor: isOnline ? '#16a34a' : '#f59e0b' }]}>
          <View style={[s.netDot, { backgroundColor: isOnline ? '#22c55e' : '#f59e0b' }]} />
          <Text style={[s.netLabel, { color: isOnline ? '#4ade80' : '#fbbf24' }]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* ── Status Card ───────────────────────────────────────────────────── */}
      <View style={[s.card, isTracking ? s.cardActive : s.cardInactive]}>
        <View style={s.statusRow}>
          <Animated.View style={[s.dot, {
            backgroundColor: isTracking ? '#22c55e' : '#ef4444',
            transform: isTracking ? [{ scale: pulseAnim }] : [],
          }]} />
          <Text style={s.statusLabel}>
            {isTracking ? 'LIVE — Location Sharing Active' : 'Tracking Inactive'}
          </Text>
        </View>
        {coords && isTracking && (
          <View style={s.coordsBox}>
            {[
              ['Latitude',  coords.latitude.toFixed(6)],
              ['Longitude', coords.longitude.toFixed(6)],
              ['Accuracy',  `±${coords.accuracy?.toFixed(0) ?? '?'}m`],
              ['Speed',     coords.speed > 0 ? `${(coords.speed * 3.6).toFixed(1)} km/h` : '—'],
            ].map(([l, v]) => (
              <View key={l} style={s.coordRow}>
                <Text style={s.coordLabel}>{l}</Text>
                <Text style={s.coordValue}>{v}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Offline Queue Banner ──────────────────────────────────────────── */}
      {queueSize > 0 && (
        <TouchableOpacity style={s.queueBanner} onPress={manualSync}>
          <Text style={s.queueText}>
            📦 {queueSize} location{queueSize !== 1 ? 's' : ''} queued offline
            {isOnline ? ' — tap to sync now' : ' — waiting for internet'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Permissions Row ───────────────────────────────────────────────── */}
      <View style={s.permRow}>
        {[
          ['Foreground GPS', fgGranted],
          ['Background GPS', bgGranted],
          ['Streaming', isOnline && isTracking],
        ].map(([label, ok]) => (
          <View key={label} style={[s.badge, { borderColor: ok ? '#16a34a' : '#ef4444', backgroundColor: ok ? '#14532d22' : '#7f1d1d22' }]}>
            <Text style={[s.badgeText, { color: ok ? '#4ade80' : '#f87171' }]}>{ok ? '✓' : '✗'} {label}</Text>
          </View>
        ))}
      </View>

      {/* ── Accuracy Toggle ───────────────────────────────────────────────── */}
      {!isTracking && (
        <View style={s.toggleRow}>
          <View>
            <Text style={s.toggleLabel}>High Accuracy Mode (GPS chip)</Text>
            <Text style={s.toggleSub}>Uses more battery — recommended outdoors</Text>
          </View>
          <Switch
            value={highAccuracy} onValueChange={setHighAccuracy}
            trackColor={{ false: '#334155', true: '#6366f1' }} thumbColor="#f1f5f9"
          />
        </View>
      )}

      {/* ── Action Button ─────────────────────────────────────────────────── */}
      {isTracking
        ? <TouchableOpacity style={s.stopBtn}  onPress={stopTracking}><Text style={s.stopBtnText}>🛑  Stop Sharing Location</Text></TouchableOpacity>
        : <TouchableOpacity style={s.startBtn} onPress={() => setShowConsent(true)}><Text style={s.startBtnText}>📍  Enable Location Sharing</Text></TouchableOpacity>
      }

      {/* ── Activity Log ──────────────────────────────────────────────────── */}
      <View style={s.logBox}>
        <Text style={s.logTitle}>Activity Log</Text>
        <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
          {log.length === 0
            ? <Text style={s.logEmpty}>No events yet.</Text>
            : log.map((m, i) => <Text key={i} style={s.logLine}>{m}</Text>)
          }
        </ScrollView>
      </View>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#020817', paddingHorizontal: 18, paddingTop: 52 },
  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  appName:      { fontSize: 30, fontWeight: '800', color: '#f8fafc', letterSpacing: 0.5 },
  appSub:       { fontSize: 11, color: '#475569', marginTop: 2 },
  netBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  netDot:       { width: 7, height: 7, borderRadius: 4 },
  netLabel:     { fontSize: 12, fontWeight: '700' },
  // Status card
  card:         { borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1 },
  cardActive:   { backgroundColor: '#0d2219', borderColor: '#16a34a55' },
  cardInactive: { backgroundColor: '#1e1b35', borderColor: '#6366f144' },
  statusRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot:          { width: 11, height: 11, borderRadius: 6, marginRight: 10 },
  statusLabel:  { color: '#cbd5e1', fontSize: 14, fontWeight: '600' },
  coordsBox:    { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 10 },
  coordRow:     { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 },
  coordLabel:   { color: '#64748b', fontSize: 13 },
  coordValue:   { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  // Queue banner
  queueBanner:  { backgroundColor: '#451a03', borderWidth: 1, borderColor: '#f59e0b', borderRadius: 10, padding: 12, marginBottom: 12 },
  queueText:    { color: '#fbbf24', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  // Permissions
  permRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  badge:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText:    { fontSize: 11, fontWeight: '600' },
  // Toggle
  toggleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', padding: 14, borderRadius: 12, marginBottom: 14 },
  toggleLabel:  { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  toggleSub:    { color: '#475569', fontSize: 11, marginTop: 2 },
  // Buttons
  startBtn:     { backgroundColor: '#6366f1', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 14, shadowColor: '#6366f1', shadowOpacity: 0.4, shadowRadius: 14, elevation: 8 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  stopBtn:      { backgroundColor: '#7f1d1d', borderWidth: 1, borderColor: '#ef4444', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 14 },
  stopBtnText:  { color: '#fca5a5', fontSize: 16, fontWeight: '700' },
  // Log
  logBox:       { flex: 1, backgroundColor: '#0a0f1a', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1e293b' },
  logTitle:     { color: '#334155', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  logLine:      { color: '#475569', fontSize: 11, lineHeight: 18, fontFamily: 'monospace' },
  logEmpty:     { color: '#1e293b', fontSize: 12, fontStyle: 'italic' },
  // Consent modal
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  consentBox:   { backgroundColor: '#0f172a', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 26, maxHeight: '92%', borderTopWidth: 1, borderColor: '#1e293b' },
  consentIcon:  { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  consentTitle: { fontSize: 21, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginBottom: 14 },
  consentScroll:{ maxHeight: 300, marginBottom: 18 },
  consentBody:  { color: '#94a3b8', fontSize: 14, lineHeight: 22, marginBottom: 12 },
  bulletBox:    { backgroundColor: '#020817', borderRadius: 12, padding: 14, marginVertical: 8 },
  bullet:       { color: '#94a3b8', fontSize: 13, lineHeight: 22, marginBottom: 6 },
  bulletBold:   { color: '#e2e8f0', fontWeight: '700' },
  agreeBtn:     { backgroundColor: '#6366f1', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  agreeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  declineBtn:   { padding: 10, alignItems: 'center' },
  declineBtnText: { color: '#475569', fontSize: 14 },
});
