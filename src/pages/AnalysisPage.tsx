import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAnalysisContext } from "../context/AnalysisContext";
import { 
  Loader2, 
  Play, 
  FileText,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  AlertTriangle,
  Cpu,
  Zap,
  Box,
  Layout,
  ExternalLink,
  ChevronRight,
  FileCog,
  Settings,
  X,
  ShieldCheck,
  ZapOff
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

interface SymbolEntry {
  id: string;
  symbol_type: string;
  value: string;
}

interface ParsedResult {
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

export function AnalysisPage() {
  const { singleAnalysis } = useAnalysisContext();
  const {
    resultMsg, setResultMsg,
    filePath, setFilePath,
    pastedText, setPastedText,
    isAnalyzing, setIsAnalyzing,
  } = singleAnalysis;

  const [selectedMode] = useState('Default');
  const [exportOption, setExportOption] = useState<'none' | 'normal' | 'min' | 'both'>('none');
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [relatedFiles, setRelatedFiles] = useState<Record<string, string>>({});
  const [symbols, setSymbols] = useState<SymbolEntry[]>([]);
  const [isSymbolsExpanded, setIsSymbolsExpanded] = useState(false);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [isVirtualPath, setIsVirtualPath] = useState(false);
  const [usePruning, setUsePruning] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  async function selectFile() {
    try {
      const selectedPath = await open({
        title: "Selecione o arquivo para processar",
        filters: [{ name: 'RCL', extensions: ['rcl'] }],
      });

      if (selectedPath) {
        const pathString = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
        setFilePath(pathString);
        setIsVirtualPath(false);
        setResultMsg("");

        // Load file content into textarea
        try {
          const content = await invoke("read_file", { path: pathString });
          setPastedText(String(content));
          setResultMsg("File loaded. Click 'Run Analysis' to start.");
        } catch (readError) {
          console.error("Erro ao ler conteúdo do arquivo:", readError);
          setResultMsg("Error loading file content.");
        }
      }
    } catch (error) {
      console.error("Erro ao selecionar arquivo:", error);
      setResultMsg("Error selecting file.");
    }
  }

  async function runAnalysis() {
    if (!pastedText.trim()) {
      setResultMsg("Please load or paste a contract before analyzing.");
      return;
    }

    setIsAnalyzing(true);
    setResultMsg("Processing Contract...");

    try {
      const exportNormal = exportOption === 'normal' || exportOption === 'both';
      const exportMin = exportOption === 'min' || exportOption === 'both';

      const response = await invoke<string>("analyze_text", {
        text: pastedText,
        mode: selectedMode,
        exportAutomaton: exportNormal,
        exportMinAutomaton: exportMin,
        usePruning: usePruning,
        originPath: filePath || null,
      });

      let finalResponse = response;
      if (response.includes(";FILES_PATH:")) {
        const [cleanRes, fPath] = response.split(";FILES_PATH:");
        finalResponse = cleanRes;
        if (!filePath) { // Only update if we didn't start with a file
          setFilePath(fPath);
          setIsVirtualPath(true);
        }
      }

      const hasSummary = finalResponse.includes(";SUMMARY_DATA:");
      const hasErrorData = finalResponse.includes(";ERROR_DATA:");

      if (hasSummary || hasErrorData) {
        const divider = hasSummary ? ";SUMMARY_DATA:" : ";ERROR_DATA:";
        const [csvPart, dataPart] = finalResponse.split(divider);
        const parts = csvPart.split(";");
        
        setParsedResult({
          time_ms: parts[0] || "-",
          states: parts[1] || "-",
          transitions: parts[2] || "-",
          individuals: parts[3] || "-",
          actions: parts[4] || "-",
          conflicting: parts[5] === "1" ? "Yes" : (parts[5] === "0" ? "No" : "-"),
          conflict_count: parts[6] || "-",
          automaton_size: parts[7] || "-",
          max_memory: parts[8] || "-",
          status: hasSummary ? "Success" : "Error",
          info: dataPart || "",
        });
        
        if (hasSummary) {
          setResultMsg("Analysis completed successfully.");
        } else {
          setResultMsg(dataPart || "Analysis failed.");
        }
      } else {
        setParsedResult({
          time_ms: "-",
          states: "-",
          transitions: "-",
          individuals: "-",
          actions: "-",
          conflicting: "-",
          conflict_count: "-",
          automaton_size: "-",
          max_memory: "-",
          status: "Error",
          info: finalResponse
        });
        setResultMsg(finalResponse);
      }
    } catch (error) {
      console.error("Erro ao analisar contrato:", error);
      const errorStr = String(error);
      setParsedResult({
        time_ms: "-",
        states: "-",
        transitions: "-",
        individuals: "-",
        actions: "-",
        conflicting: "-",
        conflict_count: "-",
        automaton_size: "-",
        max_memory: "-",
        status: "Error",
        info: errorStr || "An unknown error occurred during analysis."
      });
      setResultMsg(errorStr || "An unknown error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  useEffect(() => {
    if (filePath && parsedResult) {
      invoke<Record<string, string>>("get_related_files", { path: filePath })
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
  }, [filePath, parsedResult]);

  const fetchSymbolTable = async () => {
    if (!filePath || !relatedFiles.log || symbols.length > 0) {
      if (symbols.length > 0) setIsSymbolsExpanded(!isSymbolsExpanded);
      return;
    }

    setIsLoadingSymbols(true);
    try {
      const data = await invoke<SymbolEntry[]>("get_symbol_table", { filePath: filePath });
      setSymbols(data);
      setIsSymbolsExpanded(true);
    } catch (err) {
      console.error("Failed to fetch symbols:", err);
    } finally {
      setIsLoadingSymbols(false);
    }
  };

  const getDetailedConflicts = (info: string) => {
    const blocks = info.split('-------------------------------------------------------');
    const conflicts = [];
    
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (block.startsWith('Conflict found in state')) {
        const summaryMatch = block.match(/Conflict:\s*(.+)/);
        const summary = summaryMatch ? summaryMatch[1].trim() : "Unknown conflict";
        
        let trace = "";
        let stacktrace = "";
        
        // Look ahead for Trace and Stacktrace blocks
        if (i + 1 < blocks.length && blocks[i + 1].trim().startsWith('Trace:')) {
          trace = blocks[i + 1].trim().replace('Trace:', '').trim();
          if (i + 2 < blocks.length && blocks[i + 2].trim().startsWith('Stacktrace:')) {
            stacktrace = blocks[i + 2].trim().replace('Stacktrace:', '').trim();
          }
        }
        
        conflicts.push({ summary, trace, stacktrace });
      }
    }
    return conflicts;
  };


  async function stopAnalysis() {
    try {
      await invoke("stop_analysis");
      setResultMsg("Analysis stopped by user.");
    } catch (error) {
      console.error("Failed to stop analysis:", error);
    }
  }

  function resetAnalysis() {
    setPastedText("");
    setFilePath("");
    setResultMsg("");
    setParsedResult(null);
    setRelatedFiles({});
    setSymbols([]);
    setIsSymbolsExpanded(false);
    setIsLoadingSymbols(false);
    setIsVirtualPath(false);
  }

  return (
    <div className="analysis-page">
      <h1>Analysis Tool</h1>
      <p className="subtitle">High-performance analysis tool for RCL files.</p>
      
      <div className="pasted-analysis-section" style={{ 
        marginBottom: '2rem', 
        padding: '1.5rem', 
        background: 'rgba(255, 255, 255, 0.03)', 
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
          {(filePath && !isVirtualPath) ? filePath.split(/[\\/]/).pop() : 'Contract'}
        </h3>
        <textarea
          placeholder="Paste your .rcl contract content here..."
          value={pastedText}
            onChange={(e) => {
              setPastedText(e.target.value);
              if (filePath) {
                setFilePath("");
                setIsVirtualPath(false);
              }
            }}
          disabled={isAnalyzing}
          style={{
            width: '100%',
            height: '200px',
            background: '#1a1a1a',
            color: '#f6f6f6',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '1rem',
            fontFamily: 'monospace',
            resize: 'vertical',
            fontSize: '0.9rem',
            outline: 'none',
            boxSizing: 'border-box',
            opacity: isAnalyzing ? 0.7 : 1
          }}
        />
        <div className="file-path-container" style={{
          minHeight: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: 'all 0.3s ease'
        }}>
          {filePath && !isVirtualPath && (
            <p className="file-path-message fade-in" style={{ margin: 0, textAlign: 'center' }}>
              Selected file: <strong>{filePath}</strong>
            </p>
          )}
        </div>
        
        <div className="button-row" style={{ isolation: 'isolate' }}>
          <button onClick={selectFile} 
          disabled={isAnalyzing}
          style={{
              padding: '0.8rem 2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: isAnalyzing ? 0.5 : 1,
              cursor: isAnalyzing ? 'not-allowed' : 'pointer'
            }}>
            <FolderOpen size={20} />
            <span>Select File</span>
          </button>
          <button 
            onClick={runAnalysis}
            disabled={!pastedText.trim() || isAnalyzing}
            style={{
              padding: '0.8rem 2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: (pastedText.trim() && !isAnalyzing) ? 1 : 0.5,
              cursor: (pastedText.trim() && !isAnalyzing) ? 'pointer' : 'not-allowed'
            }}
          >
            
            {isAnalyzing ? (
              <>
                <Loader2 size={20} className="spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Play size={20} />
                <span>Run Analysis</span>
              </>
            )}
            {/* {isAnalyzing ? 'Processing...' : 'Run Analysis'} */}
          </button>
          <button 
            onClick={isAnalyzing ? stopAnalysis : resetAnalysis}
            className="clear-btn"
            style={{
              padding: '0.8rem 2rem',
            }}
          >
            {isAnalyzing ? 'Stop Analysis' : 'Clear'}
          </button>

          <button 
            className="settings-toggle-btn"
            onClick={() => setShowSettings(true)}
            disabled={isAnalyzing}
            title="Analysis Settings"
          >
            <Settings size={22} />
          </button>
        </div>
        {showSettings && (
          <div className="settings-overlay fade-in" onClick={() => setShowSettings(false)}>
            <div className="settings-dialog pop-in" onClick={e => e.stopPropagation()}>
              <div className="settings-header">
                <div className="title-with-icon">
                  <Settings size={20} className="icon-purple" />
                  <h3>Analysis Settings</h3>
                </div>
                <button className="close-dialog-btn" onClick={() => setShowSettings(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="settings-content">
                <div className="settings-section">
                  <h4>Automaton Export</h4>
                  <p className="section-desc">Choose which automaton files should be generated during analysis.</p>
                  
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
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
      
      <div className="section-header">
        <FileText size={20} />
        <h2>Result</h2>
      </div>

      {(!parsedResult || (parsedResult && parsedResult.status === 'Error')) ? (
        <div style={{ flex: 1 }}>
          <pre style={{ 
            background: '#1e1e1e',  
            color: parsedResult?.status === 'Error' ? '#f87171' : '#d4d4d4', 
            fontSize: '0.8rem',
            fontFamily: 'monospace',
            padding: '1rem', 
            borderRadius: '12px', 
            textAlign:'left',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            border: parsedResult?.status === 'Error' ? '1px solid rgba(239, 68, 68, 0.2)' : 'none'
          }}>
            {parsedResult?.status === 'Error' ? parsedResult.info : (resultMsg || "No results yet. Start analysis to see summary.")}
          </pre>
        </div>
      ) : null}

  {parsedResult && (
    <div className="rich-result-container fade-in">
          <div className="metrics-grid">
            <div className="metric-card">
              <label><Zap size={14} /> Time</label>
              <span className="value">
                {parsedResult.time_ms !== "-" ? (parseFloat(parsedResult.time_ms) / 1000).toFixed(3) + 's' : "-"}
              </span>
            </div>
            <div className="metric-card">
               <label><Box size={14} /> Size</label>
               <span className="value">{parsedResult.automaton_size}</span>
            </div>
            <div className="metric-card">
               <label><Cpu size={14} /> Memory</label>
               <span className="value">{parsedResult.max_memory} MB</span>
            </div>
          </div>

          <div className="drawer-section">
            <label><ExternalLink size={14} /> Quick Actions</label>
            <div className="actions-list">
              {filePath && !isVirtualPath && (
                <button className="action-btn-link" onClick={() => revealItemInDir(filePath)}>
                  <FolderOpen size={16} />
                  <div className="btn-content">
                    <span>Show in Folder</span>
                    {isVirtualPath && <span className="btn-subtitle">{filePath.split(/[\\/]/).pop()}</span>}
                  </div>
                  <ChevronRight size={14} className="chevron" />
                </button>
              )}
              
              {relatedFiles.result && (
                <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.result)}>
                  <FileText size={16} />
                  <div className="btn-content">
                    <span>Open Result</span>
                    <span className="btn-subtitle">{relatedFiles.result.split(/[\\/]/).pop()}</span>
                  </div>
                  <ChevronRight size={14} className="chevron" />
                </button>
              )}
              
              {relatedFiles.log && (
                <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.log)}>
                  <FileCog size={16} />
                  <div className="btn-content">
                    <span>View Full Log</span>
                    <span className="btn-subtitle">{relatedFiles.log.split(/[\\/]/).pop()}</span>
                  </div>
                  <ChevronRight size={14} className="chevron" />
                </button>
              )}

              {relatedFiles.dot && (
                <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.dot)}>
                  <Layout size={16} />
                  <div className="btn-content">
                    <span>Automaton (DOT)</span>
                    <span className="btn-subtitle">{relatedFiles.dot.split(/[\\/]/).pop()}</span>
                  </div>
                  <ChevronRight size={14} className="chevron" />
                </button>
              )}

              {relatedFiles.min_dot && (
                <button className="action-btn-link" onClick={() => revealItemInDir(relatedFiles.min_dot)}>
                  <Layout size={16} />
                  <div className="btn-content">
                    <span>Min Automaton (DOT)</span>
                    <span className="btn-subtitle">{relatedFiles.min_dot.split(/[\\/]/).pop()}</span>
                  </div>
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
                <span>States:</span> <strong>{parsedResult.states}</strong>
             </div>
             <div className="metric-item">
                <span>Transitions:</span> <strong>{parsedResult.transitions}</strong>
             </div>
             <div className="metric-item">
                <span>Individuals:</span> <strong>{parsedResult.individuals}</strong>
             </div>
             <div className="metric-item">
                <span>Actions:</span> <strong>{parsedResult.actions}</strong>
             </div>
          </div>

          <div className="drawer-section fade-in">
            {parsedResult.status === "Error" ? (
              <>
                <label><AlertCircle size={14} /> Analysis Error</label>
                <pre className="info-pre error">
                  {parsedResult.info || "Unknown error occurred."}
                </pre>
              </>
            ) : (
              <>
                <label><CheckCircle2 size={14} /> Analysis Result</label>
                
                <div className={`result-badge ${parsedResult.conflicting === 'Yes' ? 'conflict' : 'clean'}`}>
                  {parsedResult.conflicting === 'Yes' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  <span>
                    {parsedResult.conflicting === 'Yes' ? `Conflict Found (${parsedResult.conflict_count})` : 'Conflict-Free'}
                  </span>
                </div>
                 {parsedResult.conflicting === 'Yes' && (
                   <div className="conflict-details-container fade-in">
                     {getDetailedConflicts(parsedResult.info).map((conflict, i) => (
                       <div key={i} className="detailed-conflict-card">
                         <div className="conflict-card-header">
                           <AlertTriangle size={14} className="icon-orange" />
                           <span className="conflict-summary">{conflict.summary}</span>
                         </div>
                         
                         {conflict.trace && (
                           <div className="conflict-sub-section">
                             <label><Zap size={10} /> Trace</label>
                             <pre className="trace-pre">{conflict.trace}</pre>
                           </div>
                         )}

                         {conflict.stacktrace && (
                           <div className="conflict-sub-section">
                             <label><Layout size={10} /> Stacktrace</label>
                             <pre className="stacktrace-pre">{conflict.stacktrace}</pre>
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 )}
              </>
            )}
          </div>
        </div>
      )}


      <style>{`
        .conflict-details-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-top: 1rem;
        }

        .detailed-conflict-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 152, 0, 0.2);
          border-radius: 12px;
          padding: 1.25rem;
          text-align: left;
          transition: transform 0.2s ease;
        }

        .detailed-conflict-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 152, 0, 0.4);
        }

        .conflict-card-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .conflict-summary {
          font-weight: 700;
          font-size: 0.95rem;
          color: #ffb74d;
          line-height: 1.4;
        }

        .icon-orange { color: #ffa726; flex-shrink: 0; margin-top: 2px; }

        .conflict-sub-section {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .conflict-sub-section label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 0.5rem;
        }

        .trace-pre, .stacktrace-pre {
          background: rgba(0, 0, 0, 0.2);
          padding: 0.75rem;
          border-radius: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
          color: #d4d4d4;
          line-height: 1.5;
        }

        .trace-pre { color: #9cdcfe; }
        .stacktrace-pre { color: #ce9178; }

        .analysis-page {
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
        .button-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 1rem 0 2rem 0;
          flex-wrap: wrap;
          justify-content: center;
          /* Force hardware acceleration and prevent clipping */
          transform: translate3d(0, 0, 0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        .button-row button {
          min-width: 140px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .button-row .settings-toggle-btn {
          min-width: unset;
        }

        .clear-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #f87171;
        }
        .clear-btn:hover {
          background: rgba(248, 113, 113, 0.1);
          border-color: rgba(248, 113, 113, 0.2);
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

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <style>{`
        .section-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1.5rem;
          margin-bottom: 1.25rem;
        }

        .section-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .rich-result-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          background: rgba(30, 41, 59, 0.3);
          padding: 1.5rem;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          text-align: left;
        }

        .drawer-section label { 
          display: flex; 
          align-items: center; 
          gap: 0.5rem; 
          font-size: 0.75rem; 
          font-weight: 700; 
          text-transform: uppercase; 
          color: #6366f1; 
          margin-bottom: 0.75rem; 
        }

        .metrics-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr 1fr; 
          gap: 1rem; 
        }

        .metric-card { 
          background: rgba(30, 41, 59, 0.5); 
          padding: 1rem; 
          border-radius: 12px; 
          border: 1px solid rgba(255, 255, 255, 0.05); 
          display: flex; 
          flex-direction: column; 
          gap: 0.25rem; 
        }

        .metric-card .value { 
          font-size: 1rem; 
          font-weight: 700; 
          color: #f8fafc; 
        }

        .summary-section { 
          background: rgba(99, 102, 241, 0.05); 
          padding: 1.25rem; 
          border-radius: 12px; 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 1rem; 
        }

        .metric-item { 
          font-size: 0.85rem; 
          display: flex; 
          justify-content: space-between; 
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          padding-bottom: 2px;
        }

        .actions-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
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

        .btn-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .btn-subtitle {
          font-size: 0.75rem;
          opacity: 0.5;
          font-family: 'JetBrains Mono', monospace;
          white-space: pre-wrap;
          word-break: break-all;
          line-height: 1.2;
          margin-top: 2px;
        }

        .result-badge {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          border-radius: 10px;
          margin-bottom: 1rem;
          font-weight: 600;
          font-size: 1rem;
        }

        .result-badge.clean {
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .result-badge.conflict {
          background: rgba(255, 255, 255, 0.05);
          color: #fbbf24;
          border: 1px solid rgba(255, 152, 0, 0.2);
        }

        .conflict-details-preview {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .conflict-line {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          color: #f87171;
          font-size: 0.85rem;
          background: rgba(239, 68, 68, 0.05);
          padding: 0.65rem 1rem;
          border-radius: 8px;
          border: 1px dashed rgba(239, 68, 68, 0.2);
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
          padding: 0.75rem;
          max-height: 350px;
          overflow-y: auto;
        }

        .symbols-mini-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
        }

        .symbols-mini-table th {
          text-align: left;
          padding: 0.5rem;
          color: rgba(255, 255, 255, 0.4);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-weight: 500;
        }

        .symbols-mini-table td {
          padding: 0.5rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .symbol-type-tag {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.7rem;
          text-transform: uppercase;
          font-weight: 700;
        }

        .symbol-type-tag.action {
          background: rgba(59, 130, 246, 0.1);
          color: #60a5fa;
        }

        .symbol-type-tag.individual {
          background: rgba(168, 85, 247, 0.1);
          color: #c084fc;
        }

        .settings-header {
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .title-with-icon {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

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
          z-index: 1000;
          padding: 2rem;
        }

        .settings-dialog {
          background: #1e293b;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          width: 100%;
          max-width: 500px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          text-align: left;
        }

        .settings-header {
          padding: 1.5rem 1.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .settings-header h3 { margin: 0; font-size: 1.2rem; }

        .close-dialog-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 50%;
          display: flex;
          transition: all 0.2s;
        }

        .close-dialog-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
        }

        .settings-content {
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          max-height: 70vh;
          overflow-y: auto;
        }

        .settings-section h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.95rem;
          color: #a855f7;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .section-desc {
          margin: 0 0 1.25rem 0;
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .export-options-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .export-option-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .export-option-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .export-option-card.active {
          background: rgba(168, 85, 247, 0.1);
          border-color: rgba(168, 85, 247, 0.3);
        }

        .export-option-card input[type="radio"] {
          width: 18px; height: 18px; accent-color: #a855f7;
        }

        .option-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .option-title { font-weight: 600; font-size: 0.95rem; }
        .option-desc { font-size: 0.8rem; color: rgba(255, 255, 255, 0.4); }

        .pruning-checkbox-card {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1.25rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pruning-checkbox-card.active {
          background: rgba(34, 197, 94, 0.05);
          border-color: rgba(34, 197, 94, 0.2);
        }

        .checkbox-header {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .checkbox-label { flex: 1; font-weight: 600; font-size: 1rem; }
        .checkbox-desc { margin: 0; font-size: 0.85rem; color: rgba(255, 255, 255, 0.4); padding-left: 2.15rem; }

        .settings-footer {
          padding: 1.25rem 1.75rem;
          background: rgba(0, 0, 0, 0.2);
          display: flex;
          justify-content: flex-end;
        }

        .apply-btn {
          padding: 0.75rem 2rem;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .apply-btn:hover { background: #4f46e5; transform: translateY(-1px); }

        .text-green { color: #4ade80; }
        .text-gray { color: rgba(255, 255, 255, 0.2); }
        .icon-purple { color: #a855f7; }

        .custom-checkbox { position: relative; width: 20px; height: 20px; }
        .custom-checkbox input { opacity: 0; width: 0; height: 0; }
        .checkmark {
          position: absolute; top: 0; left: 0; height: 20px; width: 20px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 5px;
        }
        .custom-checkbox input:checked ~ .checkmark { background: #22c55e; border-color: #22c55e; }
        .checkmark:after {
          content: ""; position: absolute; display: none;
          left: 6px; top: 2px; width: 5px; height: 10px;
          border: solid white; border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        .custom-checkbox input:checked ~ .checkmark:after { display: block; }

        .pop-in {
          animation: pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes pop-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .action-btn-link.expanded {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          background: rgba(255, 255, 255, 0.06);
        }

        .info-pre.error {
          background: rgba(239, 68, 68, 0.05);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-family: 'JetBrains Mono', monospace;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 0;
        }

        .mono { font-family: 'JetBrains Mono', monospace; }
        .rotate-90 { transform: rotate(90deg); }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        
        .spin { 
          animation: spin 1s linear infinite; 
          will-change: transform;
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
