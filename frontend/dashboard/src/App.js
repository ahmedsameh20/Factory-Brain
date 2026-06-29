import { useEffect, useMemo, useState } from "react";
import PredictionForm from "./components/PredictionForm";
import ResultCard from "./components/ResultCard";
import EnergyPredictionForm from "./components/EnergyPredictionForm";
import EnergyResultCard from "./components/EnergyResultCard";
import MaintenanceSchedule from "./components/MaintenanceSchedule";
import { HealthDonut, FailureBarChart, UsageTrendChart, ModuleActivityChart } from "./components/Charts";
import {
  getDashboardStats,
  getEnergyDefaults,
  getHealth,
} from "./services/api";
import "./styles/Dashboard.css";

const emptyHealth = {
  backend: "offline",
  database: "offline",
  mlService: "offline",
  modelsLoaded: 0,
  averageAccuracy: 0,
};

const emptyStats = {
  maintenance: {
    machineHealth: { healthy: 0, atRisk: 0, critical: 0 },
    totalPredictions: 0,
    failureStats: { machine: 0, twf: 0, hdf: 0, pwf: 0, osf: 0, rnf: 0 },
    recentPredictions: [],
  },
  energy: {
    totalPredictions: 0,
    averagePredictedUsage: "0.00",
    peakPredictedUsage: "0.00",
    averageEfficiencyScore: "0.0",
    statusBreakdown: { optimal: 0, monitor: 0, critical: 0 },
    recentPredictions: [],
  },
  history: [],
};

const copy = {
  en: {
    appName: "Factory Brain",
    subtitle: "Unified Smart Factory Dashboard",
    summary:
      "Operate predictive maintenance and energy optimization from a single modern control center with real ML outputs.",
    language: "AR",
    sections: [
      ["overview", "Overview"],
      ["predict", "Model Console"],
      ["history", "History"],
      ["status", "System Status"],
    ],
    modules: {
      maintenance: "Predictive Maintenance",
      energy: "Energy Optimization",
      schedule: "Maintenance Schedule",
    },
    overviewTitle: "Operations Overview",
    overviewText:
      "Track both maintenance diagnostics and energy forecasts with a shared live history of real operations.",
    metrics: {
      maintenance: "Maintenance Runs",
      energy: "Energy Runs",
      critical: "Critical Alerts",
      usage: "Avg Energy Usage",
    },
    predictTitle: "Model Console",
    predictText:
      "Switch between the production models and submit real input values to get fresh system predictions.",
    historyTitle: "Live History",
    historyText:
      "Every successful operation from either model is captured here with timestamp and real returned output.",
    statusTitle: "System Status",
    statusText: "Backend, storage, and ML service connectivity for deployed models.",
    labels: {
      backend: "Backend API",
      database: "Database",
      mlService: "ML Service",
    },
    resultLabel: "Latest Result",
    waiting: "Waiting for prediction",
    recentMachine: "Machine",
    recentEnergy: "Load",
    online: "Online",
    memory: "Memory",
    offline: "Offline",
    modelCoverage: "Models Loaded",
    avgAccuracy: "Average Accuracy",
    noHistory: "No operations yet. Run either model to start filling the unified history.",
    maintenanceSubtitle:
      "Machine failure classification using live industrial telemetry.",
    energySubtitle:
      "Forecast plant energy usage and get optimization recommendations.",
    scheduleSubtitle:
      "Optimized maintenance schedule ranked by urgency and failure probability.",
    totalHistory: "Logged Operations",
    maintenanceTag: "Maintenance",
    energyTag: "Energy",
    scheduleTag: "Schedule",
    liveNow: "Live",
    updatingNow: "Updating…",
    updatedJustNow: "Updated just now",
    updatedSecondsAgo: (s) => `Updated ${s}s ago`,
  },
  ar: {
    appName: "فاكتوري برين",
    subtitle: "لوحة التحكم الموحدة للمصنع الذكي",
    summary:
      "شغّل الصيانة التنبؤية وتحسين الطاقة من مركز تحكم واحد حديث يعرض مخرجات ML حقيقية.",
    language: "EN",
    sections: [
      ["overview", "نظرة عامة"],
      ["predict", "وحدة النماذج"],
      ["history", "السجل"],
      ["status", "حالة النظام"],
    ],
    modules: {
      maintenance: "الصيانة التنبؤية",
      energy: "تحسين الطاقة",
      schedule: "جدول الصيانة",
    },
    overviewTitle: "نظرة عامة على التشغيل",
    overviewText:
      "تابع تشخيص الأعطال وتوقعات الطاقة مع سجل حي موحّد لكل العمليات الحقيقية.",
    metrics: {
      maintenance: "عمليات الصيانة",
      energy: "عمليات الطاقة",
      critical: "تنبيهات حرجة",
      usage: "متوسط استهلاك الطاقة",
    },
    predictTitle: "وحدة النماذج",
    predictText:
      "بدّل بين النماذج وأدخل بيانات حقيقية للحصول على نتائج مباشرة من النظام.",
    historyTitle: "السجل الحي",
    historyText:
      "كل عملية ناجحة من أي موديل يتم تسجيلها هنا مع الوقت والمخرجات الفعلية.",
    statusTitle: "حالة النظام",
    statusText: "اتصال الباك إند والتخزين وخدمة ML للموديلين العاملين.",
    labels: {
      backend: "واجهة الباك إند",
      database: "قاعدة البيانات",
      mlService: "خدمة ML",
    },
    resultLabel: "آخر نتيجة",
    waiting: "بانتظار التنبؤ",
    recentMachine: "الماكينة",
    recentEnergy: "الحمل",
    online: "متصل",
    memory: "ذاكرة مؤقتة",
    offline: "غير متصل",
    modelCoverage: "النماذج المحمّلة",
    avgAccuracy: "متوسط الدقة",
    noHistory: "لا يوجد سجل بعد. شغّل أي موديل وسيظهر هنا تاريخ العمليات.",
    maintenanceSubtitle: "تصنيف أعطال الماكينات باستخدام بيانات تشغيل صناعية مباشرة.",
    energySubtitle: "توقّع استهلاك الطاقة مع توصيات تحسين فعلية.",
    scheduleSubtitle: "جدول صيانة محسّن مرتّب حسب الإسراع واحتمالية الفشل.",
    totalHistory: "العمليات المسجلة",
    maintenanceTag: "صيانة",
    energyTag: "طاقة",
    scheduleTag: "جدول",
    liveNow: "مباشر",
    updatingNow: "جارٍ التحديث…",
    updatedJustNow: "تم التحديث الآن",
    updatedSecondsAgo: (s) => `تم التحديث منذ ${s} ث`,
  },
};

function App() {
  const [locale, setLocale] = useState("en");
  const [activeTab, setActiveTab] = useState("overview");
  const [activeModel, setActiveModel] = useState("maintenance");
  const [maintenanceResult, setMaintenanceResult] = useState(null);
  const [energyResult, setEnergyResult] = useState(null);
  const [health, setHealth] = useState(emptyHealth);
  const [stats, setStats] = useState(emptyStats);
  const [energyDefaults, setEnergyDefaults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";

  async function refreshDashboard() {
    const [healthResponse, statsResponse, defaultsResponse] = await Promise.all([
      getHealth(),
      getDashboardStats(),
      getEnergyDefaults(),
    ]);

    setHealth(healthResponse.data?.data || emptyHealth);
    setStats(statsResponse.data?.data || emptyStats);
    setEnergyDefaults(defaultsResponse.data?.data?.defaults || null);
    setLastUpdated(Date.now());
  }

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        await refreshDashboard();
      } catch (error) {
        if (!mounted) {
          return;
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    const intervalId = window.setInterval(loadData, 12000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // Tick every second so the "updated Xs ago" label stays live
  // independent of the 12s data-refresh cycle.
  useEffect(() => {
    const tickId = window.setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.max(0, Math.round((Date.now() - lastUpdated) / 1000)));
      }
    }, 1000);

    return () => window.clearInterval(tickId);
  }, [lastUpdated]);

  // Add smooth transitions for model switching
  const handleModelSwitch = (newModel) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveModel(newModel);
      setIsTransitioning(false);
    }, 300);
  };

  const metrics = useMemo(
    () => [
      { label: t.metrics.maintenance, value: stats.maintenance.totalPredictions },
      { label: t.metrics.energy, value: stats.energy.totalPredictions },
      { label: t.metrics.critical, value: stats.maintenance.machineHealth.critical },
      { label: t.metrics.usage, value: `${stats.energy.averagePredictedUsage} kWh` },
    ],
    [stats, t]
  );

  const services = [
    { key: "backend", value: health.backend },
    { key: "database", value: health.database },
    { key: "mlService", value: health.mlService },
  ];

  const statusMap = {
    online: t.online,
    memory: t.memory,
    offline: t.offline,
  };

  const activeResult =
    activeModel === "maintenance"
      ? maintenanceResult
      : activeModel === "energy"
      ? energyResult
      : null;

  const handleMaintenanceResult = async (nextResult) => {
    setMaintenanceResult(nextResult);
    await refreshDashboard();
  };

  const handleEnergyResult = async (nextResult) => {
    setEnergyResult(nextResult);
    await refreshDashboard();
  };

  return (
    <div className="app-shell" dir={dir}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-block">
            <div className="brand-mark">FB</div>
            <div>
              <strong>{t.appName}</strong>
              <p>{t.subtitle}</p>
            </div>
          </div>

          <div className="sidebar-panel">
            <span className="sidebar-label">{t.overviewTitle}</span>
            <p>{t.summary}</p>
          </div>

          <nav className="sidebar-nav">
            {t.sections.map(([id, label], index) => (
              <button
                type="button"
                key={id}
                className={`nav-link ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                <span className="nav-index">0{index + 1}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-stat">
            <span>{t.totalHistory}</span>
            <strong>{stats.history.length}</strong>
          </div>
          <button
            type="button"
            className="lang-toggle"
            onClick={() => setLocale((current) => (current === "ar" ? "en" : "ar"))}
          >
            {t.language}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div className="page-header-copy">
            <span className="eyebrow">{t.appName}</span>
            <h1>{t.subtitle}</h1>
            <p>{t.summary}</p>
            <div className="hero-pills">
              <span className="hero-pill primary">
                {health.modelsLoaded} {t.modelCoverage}
              </span>
              <span className="hero-pill soft">
                {Math.round((health.averageAccuracy || 0) * 100)}% {t.avgAccuracy}
              </span>
              <span className="hero-pill live-pill">
                <span className={`pulse-dot ${loading ? "" : "active"}`} />
                {loading
                  ? t.updatingNow
                  : secondsAgo < 2
                  ? t.updatedJustNow
                  : t.updatedSecondsAgo(secondsAgo)}
              </span>
            </div>
          </div>
          <div className="header-badges">
            <div className="header-badge">
              <span>{t.modules.maintenance}</span>
              <strong>{stats.maintenance.totalPredictions}</strong>
            </div>
            <div className="header-badge">
              <span>{t.modules.energy}</span>
              <strong>{stats.energy.totalPredictions}</strong>
            </div>
          </div>
        </header>

        {activeTab === "overview" && (
          <section id="overview" className="panel">
            <div className="section-head section-head-compact">
              <div>
                <h2>{t.overviewTitle}</h2>
                <p>{t.overviewText}</p>
              </div>
              <div
                className={`result-pill ${
                  activeResult?.status === "FAILURE" || activeResult?.status === "CRITICAL"
                    ? "danger"
                    : ""
                }`}
              >
                {t.resultLabel}: {activeResult?.status || t.waiting}
              </div>
            </div>

            <div className="metric-grid">
              {metrics.map((metric, index) => (
                <article key={metric.label} className={`metric-card tone-${index + 1}`}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              ))}
            </div>

            <div className="chart-grid">
              <HealthDonut locale={locale} machineHealth={stats.maintenance.machineHealth} />
              <FailureBarChart locale={locale} failureStats={stats.maintenance.failureStats} />
            </div>

            <ModuleActivityChart locale={locale} history={stats.history} />
          </section>
        )}

        {activeTab === "predict" && (
          <section id="predict" className="panel panel-full">
            <div className="section-head">
              <div>
                <h2>{t.predictTitle}</h2>
                <p>{t.predictText}</p>
              </div>
            </div>

            <div className="module-switch">
              <button
                type="button"
                className={`module-chip ${activeModel === "maintenance" ? "active" : ""}`}
                onClick={() => handleModelSwitch("maintenance")}
              >
                <span>{t.maintenanceTag}</span>
                <strong>{t.modules.maintenance}</strong>
              </button>
              <button
                type="button"
                className={`module-chip ${activeModel === "energy" ? "active" : ""}`}
                onClick={() => handleModelSwitch("energy")}
              >
                <span>{t.energyTag}</span>
                <strong>{t.modules.energy}</strong>
              </button>
              <button
                type="button"
                className={`module-chip ${activeModel === "schedule" ? "active" : ""}`}
                onClick={() => handleModelSwitch("schedule")}
              >
                <span>{t.scheduleTag}</span>
                <strong>{t.modules.schedule}</strong>
              </button>
            </div>

            <div className="console-subtitle">
              {activeModel === "maintenance"
                ? t.maintenanceSubtitle
                : activeModel === "energy"
                ? t.energySubtitle
                : t.scheduleSubtitle}
            </div>

            <div className={`transition-content ${isTransitioning ? 'fade-out' : 'fade-in'}`}>
              {activeModel === "maintenance" ? (
                <>
                  <PredictionForm locale={locale} onResult={handleMaintenanceResult} />
                  <ResultCard locale={locale} result={maintenanceResult} />
                </>
              ) : activeModel === "energy" ? (
                <>
                  <EnergyPredictionForm
                    locale={locale}
                    defaults={energyDefaults}
                    onResult={handleEnergyResult}
                  />
                  <EnergyResultCard locale={locale} result={energyResult} />
                </>
              ) : (
                <MaintenanceSchedule locale={locale} />
              )}
            </div>
          </section>
        )}

        {activeTab === "status" && (
          <section id="status" className="panel panel-full">
            <div className="section-head">
              <div>
                <h2>{t.statusTitle}</h2>
                <p>{t.statusText}</p>
              </div>
              <div className="live-dot">
                <span className={`dot ${loading ? "" : "active"}`} />
                <span>
                  {loading
                    ? t.updatingNow
                    : secondsAgo < 2
                    ? t.updatedJustNow
                    : t.updatedSecondsAgo(secondsAgo)}
                </span>
              </div>
            </div>

            <div className="status-list">
              {services.map((service) => (
                <div key={service.key} className="status-card">
                  <div>
                    <span>{t.labels[service.key]}</span>
                    <strong>{statusMap[service.value] || service.value}</strong>
                  </div>
                  <span className={`status-state ${service.value}`} />
                </div>
              ))}
            </div>

            <div className="status-snapshot-grid">
              <div className="snapshot-card">
                <span>{t.modules.maintenance}</span>
                <strong>{stats.maintenance.machineHealth.healthy}</strong>
                <p>{t.metrics.maintenance}</p>
              </div>
              <div className="snapshot-card">
                <span>{t.modules.energy}</span>
                <strong>{stats.energy.averageEfficiencyScore}</strong>
                <p>{t.avgAccuracy}</p>
              </div>
            </div>
          </section>
        )}

        {activeTab === "history" && (
          <section id="history" className="panel panel-full">
            <div className="section-head">
              <div>
                <h2>{t.historyTitle}</h2>
                <p>{t.historyText}</p>
              </div>
              <div className="history-summary">
                <strong>{stats.history.length}</strong>
                <span>{t.totalHistory}</span>
              </div>
            </div>

            <UsageTrendChart locale={locale} history={stats.history} />

            <div className="history-list">
              {stats.history.length ? (
                stats.history.map((item) => (
                  <article key={item.id} className="history-card">
                    <div className="history-top">
                      <div>
                        <div className="history-kind">
                          {item.kind === "maintenance"
                            ? t.maintenanceTag
                            : t.energyTag}
                        </div>
                        <strong>
                          {item.kind === "maintenance"
                            ? `${t.recentMachine} ${item.input.type}`
                            : `${t.recentEnergy} ${item.result.loadType}`}
                        </strong>
                      </div>
                      <span
                        className={`history-status ${
                          item.result.status === "FAILURE" ||
                          item.result.status === "CRITICAL"
                            ? "danger"
                            : "safe"
                        }`}
                      >
                        {item.result.status}
                      </span>
                    </div>

                    <p>
                      {new Date(item.timestamp).toLocaleString(
                        locale === "ar" ? "ar-EG" : "en-US"
                      )}
                    </p>

                    <div className="history-values">
                      {item.kind === "maintenance" ? (
                        <>
                          <span>{item.input.air_temperature} K</span>
                          <span>{item.input.process_temperature} K</span>
                          <span>{item.input.rotational_speed} rpm</span>
                          <span>{item.input.torque} Nm</span>
                          <span>{item.input.tool_wear} min</span>
                        </>
                      ) : (
                        <>
                          <span>{item.result.predictedUsageKWh} kWh</span>
                          <span>{item.result.efficiencyScore}</span>
                          <span>{item.result.loadType}</span>
                          <span>{item.result.peakWindow ? "Peak" : "Off-peak"}</span>
                        </>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-history">{t.noHistory}</div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;