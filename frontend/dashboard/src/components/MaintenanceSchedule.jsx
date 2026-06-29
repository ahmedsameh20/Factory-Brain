import { useEffect, useMemo, useState } from "react";
import { getLiveMaintenanceSchedule, predictMaintenance } from "../services/api";
import { CostConvergenceChart } from "./Charts";
import ShapWaterfall from "./ShapWaterfall";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      const val = values[i]?.trim() || "";
      row[h] = val === "" ? null : isNaN(val) ? val : Number(val);
    });
    return row;
  });
}

// Client-side counterpart to the backend's simulatedAnnealingCostHistory(),
// for the "Static File" tab, which has no backend round-trip to compute it
// from. The static CSV only carries the already-combined `obj_score` per
// job (not the separate downtime/maintenance/energy components the live
// DB-mode rows have), so that score is used directly as the per-job cost —
// same cooling schedule and deadline/capacity penalties as the backend/notebook
// version, just over a different cost input.
function staticCostConvergenceHistory(
  rows,
  { nDays = 7, capacityHours = 16, tStart = 1000, tEnd = 1, alpha = 0.97, iterations = 1200 } = {}
) {
  const jobs = rows.filter((r) => r.obj_score != null && r.duration_hrs != null);
  const n = jobs.length;
  if (n === 0) return { initialCost: 0, bestCost: 0, reductionPct: 0, history: [] };

  const totalCost = (assignment) => {
    let cost = 0;
    let penalty = 0;
    const load = {};
    for (let d = 1; d <= nDays; d += 1) load[d] = 0;

    assignment.forEach((day, i) => {
      const row = jobs[i];
      cost += row.obj_score;
      load[day] += row.duration_hrs;
      if (day * 24 > (row.deadline_hrs || 0) + 24) penalty += 5000;
    });

    for (let d = 1; d <= nDays; d += 1) {
      if (load[d] > capacityHours) penalty += (load[d] - capacityHours) * 300;
    }

    return cost + penalty;
  };

  let assignment = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * nDays));
  const initialCost = totalCost(assignment);
  let bestCost = initialCost;
  let currentCost = initialCost;

  let T = tStart;
  const history = [];

  for (let it = 0; it < iterations; it += 1) {
    const neighbour = [...assignment];
    const idx = Math.floor(Math.random() * n);
    neighbour[idx] = 1 + Math.floor(Math.random() * nDays);

    const newCost = totalCost(neighbour);
    const delta = newCost - currentCost;

    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      assignment = neighbour;
      currentCost = newCost;
      if (currentCost < bestCost) bestCost = currentCost;
    }

    T = Math.max(T * alpha, tEnd);
    if (it % 40 === 0) {
      history.push({ iteration: it, cost: Number(bestCost.toFixed(2)) });
    }
  }
  history.push({ iteration: iterations, cost: Number(bestCost.toFixed(2)) });

  const reductionPct = initialCost > 0 ? (1 - bestCost / initialCost) * 100 : 0;

  return {
    initialCost: Number(initialCost.toFixed(2)),
    bestCost: Number(bestCost.toFixed(2)),
    reductionPct: Number(reductionPct.toFixed(1)),
    history,
  };
}

export default function MaintenanceSchedule({ locale }) {
  const [allRows, setAllRows] = useState([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState("");
  const [queried, setQueried] = useState(false);
  const [results, setResults] = useState(null);
  const [sortField, setSortField] = useState("urgency");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // "static" = bundled maintenance_schedule.csv (unchanged default behaviour).
  // "database" = live recompute from machine_readings via /api/maintenance-schedule/live.
  const [mode, setMode] = useState("static");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const [energyCostSource, setEnergyCostSource] = useState(null);
  const [convergence, setConvergence] = useState(null);
  const [topRiskMachine, setTopRiskMachine] = useState(null);

  const [form, setForm] = useState({
    machine_id: "M",
    action: "MAINTAIN",
    priority: "ALL",
    min_fail_prob: "80",
    max_duration_hrs: "7",
    min_urgency: "5",
    max_deadline_hrs: "30",
  });

  const t = useMemo(
    () =>
      locale === "ar"
        ? {
            run: "تشغيل الاستعلام",
            running: "جارٍ البحث...",
            helper: "حدد معايير البحث ثم اضغط تشغيل لعرض جدول الصيانة.",
            fields: {
              machine_id: "رقم الماكينة",
              action: "الإجراء",
              priority: "الأولوية",
              min_fail_prob: "الحد الأدنى لاحتمال الفشل",
              max_duration_hrs: "أقصى مدة (ساعة)",
              min_urgency: "الحد الأدنى للإسراع",
              max_deadline_hrs: "أقصى موعد (ساعة)",
            },
            actions: { ALL: "الكل", MAINTAIN: "صيانة", DEFERRED: "مؤجل" },
            priorities: { ALL: "الكل", 1: "عالية", 2: "متوسطة", 3: "منخفضة" },
            machine: "الماكينة",
            day: "اليوم",
            action: "الإجراء",
            duration: "المدة (ساعة)",
            failProb: "احتمال الفشل",
            urgency: "الإسراع",
            priority: "الأولوية",
            deadline: "الموعد (ساعة)",
            maintain: "صيانة",
            deferred: "مؤجل",
            avgUrgency: "متوسط الإسراع",
            critical: "حرجة",
            noData: "لا توجد نتائج مطابقة للمعايير.",
            noService: "تعذر تحميل بيانات الجدول.",
            prev: "السابق",
            next: "التالي",
            page: "صفحة",
            of: "من",
            hours: "س",
            priorityLabels: { 1: "عالية", 2: "متوسطة", 3: "منخفضة" },
            modeStatic: "ملف ثابت",
            modeDatabase: "من قاعدة البيانات",
            liveLoading: "جارٍ حساب الجدول من القراءات الحالية...",
            liveError: "تعذر حساب الجدول من قاعدة البيانات.",
            liveRefresh: "تحديث",
            liveUpdated: "آخر تحديث",
            liveNoMachines: "لا توجد قراءات ماكينات في قاعدة البيانات بعد.",
            liveHelper: "يُعاد حساب هذا الجدول فورًا من آخر قراءات الماكينات المسجلة في قاعدة البيانات ونموذج التنبؤ بالأعطال.",
            energySourceModule2: "تكلفة الطاقة من آخر توقع لوحدة الطاقة (الوحدة 2)",
            energySourceDefault: "تكلفة الطاقة من القيمة الافتراضية المخزنة (لا يوجد توقع طاقة بعد)",
            freshRecomputedNew: "تم حساب هذا الآن \u2014 لم يكن لهذه الماكينة توقع سابق",
            freshRecomputedStale: "تم تحديث هذا الآن \u2014 كان التوقع السابق قديمًا (أكثر من ساعة)",
            freshRecomputedForced: "تم إعادة حسابه الآن بالقوة (زر التحديث)، حتى لو كان التوقع السابق لا يزال حديثًا",
            urgencyBreakdown: (risk, priority, riskW, priorityW) =>
              `سبب هذا الترتيب \u2014 لا يعتمد على نموذج تعلم آلي، بل على معادلة: ` +
              `(${riskW} \u00d7 احتمال العطل = ${(risk * 100).toFixed(1)}%) + ` +
              `(${priorityW} \u00d7 وزن الأولوية = ${(priority * 100).toFixed(1)}%)، مقسومة على الموعد النهائي بالساعات.`,
          }
        : {
            run: "Run Query",
            running: "Searching...",
            helper: "Set filter criteria and run the query to view the maintenance schedule.",
            fields: {
              machine_id: "Machine ID",
              action: "Action",
              priority: "Priority",
              min_fail_prob: "Min Fail Probability",
              max_duration_hrs: "Max Duration",
              min_urgency: "Min Urgency",
              max_deadline_hrs: "Max Deadline",
            },
            actions: { ALL: "All", MAINTAIN: "Maintain", DEFERRED: "Deferred" },
            priorities: { ALL: "All", 1: "High", 2: "Medium", 3: "Low" },
            machine: "Machine",
            day: "Day",
            action: "Action",
            duration: "Duration (hrs)",
            failProb: "Fail Prob",
            urgency: "Urgency",
            priority: "Priority",
            deadline: "Deadline (hrs)",
            maintain: "Maintain",
            deferred: "Deferred",
            avgUrgency: "Avg Urgency",
            critical: "Critical",
            noData: "No results match the selected criteria.",
            noService: "Failed to load schedule data.",
            prev: "Prev",
            next: "Next",
            page: "Page",
            of: "of",
            hours: "h",
            priorityLabels: { 1: "High", 2: "Medium", 3: "Low" },
            modeStatic: "Static File",
            modeDatabase: "From Database",
            liveLoading: "Computing the schedule from current readings...",
            liveError: "Could not compute the schedule from the database.",
            liveRefresh: "Refresh",
            liveUpdated: "Last updated",
            liveNoMachines: "No machine readings found in the database yet.",
            liveHelper: "This recomputes the schedule immediately from the latest machine readings in the database, run through the failure-prediction model.",
            energySourceModule2: "Energy cost from Module 2's latest forecast",
            energySourceDefault: "Energy cost from stored default (no energy forecast logged yet)",
            freshRecomputedNew: "Just computed \u2014 this machine had no prior prediction",
            freshRecomputedStale: "Just refreshed \u2014 the previous prediction was over an hour old",
            freshRecomputedForced: "Force-recomputed just now (Refresh button), even though the previous prediction was still fresh",
            urgencyBreakdown: (risk, priority, riskW, priorityW) =>
              `Why this ranking \u2014 not from a trained model, just the formula: ` +
              `(${riskW} \u00d7 failure risk = ${(risk * 100).toFixed(1)}%) + ` +
              `(${priorityW} \u00d7 priority weight = ${(priority * 100).toFixed(1)}%), divided by deadline hours.`,
          },
    [locale]
  );

  useEffect(() => {
    if (mode !== "static") return;
    fetch("/maintenance_schedule.csv")
      .then((res) => res.text())
      .then((text) => {
        const parsed = parseCSV(text);
        setAllRows(parsed);
        setConvergence(staticCostConvergenceHistory(parsed));

        const topMaintained = parsed
          .filter((r) => r.action === "MAINTAIN")
          .sort((a, b) => (b.fail_prob || 0) - (a.fail_prob || 0))[0];

        if (!topMaintained) {
          setTopRiskMachine(null);
          return;
        }

        setTopRiskMachine({
          machine_id: topMaintained.machine_id,
          day: topMaintained.day,
          fail_prob: topMaintained.fail_prob,
          shapExplanation: null,
        });

        // The CSV now carries each row's sensor readings (type, temperatures,
        // rpm, torque, tool wear), so the top-risk machine's SHAP explanation
        // can be fetched the same way the "From Database" tab does — a real
        // /api/predict call, not a static lookup. Best-effort: on failure
        // (e.g. backend/ML service not running), the waterfall just falls
        // back to its "unavailable" state rather than blocking the page.
        if (topMaintained.type != null && topMaintained.air_temperature != null) {
          predictMaintenance({
            machine_id: topMaintained.machine_id,
            type: topMaintained.type,
            air_temperature: topMaintained.air_temperature,
            process_temperature: topMaintained.process_temperature,
            rotational_speed: topMaintained.rotational_speed,
            torque: topMaintained.torque,
            tool_wear: topMaintained.tool_wear,
          })
            .then((response) => {
              setTopRiskMachine((current) =>
                current && current.machine_id === topMaintained.machine_id
                  ? { ...current, shapExplanation: response.data?.shapExplanation || null }
                  : current
              );
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [mode]);

  const loadLiveSchedule = (force = false) => {
    setLiveLoading(true);
    setLiveError("");

    return getLiveMaintenanceSchedule(force)
      .then((response) => {
        const data = response.data?.data;
        const rows = data?.rows || [];
        setAllRows(rows);
        setLiveUpdatedAt(new Date());
        setEnergyCostSource(data?.energyCostSource || null);
        setConvergence(data?.convergence || null);
        setTopRiskMachine(data?.topRiskMachine || null);
        // Database mode has no filter form, so show everything immediately
        // rather than waiting for a query to be run.
        setResults(computeResults(rows, noFilters));
        setPage(0);
        setQueried(true);
      })
      .catch((err) => {
        setLiveError(
          err?.response?.data?.error || err.message || "Failed to load live schedule"
        );
      })
      .finally(() => {
        setLiveLoading(false);
      });
  };

  useEffect(() => {
    if (mode !== "database") return;
    loadLiveSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setQueried(false);
    setResults(null);
    setError("");
    setConvergence(null);
    setTopRiskMachine(null);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const computeResults = (sourceRows, filters) => {
    let rows = [...sourceRows];

    if (filters.machine_id.trim()) {
      const q = filters.machine_id.trim().toLowerCase();
      rows = rows.filter((r) => String(r.machine_id).toLowerCase().includes(q));
    }

    if (filters.action !== "ALL") {
      rows = rows.filter((r) => r.action === filters.action);
    }

    if (filters.priority !== "ALL") {
      rows = rows.filter((r) => r.priority === Number(filters.priority));
    }

    if (filters.min_fail_prob !== "") {
      const minVal = Number(filters.min_fail_prob) / 100;
      rows = rows.filter((r) => (r.fail_prob || 0) >= minVal);
    }

    if (filters.max_duration_hrs !== "") {
      rows = rows.filter((r) => (r.duration_hrs || 0) <= Number(filters.max_duration_hrs));
    }

    if (filters.min_urgency !== "") {
      const minU = Number(filters.min_urgency) / 100;
      rows = rows.filter((r) => (r.urgency || 0) >= minU);
    }

    if (filters.max_deadline_hrs !== "") {
      rows = rows.filter((r) => (r.deadline_hrs || 0) <= Number(filters.max_deadline_hrs));
    }

    const maintainCount = rows.filter((r) => r.action === "MAINTAIN").length;
    const deferredCount = rows.filter((r) => r.action === "DEFERRED").length;
    const avgUrgency =
      rows.length > 0 ? rows.reduce((s, r) => s + (r.urgency || 0), 0) / rows.length : 0;
    const criticalCount = rows.filter(
      (r) => r.priority === 1 || (r.fail_prob && r.fail_prob >= 0.9)
    ).length;

    return {
      rows,
      summary: { total: rows.length, maintainCount, deferredCount, avgUrgency, criticalCount },
    };
  };

  // No filters applied — used for database mode, which shows every live
  // row directly rather than asking for filter criteria first.
  const noFilters = {
    machine_id: "",
    action: "ALL",
    priority: "ALL",
    min_fail_prob: "",
    max_duration_hrs: "",
    min_urgency: "",
    max_deadline_hrs: "",
  };

  const submit = (event) => {
    event.preventDefault();
    setQueryLoading(true);
    setError("");

    try {
      setResults(computeResults(allRows, form));
      setPage(0);
      setQueried(true);
    } catch (err) {
      setError(err.message || "Query failed");
    } finally {
      setQueryLoading(false);
    }
  };

  const sorted = useMemo(() => {
    if (!results?.rows) return [];
    const rows = [...results.rows];
    rows.sort((a, b) => {
      const aVal = a[sortField] ?? (sortDir === "asc" ? Infinity : -Infinity);
      const bVal = b[sortField] ?? (sortDir === "asc" ? Infinity : -Infinity);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [results, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  };

  const sortIcon = (field) => {
    if (sortField !== field) return "\u2195";
    return sortDir === "asc" ? "\u2191" : "\u2193";
  };

  // Spreads onto each sortable <th> so keyboard users can actually reach
  // and activate column sorting -- a plain <th onClick> is invisible to
  // Tab navigation and ignores Enter/Space, since native table headers
  // aren't interactive elements by default.
  const sortableHeaderProps = (field) => ({
    onClick: () => toggleSort(field),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSort(field);
      }
    },
    tabIndex: 0,
    role: "button",
    "aria-sort":
      sortField === field ? (sortDir === "asc" ? "ascending" : "descending") : "none",
  });

  const numericFields = [
    ["min_fail_prob", "%"],
    ["max_duration_hrs", "hrs"],
    ["min_urgency", "%"],
    ["max_deadline_hrs", "hrs"],
  ];

  return (
    <div className="maintenance-schedule">
      <div className="mode-toggle">
        <button
          type="button"
          className={`mode-toggle-btn ${mode === "static" ? "active" : ""}`}
          onClick={() => handleModeChange("static")}
        >
          {t.modeStatic}
        </button>
        <button
          type="button"
          className={`mode-toggle-btn ${mode === "database" ? "active" : ""}`}
          onClick={() => handleModeChange("database")}
        >
          {t.modeDatabase}
        </button>
      </div>

      {mode === "database" && (
        <div className="db-mode-panel" style={{ marginBottom: 22 }}>
          <p className="db-mode-helper">{t.liveHelper}</p>

          <div className="db-mode-refresh-row">
            <span className="db-mode-status">
              {liveLoading
                ? t.liveLoading
                : liveError
                ? ""
                : liveUpdatedAt
                ? `${t.liveUpdated}: ${liveUpdatedAt.toLocaleTimeString(
                    locale === "ar" ? "ar-EG" : "en-US"
                  )} \u2014 ${allRows.length} ${
                    locale === "ar" ? "ماكينة" : "machines"
                  }`
                : ""}
            </span>
            <button
              type="button"
              className="db-mode-refresh-btn"
              onClick={() => loadLiveSchedule(true)}
              disabled={liveLoading}
            >
              {liveLoading ? (
                <>
                  <span className="loading-spinner"></span> {t.liveLoading}
                </>
              ) : (
                t.liveRefresh
              )}
            </button>
          </div>

          {liveError && <div className="form-message error">{liveError}</div>}
          {!liveLoading && !liveError && allRows.length === 0 && (
            <div className="form-message">{t.liveNoMachines}</div>
          )}
          {!liveLoading && !liveError && allRows.length > 0 && energyCostSource && (
            <div className="db-mode-status">
              {energyCostSource === "module2_forecast"
                ? t.energySourceModule2
                : t.energySourceDefault}
            </div>
          )}
        </div>
      )}

      {mode === "static" && (
      <form className="prediction-form schedule-form" onSubmit={submit}>
        <div className="input-grid energy-top-grid">
          <label className="field-group">
            <span>{t.fields.machine_id}</span>
            <div className="input-wrap">
              <input
                type="text"
                name="machine_id"
                value={form.machine_id}
                onChange={handleChange}
                placeholder={locale === "ar" ? "مثال: M4652" : "e.g. M4652"}
                className="form-input"
              />
            </div>
          </label>

          <label className="field-group">
            <span>{t.fields.action}</span>
            <select
              name="action"
              value={form.action}
              onChange={handleChange}
              className="form-select"
            >
              {Object.entries(t.actions).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="input-grid energy-top-grid">
          <label className="field-group">
            <span>{t.fields.priority}</span>
            <select
              name="priority"
              value={form.priority}
              onChange={handleChange}
              className="form-select"
            >
              {Object.entries(t.priorities).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="input-grid">
          {numericFields.map(([key, unit]) => (
            <label key={key} className="field-group">
              <span>{t.fields[key]}</span>
              <div className="input-wrap">
                <input
                  type="number"
                  step="any"
                  min="0"
                  name={key}
                  value={form[key]}
                  onChange={handleChange}
                  className="form-input"
                />
                <small>{unit}</small>
              </div>
            </label>
          ))}
        </div>

        {error ? <div className="form-message error">{error}</div> : null}
        <div className="form-actions">
          <p>{t.helper}</p>
          <button type="submit" disabled={queryLoading} className="submit-button">
            {queryLoading ? (
              <>
                <span className="loading-spinner"></span> {t.running}
              </>
            ) : (
              t.run
            )}
          </button>
        </div>
      </form>
      )}

      {queried && !results && (
        <div className="result-card empty" style={{ marginTop: 22 }}>
          <h3>{t.noService}</h3>
        </div>
      )}

      {queried && results && results.summary.total === 0 && (
        <div className="result-card empty" style={{ marginTop: 22 }}>
          <h3>{t.noData}</h3>
        </div>
      )}

      {queried && results && results.summary.total > 0 && (
        <div className="schedule-results">
          <div className="schedule-summary-grid">
            <div className="schedule-summary-card tone-maintain">
              <span>{t.maintain}</span>
              <strong>{results.summary.maintainCount}</strong>
            </div>
            <div className="schedule-summary-card tone-deferred">
              <span>{t.deferred}</span>
              <strong>{results.summary.deferredCount}</strong>
            </div>
            <div className="schedule-summary-card tone-urgency">
              <span>{t.avgUrgency}</span>
              <strong>{(results.summary.avgUrgency * 100).toFixed(1)}%</strong>
            </div>
            <div className="schedule-summary-card tone-critical">
              <span>{t.critical}</span>
              <strong>{results.summary.criticalCount}</strong>
            </div>
          </div>

          <div className="schedule-table-wrap">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th {...sortableHeaderProps("machine_id")}>
                    {t.machine} {sortIcon("machine_id")}
                  </th>
                  <th {...sortableHeaderProps("day")}>
                    {t.day} {sortIcon("day")}
                  </th>
                  <th {...sortableHeaderProps("action")}>
                    {t.action} {sortIcon("action")}
                  </th>
                  <th {...sortableHeaderProps("duration_hrs")}>
                    {t.duration} {sortIcon("duration_hrs")}
                  </th>
                  <th {...sortableHeaderProps("fail_prob")}>
                    {t.failProb} {sortIcon("fail_prob")}
                  </th>
                  <th {...sortableHeaderProps("urgency")}>
                    {t.urgency} {sortIcon("urgency")}
                  </th>
                  <th {...sortableHeaderProps("priority")}>
                    {t.priority} {sortIcon("priority")}
                  </th>
                  <th {...sortableHeaderProps("deadline_hrs")}>
                    {t.deadline} {sortIcon("deadline_hrs")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((row, idx) => (
                  <tr
                    key={row.machine_id + idx}
                    className={`schedule-row action-${row.action?.toLowerCase()} priority-${row.priority}`}
                  >
                    <td className="schedule-machine">{row.machine_id}</td>
                    <td>{row.day != null ? row.day : "\u2014"}</td>
                    <td>
                      <span
                        className={`action-badge ${row.action?.toLowerCase()}`}
                      >
                        {row.action === "MAINTAIN" ? t.maintain : t.deferred}
                      </span>
                    </td>
                    <td>
                      {row.duration_hrs} {t.hours}
                    </td>
                    <td>
                      <div className="fail-bar-wrap">
                        <div
                          className="fail-bar"
                          style={{
                            width: `${(row.fail_prob || 0) * 100}%`,
                          }}
                        />
                        <span>
                          {((row.fail_prob || 0) * 100).toFixed(1)}%
                        </span>
                        {row.prediction_source?.startsWith("recomputed") && (
                          <span
                            className="freshness-dot"
                            title={
                              row.prediction_source === "recomputed_stale"
                                ? t.freshRecomputedStale
                                : row.prediction_source === "recomputed_forced"
                                ? t.freshRecomputedForced
                                : t.freshRecomputedNew
                            }
                          />
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={row.urgency_breakdown ? "urgency-value has-breakdown" : "urgency-value"}
                        title={
                          row.urgency_breakdown
                            ? t.urgencyBreakdown(
                                row.urgency_breakdown.risk_component,
                                row.urgency_breakdown.priority_component,
                                row.urgency_breakdown.risk_weight,
                                row.urgency_breakdown.priority_weight
                              )
                            : undefined
                        }
                      >
                        {(row.urgency * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span
                        className={`priority-badge priority-${row.priority}`}
                      >
                        {t.priorityLabels[row.priority] || row.priority}
                      </span>
                    </td>
                    <td>
                      {row.deadline_hrs} {t.hours}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="schedule-pagination">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="schedule-page-btn"
              >
                {t.prev}
              </button>
              <span className="schedule-page-info">
                {t.page} {page + 1} {t.of} {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="schedule-page-btn"
              >
                {t.next}
              </button>
            </div>
          )}

          {convergence && (
            <div style={{ marginTop: 22 }}>
              <CostConvergenceChart locale={locale} convergence={convergence} />
            </div>
          )}

          {topRiskMachine && (
            <div style={{ marginTop: 22 }}>
              <ShapWaterfall
                locale={locale}
                machineId={topRiskMachine.machine_id}
                day={topRiskMachine.day}
                explanation={topRiskMachine.shapExplanation}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}