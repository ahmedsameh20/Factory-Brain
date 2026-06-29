import ShapExplanation from "./ShapExplanation";

const labels = {
  en: {
    title: "Energy Optimization Output",
    empty: "No energy prediction yet",
    predictedUsage: "Predicted Usage",
    efficiency: "Efficiency Score",
    peak: "Peak Window",
    yes: "Yes",
    no: "No",
    recommendations: "Optimization Recommendations",
  },
  ar: {
    title: "نتيجة تحسين الطاقة",
    empty: "لا توجد نتيجة طاقة بعد",
    predictedUsage: "الاستهلاك المتوقع",
    efficiency: "مؤشر الكفاءة",
    peak: "ساعة ذروة",
    yes: "نعم",
    no: "لا",
    recommendations: "توصيات التحسين",
  },
};

export default function EnergyResultCard({ locale, result }) {
  const t = labels[locale];

  if (!result) {
    return (
      <div className="result-card empty">
        <h3>{t.title}</h3>
        <p>{t.empty}</p>
      </div>
    );
  }

  return (
    <div className="result-card energy-result-card">
      <div className="result-header">
        <div>
          <h3>{t.title}</h3>
          <p>{result.modelName}</p>
        </div>
        <div className={`result-status ${result.status === "CRITICAL" ? "danger" : "safe"}`}>
          {result.status}
        </div>
      </div>

      <div className="result-grid energy-result-grid">
        <div className="result-item safe">
          <span>{t.predictedUsage}</span>
          <strong>{result.predictedUsageKWh} kWh</strong>
        </div>
        <div className="result-item safe">
          <span>{t.efficiency}</span>
          <strong>{result.efficiencyScore}</strong>
        </div>
        <div className={`result-item ${result.peakWindow ? "danger" : "safe"}`}>
          <span>{t.peak}</span>
          <strong>{result.peakWindow ? t.yes : t.no}</strong>
        </div>
      </div>

      <div className="recommendations-box">
        <span className="recommendations-title">{t.recommendations}</span>
        <ul className="recommendations-list">
          {(result.recommendations || []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <ShapExplanation locale={locale} explanation={result.shapExplanation} kind="energy" />
    </div>
  );
}