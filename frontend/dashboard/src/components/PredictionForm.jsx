import { useState } from "react";
import { predict } from "../services/api";

export default function PredictionForm({ onResult }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: "M",
    air_temperature: 300,
    process_temperature: 310,
    rotational_speed: 1500,
    torque: 40,
    tool_wear: 0
  });

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async () => {
    setLoading(true);
    try {
      const res = await predict(form);
      onResult(res.data);
    } catch (err) {
  console.error(err);
  alert(
    err?.response?.data?.error ||
    err.message ||
    "Backend error"
  );
}

    setLoading(false);
  };

  return (
    <>
      <div className="input-grid">
        <select name="type" onChange={handleChange}>
          <option value="M">Type M</option>
          <option value="L">Type L</option>
          <option value="H">Type H</option>
        </select>

        {Object.keys(form).map(
          (key) =>
            key !== "type" && (
              <input
                key={key}
                name={key}
                value={form[key]}
                onChange={handleChange}
                placeholder={key.replace("_", " ")}
              />
            )
        )}
      </div>

      <button onClick={submit} disabled={loading}>
        {loading ? "Predicting..." : "Predict"}
      </button>
    </>
  );
}
