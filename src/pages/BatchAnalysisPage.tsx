import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FolderOpen, 
  Play, 
  FileText,
  FileCog,
  AlertTriangle,
  X,
  Cpu,
  Zap,
  Box,
  Layout,
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

  const [selectedResult, setSelectedResult] = useState<any | null>(null);
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
          <div className="execution-status" style={{ marginTop: '1.5rem' }}>
            {isAnalyzing && (
              <div className="active-progress">
                <div className="progress-header">
                  <div className="current-file-info">
                    <FileCog size={16} className="pulse-icon" />
                    <span className="file-label"> Currently processing:</span>
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
                  <th style={{ minWidth: '150px' }}>Conflicts</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>States</th>
                  <th>Actions</th>
                  <th style={{ textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res, idx) => (
                  <tr 
                    key={idx} 
                    className={`${res.status.toLowerCase()} results-row`}
                    onClick={() => setSelectedResult(res)}
                  >
                    <td className="file-cell" title={res.file}>
                      {res.file.split(/[\\/]/).pop()}
                    </td>
                    <td>
                      {res.status === 'Error' ? (
                        <span style={{ color: '#475569', fontSize: '0.8rem' }}>—</span>
                      ) : (
                        <span className={`conflict-badge ${res.conflicting === 'Yes' ? 'has-conflicts' : 'no-conflicts'}`}>
                          {res.conflicting === 'Yes' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                          <span style={{ marginLeft: '0.5rem' }}>
                            {res.conflicting === 'Yes' ? 'Conflict' : 'Conflict-free'}
                            {res.conflict_count && res.conflict_count !== '-' && res.conflicting === 'Yes'
                              ? ` (${res.conflict_count})` : ''}
                          </span>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`status-simple ${res.status.toLowerCase()}`}>
                        {res.status}
                      </span>
                    </td>
                    <td className="mono">{res.time_ms}ms</td>
                    <td className="mono">{res.states}</td>
                    <td className="mono">{res.actions}</td>
                    <td style={{ textAlign: 'center' }}>
                       <button className="view-details-pill">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lateral Drawer Panel */}
      <div className={`drawer-overlay ${selectedResult ? 'active' : ''}`} onClick={() => setSelectedResult(null)} />
      <div className={`drawer-panel ${selectedResult ? 'open' : ''}`}>
        {selectedResult && (
          <>
            <div className="drawer-header">
              <div className="header-title">
                <FileText size={20} className="header-icon" />
                <h3>{selectedResult.file.split(/[\\/]/).pop()}</h3>
              </div>
              <button className="close-drawer-btn" onClick={() => setSelectedResult(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              <div className="drawer-section">
                <label><Layout size={14} /> Full Path</label>
                <div className="path-display">{selectedResult.file}</div>
              </div>

              <div className="metrics-grid">
                <div className="metric-card">
                  <label><Zap size={14} /> Time</label>
                  <span className="value">{selectedResult.time_ms}ms</span>
                </div>
                <div className="metric-card">
                   <label><Box size={14} /> Size</label>
                   <span className="value">{selectedResult.automaton_size}</span>
                </div>
                <div className="metric-card">
                   <label><Cpu size={14} /> Memory</label>
                   <span className="value">{selectedResult.max_memory} MB</span>
                </div>
              </div>

              <div className="summary-section">
                 <div className="metric-item">
                    <span>States:</span> <strong>{selectedResult.states}</strong>
                 </div>
                 <div className="metric-item">
                    <span>Transitions:</span> <strong>{selectedResult.transitions}</strong>
                 </div>
                 <div className="metric-item">
                    <span>Individuals:</span> <strong>{selectedResult.individuals}</strong>
                 </div>
                 <div className="metric-item">
                    <span>Actions:</span> <strong>{selectedResult.actions}</strong>
                 </div>
              </div>

              <div className="drawer-section">
                <label><AlertCircle size={14} /> Analysis Log / Error</label>
                <pre className="info-pre">
                  {selectedResult.info || "No details available."}
                </pre>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
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

        .batch-analysis-page {
          max-width: 900px;
          margin: 0 auto;
          text-align: center;
          padding: 2rem;
          color: #f6f6f6;
          position: relative;
        }

        .subtitle {
          font-size: 1.1rem;
          color: #94a3b8;
          margin-bottom: 2.5rem;
        }

        .glass {
          background: rgba(30, 41, 59, 0.5);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .main-card { padding: 2rem; margin-bottom: 2rem; }
        .controls-grid { display: flex; flex-direction: column; gap: 1.5rem; align-items: stretch; }
        .folder-input-wrapper { display: flex; flex-direction: column; gap: 0.5rem; text-align: left; }
        .folder-input-wrapper label { font-size: 0.85rem; font-weight: 600; color: #6366f1; text-transform: uppercase; }
        .folder-input-group { display: flex; gap: 0.75rem; }
        .folder-input-group input { flex: 1; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(15, 23, 42, 0.6); color: #f8fafc; }
        .browse-btn { display: flex; align-items: center; gap: 0.5rem; padding: 0 1.25rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; color: #fff; cursor: pointer; }
        .start-btn { height: 46px; display: flex; align-items: center; gap: 0.75rem; padding: 0 2rem; border-radius: 10px; border: none; background: #6366f1; color: white; font-weight: 700; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3); }
        .start-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-1px); }
        .start-btn.analyzing { background: #0ea5e9; }

        .active-progress { background: rgba(15, 23, 42, 0.4); padding: 1.25rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); }
        .progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
        .file-name { color: #6366f1; font-weight: 600; margin-left: 0.5rem; }
        .progress-bar-outer { height: 14px; background: rgba(0, 0, 0, 0.4); border-radius: 99px; overflow: hidden; position: relative; border: 1px solid rgba(255, 255, 255, 0.05); }
        .progress-bar-inner { 
          height: 100%; 
          background: linear-gradient(90deg, #6a64d8ff 0%, #06b6d4 50%, #429b63ff 100%); 
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
          position: relative;
          box-shadow: 0 0 15px rgba(79, 70, 229, 0.5);
        }
        
        .shimmer {
          position: relative;
        }

        .shimmer::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background-image: linear-gradient(
            45deg, 
            rgba(255, 255, 255, 0.2) 25%, 
            transparent 25%, 
            transparent 50%, 
            rgba(255, 255, 255, 0.2) 50%, 
            rgba(255, 255, 255, 0.2) 75%, 
            transparent 75%, 
            transparent
          );
          background-size: 40px 40px;
          animation: progress-shimmer 1s linear infinite;
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

        @keyframes progress-shimmer {
          from { background-position: 40px 0; }
          to { background-position: 0 0; }
        }

        .results-section { margin-top: 3rem; text-align: left; }
        .results-row { cursor: pointer; transition: background 0.2s; }
        .results-row:hover { background: rgba(255, 255, 255, 0.05) !important; }
        .view-details-pill { background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); color: #a5b4fc; padding: 0.1rem 0.6rem; border-radius: 99px; font-size: 0.7rem; font-weight: 600; cursor: pointer; }

        .results-table-wrapper {
          overflow-x: auto;
          padding: 0.5rem;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: rgba(99, 102, 241, 0.4) transparent;
        }
        .results-table-wrapper::-webkit-scrollbar { height: 6px; }
        .results-table-wrapper::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.4); border-radius: 3px; }

        .results-table { min-width: 800px; width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; }
        .results-table th { padding: 1rem; text-align: left; color: #94a3b8; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .results-table td { padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
        .mono { font-family: 'JetBrains Mono', monospace; color: #cbd5e1; font-size: 0.8rem; }

        .conflict-badge { display: inline-flex; align-items: center; padding: 0.25rem 0.7rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; }
        .conflict-badge.has-conflicts { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
        .conflict-badge.no-conflicts { background: rgba(34, 197, 94, 0.08); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.15); }
        .status-simple { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: #94a3b8; }
        .status-simple.success { color: #4ade80; }
        .status-simple.error { color: #f87171; }
        .file-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }

        /* Drawer Styles */
        .drawer-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(2px); opacity: 0; pointer-events: none; transition: opacity 0.3s ease; z-index: 1000; }
        .drawer-overlay.active { opacity: 1; pointer-events: auto; }
        .drawer-panel { position: fixed; top: 0; right: 0; width: 500px; height: 100vh; background: #0f172a; border-left: 1px solid rgba(255, 255, 255, 0.1); box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5); z-index: 1001; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column; text-align: left; }
        .drawer-panel.open { transform: translateX(0); }
        .drawer-header { padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: center; }
        .header-title { display: flex; align-items: center; gap: 0.75rem; }
        .header-title h3 { margin: 0; font-size: 1.1rem; color: #f8fafc; }
        .drawer-body { padding: 1.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; }
        .drawer-section label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #6366f1; margin-bottom: 0.5rem; }
        .path-display { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #94a3b8; word-break: break-all; background: rgba(0, 0, 0, 0.2); padding: 0.75rem; border-radius: 8px; }
        .metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
        .metric-card { background: rgba(30, 41, 59, 0.5); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05); display: flex; flex-direction: column; gap: 0.25rem; }
        .metric-card .value { font-size: 1rem; font-weight: 700; color: #f8fafc; }
        .summary-section { background: rgba(99, 102, 241, 0.05); padding: 1rem; border-radius: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .metric-item { font-size: 0.85rem; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
        .info-pre { background: rgba(0, 0, 0, 0.3); color: #d1d5db; padding: 1rem; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; line-height: 1.5; white-space: pre-wrap; word-break: break-all; border: 1px solid rgba(255, 255, 255, 0.05); }
        .close-drawer-btn { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0.5rem; border-radius: 50%; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .pulse-icon { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
