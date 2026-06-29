import { useEffect, useMemo, useRef, useState } from "react";
import { predictEnergy, getLatestEnergyReadings } from "../services/api";

const HISTORY_POINTS = 32; // 8 hours at 15-minute intervals

function buildSampleHistory() {
  return Array.from({ length: HISTORY_POINTS }, () => ({
    usage_kwh: 27.51,
    lagging_reactive_kvarh: 13.09,
    leading_reactive_kvarh: 3.86,
    co2_tco2: 0.0116,
  }));
}

const fallbackDefaults = {
  timestamp: "2026-04-04T10:00",
  load_type: "Light_Load",
  history: buildSampleHistory(),
};

function normalizeDefaults(defaults) {
  // The /energy/defaults response may supply a flat sample point rather than
  // a full history array (e.g. from an older bundle). Treat anything that
  // isn't a 32-point array as a single repeated sample row instead of
  // failing outright.
  if (!defaults) return fallbackDefaults;

  if (Array.isArray(defaults.history) && defaults.history.length === HISTORY_POINTS) {
    return defaults;
  }

  const sampleRow = defaults.history?.[0] || {
    usage_kwh: 27.51,
    lagging_reactive_kvarh: 13.09,
    leading_reactive_kvarh: 3.86,
    co2_tco2: 0.0116,
  };

  return {
    timestamp: defaults.timestamp || fallbackDefaults.timestamp,
    load_type: defaults.load_type || fallbackDefaults.load_type,
    history: Array.from({ length: HISTORY_POINTS }, () => ({ ...sampleRow })),
  };
}

export default function EnergyPredictionForm({ locale, defaults, onResult }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => normalizeDefaults(defaults));
  const [showHistory, setShowHistory] = useState(false);

  const [mode, setMode] = useState("manual"); // "manual" | "database"
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState("");

  // The dashboard polls /api/energy/defaults every 12s, which hands this
  // component a brand-new `defaults` object reference each time — even when
  // the underlying values haven't changed. Previously this effect re-ran on
  // every single poll, wiping out anything the person had typed. It should
  // only seed the form once, the first time real defaults arrive (defaults
  // starts out null until that first fetch resolves), and never again.
  const hasAppliedDefaults = useRef(false);

  useEffect(() => {
    if (defaults && !hasAppliedDefaults.current) {
      setForm(normalizeDefaults(defaults));
      hasAppliedDefaults.current = true;
    }
  }, [defaults]);

  const t = useMemo(
    () =>
      locale === "ar"
        ? {
            helper:
              "أدخل آخر 8 ساعات من القراءات (32 قراءة كل 15 دقيقة) ليحسب النموذج الاتجاهات والمتوسطات المطلوبة.",
            run: "تشغيل توقع الطاقة",
            running: "جارٍ التنبؤ...",
            timestamp: "التاريخ والوقت المطلوب التوقع له",
            loadType: "نوع الحمل",
            historyToggleShow: "إظهار جدول آخر 8 ساعات",
            historyToggleHide: "إخفاء جدول آخر 8 ساعات",
            historyHelper:
              "الصف الأخير (٣٢) هو أقرب قراءة قبل لحظة التوقع. عبّئ القيم الفعلية إن وجدت.",
            colIndex: "#",
            colTimeAgo: "منذ",
            colUsage: "الاستهلاك (kWh)",
            colLagging: "القدرة التفاعلية المتأخرة",
            colLeading: "القدرة التفاعلية المتقدمة",
            colCo2: "CO2 (tCO2)",
            fillFlat: "تعبئة كل الصفوف بقيمة الصف الأول",
            loadTypes: {
              Light_Load: "حمل خفيف",
              Medium_Load: "حمل متوسط",
              Maximum_Load: "حمل أقصى",
            },
            modeManual: "إدخال يدوي",
            modeDatabase: "من قاعدة البيانات",
            dbRun: "تنبؤ من آخر 8 ساعات في قاعدة البيانات",
            dbRunning: "جارٍ التحميل والتنبؤ...",
            dbHelper:
              "يسحب هذا آخر 32 قراءة (8 ساعات) من قاعدة البيانات وينفّذ التنبؤ فورًا دون مراجعة.",
            dbNotEnoughData: (count) =>
              `توجد ${count} قراءة فقط في قاعدة البيانات، والمطلوب 32 على الأقل (8 ساعات).`,
            dbLoadError: "تعذر تحميل القراءات من قاعدة البيانات.",
          }
        : {
            helper:
              "Enter the last 8 hours of readings (32 points, 15 minutes apart) so the model can compute the lags and rolling averages it needs.",
            run: "Run Energy Forecast",
            running: "Forecasting...",
            timestamp: "Timestamp to forecast",
            loadType: "Load Type",
            historyToggleShow: "Show last-8-hours table",
            historyToggleHide: "Hide last-8-hours table",
            historyHelper:
              "Row 32 is the most recent reading right before the forecast moment. Fill in real values where you have them.",
            colIndex: "#",
            colTimeAgo: "Time ago",
            colUsage: "Usage (kWh)",
            colLagging: "Lagging Reactive (kVarh)",
            colLeading: "Leading Reactive (kVarh)",
            colCo2: "CO2 (tCO2)",
            fillFlat: "Fill all rows with row 1's values",
            loadTypes: {
              Light_Load: "Light Load",
              Medium_Load: "Medium Load",
              Maximum_Load: "Maximum Load",
            },
            modeManual: "Manual Entry",
            modeDatabase: "From Database",
            dbRun: "Predict from last 8 hours in database",
            dbRunning: "Loading and predicting...",
            dbHelper:
              "This pulls the last 32 readings (8 hours) from the database and runs the prediction immediately, with no review step.",
            dbNotEnoughData: (count) =>
              `The database only has ${count} reading(s) — at least 32 (8 hours) are needed.`,
            dbLoadError: "Could not load readings from the database.",
          },
    [locale]
  );

  const handleTopChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleHistoryChange = (index, field, value) => {
    setForm((current) => {
      const history = [...current.history];
      history[index] = { ...history[index], [field]: value };
      return { ...current, history };
    });
  };

  const fillAllFromFirstRow = () => {
    setForm((current) => {
      const first = current.history[0];
      return {
        ...current,
        history: current.history.map(() => ({ ...first })),
      };
    });
  };

  const runPrediction = async (payload) => {
    setLoading(true);
    setError("");

    try {
      const response = await predictEnergy(payload);
      onResult(response.data, payload);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Energy forecast failed");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    const payload = {
      timestamp: form.timestamp,
      load_type: form.load_type,
      history: form.history.map((point) => ({
        usage_kwh: Number(point.usage_kwh),
        lagging_reactive_kvarh: Number(point.lagging_reactive_kvarh),
        leading_reactive_kvarh: Number(point.leading_reactive_kvarh),
        co2_tco2: Number(point.co2_tco2),
      })),
    };

    await runPrediction(payload);
  };

  const runFromDatabase = async () => {
    setDbLoading(true);
    setDbError("");

    try {
      const response = await getLatestEnergyReadings(HISTORY_POINTS);
      const rows = response.data?.data || [];

      if (rows.length < HISTORY_POINTS) {
        setDbError(t.dbNotEnoughData(rows.length));
        return;
      }

      const latest = rows[rows.length - 1];

      // DB mode submits immediately — no review step. Timestamp is "now"
      // (the moment being forecast); load_type comes from the most recent
      // reading, since the live table doesn't ask the user to pick one.
      const payload = {
        timestamp: new Date().toISOString().slice(0, 16),
        load_type: latest.load_type || "Light_Load",
        history: rows.map((row) => ({
          usage_kwh: Number(row.usage_kwh),
          lagging_reactive_kvarh: Number(row.lagging_reactive_kvarh),
          leading_reactive_kvarh: Number(row.leading_reactive_kvarh),
          co2_tco2: Number(row.co2_tco2),
        })),
      };

      await runPrediction(payload);
    } catch (err) {
      setDbError(err?.response?.data?.error || err.message || t.dbLoadError);
    } finally {
      setDbLoading(false);
    }
  };

  return (
    <div className="prediction-form-wrap">
      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle-btn ${mode === "manual" ? "active" : ""}`}
          onClick={() => setMode("manual")}
        >
          {t.modeManual}
        </button>
        <button
          type="button"
          className={`mode-toggle-btn ${mode === "database" ? "active" : ""}`}
          onClick={() => setMode("database")}
        >
          {t.modeDatabase}
        </button>
      </div>

      {mode === "manual" ? (
        <form className="prediction-form energy-form" onSubmit={submit}>
      <div className="input-grid energy-top-grid">
        <label className="field-group">
          <span>{t.timestamp}</span>
          <div className="input-wrap">
            <input
              type="datetime-local"
              name="timestamp"
              value={form.timestamp}
              onChange={handleTopChange}
              required
              className="form-input"
            />
          </div>
        </label>

        <label className="field-group">
          <span>{t.loadType}</span>
          <select
            name="load_type"
            value={form.load_type}
            onChange={handleTopChange}
            className="form-select"
          >
            {Object.entries(t.loadTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        className="history-toggle-button"
        onClick={() => setShowHistory((current) => !current)}
      >
        {showHistory ? t.historyToggleHide : t.historyToggleShow}
      </button>

      {showHistory && (
        <div className="energy-history-block">
          <div className="energy-history-head">
            <p>{t.historyHelper}</p>
            <button type="button" className="fill-flat-button" onClick={fillAllFromFirstRow}>
              {t.fillFlat}
            </button>
          </div>

          <div className="energy-history-table-wrap">
            <table className="energy-history-table">
              <thead>
                <tr>
                  <th>{t.colIndex}</th>
                  <th>{t.colTimeAgo}</th>
                  <th>{t.colUsage}</th>
                  <th>{t.colLagging}</th>
                  <th>{t.colLeading}</th>
                  <th>{t.colCo2}</th>
                </tr>
              </thead>
              <tbody>
                {form.history.map((point, index) => {
                  const minutesAgo = (HISTORY_POINTS - 1 - index) * 15;
                  return (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>{minutesAgo === 0 ? "now" : `${minutesAgo}m`}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={point.usage_kwh}
                          onChange={(e) =>
                            handleHistoryChange(index, "usage_kwh", e.target.value)
                          }
                          className="form-input history-cell-input"
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={point.lagging_reactive_kvarh}
                          onChange={(e) =>
                            handleHistoryChange(index, "lagging_reactive_kvarh", e.target.value)
                          }
                          className="form-input history-cell-input"
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={point.leading_reactive_kvarh}
                          onChange={(e) =>
                            handleHistoryChange(index, "leading_reactive_kvarh", e.target.value)
                          }
                          className="form-input history-cell-input"
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={point.co2_tco2}
                          onChange={(e) =>
                            handleHistoryChange(index, "co2_tco2", e.target.value)
                          }
                          className="form-input history-cell-input"
                          required
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error ? <div className="form-message error">{error}</div> : null}

      <div className="form-actions">
        <p>{t.helper}</p>
        <button type="submit" disabled={loading} className="submit-button">
          {loading ? (
            <>
              <span className="loading-spinner"></span> {t.running}
            </>
          ) : (
            t.run
          )}
        </button>
      </div>
        </form>
      ) : (
        <div className="db-mode-panel">
          {dbError && <div className="form-message error">{dbError}</div>}

          <p className="db-mode-helper">{t.dbHelper}</p>

          <button
            type="button"
            className="submit-button"
            disabled={dbLoading}
            onClick={runFromDatabase}
          >
            {dbLoading ? (
              <>
                <span className="loading-spinner"></span> {t.dbRunning}
              </>
            ) : (
              t.dbRun
            )}
          </button>
        </div>
      )}
    </div>
  );
}