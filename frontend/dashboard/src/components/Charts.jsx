const labels = {
  en: {
    healthTitle: "Machine Health Mix",
    healthSub: "Share of all monitored machines",
    healthy: "Healthy",
    atRisk: "At Risk",
    critical: "Critical",
    failureTitle: "Failure Modes Detected",
    failureSub: "Count of each failure type across all runs",
    trendTitle: "Energy Usage Trend",
    trendSub: "Predicted usage (kWh) over recent operations",
    activityTitle: "Module Activity Over Time",
    activitySub: "Cumulative runs logged by each model, in the order they happened",
    maintenanceLine: "Maintenance",
    energyLine: "Energy",
    convergenceTitle: "Scheduling Cost Convergence",
    convergenceSub: "Simulated annealing's best cost found, as it searches for a lower-cost schedule",
    initialCost: "Initial cost",
    bestCost: "Best cost found",
    reduction: "Reduction",
    noData: "Not enough data yet — run a few predictions to see this chart.",
    machine: "Machine",
    twf: "Tool Wear",
    hdf: "Heat Diss.",
    pwf: "Power",
    osf: "Overstrain",
    rnf: "Random",
  },
  ar: {
    healthTitle: "توزيع حالة الماكينات",
    healthSub: "نسبة كل حالة من إجمالي الماكينات المراقبة",
    healthy: "سليمة",
    atRisk: "في خطر",
    critical: "حرجة",
    failureTitle: "أنواع الأعطال المكتشفة",
    failureSub: "عدد كل نوع عطل في كل العمليات",
    trendTitle: "اتجاه استهلاك الطاقة",
    trendSub: "الاستهلاك المتوقع (كيلوواط/ساعة) في آخر العمليات",
    activityTitle: "نشاط الموديلات عبر الزمن",
    activitySub: "العمليات التراكمية لكل موديل بترتيب حدوثها الفعلي",
    maintenanceLine: "الصيانة",
    energyLine: "الطاقة",
    convergenceTitle: "تقارب تكلفة الجدولة",
    convergenceSub: "أفضل تكلفة وجدها التلدين المحاكى أثناء البحث عن جدول أقل تكلفة",
    initialCost: "التكلفة الابتدائية",
    bestCost: "أفضل تكلفة",
    reduction: "نسبة الانخفاض",
    noData: "لا توجد بيانات كافية بعد \u2014 نفّذ بعض التنبؤات لرؤية هذا الرسم.",
    machine: "الماكينة",
    twf: "تآكل الأداة",
    hdf: "تبديد الحرارة",
    pwf: "الطاقة",
    osf: "الإجهاد",
    rnf: "عشوائي",
  },
};

/* ---------- Donut chart: machine health mix ---------- */
export function HealthDonut({ locale, machineHealth }) {
  const t = labels[locale];
  const healthy = machineHealth?.healthy || 0;
  const atRisk = machineHealth?.atRisk || 0;
  const critical = machineHealth?.critical || 0;
  const total = healthy + atRisk + critical;

  const segments = [
    { value: healthy, color: "var(--teal)", label: t.healthy },
    { value: atRisk, color: "var(--amber)", label: t.atRisk },
    { value: critical, color: "var(--rose)", label: t.critical },
  ];

  const size = 150;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offsetAccum = 0;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>{t.healthTitle}</h3>
        <p>{t.healthSub}</p>
      </div>

      {total === 0 ? (
        <div className="chart-empty">{t.noData}</div>
      ) : (
        <div className="donut-row">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--line)"
              strokeWidth={stroke}
            />
            {segments.map((seg, i) => {
              const frac = seg.value / total;
              const dash = frac * circumference;
              const gap = circumference - dash;
              const rotation = (offsetAccum / total) * 360 - 90;
              offsetAccum += seg.value;
              if (frac === 0) return null;
              return (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
                  strokeLinecap="butt"
                />
              );
            })}
            <text
              x={size / 2}
              y={size / 2 - 4}
              textAnchor="middle"
              className="donut-total-value"
            >
              {total}
            </text>
            <text
              x={size / 2}
              y={size / 2 + 16}
              textAnchor="middle"
              className="donut-total-label"
            >
              {locale === "ar" ? "إجمالي" : "Total"}
            </text>
          </svg>

          <ul className="chart-legend">
            {segments.map((seg, i) => (
              <li key={i}>
                <span className="legend-dot" style={{ background: seg.color }} />
                <span className="legend-label">{seg.label}</span>
                <strong className="legend-value">{seg.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Bar chart: failure modes ---------- */
export function FailureBarChart({ locale, failureStats }) {
  const t = labels[locale];
  const keys = ["machine", "twf", "hdf", "pwf", "osf", "rnf"];
  const values = keys.map((k) => failureStats?.[k] || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>{t.failureTitle}</h3>
        <p>{t.failureSub}</p>
      </div>

      {total === 0 ? (
        <div className="chart-empty">{t.noData}</div>
      ) : (
        <div className="bar-chart">
          {keys.map((k, i) => {
            const value = values[i];
            const pct = Math.round((value / max) * 100);
            return (
              <div className="bar-row" key={k}>
                <span className="bar-label">{t[k]}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <strong className="bar-value">{value}</strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Line chart: energy usage trend over recent history ---------- */
export function UsageTrendChart({ locale, history }) {
  const t = labels[locale];
  const points = (history || [])
    .filter((item) => item.kind === "energy")
    .slice(0, 12)
    .reverse()
    .map((item) => Number(item.result?.predictedUsageKWh) || 0);

  const width = 560;
  const height = 160;
  const padding = 24;

  if (points.length < 2) {
    return (
      <div className="chart-card">
        <div className="chart-head">
          <h3>{t.trendTitle}</h3>
          <p>{t.trendSub}</p>
        </div>
        <div className="chart-empty">{t.noData}</div>
      </div>
    );
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  const coords = points.map((value, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return [x, y];
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L ${coords[coords.length - 1][0].toFixed(1)} ${height - padding} L ${coords[0][0].toFixed(1)} ${height - padding} Z`;

  return (
    <div className="chart-card chart-card-wide">
      <div className="chart-head">
        <h3>{t.trendTitle}</h3>
        <p>{t.trendSub}</p>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="trend-svg"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--violet)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trendFill)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--violet)" strokeWidth="2.5" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill="var(--violet)" />
        ))}
      </svg>

      <div className="trend-minmax">
        <span>
          {locale === "ar" ? "أدنى" : "Min"}: <strong>{min.toFixed(1)} kWh</strong>
        </span>
        <span>
          {locale === "ar" ? "أعلى" : "Max"}: <strong>{max.toFixed(1)} kWh</strong>
        </span>
      </div>
    </div>
  );
}

/* ---------- Dual-line chart: Maintenance vs Energy activity over time ----------
   Both modules log real timestamped runs into `stats.history`, so cumulative
   run counts over that real sequence is the one fair, honest shared axis.
   (Schedule has no run history — it's a static CSV lookup — so it's left out
   rather than faked.) */
export function ModuleActivityChart({ locale, history }) {
  const t = labels[locale];
  const width = 560;
  const height = 170;
  const padding = 26;

  // stats.history arrives newest-first; take the most recent window and
  // walk it in chronological order so the line reads left-to-right in time.
  const recent = (history || []).slice(0, 24).reverse();

  if (recent.length < 2) {
    return (
      <div className="chart-card chart-card-wide">
        <div className="chart-head">
          <h3>{t.activityTitle}</h3>
          <p>{t.activitySub}</p>
        </div>
        <div className="chart-empty">{t.noData}</div>
      </div>
    );
  }

  let maintenanceCount = 0;
  let energyCount = 0;
  const maintenanceSeries = [];
  const energySeries = [];

  recent.forEach((item) => {
    if (item.kind === "maintenance") {
      maintenanceCount += 1;
    } else if (item.kind === "energy") {
      energyCount += 1;
    }
    maintenanceSeries.push(maintenanceCount);
    energySeries.push(energyCount);
  });

  const maxCount = Math.max(1, maintenanceCount, energyCount);

  const toPath = (series) =>
    series
      .map((value, i) => {
        const x = padding + (i / (series.length - 1)) * (width - padding * 2);
        const y = height - padding - (value / maxCount) * (height - padding * 2);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const maintenancePath = toPath(maintenanceSeries);
  const energyPath = toPath(energySeries);

  return (
    <div className="chart-card chart-card-wide">
      <div className="chart-head">
        <h3>{t.activityTitle}</h3>
        <p>{t.activitySub}</p>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="trend-svg"
      >
        <path d={maintenancePath} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        <path d={energyPath} fill="none" stroke="var(--teal)" strokeWidth="2.5" />
        {maintenanceSeries.map((value, i) => {
          const x = padding + (i / (maintenanceSeries.length - 1)) * (width - padding * 2);
          const y = height - padding - (value / maxCount) * (height - padding * 2);
          return <circle key={`m-${i}`} cx={x} cy={y} r="2.5" fill="var(--primary)" />;
        })}
        {energySeries.map((value, i) => {
          const x = padding + (i / (energySeries.length - 1)) * (width - padding * 2);
          const y = height - padding - (value / maxCount) * (height - padding * 2);
          return <circle key={`e-${i}`} cx={x} cy={y} r="2.5" fill="var(--teal)" />;
        })}
      </svg>

      <div className="trend-minmax activity-legend">
        <span>
          <span className="legend-dot" style={{ background: "var(--primary)" }} />
          {t.maintenanceLine}: <strong>{maintenanceCount}</strong>
        </span>
        <span>
          <span className="legend-dot" style={{ background: "var(--teal)" }} />
          {t.energyLine}: <strong>{energyCount}</strong>
        </span>
      </div>
    </div>
  );
}

/* ---------- Line chart: scheduling cost convergence (simulated annealing) ----------
   `convergence` comes from the backend's simulatedAnnealingCostHistory(), which
   ports SM.ipynb's simulated_annealing() cost_history onto the live schedule —
   the best cost found so far, sampled every few iterations as the search cools. */
export function CostConvergenceChart({ locale, convergence }) {
  const t = labels[locale];
  const history = convergence?.history || [];
  const width = 560;
  const height = 170;
  const padding = 26;

  if (history.length < 2) {
    return (
      <div className="chart-card chart-card-wide">
        <div className="chart-head">
          <h3>{t.convergenceTitle}</h3>
          <p>{t.convergenceSub}</p>
        </div>
        <div className="chart-empty">{t.noData}</div>
      </div>
    );
  }

  const costs = history.map((p) => p.cost);
  const max = Math.max(...costs);
  const min = Math.min(...costs);
  const range = max - min || 1;

  const coords = history.map((point, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.cost - min) / range) * (height - padding * 2);
    return [x, y];
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1][0].toFixed(1)} ${height - padding} L ${coords[0][0].toFixed(1)} ${height - padding} Z`;

  return (
    <div className="chart-card chart-card-wide">
      <div className="chart-head">
        <h3>{t.convergenceTitle}</h3>
        <p>{t.convergenceSub}</p>
      </div>

      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="trend-svg"
      >
        <defs>
          <linearGradient id="convergenceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--rose)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--rose)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#convergenceFill)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--rose)" strokeWidth="2.5" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="var(--rose)" />
        ))}
      </svg>

      <div className="trend-minmax">
        <span>
          {t.initialCost}: <strong>{convergence.initialCost.toLocaleString()}</strong>
        </span>
        <span>
          {t.bestCost}: <strong>{convergence.bestCost.toLocaleString()}</strong>
        </span>
        <span>
          {t.reduction}: <strong>{convergence.reductionPct}%</strong>
        </span>
      </div>
    </div>
  );
}