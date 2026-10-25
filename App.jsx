import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  BatteryCharging,
  Bolt,
  Calculator,
  Cpu,
  Gauge,
  Home,
  Power,
  ShieldCheck,
  SlidersHorizontal,
  Wifi,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "./styles.css";
import {
  firebaseReady,
  subscribeLive,
  subscribeSettings,
  writeLoad,
  writeSettings,
} from "./firebase.js";

const initialReadings = {
  voltage: 230,
  current: 2.1,
  power: 483,
  energy: 4.82,
};

const zeroReadings = {
  voltage: 0,
  current: 0,
  power: 0,
  energy: 0,
};

function App() {
  const [page, setPage] = useState("home");

  // With Firebase configured the app starts in LIVE DEVICE mode.
  // Turn Simulation on (Home page) to test without the ESP32.
  const [simulation, setSimulation] = useState(!firebaseReady);
  const deviceMode = firebaseReady && !simulation;

  const [autoVoltage, setAutoVoltage] = useState(true);

  const [readings, setReadings] = useState(
    firebaseReady ? zeroReadings : initialReadings
  );

  const [loadOn, setLoadOn] = useState(true);
  const [protectionActive, setProtectionActive] = useState(false);

  const [manualVoltage, setManualVoltage] = useState(230);
  const [manualCurrent, setManualCurrent] = useState(2.1);

  const [history, setHistory] = useState([]);

  const [settings, setSettings] = useState({
    lower: 200,
    upper: 250,
    tariff: 8,
  });

  // Live device state
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState("NORMAL");
  const lastSeen = useRef(0);
  const lastCommand = useRef(0);

  /*
   * LIVE DEVICE (Firebase)
   */
  useEffect(() => {
    if (!deviceMode) return;

    const offLive = subscribeLive((v) => {
      if (!v) return;

      lastSeen.current = Date.now();
      setDeviceOnline(true);

      const voltage = Number(v.voltage || 0);
      const current = Number(v.current || 0);
      const power = Number(v.power ?? voltage * current);
      const energy = Number(v.energy || 0);

      setReadings({ voltage, current, power, energy });
      setDeviceStatus(v.status || "NORMAL");
      setProtectionActive(Boolean(v.protection));

      // Do not let a stale value undo a button press for a few seconds
      if (Date.now() - lastCommand.current > 8000) {
        setLoadOn(Boolean(v.load));
      }

      setHistory((old) =>
        [
          ...old,
          {
            time: new Date().toLocaleTimeString(),
            voltage: Number(voltage.toFixed(1)),
            current: Number(current.toFixed(2)),
            power: Number(power.toFixed(0)),
          },
        ].slice(-20)
      );
    });

    const offSettings = subscribeSettings((v) => {
      if (!v) return;

      setSettings((s) => ({
        lower: Number(v.lowerVoltage ?? s.lower),
        upper: Number(v.upperVoltage ?? s.upper),
        tariff: Number(v.tariff ?? s.tariff),
      }));
    });

    // Mark the device offline if nothing arrives for 20 seconds
    const timer = setInterval(() => {
      if (Date.now() - lastSeen.current > 20000) {
        setDeviceOnline(false);
      }
    }, 5000);

    return () => {
      offLive();
      offSettings();
      clearInterval(timer);
    };
  }, [deviceMode]);

  /*
   * SIMULATION ENGINE
   */
  useEffect(() => {
    if (!simulation) return;

    const timer = setInterval(() => {
      setReadings((previous) => {
        let voltage;

        if (autoVoltage) {
          voltage = 230 + (Math.random() * 8 - 4);
        } else {
          voltage = Number(manualVoltage);
        }

        let current;

        if (loadOn) {
          if (autoVoltage) {
            current = 1.5 + Math.random() * 2.5;
          } else {
            current = Number(manualCurrent);
          }
        } else {
          current = 0;
        }

        const power = voltage * current;

        // Energy increment for a 1-second simulation interval
        const energyIncrement = power / 1000 / 3600;

        const newEnergy = Number(previous.energy) + energyIncrement;

        return {
          voltage,
          current,
          power,
          energy: newEnergy,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [simulation, autoVoltage, manualVoltage, manualCurrent, loadOn]);

  /*
   * SIMULATED PROTECTION (simulation only; the ESP32 does the real one)
   */
  useEffect(() => {
    if (!simulation) return;

    if (
      readings.voltage < settings.lower ||
      readings.voltage > settings.upper
    ) {
      setProtectionActive(true);
      setLoadOn(false);
    } else {
      setProtectionActive(false);
    }
  }, [simulation, readings.voltage, settings.lower, settings.upper]);

  /*
   * HISTORY (simulation only; live mode records on every update)
   */
  useEffect(() => {
    if (!simulation) return;

    const item = {
      time: new Date().toLocaleTimeString(),
      voltage: Number(readings.voltage.toFixed(1)),
      current: Number(readings.current.toFixed(2)),
      power: Number(readings.power.toFixed(0)),
    };

    setHistory((old) => {
      const next = [...old, item];
      return next.slice(-20);
    });
  }, [simulation, readings.voltage, readings.current, readings.power]);

  const status = useMemo(() => {
    if (deviceMode) {
      if (!deviceOnline) {
        return {
          label: "NO DATA",
          className: "danger",
          description: "Waiting for the ESP32 to send readings.",
        };
      }

      if (deviceStatus !== "NORMAL") {
        return {
          label: deviceStatus,
          className: "danger",
          description: "The ESP32 has reported a protection condition.",
        };
      }

      return {
        label: "NORMAL",
        className: "normal",
        description: "The ESP32 reports normal operation.",
      };
    }

    if (readings.voltage < settings.lower) {
      return {
        label: "LOW VOLTAGE",
        className: "danger",
        description: "Voltage is below the configured safe range.",
      };
    }

    if (readings.voltage > settings.upper) {
      return {
        label: "HIGH VOLTAGE",
        className: "danger",
        description: "Voltage is above the configured safe range.",
      };
    }

    return {
      label: "NORMAL",
      className: "normal",
      description: "Voltage is currently within the configured range.",
    };
  }, [deviceMode, deviceOnline, deviceStatus, readings.voltage, settings]);

  const bill = readings.energy * settings.tariff;

  async function toggleLoad() {
    if (protectionActive) return;

    const next = !loadOn;
    setLoadOn(next);

    if (deviceMode) {
      lastCommand.current = Date.now();

      try {
        await writeLoad(next);
      } catch (error) {
        console.error("Could not send load command:", error);
      }
    }
  }

  function saveSettings() {
    writeSettings({
      lowerVoltage: settings.lower,
      upperVoltage: settings.upper,
      tariff: settings.tariff,
      automaticProtection: true,
    }).catch((error) => console.error("Could not save settings:", error));
  }

  function forceNormalVoltage() {
    setAutoVoltage(false);
    setManualVoltage(230);
  }

  function simulateLowVoltage() {
    setAutoVoltage(false);
    setManualVoltage(180);
  }

  function simulateHighVoltage() {
    setAutoVoltage(false);
    setManualVoltage(270);
  }

  function enableAuto() {
    setAutoVoltage(true);
  }

  function resetEnergy() {
    setReadings((old) => ({
      ...old,
      energy: 0,
    }));
  }

  const headerDanger = protectionActive || (deviceMode && !deviceOnline);

  let headerText = "SYSTEM NORMAL";
  if (protectionActive) headerText = "PROTECTION ACTIVE";
  else if (deviceMode && !deviceOnline) headerText = "DEVICE OFFLINE";

  let badgeText = simulation ? "SIMULATION RUNNING" : "SIMULATION OFF";
  if (deviceMode) {
    badgeText = deviceOnline ? "LIVE FROM ESP32" : "WAITING FOR ESP32";
  }

  return (
    <div className="app">
      {/* HEADER */}
      <header className="topbar">
        <div className="brand" onClick={() => setPage("home")}>
          <div className="brand-icon">
            <Zap size={22} />
          </div>

          <div>
            <div className="brand-name">VoltGuard</div>
            <div className="brand-subtitle">SMART ENERGY MONITOR</div>
          </div>
        </div>

        <div
          className={`system-status ${headerDanger ? "status-danger" : ""}`}
        >
          <span className="status-dot"></span>
          {headerText}
        </div>
      </header>

      {/* MAIN */}
      <main className="main-content">
        {page === "home" && (
          <>
            <section className="hero">
              <div>
                <div className="eyebrow">REAL-TIME MONITORING</div>

                <h1>Energy Dashboard</h1>

                <p>
                  Monitor voltage, current, power and energy consumption in
                  real time.
                </p>
              </div>

              <div className="simulation-badge">
                <Activity size={16} />
                {badgeText}
              </div>
            </section>

            {/* METRICS */}
            <section className="metrics-grid">
              <MetricCard
                icon={<Bolt />}
                title="VOLTAGE"
                value={readings.voltage.toFixed(1)}
                unit="V"
                note={`Safe range: ${settings.lower}-${settings.upper} V`}
              />

              <MetricCard
                icon={<Activity />}
                title="CURRENT"
                value={readings.current.toFixed(2)}
                unit="A"
                note="Measured load current"
              />

              <MetricCard
                icon={<Gauge />}
                title="POWER"
                value={readings.power.toFixed(0)}
                unit="W"
                note="Instantaneous power"
              />

              <MetricCard
                icon={<BatteryCharging />}
                title="ENERGY"
                value={readings.energy.toFixed(3)}
                unit="kWh"
                note="Accumulated consumption"
              />
            </section>

            {/* STATUS + LOAD */}
            <section className="two-column">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <div className="eyebrow">LIVE STATUS</div>

                    <h2>Electrical Condition</h2>
                  </div>

                  <span className={`status-pill ${status.className}`}>
                    {status.label}
                  </span>
                </div>

                <div className="big-reading">
                  {readings.voltage.toFixed(1)}
                  <span>V</span>
                </div>

                <p className="muted">{status.description}</p>

                {protectionActive && (
                  <div className="warning-box">
                    <ShieldCheck size={20} />

                    <div>
                      <strong>Protection triggered</strong>
                      <p>
                        {deviceMode
                          ? "The ESP32 has switched the load OFF. After an overcurrent trip, press the BOOT button on the ESP32, then turn the load ON here."
                          : "The simulated load has been switched OFF because the voltage is outside the safe range."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <div className="eyebrow">LOAD CONTROL</div>

                    <h2>Connected Load</h2>
                  </div>

                  <Power size={24} />
                </div>

                <div
                  className={`load-display ${
                    loadOn ? "load-on" : "load-off"
                  }`}
                >
                  <div className="load-state">{loadOn ? "ON" : "OFF"}</div>

                  <div className="muted">
                    {loadOn
                      ? "Load is currently powered."
                      : "Load is currently disconnected."}
                  </div>
                </div>

                <button
                  className={`large-button ${
                    loadOn ? "button-danger" : "button-success"
                  }`}
                  onClick={toggleLoad}
                  disabled={protectionActive}
                >
                  <Power size={18} />

                  {loadOn ? "Turn Load OFF" : "Turn Load ON"}
                </button>
              </div>
            </section>

            {/* CHART */}
            <section className="panel chart-panel">
              <div className="panel-header">
                <div>
                  <div className="eyebrow">LIVE DATA</div>

                  <h2>Voltage History</h2>
                </div>

                <div className="live-indicator">
                  <span></span>
                  LIVE
                </div>
              </div>

              <div className="chart">
                {history.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />

                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />

                      <YAxis
                        domain={[
                          Math.min(
                            160,
                            Math.floor(
                              Math.min(...history.map((x) => x.voltage)) - 10
                            )
                          ),
                          Math.max(
                            280,
                            Math.ceil(
                              Math.max(...history.map((x) => x.voltage)) + 10
                            )
                          ),
                        ]}
                        tick={{ fontSize: 11 }}
                      />

                      <Tooltip />

                      <Line
                        type="monotone"
                        dataKey="voltage"
                        stroke="#35a7ff"
                        strokeWidth={3}
                        dot={false}
                        name="Voltage"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-chart">
                    {deviceMode
                      ? "Waiting for data from the ESP32..."
                      : "Waiting for simulation data..."}
                  </div>
                )}
              </div>
            </section>

            {/* SIMULATION CONTROL */}
            <section className="panel simulation-panel">
              <div className="panel-header">
                <div>
                  <div className="eyebrow">TEST ENVIRONMENT</div>

                  <h2>Simulation Control</h2>

                  <p className="muted">
                    {firebaseReady
                      ? "Turn simulation ON to test without the ESP32. Turn it OFF to show live readings from the device."
                      : "Create different electrical conditions and test VoltGuard protection."}
                  </p>
                </div>

                <SlidersHorizontal size={28} />
              </div>

              <div className="simulation-controls">
                <div className="control-card">
                  <div className="control-title">Simulation</div>

                  <button
                    className={
                      simulation ? "control-button active" : "control-button"
                    }
                    onClick={() => setSimulation((v) => !v)}
                  >
                    {simulation
                      ? "RUNNING"
                      : firebaseReady
                      ? "OFF (LIVE DEVICE)"
                      : "PAUSED"}
                  </button>
                </div>

                <div className="control-card">
                  <div className="control-title">Voltage Mode</div>

                  <button
                    className={
                      autoVoltage ? "control-button active" : "control-button"
                    }
                    onClick={enableAuto}
                    disabled={!simulation}
                  >
                    AUTO
                  </button>
                </div>

                <div className="control-card">
                  <div className="control-title">Manual Voltage</div>

                  <input
                    type="range"
                    min="150"
                    max="300"
                    value={manualVoltage}
                    disabled={!simulation}
                    onChange={(e) => {
                      setAutoVoltage(false);
                      setManualVoltage(e.target.value);
                    }}
                  />

                  <div className="slider-value">{manualVoltage} V</div>
                </div>

                <div className="control-card">
                  <div className="control-title">Manual Current</div>

                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={manualCurrent}
                    disabled={!simulation}
                    onChange={(e) => setManualCurrent(e.target.value)}
                  />

                  <div className="slider-value">
                    {Number(manualCurrent).toFixed(1)} A
                  </div>
                </div>
              </div>

              <div className="scenario-buttons">
                <button
                  className="scenario normal-scenario"
                  onClick={forceNormalVoltage}
                  disabled={!simulation}
                >
                  <ShieldCheck size={18} />
                  NORMAL 230V
                </button>

                <button
                  className="scenario low-scenario"
                  onClick={simulateLowVoltage}
                  disabled={!simulation}
                >
                  <Activity size={18} />
                  TEST LOW VOLTAGE
                </button>

                <button
                  className="scenario high-scenario"
                  onClick={simulateHighVoltage}
                  disabled={!simulation}
                >
                  <Bolt size={18} />
                  TEST HIGH VOLTAGE
                </button>

                <button
                  className="scenario"
                  onClick={() => setLoadOn(false)}
                  disabled={!simulation}
                >
                  <Power size={18} />
                  LOAD OFF
                </button>

                <button
                  className="scenario"
                  onClick={() => {
                    setAutoVoltage(false);
                    setManualVoltage(230);
                    setLoadOn(true);
                  }}
                  disabled={!simulation}
                >
                  <Power size={18} />
                  RESET TEST
                </button>
              </div>
            </section>
          </>
        )}

        {page === "analytics" && (
          <AnalyticsPage history={history} readings={readings} />
        )}

        {page === "billing" && (
          <BillingPage
            energy={readings.energy}
            tariff={settings.tariff}
            bill={bill}
            setTariff={(value) =>
              setSettings((s) => ({
                ...s,
                tariff: Number(value),
              }))
            }
            resetEnergy={resetEnergy}
            canReset={simulation}
          />
        )}

        {page === "protection" && (
          <ProtectionPage
            settings={settings}
            setSettings={setSettings}
            protectionActive={protectionActive}
            onSave={saveSettings}
            canSave={firebaseReady}
          />
        )}

        {page === "device" && (
          <DevicePage
            simulation={simulation}
            firebaseReady={firebaseReady}
            deviceMode={deviceMode}
            deviceOnline={deviceOnline}
          />
        )}
      </main>

      {/* NAVIGATION */}
      <nav className="bottom-nav">
        <NavButton
          active={page === "home"}
          icon={<Home />}
          label="Home"
          onClick={() => setPage("home")}
        />

        <NavButton
          active={page === "analytics"}
          icon={<BarChart3 />}
          label="Analytics"
          onClick={() => setPage("analytics")}
        />

        <NavButton
          active={page === "billing"}
          icon={<Calculator />}
          label="Billing"
          onClick={() => setPage("billing")}
        />

        <NavButton
          active={page === "protection"}
          icon={<ShieldCheck />}
          label="Protection"
          onClick={() => setPage("protection")}
        />

        <NavButton
          active={page === "device"}
          icon={<Cpu />}
          label="Device"
          onClick={() => setPage("device")}
        />
      </nav>
    </div>
  );
}

/* ---------------- COMPONENTS ---------------- */

function MetricCard({ icon, title, value, unit, note }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>

      <div className="metric-content">
        <div className="metric-title">{title}</div>

        <div className="metric-value">
          {value}
          <span>{unit}</span>
        </div>

        <div className="metric-note">{note}</div>
      </div>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function AnalyticsPage({ history, readings }) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div className="eyebrow">DATA ANALYSIS</div>

        <h1>Analytics</h1>

        <p>Live electrical measurements.</p>
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <div className="eyebrow">CURRENT</div>

          <div className="analytics-number">
            {readings.current.toFixed(2)} A
          </div>
        </div>

        <div className="panel">
          <div className="eyebrow">POWER</div>

          <div className="analytics-number">
            {readings.power.toFixed(0)} W
          </div>
        </div>
      </div>

      <div className="panel chart-panel">
        <h2>Voltage Trend</h2>

        <div className="chart">
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />

                <XAxis dataKey="time" />

                <YAxis />

                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="voltage"
                  stroke="#35a7ff"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">Waiting for data...</div>
          )}
        </div>
      </div>
    </section>
  );
}

function BillingPage({
  energy,
  tariff,
  bill,
  setTariff,
  resetEnergy,
  canReset,
}) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div className="eyebrow">ELECTRICITY COST</div>

        <h1>Billing</h1>

        <p>Estimate your electricity cost from measured energy consumption.</p>
      </div>

      <div className="billing-card">
        <div>
          <div className="eyebrow">ESTIMATED BILL</div>

          <div className="bill-value">₹{bill.toFixed(2)}</div>
        </div>

        <div className="billing-details">
          <div>
            <span>Energy consumed</span>
            <strong>{energy.toFixed(3)} kWh</strong>
          </div>

          <div>
            <span>Tariff</span>

            <input
              type="number"
              value={tariff}
              onChange={(e) => setTariff(e.target.value)}
            />

            <span>₹ / kWh</span>
          </div>
        </div>

        <button
          className="large-button button-danger"
          onClick={resetEnergy}
          disabled={!canReset}
        >
          Reset Energy {canReset ? "" : "(simulation only)"}
        </button>
      </div>
    </section>
  );
}

function ProtectionPage({
  settings,
  setSettings,
  protectionActive,
  onSave,
  canSave,
}) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div className="eyebrow">SAFETY SYSTEM</div>

        <h1>Protection</h1>

        <p>Configure the voltage protection limits.</p>
      </div>

      <div className="panel protection-settings">
        <div className="protection-status">
          <ShieldCheck size={32} />

          <div>
            <strong>
              {protectionActive
                ? "Protection Triggered"
                : "Protection Monitoring"}
            </strong>

            <p>
              {protectionActive
                ? "The system has switched the load off."
                : "The system is monitoring the voltage continuously."}
            </p>
          </div>
        </div>

        <label>
          Lower Voltage Limit
          <div className="input-row">
            <input
              type="number"
              value={settings.lower}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  lower: Number(e.target.value),
                }))
              }
            />

            <span>V</span>
          </div>
        </label>

        <label>
          Upper Voltage Limit
          <div className="input-row">
            <input
              type="number"
              value={settings.upper}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  upper: Number(e.target.value),
                }))
              }
            />

            <span>V</span>
          </div>
        </label>

        <button
          className="large-button button-success"
          onClick={onSave}
          disabled={!canSave}
        >
          Save to device
        </button>

        <p className="muted">
          The ESP32 enforces these limits itself, but only after voltage
          protection is armed in its firmware (after calibration).
        </p>
      </div>
    </section>
  );
}

function DevicePage({ simulation, firebaseReady, deviceMode, deviceOnline }) {
  let espState = "Simulated";
  if (deviceMode) espState = deviceOnline ? "Online" : "Offline";

  return (
    <section className="page-section">
      <div className="page-heading">
        <div className="eyebrow">DEVICE CONNECTION</div>

        <h1>Device</h1>

        <p>ESP32 energy monitoring node.</p>
      </div>

      <div className="panel device-panel">
        <div className="device-icon">
          <Cpu size={42} />
        </div>

        <h2>VoltGuard Energy Node</h2>

        <div className="device-row">
          <Wifi size={18} />
          <span>ESP32</span>
          <strong>{espState}</strong>
        </div>

        <div className="device-row">
          <DatabaseIcon />
          <span>Firebase</span>
          <strong>{firebaseReady ? "Configured" : "Not configured"}</strong>
        </div>

        <div className="device-row">
          <Activity size={18} />
          <span>Mode</span>
          <strong>{simulation ? "Simulation" : "Live device"}</strong>
        </div>
      </div>
    </section>
  );
}

function DatabaseIcon() {
  return <span className="database-icon">◉</span>;
}

export default App;
