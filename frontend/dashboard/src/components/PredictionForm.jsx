import { useEffect, useMemo, useState } from "react";
import { predictMaintenance, getMachineReadings } from "../services/api";

const SENSOR_RANGES = {
  air_temperature:    { min: 295.3, max: 304.5, unit: "K" },
  process_temperature:{ min: 305.7, max: 313.8, unit: "K" },
  rotational_speed:   { min: 1168,  max: 2886,  unit: "rpm" },
  torque:             { min: 3.8,   max: 76.6,  unit: "Nm" },
  tool_wear:          { min: 0,     max: 253,   unit: "min" },
};

function checkAnomalies(form, isRtl) {
  const warnings = [];
  for (const [key, range] of Object.entries(SENSOR_RANGES)) {
    const v = parseFloat(form[key]);
    if (isNaN(v)) continue;
    if (v < range.min || v > range.max) {
      warnings.push(
        isRtl
          ? `${key}: القيمة ${v} ${range.unit} خارج النطاق الطبيعي (${range.min}–${range.max})`
          : `${key}: value ${v} ${range.unit} is outside normal range (${range.min}–${range.max})`
      );
    }
  }
  return warnings;
}

export default function PredictionForm({ locale, onResult }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    type: "M",
    air_temperature: 300,
    process_temperature: 310,
    rotational_speed: 1500,
    torque: 40,
    tool_wear: 0,
  });

  const [mode, setMode] = useState("manual"); // "manual" | "database"
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [machinesError, setMachinesError] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState("");

  const text = useMemo(
    () =>
      locale === "ar"
        ? {
            machineType: "نوع الماكينة",
            run: "تشغيل التنبؤ",
            running: "جارٍ التحليل...",
            helper: "أدخل القيم المطلوبة ثم نفّذ التنبؤ.",
            fields: {
              air_temperature: "درجة حرارة الهواء",
              process_temperature: "درجة حرارة العملية",
              rotational_speed: "السرعة الدورانية",
              torque: "العزم",
              tool_wear: "تآكل الأداة",
            },
            modeManual: "إدخال يدوي",
            modeDatabase: "من قاعدة البيانات",
            selectMachine: "اختر ماكينة",
            selectMachinePlaceholder: "-- اختر ماكينة --",
            loadingMachines: "جارٍ تحميل الماكينات...",
            noMachines: "لا توجد قراءات ماكينات في قاعدة البيانات بعد.",
            dbHelper: "اختيار ماكينة يشغّل التنبؤ فورًا بآخر قراءاتها المسجلة.",
            machinesLoadError: "تعذر تحميل قائمة الماكينات.",
            lastUpdated: "آخر تحديث",
          }
        : {
            machineType: "Machine Type",
            run: "Run Prediction",
            running: "Processing...",
            helper: "Enter the required values and run the prediction.",
            fields: {
              air_temperature: "Air Temperature",
              process_temperature: "Process Temperature",
              rotational_speed: "Rotational Speed",
              torque: "Torque",
              tool_wear: "Tool Wear",
            },
            modeManual: "Manual Entry",
            modeDatabase: "From Database",
            selectMachine: "Select a machine",
            selectMachinePlaceholder: "-- Select a machine --",
            loadingMachines: "Loading machines...",
            noMachines: "No machine readings found in the database yet.",
            dbHelper: "Picking a machine runs the prediction immediately using its latest stored reading.",
            machinesLoadError: "Could not load the machine list.",
            lastUpdated: "Last updated",
          },
    [locale]
  );

  useEffect(() => {
    if (mode !== "database") return;

    let active = true;
    setMachinesLoading(true);
    setMachinesError("");

    getMachineReadings()
      .then((response) => {
        if (!active) return;
        setMachines(response.data?.data || []);
      })
      .catch(() => {
        if (active) setMachinesError(text.machinesLoadError);
      })
      .finally(() => {
        if (active) setMachinesLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const runPrediction = async (payload) => {
    setLoading(true);
    setError("");

    try {
      const response = await predictMaintenance(payload);
      onResult(response.data, {
        ...payload,
        air_temperature: Number(payload.air_temperature),
        process_temperature: Number(payload.process_temperature),
        rotational_speed: Number(payload.rotational_speed),
        torque: Number(payload.torque),
        tool_wear: Number(payload.tool_wear),
      });
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMachineSelect = (event) => {
    const machineId = event.target.value;
    setSelectedMachineId(machineId);
    if (!machineId) return;

    const machine = machines.find((m) => m.machine_id === machineId);
    if (!machine) return;

    // DB mode submits immediately on selection — no review step. machine_id
    // is included so the backend can log this prediction against this
    // specific machine, letting Module 3 reuse it later instead of
    // re-predicting from scratch.
    runPrediction({
      machine_id: machine.machine_id,
      type: machine.type,
      air_temperature: machine.air_temperature,
      process_temperature: machine.process_temperature,
      rotational_speed: machine.rotational_speed,
      torque: machine.torque,
      tool_wear: machine.tool_wear,
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    await runPrediction(form);
  };

  const anomalyWarnings = useMemo(() => checkAnomalies(form, locale === "ar"), [form, locale]);

  const fields = [
    ["air_temperature", "K"],
    ["process_temperature", "K"],
    ["rotational_speed", "rpm"],
    ["torque", "Nm"],
    ["tool_wear", "min"],
  ];

  return (
    <div className="prediction-form-wrap">
      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle-btn ${mode === "manual" ? "active" : ""}`}
          onClick={() => setMode("manual")}
        >
          {text.modeManual}
        </button>
        <button
          type="button"
          className={`mode-toggle-btn ${mode === "database" ? "active" : ""}`}
          onClick={() => setMode("database")}
        >
          {text.modeDatabase}
        </button>
      </div>

      {mode === "manual" ? (
        <form className="prediction-form" onSubmit={submit}>
          <div className="field-group">
            <label>{text.machineType}</label>
            <select name="type" value={form.type} onChange={handleChange} className="form-select">
              <option value="L">L</option>
              <option value="M">M</option>
              <option value="H">H</option>
            </select>
          </div>

          <div className="input-grid">
            {fields.map(([key, unit]) => (
              <label key={key} className="field-group">
                <span>{text.fields[key]}</span>
                <div className="input-wrap">
                  <input
                    type="number"
                    name={key}
                    value={form[key]}
                    onChange={handleChange}
                    required
                    className="form-input"
                  />
                  <small>{unit}</small>
                </div>
              </label>
            ))}
          </div>

          {anomalyWarnings.length > 0 && (
            <div className="anomaly-warnings">
              <div className="anomaly-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {locale === "ar" ? "قيم خارج النطاق الطبيعي للتدريب" : "Values outside training data normal range"}
              </div>
              {anomalyWarnings.map((w, i) => <p key={i} className="anomaly-item">{w}</p>)}
            </div>
          )}
          {error ? <div className="form-message error">{error}</div> : null}
          <div className="form-actions">
            <p>{text.helper}</p>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? (
                <>
                  <span className="loading-spinner"></span> {text.running}
                </>
              ) : (
                text.run
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="db-mode-panel">
          {/* Critical / high-priority machines quick-access strip */}
          {!machinesLoading && machines.length > 0 && (() => {
            const critical = machines.filter((m) => Number(m.priority) === 1 || Number(m.tool_wear) >= 140);
            if (!critical.length) return null;
            return (
              <div className="pdm-critical-strip">
                <div className="pdm-critical-header">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {locale === "ar" ? "ماكينات تحتاج انتباهاً" : "Machines needing attention"}
                </div>
                <div className="pdm-critical-chips">
                  {critical.map((m) => {
                    const wear = Number(m.tool_wear);
                    const isHigh = Number(m.priority) === 1;
                    const wearPct = Math.min(100, Math.round((wear / 253) * 100));
                    return (
                      <button
                        key={m.machine_id}
                        type="button"
                        className={`pdm-critical-chip ${isHigh ? "priority-1" : "priority-2"}`}
                        onClick={() => handleMachineSelect({ target: { value: m.machine_id } })}
                        disabled={loading}
                        title={`Wear: ${wear} min (${wearPct}%) | Priority: ${isHigh ? "High" : "Med"} | Deadline: ${m.deadline_hours}h`}
                      >
                        <span className="pdm-chip-id">{m.machine_id}</span>
                        <span className="pdm-chip-type">{m.type}</span>
                        <div className="pdm-chip-wear-track">
                          <div className="pdm-chip-wear-fill" style={{ width: `${wearPct}%` }} />
                        </div>
                        <span className="pdm-chip-wear-val">{wear}min</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <label className="field-group">
            <span>{text.selectMachine}</span>
            <select
              value={selectedMachineId}
              onChange={handleMachineSelect}
              className="form-select"
              disabled={machinesLoading || loading}
            >
              <option value="">{text.selectMachinePlaceholder}</option>
              {machines.map((machine) => (
                <option key={machine.machine_id} value={machine.machine_id}>
                  {machine.machine_id} ({machine.type}) {Number(machine.priority) === 1 ? "⚠" : ""}
                </option>
              ))}
            </select>
          </label>

          {machinesLoading && <div className="form-message">{text.loadingMachines}</div>}
          {machinesError && <div className="form-message error">{machinesError}</div>}
          {!machinesLoading && !machinesError && machines.length === 0 && (
            <div className="form-message">{text.noMachines}</div>
          )}
          {error && <div className="form-message error">{error}</div>}
          {loading && (
            <div className="form-message">
              <span className="loading-spinner"></span> {text.running}
            </div>
          )}

          <p className="db-mode-helper">{text.dbHelper}</p>
        </div>
      )}
    </div>
  );
}