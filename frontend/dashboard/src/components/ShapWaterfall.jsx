const labels = {
  en: {
    title: "SHAP Waterfall — Why This Machine Was Scheduled",
    subtitle: (machineId, day) =>
      `Cumulative effect of each factor on ${machineId}'s failure risk score, leading to its Day ${day} maintenance slot`,
    unavailable: "No SHAP explanation available for the top-risk scheduled machine.",
    running: "Running total",
  },
  ar: {
    title: "مخطط SHAP التراكمي — سبب جدولة هذه الماكينة",
    subtitle: (machineId, day) =>
      `التأثير التراكمي لكل عامل على درجة خطر العطل للماكينة ${machineId}، المؤدي إلى جدولتها في اليوم ${day}`,
    unavailable: "لا يوجد تفسير SHAP متاح للماكينة الأعلى خطورة المجدولة.",
    running: "الإجمالي التراكمي",
  },
};

/**
 * Waterfall view of a SHAP explanation: each bar starts where the previous
 * one ended, so the chart reads as a running total building up the failure
 * score one feature at a time — ranked by |contribution|, same ordering the
 * ML service already returns. Built from the same `shap_explanation` payload
 * as <ShapExplanation>, just laid out cumulatively instead of as ranked bars.
 */
export default function ShapWaterfall({ locale, machineId, day, explanation }) {
  const t = labels[locale];

  if (!explanation || explanation.length === 0) {
    return (
      <div className="shap-card waterfall-card">
        <div className="shap-head">
          <h4>{t.title}</h4>
        </div>
        <p className="shap-empty">{t.unavailable}</p>
      </div>
    );
  }

  let running = 0;
  const steps = explanation.map((item) => {
    const start = running;
    running += item.contribution;
    return { ...item, start, end: running };
  });

  const allValues = steps.flatMap((s) => [s.start, s.end]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(0, ...allValues);
  const span = maxVal - minVal || 1;

  const toPct = (value) => ((value - minVal) / span) * 100;

  return (
    <div className="shap-card waterfall-card">
      <div className="shap-head">
        <h4>{t.title}</h4>
        <p>{t.subtitle(machineId, day)}</p>
      </div>

      <ul className="waterfall-list">
        {steps.map((step, i) => {
          const isUp = step.contribution >= 0;
          const left = Math.min(toPct(step.start), toPct(step.end));
          const widthPct = Math.abs(toPct(step.end) - toPct(step.start));

          return (
            <li key={i} className="waterfall-row">
              <span className="waterfall-feature-name">{step.feature}</span>
              <div className="waterfall-track">
                <div
                  className="waterfall-zero-line"
                  style={{ left: `${toPct(0)}%` }}
                />
                <div
                  className={`waterfall-bar ${isUp ? "up" : "down"}`}
                  style={{ left: `${left}%`, width: `${widthPct}%` }}
                />
              </div>
              <span className={`waterfall-value ${isUp ? "up" : "down"}`}>
                {step.contribution >= 0 ? "+" : ""}
                {step.contribution.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="waterfall-total">
        {t.running}: <strong>{running.toFixed(3)}</strong>
      </div>
    </div>
  );
}
