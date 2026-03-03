import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FolderOpen, 
  Play, 
  FileText,
  FileCog,
} from "lucide-react";
import { useAnalysisContext } from "../context/AnalysisContext";

export function BatchAnalysisPage() {
  const { batchAnalysis } = useAnalysisContext();
  const {
    folderPath, setFolderPath,
    isAnalyzing, setIsAnalyzing,
    progress, setProgress,
    currentFile, setCurrentFile,
    results, setResults,
    logs, setLogs,
    addLog
  } = batchAnalysis;

  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSelectFolder = async () => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        setFolderPath(selected);
        addLog(`Selected folder: ${selected}`, "info");
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
      addLog(`Failed to select directory: ${err}`, "error");
    }
  };

  const handleStartAnalysis = async () => {
    if (!folderPath) return;

    setIsAnalyzing(true);
    setProgress(0);
    setResults([]);
    setLogs([]);
    setCurrentFile("Initializing...");
    addLog(`Starting batch analysis in: ${folderPath}`, "info");

    try {
      await invoke<string>("run_batch_analysis", { folderPath });
      addLog("Analysis process finished.", "success");
    } catch (err) {
      console.error("Analysis failed:", err);
      addLog(`Critical error: ${err}`, "error");
    } finally {
      setIsAnalyzing(false);
      setCurrentFile("Done");
    }
  };

  return (
    <div className="batch-analysis-page">
      <h1>Batch Analysis</h1>
      <p className="subtitle">High-performance processing for multiple RCL files.</p>

      <div className="main-card glass">
        <div className="controls-grid">
          <div className="folder-input-wrapper">
            <label>Source Directory</label>
            <div className="folder-input-group">
              <input 
                type="text" 
                readOnly 
                placeholder="Click browse to select a folder..." 
                value={folderPath || ""} 
              />
              <button className="browse-btn" onClick={handleSelectFolder} disabled={isAnalyzing}>
                <FolderOpen size={18} />
                <span>Browse</span>
              </button>
            </div>
          </div>
          
          <button 
            className={`start-btn ${isAnalyzing ? 'analyzing' : ''}`} 
            onClick={handleStartAnalysis} 
            disabled={!folderPath || isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={20} className="spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Play size={20} />
                <span>Start Batch Execution</span>
              </>
            )}
          </button>
        </div>

        {(isAnalyzing || logs.length > 0) && (
          <div className="execution-status">
            {isAnalyzing && (
              <div className="active-progress">
                <div className="progress-header">
                  <div className="current-file-info">
                    <FileCog size={16} className="pulse-icon" />
                    <span className="file-label">Currently processing:</span>
                    <span className="file-name">{currentFile || "Preparing..."}</span>
                  </div>
                  <span className="percentage">{Math.round(progress)}%</span>
                </div>
                <div className="progress-bar-outer">
                  <div 
                    className={`progress-bar-inner ${isAnalyzing ? 'shimmer' : ''}`} 
                    style={{ width: `${progress}%` }}
                  >
                    <div className="progress-glow"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="results-section fade-in">
          <div className="section-header">
            <FileText size={20} />
            <h2>Results</h2>
            <div className="results-count">{results.length} files processed</div>
          </div>
          <div className="results-table-wrapper glass">
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
                  <th>Conflicts</th>
                  <th>Result Size</th>
                  <th>RAM (MB)</th>
                  <th>Info</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res, idx) => (
                  <tr key={idx} className={res.status.toLowerCase()}>
                    <td className="file-cell" title={res.file}>
                      {res.file.split(/[\\/]/).pop()}
                    </td>
                    <td>
                      <span className={`status-badge ${res.status.toLowerCase()}`}>
                        {res.status === "Success" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {res.status}
                      </span>
                    </td>
                    <td className="mono">{res.time_ms}</td>
                    <td className="mono">{res.states}</td>
                    <td className="mono">{res.transitions}</td>
                    <td className="mono">{res.individuals}</td>
                    <td className="mono">{res.actions}</td>
                    <td>
                      <span className={`conflict-tag ${res.conflicting === 'Yes' ? 'has-conflicts' : ''}`}>
                        {res.conflicting} ({res.conflict_count})
                      </span>
                    </td>
                    <td className="mono">{res.automaton_size}</td>
                    <td className="mono">{res.max_memory}</td>
                    <td className="info-cell" title={res.info}>{res.info}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        .batch-analysis-page {
          max-width: 800px;
          margin: 0 auto;
          text-align: center;
          padding: 2rem;
          color: #f6f6f6;
        }

        .subtitle {
          font-size: 1.2rem;
          color: #646cff;
          margin-bottom: 3rem;
        }

        .glass {
          background: rgba(30, 41, 59, 0.5);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .main-card {
          padding: 2rem;
          margin-bottom: 2rem;
        }

        .controls-grid {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          align-items: stretch;
        }

        .folder-input-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          text-align: left;
        }

        .folder-input-wrapper label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #6366f1;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .folder-input-group {
          display: flex;
          gap: 0.75rem;
        }

        .folder-input-group input {
          flex: 1;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.6);
          color: #f8fafc;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .folder-input-group input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .browse-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0 1.25rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .browse-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .start-btn {
          height: 46px;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0 2rem;
          border-radius: 10px;
          border: none;
          background: #6366f1;
          color: white;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.39);
        }

        .start-btn:hover:not(:disabled) {
          background: #4f46e5;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.23);
        }

        .start-btn:active {
          transform: translateY(0);
        }

        .start-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          filter: grayscale(0.5);
        }

        .start-btn.analyzing {
          background: #0ea5e9;
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.3);
        }

        .execution-status {
          margin-top: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .active-progress {
          background: rgba(15, 23, 42, 0.4);
          padding: 1.25rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .current-file-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
        }

        .file-label {
          color: #94a3b8;
        }

        .file-name {
          color: #6366f1;
          font-weight: 600;
        }

        .percentage {
          font-weight: 800;
          color: #6366f1;
          font-size: 1.1rem;
        }

        .progress-bar-outer {
          height: 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
          overflow: hidden;
          position: relative;
        }

        .progress-bar-inner {
          height: 100%;
          background: linear-gradient(90deg, #6366f1 0%, #0ea5e9 100%);
          border-radius: 6px;
          transition: width 0.4s ease;
          position: relative;
        }

        .progress-glow {
          position: absolute;
          right: 0;
          top: 0;
          height: 100%;
          width: 20px;
          background: white;
          filter: blur(8px);
          opacity: 0.4;
        }

        .shimmer {
          background-size: 40px 40px;
          background-image: linear-gradient(
            45deg, 
            rgba(255, 255, 255, 0.1) 25%, 
            transparent 25%, 
            transparent 50%, 
            rgba(255, 255, 255, 0.1) 50%, 
            rgba(255, 255, 255, 0.1) 75%, 
            transparent 75%, 
            transparent
          );
          animation: progress-shimmer 1s linear infinite;
        }

        .results-section {
          margin-top: 3rem;
          text-align: left;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }

        .section-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .results-count {
          font-size: 0.8rem;
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          padding: 0.2rem 0.6rem;
          border-radius: 99px;
          font-weight: 600;
        }

        .results-table-wrapper {
          overflow-x: auto;
          padding: 0.5rem;
        }

        .results-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.85rem;
        }

        .results-table th {
          padding: 1rem;
          text-align: left;
          color: #94a3b8;
          font-weight: 600;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .results-table td {
          padding: 0.85rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .results-table tr:last-child td {
          border-bottom: none;
        }

        .results-table tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .mono {
          font-family: 'JetBrains Mono', monospace;
          color: #cbd5e1;
          font-size: 0.8rem;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.2rem 0.6rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        .status-badge.success {
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
        }

        .status-badge.error {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
        }

        .conflict-tag {
          font-size: 0.75rem;
          color: #94a3b8;
        }

        .conflict-tag.has-conflicts {
          color: #fbbf24;
          font-weight: 600;
        }

        .info-cell {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #64748b;
          font-size: 0.75rem;
        }

        .file-cell {
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 500;
        }

        @keyframes progress-shimmer {
          from { background-position: 40px 0; }
          to { background-position: 0 0; }
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .pulse-icon {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          color: #0ea5e9;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }

        .fade-in {
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          .batch-analysis-page {
            padding: 1rem;
          }
          .controls-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          .folder-input-group {
            flex-direction: column;
          }
          .browse-btn {
            padding: 0.8rem;
            justify-content: center;
          }
          .start-btn {
            width: 100%;
            justify-content: center;
          }
          .subtitle {
            font-size: 1rem;
            margin-bottom: 2rem;
          }
          h1 {
            font-size: 1.8rem;
          }
          .main-card {
            padding: 1.2rem;
          }
          .results-table th, .results-table td {
            padding: 0.6rem;
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
