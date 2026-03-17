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
  ExternalLink,
  ChevronRight,
  Square,
  Settings,
  ShieldCheck,
  ZapOff
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useAnalysisContext, BatchResult } from "../context/AnalysisContext";

interface SymbolEntry {
  id: string;
  symbol_type: string;
  value: string;
}

export function BatchAnalysisPage() {
  const { batchAnalysis } = useAnalysisContext();
  const {
    folderPath, setFolderPath,
    isAnalyzing, setIsAnalyzing,
    progress, setProgress,
    currentFile, setCurrentFile,
    results, setResults,
    logs, setLogs,
    addLog,
    batchCsvPath, setBatchCsvPath
  } = batchAnalysis;

  const [selectedResult, setSelectedResult] = useState<BatchResult | null>(null);
  const [relatedFiles, setRelatedFiles] = useState<Record<string, string>>({});
  const [symbols, setSymbols] = useState<SymbolEntry[]>([]);
  const [isSymbolsExpanded, setIsSymbolsExpanded] = useState(false);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [exportOption, setExportOption] = useState<'none' | 'normal' | 'min' | 'both'>('none');
  const [usePruning, setUsePruning] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Fetch related files when selection changes
  useEffect(() => {
    if (selectedResult) {
      invoke<Record<string, string>>("get_related_files", { path: selectedResult.file })
        .then(setRelatedFiles)
        .catch(err => {
          console.error("Failed to fetch related files:", err);
          setRelatedFiles({});
        });
    } else {
      setRelatedFiles({});
    }
    setIsSymbolsExpanded(false);
    setSymbols([]);
  }, [selectedResult]);

  const fetchSymbolTable = async () => {
    if (!selectedResult || !relatedFiles.log || symbols.length > 0) {
      if (symbols.length > 0) setIsSymbolsExpanded(!isSymbolsExpanded);
      return;
    }

    setIsLoadingSymbols(true);
    try {
      const data = await invoke<SymbolEntry[]>("get_symbol_table", { filePath: selectedResult.file });
      setSymbols(data);
      setIsSymbolsExpanded(true);
    } catch (err) {
      console.error("Failed to fetch symbols:", err);
      addLog(`Error loading symbols: ${err}`, "error");
    } finally {
      setIsLoadingSymbols(false);
    }
  };

  const getConflictLines = (info: string) => {
    return info.split('\n').filter(line => line.trim().startsWith('Conflict:'));
  };

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
    setBatchCsvPath("");
    setCurrentFile("Initializing...");
    addLog(`Starting batch analysis in: ${folderPath}`, "info");

    try {
      const exportNormal = exportOption === 'normal' || exportOption === 'both';
      const exportMin = exportOption === 'min' || exportOption === 'both';

      const response = await invoke<string>("run_batch_analysis", { 
        folderPath,
        exportAutomaton: exportNormal,
        exportMinAutomaton: exportMin,
        usePruning: usePruning
      });
      addLog("Analysis process finished.", "success");
      
      // Extract path from "Batch analysis completed. Results saved to <path>"
      if (response.includes("Results saved to ")) {
        const path = response.split("Results saved to ")[1];
        setBatchCsvPath(path);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      addLog(`Critical error: ${err}`, "error");
    } finally {
      setIsAnalyzing(false);
      setCurrentFile("Done");
    }
  };

  const handleStopAnalysis = async () => {
    try {
      await invoke("stop_analysis");
      addLog("Stop signal sent...", "info");
    } catch (err) {
      console.error("Failed to stop analysis:", err);
      addLog(`Error stopping analysis: ${err}`, "error");
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
          
          <div className="actions-group">
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

            {isAnalyzing ? (
              <button 
                className="stop-btn fade-in" 
                onClick={handleStopAnalysis}
                title="Stop Batch Analysis"
              >
                <Square size={20} fill="currentColor" />
                <span>Stop Analysis</span>
              </button>
            ) : (
              <button 
                className="settings-toggle-btn"
                onClick={() => setShowSettings(true)}
                disabled={isAnalyzing}
                title="Analysis Settings"
              >
                <Settings size={22} strokeWidth={2.2} color="white" style={{ display: 'block' }} />
              </button>
            )}
          </div>
        </div>

        {(isAnalyzing || logs.length > 0) && (
          <div className="execution-status" style={{ marginTop: '1.5rem' }}>
            {(isAnalyzing || progress > 0) && (
              <div className="active-progress">
                <div className="progress-header">
                  <div className="current-file-info">
                    <FileCog size={16} className={isAnalyzing ? "pulse-icon" : ""} />
                    <span className="file-label"> {isAnalyzing ? "Currently processing:" : "Batch status:"}</span>
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
            
            {batchCsvPath && (
              <button 
                className="action-btn-link" 
                onClick={() => revealItemInDir(batchCsvPath)}
                style={{ marginLeft: 'auto', padding: '6px 12px', width: 'auto' }}
              >
                <FileText size={16} />
                <span>Open Batch CSV</span>
                <ChevronRight size={14} className="chevron" />
              </button>
            )}
          </div>
          <div className="results-table-wrapper glass">
            <table className="results-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th style={{ minWidth: '150px' }}>Conflicts</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Max Memory</th>
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
                    <td className="mono">
                      {res.time_ms !== "-" ? (parseFloat(res.time_ms) / 1000).toFixed(3) + 's' : "-"}
                    </td>
                    <td className="mono">{res.max_memory} MB</td>
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
                  <span className="value">
                    {selectedResult.time_ms !== "-" ? (parseFloat(selectedResult.time_ms) / 1000).toFixed(3) + 's' : "-"}
                  </span>
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

              <div className="drawer-section">
                <label><ExternalLink size={14} /> Quick Actions</label>
                <div className="actions-list">
                  <button className="action-btn-link" onClick={() => revealItemInDir(selectedResult.file)}>
                    <FolderOpen size={16} />
                    <span>Show in Folder</span>
                    <ChevronRight size={14} className="chevron" />
                  </button>
                  
                  {relatedFiles.result && (
                    <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.result)}>
                      <FileText size={16} />
                      <span>Open Result</span>
                      <ChevronRight size={14} className="chevron" />
                    </button>
                  )}
                  
                  {relatedFiles.log && (
                    <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.log)}>
                      <FileCog size={16} />
                      <span>View Full Log</span>
                      <ChevronRight size={14} className="chevron" />
                    </button>
                  )}

                  {relatedFiles.dot && (
                    <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.dot)}>
                      <Layout size={16} />
                      <span>Automaton (DOT)</span>
                      <ChevronRight size={14} className="chevron" />
                    </button>
                  )}

                  {relatedFiles.min_dot && (
                    <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.min_dot)}>
                      <Layout size={16} />
                      <span>Min Automaton (DOT)</span>
                      <ChevronRight size={14} className="chevron" />
                    </button>
                  )}

                  {relatedFiles.log && (
                    <div className="symbols-accordion">
                      <button 
                        className={`action-btn-link ${isSymbolsExpanded ? 'expanded' : ''}`} 
                        onClick={fetchSymbolTable}
                        disabled={isLoadingSymbols}
                      >
                        <Layout size={16} />
                        <span>{isLoadingSymbols ? 'Loading symbols...' : 'Table of Symbols'}</span>
                        <ChevronRight size={14} className={`chevron ${isSymbolsExpanded ? 'rotate-90' : ''}`} />
                      </button>
                      
                      {isSymbolsExpanded && symbols.length > 0 && (
                        <div className="symbols-table-container fade-in">
                          <table className="symbols-mini-table">
                            <thead>
                              <tr>
                                <th>ID</th>
                                <th>Type</th>
                                <th>Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {symbols.map((s, i) => (
                                <tr key={i}>
                                  <td className="mono">({s.id})</td>
                                  <td>
                                    <span className={`symbol-type-tag ${s.symbol_type}`}>
                                      {s.symbol_type}
                                    </span>
                                  </td>
                                  <td className="mono">{s.value}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
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

              {selectedResult.status === "Error" ? (
                <div className="drawer-section fade-in">
                  <label><AlertCircle size={14} /> Analysis Error</label>
                  <pre className="info-pre error">
                    {selectedResult.info || "Unknown error occurred."}
                  </pre>
                </div>
              ) : (
                <div className="drawer-section fade-in">
                  <label><CheckCircle2 size={14} /> Analysis Result</label>
                  
                  <div className={`result-badge ${selectedResult.conflicting === 'Yes' ? 'conflict' : 'clean'}`}>
                    {selectedResult.conflicting === 'Yes' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    <span>
                      {selectedResult.conflicting === 'Yes' ? `Conflict Found (${selectedResult.conflict_count})` : 'Conflict-Free'}
                    </span>
                  </div>

                  {selectedResult.conflicting === 'Yes' && (
                    <div className="conflict-details-preview fade-in">
                      {getConflictLines(selectedResult.info).map((line, i) => (
                        <div key={i} className="conflict-line">
                          <AlertTriangle size={12} />
                          <span>{line.replace('Conflict:', '').trim()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
        .start-btn { flex: 1; height: 46px; display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 0 2rem; border-radius: 10px; border: none; background: #6366f1; color: white; font-weight: 700; cursor: pointer; transition: transform 0.3s ease, background 0.3s ease, box-shadow 0.3s ease; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3); }
        .start-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-1px); }
        .start-btn.analyzing { background: #0ea5e9; flex: 2; }
        
        .actions-group {
          display: flex;
          gap: 1rem;
          align-items: center;
          /* Force hardware acceleration and prevent clipping */
          transform: translate3d(0, 0, 0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          isolation: isolate;
        }

        .stop-btn {
          flex: 1;
          height: 46px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0 1.5rem;
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        }

        .stop-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.3);
          transform: translateY(-1px);
        }

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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .actions-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .action-btn-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.8);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }

        .action-btn-link:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: #fff;
          transform: translateX(4px);
        }

        .action-btn-link .chevron {
          margin-left: auto;
          opacity: 0.3;
          transition: opacity 0.2s ease;
        }

        .action-btn-link:hover .chevron {
          opacity: 1;
        }

        .result-badge {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          font-weight: 600;
          font-size: 0.95rem;
        }

        .result-badge.clean {
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .result-badge.conflict {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .info-pre.error {
          border-left: 3px solid #f87171;
          background: rgba(239, 68, 68, 0.05);
        }

        .info-pre.success {
          border-left: 3px solid #4ade80;
          background: rgba(34, 197, 94, 0.05);
        }

        .conflict-details-preview {
          margin-bottom: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .conflict-line {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #f87171;
          font-size: 0.85rem;
          font-family: 'Inter', sans-serif;
          background: rgba(239, 68, 68, 0.05);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px dashed rgba(239, 68, 68, 0.2);
        }

        .log-expand-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .toggle-log-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 0.8rem;
          cursor: pointer;
          width: fit-content;
          padding: 0.25rem 0;
          transition: color 0.2s;
        }

        .toggle-log-btn:hover {
          color: #f6f6f6;
        }

        .rotate-90 {
          transform: rotate(90deg);
        }

        .symbols-accordion {
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        .symbols-table-container {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-top: none;
          border-bottom-left-radius: 8px;
          border-bottom-right-radius: 8px;
          padding: 0.5rem;
          max-height: 300px;
          overflow-y: auto;
        }

        .symbols-mini-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.75rem;
        }

        .symbols-mini-table th {
          text-align: left;
          padding: 0.4rem;
          color: rgba(255, 255, 255, 0.4);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-weight: 500;
        }

        .symbols-mini-table td {
          padding: 0.4rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .symbol-type-tag {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.7rem;
          text-transform: uppercase;
          font-weight: 600;
        }

        .symbol-type-tag.action {
          background: rgba(59, 130, 246, 0.1);
          color: #60a5fa;
        }

        .symbol-type-tag.individual {
          background: rgba(168, 85, 247, 0.1);
          color: #c084fc;
        }

        .action-btn-link.expanded {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          background: rgba(255, 255, 255, 0.06);
        }

        .pulse-icon { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .settings-toggle-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.8rem;
          aspect-ratio: 1 / 1;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #fff;
          opacity: 0.9;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .settings-toggle-btn:hover:not(:disabled) {
          background: rgba(168, 85, 247, 0.15);
          color: #fff;
          opacity: 1;
          border-color: rgba(168, 85, 247, 0.5);
          transform: rotate(30deg) scale(1.05);
        }

        .settings-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 2rem;
        }

        .settings-dialog {
          background: #1a1b26;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          width: 100%;
          max-width: 500px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          text-align: left;
        }

        .settings-header {
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .settings-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #fff;
        }

        .title-with-icon {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .icon-purple { color: #a855f7; }

        .close-dialog-btn {
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: rgba(255, 255, 255, 0.5);
          padding: 0.5rem;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-dialog-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
        }

        .settings-content {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          max-height: 70vh;
          overflow-y: auto;
        }

        .settings-section h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #a855f7;
          font-weight: 700;
        }

        .section-desc {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 1.25rem;
        }

        .export-options-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .export-option-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .export-option-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .export-option-card.active {
          background: rgba(168, 85, 247, 0.08);
          border-color: rgba(168, 85, 247, 0.3);
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.1);
        }

        .export-option-card input[type="radio"] {
          margin-top: 4px;
          accent-color: #a855f7;
        }

        .option-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .option-title {
          font-weight: 600;
          color: #fff;
          font-size: 0.95rem;
        }

        .option-desc {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.4;
        }

        .pruning-toggle-wrapper {
          margin-top: 1rem;
        }

        .pruning-checkbox-card {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1.25rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pruning-checkbox-card.active {
          background: rgba(168, 85, 247, 0.08);
          border-color: rgba(168, 85, 247, 0.3);
        }

        .checkbox-header {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .checkbox-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .text-green { color: #4ade80; }
        .text-gray { color: rgba(255, 255, 255, 0.3); }

        .checkbox-label {
          font-weight: 600;
          color: #fff;
          flex: 1;
        }

        .custom-checkbox {
          position: relative;
          width: 20px;
          height: 20px;
        }

        .custom-checkbox input {
          opacity: 0;
          width: 0; height: 0;
          position: absolute;
        }

        .checkmark {
          position: absolute;
          top: 0; left: 0;
          width: 20px; height: 20px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          transition: all 0.2s;
        }

        .custom-checkbox input:checked ~ .checkmark {
          background: #a855f7;
          border-color: #a855f7;
        }

        .checkmark:after {
          content: "";
          position: absolute;
          display: none;
          left: 6px; top: 2px;
          width: 5px; height: 10px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .custom-checkbox input:checked ~ .checkmark:after {
          display: block;
        }

        .checkbox-desc {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.4;
          margin: 0;
          padding-left: 3.25rem;
        }

        .settings-footer {
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: flex-end;
        }

        .apply-btn {
          background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%);
          border: none;
          color: #fff;
          padding: 0.8rem 2rem;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(168, 85, 247, 0.3);
        }

        .apply-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(168, 85, 247, 0.4);
        }

        .pop-in { animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      
      {showSettings && (
        <div className="settings-overlay fade-in" onClick={() => setShowSettings(false)}>
          <div className="settings-dialog pop-in" onClick={e => e.stopPropagation()}>
            <div className="settings-header">
              <div className="title-with-icon">
                <Settings size={20} className="icon-purple" />
                <h3>Global Batch Settings</h3>
              </div>
              <button className="close-dialog-btn" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="settings-content">
              <div className="settings-section">
                <h4>Automaton Export</h4>
                <p className="section-desc">Choose which automaton files should be generated for each file in the batch.</p>
                
                <div className="export-options-list">
                  <label className={`export-option-card ${exportOption === 'none' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="exportOption"
                      value="none"
                      checked={exportOption === 'none'} 
                      onChange={() => setExportOption('none')}
                    />
                    <div className="option-info">
                      <span className="option-title">Don't Export</span>
                      <span className="option-desc">Fastest analysis, only results are kept.</span>
                    </div>
                  </label>

                  <label className={`export-option-card ${exportOption === 'normal' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="exportOption"
                      value="normal"
                      checked={exportOption === 'normal'} 
                      onChange={() => setExportOption('normal')}
                    />
                    <div className="option-info">
                      <span className="option-title">Standard Automaton</span>
                      <span className="option-desc">Generates the .dot file for visualization.</span>
                    </div>
                  </label>

                  <label className={`export-option-card ${exportOption === 'min' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="exportOption"
                      value="min"
                      checked={exportOption === 'min'} 
                      onChange={() => setExportOption('min')}
                    />
                    <div className="option-info">
                      <span className="option-title">Minimal Automaton</span>
                      <span className="option-desc">Generates a smaller, optimized version.</span>
                    </div>
                  </label>

                  <label className={`export-option-card ${exportOption === 'both' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="exportOption"
                      value="both"
                      checked={exportOption === 'both'} 
                      onChange={() => setExportOption('both')}
                    />
                    <div className="option-info">
                      <span className="option-title">Both Formats</span>
                      <span className="option-desc">Generate both standard and minimal .dot files.</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <h4>Optimization</h4>
                <div className="pruning-toggle-wrapper">
                  <label className={`pruning-checkbox-card ${usePruning ? 'active' : ''}`}>
                    <div className="checkbox-header">
                      <div className="checkbox-icon">
                        {usePruning ? <ShieldCheck size={18} className="text-green" /> : <ZapOff size={18} className="text-gray" />}
                      </div>
                      <span className="checkbox-label">Use Pruning</span>
                      <div className="custom-checkbox">
                        <input 
                          type="checkbox" 
                          checked={usePruning}
                          onChange={(e) => setUsePruning(e.target.checked)}
                        />
                        <span className="checkmark"></span>
                      </div>
                    </div>
                    <p className="checkbox-desc">Apply aggressive pruning to reduce model size. Recommended for large contracts.</p>
                  </label>
                </div>
              </div>
            </div>

            <div className="settings-footer">
              <button className="apply-btn" onClick={() => setShowSettings(false)}>
                Apply to Batch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
