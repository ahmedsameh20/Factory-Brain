const labels = {
  en: {
    title: "Why this result",
    subtitle: "Top factors the model weighed, ranked by influence",
    increases: "pushes toward failure",
    increasesEnergy: "pushes usage up",
    decreases: "pushes toward normal",
    decreasesEnergy: "pushes usage down",
    unavailable: "Explanation unavailable for this prediction.",
  },
  ar: {
    title: "سبب هذه النتيجة",
    subtitle: "أهم العوامل التي أثرت في القرار، مرتبة حسب التأثير",
    increases: "يزيد من احتمال العطل",
    increasesEnergy: "يرفع الاستهلاك",
    decreases: "يقلل من احتمال العطل",
    decreasesEnergy: "يقلل الاستهلاك",
    unavailable: "التفسير غير متوفر لهذا التنبؤ.",
  },
};

/**
 * Renders a ranked list of SHAP feature contributions as horizontal bars —
 * real SHAP values from the ML service (TreeExplainer for tree models, a
 * closed-form linear equivalent for the two Logistic Regression models),
 * not a cosmetic placeholder. `kind` controls wording only ("failure" vs
 * "energy" framing); the data itself is identical either way.
 */
export default function ShapExplanation({ locale, explanation, kind = "failure" }) {
  const t = labels[locale];

  if (!explanation || explanation.length === 0) {
    return (
      <div className="shap-card">
        <div className="shap-head">
          <h4>{t.title}</h4>
        </div>
        <p className="shap-empty">{t.unavailable}</p>
      </div>
    );
  }

  const maxAbs = Math.max(...explanation.map((e) => Math.abs(e.contribution)), 1e-9);

  return (
    <div className="shap-card">
      <div className="shap-head">
        <h4>{t.title}</h4>
        <p>{t.subtitle}</p>
      </div>

      <ul className="shap-list">
        {explanation.map((item, i) => {
          const pct = Math.min(100, (Math.abs(item.contribution) / maxAbs) * 100);
          const isUp = item.direction === "increases";
          const directionLabel = isUp
            ? kind === "energy" ? t.increasesEnergy : t.increases
            : kind === "energy" ? t.decreasesEnergy : t.decreases;

          return (
            <li key={i} className="shap-row">
              <span className="shap-feature-name">{item.feature}</span>
              <div className="shap-bar-track">
                <div
                  className={`shap-bar-fill ${isUp ? "up" : "down"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`shap-direction ${isUp ? "up" : "down"}`}>
                {directionLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}