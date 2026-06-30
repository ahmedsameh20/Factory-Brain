import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "../services/api";

export default function SettingsPanel({ locale }) {
  const isRtl = locale === "ar";

  const [form, setForm] = useState({
    energyRateUsdPerKwh: 0.15,
    alertThreshold: 0.70,
    alertsEnabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unavailable"
  );

  useEffect(() => {
    getSettings()
      .then((res) => { if (res.data?.data) setForm(res.data.data); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setSavedMsg("");
    try {
      const res = await updateSettings(form);
      if (res.data?.data) setForm(res.data.data);
      setSavedMsg(isRtl ? "تم الحفظ" : "Saved");
      setTimeout(() => setSavedMsg(""), 2500);
    } catch {
      setSavedMsg(isRtl ? "فشل الحفظ" : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === "granted") {
      setForm((f) => ({ ...f, alertsEnabled: true }));
    }
  }

  function toggleAlerts() {
    if (!form.alertsEnabled && notifPerm !== "granted") {
      requestNotifPermission();
    } else {
      setForm((f) => ({ ...f, alertsEnabled: !f.alertsEnabled }));
    }
  }

  const notifLabel = () => {
    if (notifPerm === "denied") return isRtl ? "محظور في المتصفح" : "Blocked by browser";
    if (notifPerm !== "granted") return isRtl ? "انقر للسماح بالإشعارات" : "Click to allow notifications";
    return form.alertsEnabled
      ? (isRtl ? "مفعّل" : "Enabled")
      : (isRtl ? "معطّل" : "Disabled");
  };

  return (
    <div className="settings-panel">
      <div className="settings-grid">
        {/* Energy Rate Card */}
        <div className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon-wrap energy-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div>
              <strong>{isRtl ? "سعر الطاقة" : "Energy Rate"}</strong>
              <p>{isRtl ? "المعدل المستخدم لتحويل توقعات الكيلوواط ساعة إلى تكلفة بالدولار في جدول الصيانة" : "Converts kWh forecasts into cost figures for Module 3 scheduling"}</p>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-label">{isRtl ? "الدولار لكل كيلوواط/ساعة" : "USD per kWh"}</label>
            <div className="input-wrap settings-input-wrap">
              <input
                type="number"
                min="0.001"
                max="99"
                step="0.001"
                value={form.energyRateUsdPerKwh}
                onChange={(e) => setForm((f) => ({ ...f, energyRateUsdPerKwh: e.target.value }))}
              />
              <small>$/kWh</small>
            </div>
          </div>

          <div className="settings-hint">
            {isRtl
              ? `المعدل الحالي: $${Number(form.energyRateUsdPerKwh).toFixed(4)} / kWh`
              : `Current: $${Number(form.energyRateUsdPerKwh).toFixed(4)} / kWh`}
          </div>
        </div>

        {/* Alerts Card */}
        <div className="settings-card">
          <div className="settings-card-head">
            <div className="settings-card-icon-wrap alert-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div>
              <strong>{isRtl ? "تنبيهات الأعطال" : "Failure Alerts"}</strong>
              <p>{isRtl ? "إشعارات فورية عند تجاوز احتمالية الفشل للحد المحدد" : "Instant notifications when failure probability exceeds your threshold"}</p>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-label">
              {isRtl ? "حد التنبيه" : "Alert Threshold"} — {Math.round(Number(form.alertThreshold) * 100)}%
            </label>
            <div className="threshold-row">
              <span className="threshold-edge">10%</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={form.alertThreshold}
                onChange={(e) => setForm((f) => ({ ...f, alertThreshold: parseFloat(e.target.value) }))}
                className="threshold-slider"
              />
              <span className="threshold-edge">100%</span>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-label">{isRtl ? "تفعيل التنبيهات" : "Enable Alerts"}</label>
            <div className="toggle-row">
              <button
                type="button"
                className={`toggle-switch ${form.alertsEnabled && notifPerm === "granted" ? "on" : "off"}`}
                onClick={toggleAlerts}
                disabled={notifPerm === "denied"}
                aria-label={isRtl ? "تبديل التنبيهات" : "Toggle alerts"}
              >
                <span className="toggle-thumb" />
              </button>
              <span className="toggle-label">{notifLabel()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-footer">
        <div className="settings-save-row">
          <button
            type="button"
            className={`save-btn ${savedMsg.includes("fail") || savedMsg.includes("فشل") ? "error" : savedMsg ? "success" : ""}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? (isRtl ? "جارٍ الحفظ…" : "Saving…")
              : savedMsg || (isRtl ? "حفظ الإعدادات" : "Save Settings")}
          </button>
          <p className="settings-footer-note">
            {isRtl
              ? "الإعدادات مؤقتة — تُعاد للقيم الافتراضية عند إعادة تشغيل الخادم."
              : "Settings are runtime-only and reset on server restart."}
          </p>
        </div>
      </div>
    </div>
  );
}
