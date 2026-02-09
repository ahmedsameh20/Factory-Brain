export default function ResultCard({ result }) {
  if (!result) return null;

  const isFailure = result.status === "FAILURE";

  return (
    <div className={`card ${isFailure ? "failure" : "success"}`}>
      <h2>Status: {result.status}</h2>

      <div className="badge-grid">
        {Object.entries(result.failures).map(([key, val]) => (
          <div
            key={key}
            className={`badge ${val ? "bad" : "ok"}`}
          >
            {key.toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}
