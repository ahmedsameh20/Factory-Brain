import ShapExplanation from "./ShapExplanation";

const labels = {
  en: {
    title: "Prediction Result",
    waiting: "No result yet",
    overall: "Overall Status",
    machine: "Machine Failure",
    twf: "Tool Wear Failure",
    hdf: "Heat Dissipation Failure",
    pwf: "Power Failure",
    osf: "Overstrain Failure",
    rnf: "Random Failure",
    alert: "Alert",
    clear: "Clear",
  },
  ar: {
    title: "نتيجة التنبؤ",
    waiting: "لا توجد نتيجة بعد",
    overall: "الحالة العامة",
    machine: "فشل الماكينة",
    twf: "فشل تآكل الأداة",
    hdf: "فشل تبديد الحرارة",
    pwf: "فشل الطاقة",
    osf: "فشل الإجهاد الزائد",
    rnf: "فشل عشوائي",
    alert: "خطر",
    clear: "سليم",
  },
};

export default function ResultCard({ locale, result }) {
  const t = labels[locale];

  if (!result) {
    return (
      <div className="result-card empty">
        <h3>{t.title}</h3>
        <p>{t.waiting}</p>
      </div>
    );
  }

  return (
    <div className="result-card">
      {result.heuristic && (
        <div className="anomaly-warnings" style={{ marginBottom: "12px" }}>
          <div className="anomaly-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {locale === "ar" ? "خدمة الذكاء الاصطناعي غير متاحة — نتيجة تقريبية بناءً على تآكل الأداة" : "ML service offline — result estimated from tool wear only"}
          </div>
        </div>
      )}
      <div className="result-header">
        <div>
          <h3>{t.title}</h3>
          <p>{t.waiting === "No result yet" ? "Latest machine evaluation details." : "تفاصيل آخر تقييم تم تنفيذه."}</p>
        </div>
        <div className={`result-status ${result.status === "FAILURE" ? "danger" : "safe"}`}>
          {t.overall}: {result.status}
        </div>
      </div>

      <div className="result-grid">
        {Object.entries(result.failures).map(([key, value]) => (
          <div key={key} className={`result-item ${value ? "danger" : "safe"}`}>
            <span>{t[key]}</span>
            <strong>{value ? t.alert : t.clear}</strong>
          </div>
        ))}
      </div>

      <ShapExplanation locale={locale} explanation={result.shapExplanation} kind="failure" />
    </div>
  );
}