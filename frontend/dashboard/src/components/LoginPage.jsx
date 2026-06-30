import { useState } from "react";
import { login } from "../services/api";

export default function LoginPage({ onLogin, locale }) {
  const isRtl = locale === "ar";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await login(username, password);
      const { token, username: user, role } = res.data;
      localStorage.setItem("fb_token", token);
      localStorage.setItem("fb_user", JSON.stringify({ username: user, role }));
      onLogin({ username: user, role });
    } catch (err) {
      setError(
        err.response?.data?.error ||
        (isRtl ? "فشل تسجيل الدخول. تحقق من بيانات الاعتماد." : "Login failed. Check your credentials.")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" style={{ width: 56, height: 56, fontSize: "1.1rem" }}>FB</div>
          <div>
            <strong className="login-app-name">Factory Brain</strong>
            <p>{isRtl ? "لوحة التحكم الموحدة للمصنع الذكي" : "Intelligent Operations Dashboard"}</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} dir={isRtl ? "rtl" : "ltr"}>
          <div className="field-group">
            <label className="settings-label">{isRtl ? "اسم المستخدم" : "Username"}</label>
            <div className="input-wrap">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="field-group">
            <label className="settings-label">{isRtl ? "كلمة المرور" : "Password"}</label>
            <div className="input-wrap">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {error && <div className="form-message error">{error}</div>}

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? (
              <><span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> {isRtl ? "جارٍ الدخول…" : "Signing in…"}</>
            ) : (
              isRtl ? "تسجيل الدخول" : "Sign In"
            )}
          </button>
        </form>

        <p className="login-hint">
          {isRtl
            ? "بيانات الاعتماد الافتراضية: admin / admin123 — قابلة للتغيير عبر متغيرات البيئة."
            : "Default credentials: admin / admin123 — change via APP_USERNAME / APP_PASSWORD env vars."}
        </p>
      </div>
    </div>
  );
}
