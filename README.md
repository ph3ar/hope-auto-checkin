# HOPE Auto Check-In (UNLICENSED)

Smart volunteer shift automation for HOPE conference staff and volunteers.

## ✨ Features

- Pulls volunteer shifts from Engelsystem
- Auto-checks in on Matrix (`@kusanagi`) when shift is about to start
- Posts into different Matrix rooms depending on shift-type
- Smart haptics + alerts (Scriptable/iOS)
- Slash-command aware – `/oncall` and `/off` to toggle status
- Logs check-ins to CSV (+ Google Sheets placeholder)
- Optional scheduled loop every N minutes
- Optional Scriptable home-screen widget display

## 📁 Files

| File          | Purpose                                |
|---------------|----------------------------------------|
| `checkin.js`  | Main script (Scriptable/Nodifiable)     |
| `.env.example`| Example secrets placeholder            |

---

## 🔧 Setup

### 1) Get your Engelsystem API key
> Shifts → JSON export → copy API key

### 2) Store secrets

Either in **Scriptable → Keychain** (preferred):
- `ENGELSYSTEM_USER`
- `ENGELSYSTEM_PASS`
- `ENGELSYSTEM_APIKEY`
- `MATRIX_USER`
- `MATRIX_PASS`

Or copy `.env.example` → `.env` and fill values.

### 3) Run

#### Scriptable (iOS):
- Install script as `checkin.js`
- Run manually or pin widget

#### Node (optional):
```bash
npm install node-fetch
node checkin.js
