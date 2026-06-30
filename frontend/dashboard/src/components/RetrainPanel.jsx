import { useRef, useState } from "react";
import { retrainModel } from "../services/api";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: "CSV must have a header row and at least one data row" };
  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const required = ["Type", "Air_temperature_K", "Process_temperature_K", "Rotational_speed_rpm", "Torque_Nm", "Tool_wear_min", "Machine_failure"];
  const missing = required.filter((f) => !header.includes(f));
  if (missing.length) return { error: `Missing columns: ${missing.join(", ")}` };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
    const obj = {};
    header.forEach((h, idx) => (obj[h] = vals[idx] ?? ""));
    rows.push({
      Type: obj.Type,
      Air_temperature_K: parseFloat(obj.Air_temperature_K),
      Process_temperature_K: parseFloat(obj.Process_temperature_K),
      Rotational_speed_rpm: parseInt(obj.Rotational_speed_rpm, 10),
      Torque_Nm: parseFloat(obj.Torque_Nm),
      Tool_wear_min: parseInt(obj.Tool_wear_min, 10),
      Machine_failure: parseInt(obj.Machine_failure, 10),
    });
  }
  return { rows };
}

export default function RetrainPanel({ locale }) {
  const isRtl = locale === "ar";
  const fileRef = useRef();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [parseError, setParseError] = useState("");
  const [training, setTraining] = useState(false);
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState("");
  const [deploying, setDeploying] = useState(false);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setParseError("");
    setResult(null);
    setRunError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      if (parsed.error) {
        setParseError(parsed.error);
        setRows(null);
      } else {
        setRows(parsed.rows);
      }
    };
    reader.readAsText(file);
  }

  async function handleTrain(deploy = false) {
    if (!rows) return;
    deploy ? setDeploying(true) : setTraining(true);
    setRunError("");
    try {
      const res = await retrainModel(rows, deploy);
      setResult({ ...res.data.data, deploy });
    } catch (err) {
      setRunError(err.response?.data?.detail || err.response?.data?.error || (isRtl ? "فشل إعادة التدريب" : "Retraining failed"));
    } finally {
      setTraining(false);
      setDeploying(false);
    }
  }

  const SAMPLE_CSV = `Type,Air_temperature_K,Process_temperature_K,Rotational_speed_rpm,Torque_Nm,Tool_wear_min,Machine_failure
M,298.1,308.6,1551,42.8,0,0
L,298.2,308.7,1408,46.3,3,0
H,298.1,308.5,1498,49.4,5,1`;

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "retrain_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="retrain-wrap">
      <div className="retrain-header">
        <div>
          <h3>{isRtl ? "إعادة تدريب النموذج" : "Model Retraining"}</h3>
          <p>{isRtl ? "قم بتحميل بيانات مُسمَّاة لتدريب نموذج تنبؤ جديد." : "Upload labeled sensor data to train a new prediction model."}</p>
        </div>
        <button type="button" className="retrain-sample-btn" onClick={downloadSample}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {isRtl ? "تنزيل القالب" : "Download Template"}
        </button>
      </div>

      <div className="retrain-drop-zone" onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p>{fileName || (isRtl ? "انقر لاختيار ملف CSV مُسمَّى" : "Click to select labeled CSV file")}</p>
        {rows && (
          <span className="retrain-row-count">
            {rows.length} {isRtl ? "صف بيانات" : "data rows"} &mdash; {rows.filter((r) => r.Machine_failure === 1).length} {isRtl ? "عطل" : "failures"}
          </span>
        )}
      </div>

      {parseError && <div className="form-message error">{parseError}</div>}

      <div className="retrain-required-note">
        <strong>{isRtl ? "الأعمدة المطلوبة:" : "Required columns:"}</strong>{" "}
        Type, Air_temperature_K, Process_temperature_K, Rotational_speed_rpm, Torque_Nm, Tool_wear_min, Machine_failure
        <br />
        <em>{isRtl ? "الحد الأدنى: 50 صف. قيم Machine_failure: 0 أو 1." : "Minimum: 50 rows. Machine_failure values: 0 or 1."}</em>
      </div>

      <div className="retrain-actions">
        <button
          type="button"
          className="retrain-run-btn"
          onClick={() => handleTrain(false)}
          disabled={!rows || rows.length < 50 || training || deploying}
        >
          {training ? <><span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {isRtl ? "جارٍ التدريب…" : "Training…"}</> : (isRtl ? "تشغيل التدريب (بدون نشر)" : "Train Only (No Deploy)")}
        </button>
      </div>

      {runError && <div className="form-message error">{runError}</div>}

      {result && (
        <div className="retrain-results">
          <div className="retrain-results-head">
            <strong>{isRtl ? "نتائج التدريب" : "Training Results"}</strong>
            {result.deploy && (
              <span className="retrain-deployed-badge">{isRtl ? "تم النشر" : "Deployed"}</span>
            )}
          </div>
          <div className="retrain-metrics">
            {[
              { label: isRtl ? "الدقة" : "Accuracy", value: `${(result.accuracy * 100).toFixed(1)}%`, good: result.accuracy >= 0.8 },
              { label: isRtl ? "درجة F1" : "F1 Score", value: `${(result.f1_score * 100).toFixed(1)}%`, good: result.f1_score >= 0.6 },
              { label: isRtl ? "معدل الأعطال" : "Failure Rate", value: `${result.failure_rate_pct}%`, good: null },
              { label: isRtl ? "صفوف التدريب" : "Train Rows", value: result.train_size, good: null },
              { label: isRtl ? "صفوف الاختبار" : "Test Rows", value: result.test_size, good: null },
            ].map((m) => (
              <div key={m.label} className="retrain-metric-card">
                <span className="retrain-metric-label">{m.label}</span>
                <strong
                  className="retrain-metric-value"
                  style={{ color: m.good === null ? "var(--primary)" : m.good ? "var(--teal)" : "var(--rose)" }}
                >
                  {m.value}
                </strong>
              </div>
            ))}
          </div>

          {!result.deploy && (
            <div className="retrain-deploy-section">
              <p>{isRtl ? "هل تريد تطبيق هذا النموذج على الإنتاج؟" : "Satisfied with the results? Deploy to replace the production model."}</p>
              <button
                type="button"
                className="retrain-deploy-btn"
                onClick={() => handleTrain(true)}
                disabled={deploying}
              >
                {deploying ? <><span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {isRtl ? "جارٍ النشر…" : "Deploying…"}</> : (isRtl ? "نشر إلى الإنتاج" : "Deploy to Production")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
