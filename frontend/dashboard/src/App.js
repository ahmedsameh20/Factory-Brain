import { useState } from "react";
import PredictionForm from "./components/PredictionForm";
import ResultCard from "./components/ResultCard";
import "./styles/Dashboard.css";

function App() {
  const [result, setResult] = useState(null);

  return (
    <div className="container">
      <div className="card">
        <div className="title">
          Predictive Maintenance Dashboard
        </div>

        <PredictionForm onResult={setResult} />
      </div>

      <ResultCard result={result} />
    </div>
  );
}

export default App;
