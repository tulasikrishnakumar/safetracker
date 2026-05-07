# SafeTracker 📍

A **fully ethical, consent-first** GPS location tracking system with three components: a **React Native app** for the tracked device, a **Node.js backend** hosted on Render.com, and a **web dashboard** for live monitoring.

---

## Architecture

```
┌─────────────────────────┐     HTTPS POST      ┌──────────────────────────┐
│   SafeTracker App       │ ──────────────────► │   Backend Server         │
│   (Android APK)         │   /api/location      │   (Render.com — 24/7)    │
│   [Target Device]       │   /api/location/batch│                          │
│                         │ ◄────────────────── │   wss:// WebSocket       │
│  • GPS always on        │                      └────────────┬─────────────┘
│  • Offline queue        │                                   │ Real-time push
│  • Auto-sync on connect │                                   ▼
└─────────────────────────┘                      ┌──────────────────────────┐
                                                 │   Monitor Dashboard      │
                                                 │   (Web Browser)          │
                                                 │   [Your Device]          │
                                                 │                          │
                                                 │  • Live map              │
                                                 │  • Path history          │
                                                 │  • Device sidebar        │
                                                 └──────────────────────────┘
```

---

## Live URLs

| Component | URL |
|---|---|
| 🌐 Backend Server | `https://safetracker-k5wy.onrender.com` |
| 📊 Monitor Dashboard | `https://safetracker-k5wy.onrender.com/dashboard` |
| ❤️ Health Check | `https://safetracker-k5wy.onrender.com/health` |

---

## Privacy & Ethics

> This app is built for **consensual, transparent** location sharing only.

- ✅ **Explicit opt-in** — the tracked user must read and agree to a full consent screen before any location data is ever collected.
- ✅ **Persistent notification** — a permanent status-bar notification (`📍 SafeTracker Active`) is shown 24/7 whenever tracking is active.
- ✅ **User can stop at any time** — one tap in the app stops tracking and removes the background task.
- ✅ **Offline transparency** — the app's activity log shows exactly what is happening locally vs. being sent.
- ✅ **No hidden data** — only GPS coordinates, accuracy, speed, and altitude are collected.

---

## Features

| Feature | Details |
|---|---|
| 📍 Live GPS | Updates every 10 seconds or every 5 metres moved |
| 📵 Offline Queue | GPS recorded with no internet; auto-uploaded when connection returns (up to 2000 points ≈ 5.5 hours) |
| 🔔 Foreground Notification | Permanent Android notification while tracking is active |
| 🗺️ Live Map | Dark Leaflet.js map with device markers, accuracy circles, path polylines |
| ⚡ Real-time WebSocket | Dashboard updates instantly when a new point arrives |
| 📦 Batch Upload | Offline points uploaded in one request when internet restores |
| 🔁 Auto-reconnect | Dashboard reconnects automatically if server connection drops |
| 🌐 Cloud Hosted | Server runs 24/7 on Render.com — no PC required |

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
    ├── App.js                   ← Main app: consent UI, GPS, offline queue
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
3. As soon as the target device starts sharing, a 📱 marker appears on the map.
4. Click any device card in the sidebar to focus the map on that device.

> **Alternatively**, open the local file directly:
> ```
> dashboard/index.html
> ```
> Then manually set the server URL to `wss://safetracker-k5wy.onrender.com` and click Connect.

---

### 📱 Target Device Setup (Android Phone)

#### Step 1 — Install the APK

Download and install the APK built via EAS Build:

1. On the target Android phone, go to **Settings → Security** → enable **"Install from unknown sources"** (or allow Chrome to install APKs).
2. Open the EAS APK download link in the phone's browser.
3. Download and tap **Install**.

> **Note:** The APK is a standard Android app. It does NOT require Expo Go.

#### Step 2 — Grant Permissions

When the app opens for the first time:

1. Read the **consent screen** carefully.
2. Tap **"I Agree & Enable Tracking"**.
3. When Android asks for location permission, select **"Allow all the time"** (required for background tracking).
4. A persistent notification `📍 SafeTracker Active` will appear in the status bar — this is intentional and confirms tracking is on.

#### Step 3 — Confirm it's Working

In the app's **Activity Log** you will see:
```
✅ Background permission granted.
🚀 Tracking started.
📌 Initial fix: 12.97345, 77.59051
```

The dashboard will show the device on the map within seconds.

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
npx eas-cli login          # Sign in to expo.dev (free account)
npx eas-cli build --platform android --profile preview
# ✅ Returns a download link for a full .apk file
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native + Expo SDK 54 |
| Background GPS | `expo-location` + `expo-task-manager` (Foreground Service) |
| Offline Queue | `@react-native-async-storage/async-storage` |
| Network Detection | `@react-native-community/netinfo` |
| App Build | EAS Build (Expo Application Services) |
| Backend | Node.js + Express + `ws` (WebSocket) |
| Hosting | Render.com (free tier, 24/7) |
| Dashboard | Vanilla HTML/JS + Leaflet.js (dark map tiles from CartoDB) |
| Tunnelling (dev) | Cloudflare Tunnel (`cloudflared`) |
| Version Control | Git + GitHub |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Dashboard shows "Disconnected" | Check that the server URL is `wss://safetracker-k5wy.onrender.com` and click Connect |
| App shows ❌ Background permission denied | Go to Android Settings → Apps → SafeTracker → Permissions → Location → set to "Allow all the time" |
| Offline points not uploading | Tap the amber banner in the app, or wait — it auto-syncs on reconnect |
| Render server is slow to respond (first request) | Free tier sleeps after inactivity; the keep-alive ping should prevent this, but first cold start may take ~30s |
| Map tiles not loading | Dashboard requires internet to load map tiles from CartoDB |
