import { useEffect, useState } from "react";
import { getFleetHealth } from "../services/api";

function riskColor(prob) {
  if (prob == null) return { bg: "var(--surface-soft)", text: "var(--muted)" };
  if (prob >= 0.8) return { bg: "#fef2f2", text: "var(--rose)" };
  if (prob >= 0.5) return { bg: "#fffbeb", text: "var(--amber)" };
  if (prob >= 0.2) return { bg: "#f0f9f7", text: "var(--teal)" };
  return { bg: "#f3f6fa", text: "var(--primary)" };
}

function riskLabel(prob, isRtl) {
  if (prob == null) return isRtl ? "غير معروف" : "Unknown";
  if (prob >= 0.8) return isRtl ? "حرج" : "Critical";
  if (prob >= 0.5) return isRtl ? "خطر" : "At Risk";
  if (prob >= 0.2) return isRtl ? "تحت المراقبة" : "Monitor";
  return isRtl ? "سليم" : "Healthy";
}

function FleetSummaryBar({ fleet, isRtl }) {
  const total = fleet.length;
  const critical = fleet.filter((m) => (m.fail_prob ?? 0) >= 0.8).length;
  const atRisk = fleet.filter((m) => (m.fail_prob ?? 0) >= 0.5 && (m.fail_prob ?? 0) < 0.8).length;
  const monitor = fleet.filter((m) => (m.fail_prob ?? 0) >= 0.2 && (m.fail_prob ?? 0) < 0.5).length;
  const healthy = fleet.filter((m) => (m.fail_prob ?? 1) < 0.2).length;

  const segments = [
    { label: isRtl ? "حرج" : "Critical", count: critical, color: "var(--rose)" },
    { label: isRtl ? "خطر" : "At Risk", count: atRisk, color: "var(--amber)" },
    { label: isRtl ? "مراقبة" : "Monitor", count: monitor, color: "#5a9fa0" },
    { label: isRtl ? "سليم" : "Healthy", count: healthy, color: "var(--teal)" },
  ];

  return (
    <div className="fleet-summary-bar">
      {segments.map((s) => (
        <div key={s.label} className="fleet-summary-seg">
          <span className="fleet-summary-dot" style={{ background: s.color }} />
          <span className="fleet-summary-count" style={{ color: s.color }}>{s.count}</span>
          <span className="fleet-summary-label">{s.label}</span>
        </div>
      ))}
      <span className="fleet-summary-total">{total} {isRtl ? "ماكينة" : "machines"}</span>
    </div>
  );
}

export default function FleetHealth({ locale }) {
  const isRtl = locale === "ar";
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    getFleetHealth()
      .then((res) => setFleet(res.data?.data || []))
      .catch(() => setError(isRtl ? "تعذر تحميل بيانات الأسطول" : "Failed to load fleet data"))
      .finally(() => setLoading(false));
  }, [isRtl]);

  const filtered = fleet.filter((m) => {
    const p = m.fail_prob ?? 0;
    if (filter === "critical") return p >= 0.8;
    if (filter === "atrisk") return p >= 0.5 && p < 0.8;
    if (filter === "healthy") return p < 0.2;
    return true;
  });

  if (loading) return (
    <div className="schedule-loading">
      <span className="loading-spinner" />
      {isRtl ? "جارٍ تحميل بيانات الأسطول…" : "Loading fleet data…"}
    </div>
  );

  if (error) return <div className="form-message error">{error}</div>;

  if (fleet.length === 0) return (
    <div className="chart-empty">
      {isRtl ? "لا توجد ماكينات في قاعدة البيانات بعد." : "No machines in the database yet. Add machines via the machine-readings API."}
    </div>
  );

  return (
    <div className="fleet-wrap">
      <div className="fleet-controls">
        <FleetSummaryBar fleet={fleet} isRtl={isRtl} />
        <div className="schedule-filters">
          {[
            ["all", isRtl ? "الكل" : "All"],
            ["critical", isRtl ? "حرج" : "Critical"],
            ["atrisk", isRtl ? "خطر" : "At Risk"],
            ["healthy", isRtl ? "سليم" : "Healthy"],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`schedule-filter-chip ${filter === val ? "active" : ""}`}
              onClick={() => setFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="fleet-grid">
        {filtered.map((m) => {
          const colors = riskColor(m.fail_prob);
          const pct = m.fail_prob != null ? Math.round(m.fail_prob * 100) : null;
          return (
            <div
              key={m.machine_id}
              className="fleet-card"
              style={{ borderColor: colors.text + "44", background: colors.bg }}
            >
              <div className="fleet-card-head">
                <span className="fleet-machine-id">{m.machine_id}</span>
                <span className="fleet-type-badge">{m.type}</span>
              </div>

              <div className="fleet-prob-row">
                <div className="fleet-prob-bar-track">
                  <div
                    className="fleet-prob-bar-fill"
                    style={{
                      width: `${pct ?? 0}%`,
                      background: colors.text,
                    }}
                  />
                </div>
                <span className="fleet-prob-value" style={{ color: colors.text }}>
                  {pct != null ? `${pct}%` : "—"}
                </span>
              </div>

              <div className="fleet-risk-label" style={{ color: colors.text }}>
                {riskLabel(m.fail_prob, isRtl)}
              </div>

              <div className="fleet-meta">
                <span>
                  {isRtl ? "أول:" : "P:"}{" "}
                  <strong>{m.priority === 1 ? (isRtl ? "عالية" : "High") : m.priority === 2 ? (isRtl ? "متوسطة" : "Med") : (isRtl ? "منخفضة" : "Low")}</strong>
                </span>
                <span>
                  {isRtl ? "موعد:" : "DL:"} <strong>{m.deadline_hours}h</strong>
                </span>
              </div>

              {m.last_predicted && (
                <div className="fleet-last-pred">
                  {new Date(m.last_predicted).toLocaleString(isRtl ? "ar-EG" : "en-US", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
