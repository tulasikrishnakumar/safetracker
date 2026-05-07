# SafeTracker

A **fully ethical, consent-first** GPS location tracking system with three components.

---

## Architecture

```
┌──────────────────────┐   POST /api/location   ┌────────────────────┐
│  SafeTracker App     │ ─────────────────────► │  Backend Server    │
│  (React Native/Expo) │                        │  (Node.js/Express) │
│  [Tracked Device]    │                        │                    │
└──────────────────────┘                        │  WebSocket Server  │
                                                └────────┬───────────┘
                                                         │ ws:// push
                                                         ▼
                                                ┌────────────────────┐
                                                │  Monitor Dashboard │
                                                │  (Web Browser)     │
                                                │  [Trusted Contact] │
                                                └────────────────────┘
```

---

## Privacy & Ethics

- **Explicit opt-in** — The tracked device user must read and agree to a full consent screen before any location data is ever collected.
- **Persistent notification** — Android shows a foreground service notification 24/7 while tracking is active. iOS shows the blue location pill.
- **User can stop at any time** — One tap inside the app stops tracking and removes the background task.
- **Transparent data use** — Only GPS coordinates, accuracy, speed, and altitude are collected. No messages, contacts, or other data.

---

## Getting Started

### 1. Server

```bash
cd server
npm install
node server.js
```

Server runs on port **4000**. Note your local IP address (e.g. `192.168.1.100`).

### 2. SafeTracker App (Tracked Device)

1. Edit `SafeTracker/App.js` — update `SERVER_URL` to your server's local IP:
   ```js
   const SERVER_URL = 'http://192.168.1.100:4000';
   ```
2. Install and run:
   ```bash
   cd SafeTracker
   npm install
   npx expo start
   ```
3. Scan the QR code with **Expo Go** on Android.
4. Grant consent and permissions when prompted.

### 3. Monitor Dashboard (Trusted Contact)

1. Open `dashboard/index.html` in any browser.
2. Set the server URL to `ws://<your-server-ip>:4000`.
3. Click **Connect** — live locations appear on the map.

---

## REST API Reference

| Method | Endpoint                          | Description                        |
|--------|-----------------------------------|------------------------------------|
| POST   | `/api/location`                   | Receive location update from device |
| GET    | `/api/location/:deviceId`         | Get latest location for a device   |
| GET    | `/api/location/:deviceId/history` | Get location history               |
| GET    | `/api/devices`                    | List all known devices             |
| GET    | `/health`                         | Server health check                |

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Mobile App | React Native + Expo + expo-location     |
| Background | expo-task-manager (Foreground Service)  |
| Server     | Node.js + Express + ws (WebSocket)      |
| Dashboard  | Vanilla HTML/JS + Leaflet.js            |
