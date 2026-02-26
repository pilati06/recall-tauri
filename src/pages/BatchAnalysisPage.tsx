import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface BatchResult {
  file: string;
  time_ms: string;
  states: string;
  transitions: string;
  individuals: string;
  actions: string;
  conflicting: string;
  conflict_count: string;
  automaton_size: string;
  max_memory: string;
  status: string;
  info: string;
}

interface ProgressEvent {
  file: string;
  status: string;
  result: string | null;
  time_ms: number | null;
  progress: number;
}

export function BatchAnalysisPage() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string>("");
  const [results, setResults] = useState<BatchResult[]>([]);

  useEffect(() => {
    const unlisten = listen<ProgressEvent>("batch-progress", (event) => {
      setProgress(event.payload.progress * 100);
      setCurrentFile(event.payload.file);
      
      if (event.payload.status !== "Processing") {
        // Parse the result if it's a success string (CSV format)
        if (event.payload.status === "Success" && event.payload.result) {
          const parts = event.payload.result.split(";");
          // parts indices: 0:time, 1:states, 2:transitions, 3:indiv, 4:actions, 5:conflicting, 6:conflict_count, 7:size, 8:ram, 9:status
          const newResult: BatchResult = {
            file: event.payload.file,
            time_ms: parts[0] || event.payload.time_ms?.toString() || "-",
            states: parts[1] || "-",
            transitions: parts[2] || "-",
            individuals: parts[3] || "-",
            actions: parts[4] || "-",
            conflicting: parts[5] === "1" ? "Yes" : "No",
            conflict_count: parts[6] || "-",
            automaton_size: parts[7] || "-",
            max_memory: parts[8] || "-",
            status: "Success",
            info: "",
          };
          setResults((prev) => [...prev, newResult]);
        } else {
          const newResult: BatchResult = {
            file: event.payload.file,
            time_ms: event.payload.time_ms?.toString() || "-",
            states: "-",
            transitions: "-",
            individuals: "-",
            actions: "-",
            conflicting: "-",
            conflict_count: "-",
            automaton_size: "-",
            max_memory: "-",
            status: "Error",
            info: (event.payload.result || "Unknown error").replace(/\r?\n|\r/g, " "),
          };
          setResults((prev) => [...prev, newResult]);
        }
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleSelectFolder = async () => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        setFolderPath(selected);
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  const handleStartAnalysis = async () => {
    if (!folderPath) return;

    setIsAnalyzing(true);
    setProgress(0);
    setResults([]);
    setCurrentFile("Starting...");

    try {
      const message = await invoke<string>("run_batch_analysis", { folderPath });
      alert(message);
    } catch (err) {
      console.error("Analysis failed:", err);
      alert("Error during batch analysis: " + err);
    } finally {
      setIsAnalyzing(false);
      setCurrentFile("Completed");
    }
  };

  return (
    <div className="batch-analysis-page">
      <h1>Batch Analysis</h1>
      <p className="subtitle">Process multiple RCL files from a folder.</p>

      <div className="controls">
        <div className="folder-input-group">
          <input 
            type="text" 
            readOnly 
            placeholder="No folder selected" 
            value={folderPath || ""} 
          />
          <button onClick={handleSelectFolder} disabled={isAnalyzing}>
            Browse...
          </button>
        </div>
        
        <button 
          className="start-btn" 
          onClick={handleStartAnalysis} 
          disabled={!folderPath || isAnalyzing}
        >
          {isAnalyzing ? "Analyzing..." : "Start Batch Analysis"}
        </button>
      </div>

      {isAnalyzing && (
        <div className="progress-container">
          <div className="progress-info">
            <span>{currentFile}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="results-container">
          <h2>Results</h2>
          <table className="results-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Time (ms)</th>
                <th>States</th>
                <th>Trans.</th>
                <th>Indiv.</th>
                <th>Actions</th>
                <th>Conf.</th>
                <th>No. Conf.</th>
                <th>Size (MB)</th>
                <th>RAM (MB)</th>
                <th>Info</th>
              </tr>
            </thead>
            <tbody>
              {results.map((res, idx) => (
                <tr key={idx} className={res.status.toLowerCase()}>
                  <td>{res.file}</td>
                  <td>{res.status}</td>
                  <td>{res.time_ms}</td>
                  <td>{res.states}</td>
                  <td>{res.transitions}</td>
                  <td>{res.individuals}</td>
                  <td>{res.actions}</td>
                  <td>{res.conflicting}</td>
                  <td>{res.conflict_count}</td>
                  <td>{res.automaton_size}</td>
                  <td>{res.max_memory}</td>
                  <td className="info-cell" title={res.info}>{res.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .batch-analysis-page {
          max-width: 1000px;
          margin: 0 auto;
          text-align: center;
          padding: 2rem;
          color: #f6f6f6;
        }
        .subtitle {
          font-size: 1.1rem;
          color: #646cff;
          margin-bottom: 2rem;
        }
        .controls {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          align-items: center;
          margin-bottom: 2rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 2rem;
          border-radius: 12px;
        }
        .folder-input-group {
          display: flex;
          width: 100%;
          max-width: 600px;
          gap: 0.5rem;
        }
        .folder-input-group input {
          flex: 1;
          padding: 0.8rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(0, 0, 0, 0.3);
          color: white;
        }
        .folder-input-group button, .start-btn {
          padding: 0.8rem 1.5rem;
          border-radius: 8px;
          border: none;
          background: #646cff;
          color: white;
          cursor: pointer;
          font-weight: bold;
          transition: background 0.2s;
        }
        .folder-input-group button:hover, .start-btn:hover:not(:disabled) {
          background: #535bf2;
        }
        .start-btn {
          width: 100%;
          max-width: 600px;
          background: #24c8db;
        }
        .start-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .progress-container {
          width: 100%;
          max-width: 600px;
          margin: 0 auto 2rem auto;
        }
        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
          color: #24c8db;
        }
        .progress-bar-container {
          width: 100%;
          height: 10px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #646cff, #24c8db);
          transition: width 0.3s ease;
        }
        .results-container {
          margin-top: 3rem;
          text-align: left;
        }
        .results-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          font-size: 0.9rem;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          overflow: hidden;
        }
        .results-table th, .results-table td {
          padding: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .results-table th {
          background: rgba(100, 108, 255, 0.2);
          color: #646cff;
          font-weight: bold;
        }
        .results-table tr.success td:nth-child(2) { color: #4caf50; }
        .results-table tr.error td:nth-child(2) { color: #f44336; }
        .results-table tr:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .info-cell {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.6);
        }
      `}</style>
    </div>
  );
}
