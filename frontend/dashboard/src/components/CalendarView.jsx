export default function CalendarView({ rows, locale }) {
  const isRtl = locale === "ar";
  const today = new Date();

  const dayInfo = (d) => {
    const date = new Date(today);
    date.setDate(today.getDate() + d - 1);
    const dayNames = isRtl
      ? ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return { name: dayNames[date.getDay()], num: date.getDate(), month: date.getMonth() + 1 };
  };

  const priorityColor = (p) => {
    if (p === 1) return "var(--rose)";
    if (p === 2) return "var(--amber)";
    return "var(--primary)";
  };

  const priorityLabel = (p) => {
    if (!p) return "";
    const map = isRtl ? { 1: "عالية", 2: "متوسطة", 3: "منخفضة" } : { 1: "H", 2: "M", 3: "L" };
    return map[p] || p;
  };

  const maintained = rows.filter((r) => r.action === "MAINTAIN");
  const deferred = rows.filter((r) => r.action === "DEFERRED");

  return (
    <div className="calendar-wrap">
      <div className="calendar-grid">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const { name, num, month } = dayInfo(d);
          const tasks = maintained.filter((r) => r.day === d);
          const isToday = d === 1;
          return (
            <div key={d} className={`calendar-col ${tasks.length > 0 ? "has-tasks" : ""} ${isToday ? "is-today" : ""}`}>
              <div className="calendar-day-head">
                <span className="calendar-day-name">{name}</span>
                <span className="calendar-day-num">
                  {num}/{month}
                </span>
                {tasks.length > 0 && (
                  <span className="calendar-task-count">{tasks.length}</span>
                )}
              </div>
              <div className="calendar-tasks">
                {tasks.length === 0 ? (
                  <div className="calendar-empty">
                    {isRtl ? "—" : "—"}
                  </div>
                ) : (
                  tasks.map((r) => (
                    <div
                      key={r.machine_id}
                      className="calendar-task"
                      style={{ borderColor: priorityColor(r.priority) }}
                      title={`${r.machine_id} — Fail: ${(r.fail_prob * 100).toFixed(1)}%, Priority: ${priorityLabel(r.priority)}, Duration: ${r.duration_hrs || r.duration_hrs}h`}
                    >
                      <span className="calendar-task-id">{r.machine_id}</span>
                      <div className="calendar-task-meta">
                        <span className="calendar-task-prob" style={{ color: r.fail_prob >= 0.7 ? "var(--rose)" : "var(--muted)" }}>
                          {(r.fail_prob * 100).toFixed(0)}%
                        </span>
                        <span className="calendar-task-priority" style={{ color: priorityColor(r.priority) }}>
                          {priorityLabel(r.priority)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {deferred.length > 0 && (
        <div className="calendar-deferred-row">
          <span className="calendar-deferred-label">{isRtl ? "مؤجّل:" : "Deferred:"}</span>
          <div className="calendar-deferred-items">
            {deferred.map((r) => (
              <span
                key={r.machine_id}
                className="calendar-deferred-item"
                title={`Fail prob: ${(r.fail_prob * 100).toFixed(1)}%`}
              >
                {r.machine_id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
