# SafeTracker 📍

A **fully ethical, consent-first** GPS location tracking system with three components: a **React Native app** for the tracked device, a **Node.js backend** hosted on Render.com, and a **web dashboard** for live monitoring.

> **v1.1 — Multi-Device Support:** Each phone now gets its own permanent unique ID automatically. Multiple phones can be tracked simultaneously on the same dashboard.

---

## Architecture

```
┌─────────────────────────┐     HTTPS POST      ┌──────────────────────────┐
│   SafeTracker App       │ ──────────────────► │   Backend Server         │
│   (Android APK)         │   /api/location      │   (Render.com — 24/7)    │
│   [Any tracked device]  │   /api/location/batch│                          │
│                         │ ◄────────────────── │   wss:// WebSocket       │
│  • Unique Device ID     │                      └────────────┬─────────────┘
│  • GPS always on        │                                   │ Real-time push
│  • Offline queue        │                                   ▼
│  • Auto-sync on connect │                      ┌──────────────────────────┐
└─────────────────────────┘                      │   Monitor Dashboard      │
                                                 │   (Web Browser)          │
         Phone A ──┐                             │                          │
         Phone B ──┼──► Server ──► Dashboard     │  • Live map              │
         Phone C ──┘                             │  • Multiple device cards │
                                                 │  • Path history per device│
                                                 └──────────────────────────┘
```

---

## Live URLs

| Component | URL |
|---|---|
| 🌐 Backend Server | `https://safetracker-k5wy.onrender.com` |
| 📊 Monitor Dashboard | `https://safetracker-k5wy.onrender.com/dashboard` |
| ❤️ Health Check | `https://safetracker-k5wy.onrender.com/health` |
| 📥 Latest APK | [Download APK](https://expo.dev/artifacts/eas/bBTv7rtY91rvEuApUvuMt9.apk) |

---

## Privacy & Ethics

> This app is built for **consensual, transparent** location sharing only.

- ✅ **Explicit opt-in** — the tracked user must read and agree to a full consent screen before any location data is ever collected.
- ✅ **Persistent notification** — a permanent status-bar notification (`📍 SafeTracker Active`) is shown 24/7 whenever tracking is active.
- ✅ **Device ID visible** — each phone displays its own unique ID in the app header so the user always knows which device is identified.
- ✅ **User can stop at any time** — one tap in the app stops tracking and removes the background task.
- ✅ **Offline transparency** — the app's activity log shows exactly what is happening locally vs. being sent.
- ✅ **No hidden data** — only GPS coordinates, accuracy, speed, and altitude are collected.

---

## Features

| Feature | Details |
|---|---|
| 📍 Live GPS | Updates every 10 seconds or every 5 metres moved |
| 📱 Unique Device ID | Auto-generated from hardware (`androidId` / `identifierForVendor`) — stable across updates |
| 👥 Multi-Device | Track multiple phones simultaneously — each appears as a separate card on the dashboard |
| 📵 Offline Queue | GPS recorded with no internet; auto-uploaded when connection returns (up to 2000 points ≈ 5.5 hours) |
| 🔔 Foreground Notification | Permanent Android notification while tracking is active |
| 🗺️ Live Map | Dark Leaflet.js map with device markers, accuracy circles, path polylines |
| ⚡ Real-time WebSocket | Dashboard updates instantly when a new point arrives |
| 📦 Batch Upload | Offline points uploaded in one request when internet restores |
| 🔁 Auto-reconnect | Dashboard reconnects automatically if server connection drops |
| 🌐 Cloud Hosted | Server runs 24/7 on Render.com — no PC required |

---

## How Multi-Device ID Works

Each phone is assigned a **permanent unique ID** on first launch:

```
Phone A  →  androidId: "a1b2c3d4..."  →  stored in AsyncStorage  →  sent with every GPS point
Phone B  →  androidId: "x9y8z7w6..."  →  stored in AsyncStorage  →  sent with every GPS point
Dashboard →  sees both as separate devices ✅
```

**ID resolution chain:**
1. `androidId` (Android hardware ID) — stable, unique per device
2. `identifierForVendor` (iOS) — stable per app vendor
3. Random fallback `device-XXXXXXXX` — generated once and persisted if hardware ID is unavailable

The ID is displayed in the app header and logged at startup: `📱 Device ID: <id>`

---

## Project Structure

```
locaton_tracking/
│
├── README.md                    ← This file
├── render.yaml                  ← Render.com auto-deploy config
├── start.js                     ← Local smart launcher (auto-detects tunnel URL)
├── package.json                 ← Root scripts
├── .gitignore
│
├── server/                      ← Node.js Backend (deployed to Render)
│   ├── server.js                ← Express + WebSocket server
│   └── package.json
│
├── dashboard/                   ← Monitor Dashboard (web)
│   └── index.html               ← Standalone HTML — open in any browser
│
└── SafeTracker/                 ← Android App (React Native / Expo)
    ├── App.js                   ← Main app: consent UI, GPS, unique device ID, offline queue
    ├── app.json                 ← Permissions & build config
    ├── eas.json                 ← EAS Build profiles (APK)
    └── package.json
```

---

## Setup Guide

### 🖥️ Monitor Device Setup (Your Phone or PC)

Open the dashboard in any browser — no installation needed:

```
https://safetracker-k5wy.onrender.com/dashboard
```

1. The page loads with the WebSocket URL pre-filled.
2. Click **"Connect"** → the status dot turns 🟢 **Live**.
3. As soon as a tracked device starts sharing, a 📱 marker appears on the map.
4. Click any device card in the sidebar to focus the map on that device.
5. **Multiple devices** show up as separate cards — each with their own map marker and path.

> **Alternatively**, open the local file directly:
> ```
> dashboard/index.html
> ```
> Then manually set the server URL to `wss://safetracker-k5wy.onrender.com` and click Connect.

---

### 📱 Target Device Setup (Android Phone — any number of devices)

#### Step 1 — Install the APK

Download the latest APK built via EAS Build:

**[⬇️ Download SafeTracker APK](https://expo.dev/artifacts/eas/bBTv7rtY91rvEuApUvuMt9.apk)**

1. On each Android phone, go to **Settings → Security** → enable **"Install from unknown sources"** (or allow Chrome to install APKs).
2. Open the APK download link in the phone's browser.
3. Download and tap **Install**.

> **Note:** The APK is a standard Android app. It does NOT require Expo Go. Install the same APK on as many phones as you want — each one will get its own unique ID automatically.

#### Step 2 — Grant Permissions

When the app opens for the first time:

1. Read the **consent screen** carefully.
2. Tap **"I Agree & Enable Tracking"**.
3. When Android asks for location permission, select **"Allow all the time"** (required for background tracking).
4. A persistent notification `📍 SafeTracker Active` will appear in the status bar — this is intentional and confirms tracking is on.

#### Step 3 — Confirm it's Working

In the app's **Activity Log** you will see:
```
📱 Device ID: a1b2c3d4e5f6...
✅ Background permission granted.
🚀 Tracking started.
📌 Initial fix: 12.97345, 77.59051
```

The device ID displayed here is what identifies this phone on the dashboard. The dashboard will show the device on the map within seconds.

---

## Offline Behaviour

| Target Device State | What Happens |
|---|---|
| Internet ON | Location sent to server every 10s, dashboard updates in real-time |
| Internet OFF (data/WiFi) | GPS still records; points saved on-device (up to 2000) |
| Internet restored | All saved points uploaded automatically in one batch |
| Airplane Mode | GPS disabled by Android — nothing recorded |

The app shows an amber **"X points queued offline"** banner when there are unsent points. Tap it to manually trigger an upload when online.

---

## REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/location` | Receive a single live GPS point |
| `POST` | `/api/location/batch` | Receive bulk offline-queued points |
| `GET` | `/api/location/:deviceId` | Get latest location for a device |
| `GET` | `/api/location/:deviceId/history` | Get location history (add `?limit=N`) |
| `GET` | `/api/devices` | List all known devices |
| `GET` | `/health` | Server health check |
| `GET` | `/dashboard` | Serves the monitor dashboard HTML |

---

## Local Development

### Run the server locally

```bash
cd server
npm install
node server.js
# Server starts at http://localhost:4000
```

### Run with auto tunnel (cloudflared)

```bash
# From the project root — auto-detects tunnel URL and patches all files
node start.js
```

### Run the Expo app (development only — background GPS limited)

```bash
cd SafeTracker
npx expo start --lan --port 8090
# Scan QR with Expo Go (same WiFi only)
# ⚠️ Background location does NOT work in Expo Go on Android
```

### Build production APK

```bash
cd SafeTracker
eas login                # Sign in to expo.dev (free account)
eas build --platform android --profile preview
# ✅ Returns a download link for a full .apk file
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native + Expo SDK 54 |
| Background GPS | `expo-location` + `expo-task-manager` (Foreground Service) |
| Device Identity | `expo-application` (`androidId` / `identifierForVendor`) |
| Offline Queue | `@react-native-async-storage/async-storage` |
| Network Detection | `@react-native-community/netinfo` |
| App Build | EAS Build (Expo Application Services) |
| Backend | Node.js + Express + `ws` (WebSocket) |
| Hosting | Render.com (free tier, 24/7) |
| Dashboard | Vanilla HTML/JS + Leaflet.js (dark map tiles from CartoDB) |
| Tunnelling (dev) | Cloudflare Tunnel (`cloudflared`) |
| Version Control | Git + GitHub |

---

## Changelog

### v1.1.0 — Multi-Device Support
- **Added** `expo-application` dependency for hardware-level device identification
- **Removed** hardcoded `DEVICE_ID = 'device-001'` constant
- **Added** `getDeviceId()` — reads `androidId` (Android) or `identifierForVendor` (iOS), persists to `AsyncStorage`
- **Added** module-level `_cachedDeviceId` so background task reuses the same ID without hitting storage every 10s
- **Added** device ID display in app header and activity log on startup
- **Result:** Install the same APK on any number of phones — each registers as a unique device on the dashboard

### v1.0.0 — Initial Release
- Consent-first tracked device app (React Native / Expo)
- Background GPS with foreground notification
- Offline queue with auto-sync (up to 2000 points)
- Real-time WebSocket dashboard with Leaflet.js map
- Deployed to Render.com (24/7)

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Dashboard shows "Disconnected" | Check that the server URL is `wss://safetracker-k5wy.onrender.com` and click Connect |
| Two phones show same device on dashboard | This was a bug in v1.0. Update to the latest APK (v1.1) — each phone now gets its own ID |
| App shows ❌ Background permission denied | Go to Android Settings → Apps → SafeTracker → Permissions → Location → set to "Allow all the time" |
| Offline points not uploading | Tap the amber banner in the app, or wait — it auto-syncs on reconnect |
| Render server is slow to respond (first request) | Free tier sleeps after inactivity; the keep-alive ping should prevent this, but first cold start may take ~30s |
| Map tiles not loading | Dashboard requires internet to load map tiles from CartoDB |
| Device ID shows "Loading…" on startup | Normal — resolves within 1–2 seconds as AsyncStorage is read asynchronously |
