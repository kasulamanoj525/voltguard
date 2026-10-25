# VoltGuard
React + Vite smart energy monitoring app.

Flow: ESP32 → Wi-Fi → Firebase Realtime Database → VoltGuard.

Run:
1. Install Node.js LTS.
2. `npm install`
3. Copy `.env.example` to `.env.local`
4. Add Firebase Web config values.
5. `npm run dev`

Firebase paths:
`/energyMonitor/live`
`/energyMonitor/settings`
`/energyMonitor/control`

Simulation mode works without Firebase configuration.

Real electrical protection must be implemented locally on the ESP32 and appropriate protection hardware; never depend on cloud/app logic for a safety interlock.
