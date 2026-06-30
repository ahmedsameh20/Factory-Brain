import { useRef, useState } from "react";
import { predictBatch } from "../services/api";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i]?.trim() ?? "";
    });
    return obj;
  });
}

function downloadCSV(results) {
  const headers = ["Row", "Machine ID", "Type", "Status", "Fail Prob %", "TWF", "HDF", "PWF", "OSF", "RNF", "Error"];
  const rows = results.map((r) => [
    r.row,
    r.machine_id,
    r.type || "",
    r.status || "",
    r.failureProbability != null ? (r.failureProbability * 100).toFixed(1) : "",
    r.failures?.twf ? "Y" : r.error ? "" : "N",
    r.failures?.hdf ? "Y" : r.error ? "" : "N",
    r.failures?.pwf ? "Y" : r.error ? "" : "N",
    r.failures?.osf ? "Y" : r.error ? "" : "N",
    r.failures?.rnf ? "Y" : r.error ? "" : "N",
    r.error || "",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `batch-results-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BatchPrediction({ locale }) {
  const isRtl = locale === "ar";
  const fileRef = useRef();
  const [fileName, setFileName] = useState("");
  const [machines, setMachines] = useState([]);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result);
        if (parsed.length === 0) {
          setError(isRtl ? "الملف فارغ أو غير صالح" : "File is empty or invalid");
          return;
        }
        setMachines(parsed);
      } catch {
        setError(isRtl ? "فشل تحليل الملف" : "Failed to parse CSV file");
      }
    };
    reader.readAsText(file);
  }

  async function handleRun() {
    if (!machines.length) return;
    setRunning(true);
    setError("");
    try {
      const res = await predictBatch(machines);
      setResults(res.data.results);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Batch prediction failed");
    } finally {
      setRunning(false);
    }
  }

  const failCount = results?.filter((r) => r.status === "FAILURE").length ?? 0;
  const errCount = results?.filter((r) => r.error).length ?? 0;

  return (
    <div className="batch-panel">
      <div className="batch-top">
        <div
          className={`batch-drop-zone ${machines.length ? "has-file" : ""}`}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="batch-drop-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="batch-drop-label">
            {fileName
              ? fileName
              : isRtl ? "انقر لاختيار ملف CSV" : "Click to select a CSV file"}
          </span>
          <small className="batch-drop-hint">
            {isRtl
              ? "أعمدة: machine_id, type, air_temperature, process_temperature, rotational_speed, torque, tool_wear"
              : "Columns: machine_id, type, air_temperature, process_temperature, rotational_speed, torque, tool_wear"}
          </small>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFile} />
        </div>

        <div className="batch-actions">
          {machines.length > 0 && (
            <div className="batch-count-pill">
              {machines.length} {isRtl ? "ماكينة" : "machines"}
            </div>
          )}
          <button
            type="button"
            className="batch-run-btn"
            onClick={handleRun}
            disabled={!machines.length || running}
          >
            {running ? (
              <><span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> {isRtl ? "جارٍ التشغيل…" : "Running…"}</>
            ) : (
              isRtl ? "تشغيل الكل" : "Run All"
            )}
          </button>
          {results && (
            <button type="button" className="batch-export-btn" onClick={() => downloadCSV(results)}>
              {isRtl ? "تصدير CSV" : "Export CSV"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="form-message error">{error}</div>}

      {results && (
        <div className="batch-results-wrap">
          <div className="batch-results-head">
            <strong>{isRtl ? "نتائج الدفعة" : "Batch Results"}</strong>
            <div className="batch-pills">
              <span className={`batch-status-pill ${failCount > 0 ? "danger" : "safe"}`}>
                {failCount} {isRtl ? "عطل" : "failure"}{failCount !== 1 && !isRtl ? "s" : ""}
              </span>
              {errCount > 0 && (
                <span className="batch-status-pill warn">
                  {errCount} {isRtl ? "خطأ" : "error"}{errCount !== 1 && !isRtl ? "s" : ""}
                </span>
              )}
              <span className="batch-status-pill safe">
                {results.length - failCount - errCount} {isRtl ? "سليم" : "normal"}
              </span>
            </div>
          </div>

          <div className="schedule-table-wrap batch-table-wrap">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{isRtl ? "المعرف" : "Machine ID"}</th>
                  <th>{isRtl ? "النوع" : "Type"}</th>
                  <th>{isRtl ? "الحالة" : "Status"}</th>
                  <th>{isRtl ? "احتمالية الفشل" : "Fail Prob"}</th>
                  <th>TWF</th>
                  <th>HDF</th>
                  <th>PWF</th>
                  <th>OSF</th>
                  <th>RNF</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row} className={`schedule-row ${r.error ? "" : r.status === "FAILURE" ? "action-deferred" : "action-maintain"}`}>
                    <td style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{r.row}</td>
                    <td className="schedule-machine">{r.machine_id}</td>
                    <td>{r.type || "—"}</td>
                    <td>
                      {r.error ? (
                        <span className="action-badge deferred" title={r.error}>ERR</span>
                      ) : (
                        <span className={`action-badge ${r.status === "FAILURE" ? "deferred" : "maintain"}`}>
                          {r.status}
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {r.failureProbability != null
                        ? `${(r.failureProbability * 100).toFixed(1)}%`
                        : r.error ? <span style={{ color: "var(--rose)", fontSize: "0.8rem" }}>{r.error}</span> : "—"}
                    </td>
                    {["twf", "hdf", "pwf", "osf", "rnf"].map((f) => (
                      <td key={f} style={{ color: r.failures?.[f] ? "var(--rose)" : "var(--teal)", fontWeight: 700, fontSize: "0.88rem" }}>
                        {r.failures ? (r.failures[f] ? "✕" : "✓") : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
