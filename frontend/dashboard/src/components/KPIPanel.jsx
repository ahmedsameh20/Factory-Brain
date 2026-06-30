import { useEffect, useState } from "react";
import { getKPI } from "../services/api";

function SparkBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="spark-bar-track">
      <div className="spark-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function DailyActivityChart({ data, isRtl }) {
  if (!data || data.length === 0) return (
    <div className="chart-empty" style={{ fontSize: "0.82rem" }}>
      {isRtl ? "لا توجد بيانات لآخر 7 أيام" : "No data for the last 7 days"}
    </div>
  );

  const maxPreds = Math.max(...data.map((d) => Number(d.predictions)), 1);

  return (
    <div className="kpi-daily-chart">
      {data.map((d) => {
        const preds = Number(d.predictions);
        const failures = Number(d.failures);
        const pct = (preds / maxPreds) * 100;
        const failPct = preds > 0 ? (failures / preds) * 100 : 0;
        const label = new Date(d.date).toLocaleDateString(isRtl ? "ar-EG" : "en-US", { month: "short", day: "numeric" });
        return (
          <div key={d.date} className="kpi-daily-col" title={`${preds} predictions, ${failures} failures`}>
            <div className="kpi-daily-bar-wrap">
              <div className="kpi-daily-bar" style={{ height: `${Math.max(4, pct)}%` }}>
                {failures > 0 && (
                  <div className="kpi-daily-fail-overlay" style={{ height: `${failPct}%` }} />
                )}
              </div>
            </div>
            <span className="kpi-daily-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function KPIPanel({ locale }) {
  const isRtl = locale === "ar";
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getKPI()
      .then((res) => setKpi(res.data?.data || null))
      .catch(() => setError(isRtl ? "تعذر تحميل مؤشرات الأداء" : "Failed to load KPIs"))
      .finally(() => setLoading(false));
  }, [isRtl]);

  if (loading) return (
    <div className="schedule-loading" style={{ padding: 20 }}>
      <span className="loading-spinner" />
      {isRtl ? "جارٍ تحميل مؤشرات الأداء…" : "Loading KPIs…"}
    </div>
  );

  if (error) return <div className="form-message error">{error}</div>;
  if (!kpi) return null;

  const cards = [
    {
      label: isRtl ? "إجمالي التنبؤات" : "Total Predictions",
      value: kpi.totalPredictions.toLocaleString(),
      sub: isRtl ? "صيانة + طاقة" : "Maintenance + Energy",
      color: "var(--primary)",
      bg: "var(--primary-soft)",
    },
    {
      label: isRtl ? "معدل الأعطال" : "Failure Rate",
      value: `${kpi.failureRate}%`,
      sub: `${kpi.failureCount} ${isRtl ? "عطل" : "failures"} / ${kpi.totalPredictions} ${isRtl ? "تنبؤ" : "total"}`,
      color: kpi.failureRate > 20 ? "var(--rose)" : kpi.failureRate > 10 ? "var(--amber)" : "var(--teal)",
      bg: kpi.failureRate > 20 ? "var(--rose-soft)" : kpi.failureRate > 10 ? "var(--amber-soft)" : "var(--teal-soft)",
    },
    {
      label: isRtl ? "متوسط الوقت بين الأعطال" : "MTBF Estimate",
      value: kpi.mtbfHours != null ? `${kpi.mtbfHours}h` : "—",
      sub: isRtl ? "ساعات بين الأعطال" : "Hours between failures",
      color: "var(--violet)",
      bg: "var(--violet-soft)",
    },
    {
      label: isRtl ? "كفاءة الطاقة" : "Energy Efficiency",
      value: kpi.energyAvgEfficiency != null ? `${kpi.energyAvgEfficiency}%` : "—",
      sub: `${kpi.energyCriticalEvents} ${isRtl ? "حدث حرج" : "critical events"}`,
      color: kpi.energyAvgEfficiency < 70 ? "var(--rose)" : kpi.energyAvgEfficiency < 85 ? "var(--amber)" : "var(--teal)",
      bg: kpi.energyAvgEfficiency < 70 ? "var(--rose-soft)" : kpi.energyAvgEfficiency < 85 ? "var(--amber-soft)" : "var(--teal-soft)",
    },
    {
      label: isRtl ? "متوسط استهلاك الطاقة" : "Avg Energy Usage",
      value: kpi.energyAvgKwh != null ? `${kpi.energyAvgKwh}` : "—",
      sub: "kWh",
      color: "var(--primary)",
      bg: "var(--primary-soft)",
    },
    {
      label: isRtl ? "تنبؤات الطاقة" : "Energy Predictions",
      value: kpi.totalEnergyPredictions.toLocaleString(),
      sub: isRtl ? "إجمالي دورات التنبؤ" : "Total forecast cycles",
      color: "var(--teal)",
      bg: "var(--teal-soft)",
    },
  ];

  return (
    <div className="kpi-wrap">
      <div className="kpi-grid">
        {cards.map((card) => (
          <div key={card.label} className="kpi-card" style={{ background: card.bg, borderColor: card.color + "30" }}>
            <span className="kpi-label">{card.label}</span>
            <strong className="kpi-value" style={{ color: card.color }}>{card.value}</strong>
            <span className="kpi-sub">{card.sub}</span>
            {card.label.includes("Failure") || card.label.includes("أعطال") ? (
              <SparkBar value={kpi.failureRate} max={100} color={card.color} />
            ) : null}
          </div>
        ))}
      </div>

      <div className="kpi-daily-wrap">
        <div className="chart-head">
          <h3>{isRtl ? "نشاط آخر 7 أيام" : "Last 7 Days Activity"}</h3>
          <p>{isRtl ? "الأشرطة الرمادية = التنبؤات، الأحمر = الأعطال" : "Grey bars = predictions, red overlay = failures"}</p>
        </div>
        <DailyActivityChart data={kpi.dailyActivity} isRtl={isRtl} />
      </div>
    </div>
  );
}
