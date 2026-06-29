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