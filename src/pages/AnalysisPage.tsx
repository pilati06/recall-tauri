import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useAnalysisContext } from "../context/AnalysisContext";

export function AnalysisPage() {
  const { singleAnalysis } = useAnalysisContext();
  const {
    resultMsg, setResultMsg,
    filePath, setFilePath,
    logs, setLogs,
    pastedText, setPastedText,
    logsVisible, setLogsVisible,
    isAnalyzing, setIsAnalyzing,
  } = singleAnalysis;

  const [selectedMode] = useState('Default');
  const [exportAutomaton, setExportAutomaton] = useState(false);
  const [exportMinAutomaton, setExportMinAutomaton] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsVisible && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsVisible]);

  async function selectFile() {
    try {
      const selectedPath = await open({
        title: "Selecione o arquivo para processar",
        filters: [{ name: 'RCL', extensions: ['rcl'] }],
      });

      if (selectedPath) {
        const pathString = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
        setFilePath(pathString);
        setLogs([]); // Clear previous logs
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
    setLogs([]); 
    setResultMsg("Processing Contract...");

    try {
      let response;
      if (filePath) {
        response = await invoke("process_file", { 
          path: filePath, 
          mode: selectedMode,
          exportAutomaton,
          exportMinAutomaton
        });
      } else {
        response = await invoke("analyze_text", { 
          text: pastedText, 
          mode: selectedMode,
          exportAutomaton,
          exportMinAutomaton
        });
      }

      setResultMsg(String(response) || "Analysis completed.");
    } catch (error) {
      console.error("Erro ao analisar contrato:", error);
      const errorStr = String(error);
      setResultMsg(errorStr || "An unknown error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  }

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
    setLogs([]);
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
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Contract</h3>
        <textarea
          placeholder="Paste your .rcl contract content here..."
          value={pastedText}
          onChange={(e) => {
            setPastedText(e.target.value);
            if (filePath) setFilePath(""); // Clear path if user edits text
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
        <div className="button-row">
          <button onClick={selectFile} 
          disabled={isAnalyzing}
          style={{
              padding: '0.8rem 2rem',
              opacity: isAnalyzing ? 0.5 : 1,
              cursor: isAnalyzing ? 'not-allowed' : 'pointer'
            }}>
            Select File
          </button>
          <button 
            onClick={runAnalysis}
            disabled={!pastedText.trim() || isAnalyzing}
            style={{
              padding: '0.8rem 2rem',
              opacity: (pastedText.trim() && !isAnalyzing) ? 1 : 0.5,
              cursor: (pastedText.trim() && !isAnalyzing) ? 'pointer' : 'not-allowed'
            }}
          >
            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
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
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          marginTop: '0.5rem',
          gap: '0.5rem'
        }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            cursor: 'pointer',
            fontSize: '0.9rem',
            color: 'rgba(255, 255, 255, 0.8)'
          }}>
            <input 
              type="checkbox" 
              checked={exportAutomaton} 
              onChange={(e) => {
                const checked = e.target.checked;
                setExportAutomaton(checked);
                if (!checked) setExportMinAutomaton(false);
              }}
              disabled={isAnalyzing}
              style={{ cursor: 'pointer' }}
            />
            Export Automaton (.dot)
          </label>

          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            cursor: 'pointer',
            fontSize: '0.9rem',
            color: 'rgba(255, 255, 255, 0.8)',
            marginLeft: '1.5rem',
            opacity: exportAutomaton ? 1 : 0.5
          }}>
            <input 
              type="checkbox" 
              checked={exportMinAutomaton} 
              onChange={(e) => {
                const checked = e.target.checked;
                setExportMinAutomaton(checked);
                if (checked) setExportAutomaton(true);
              }}
              disabled={isAnalyzing}
              style={{ cursor: 'pointer' }}
            />
            Include Minimized Version (_min.dot)
          </label>
        </div>
      </div>

      {filePath && <p style={{ textAlign: 'center' }}>Selected file: <strong>{filePath}</strong></p>}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h3>Result summary</h3>
          <pre style={{ 
            background: '#1e1e1e',  
            color: '#d4d4d4', 
            fontSize: '0.8rem',
            fontFamily: 'monospace',
            padding: '1rem', 
            borderRadius: '12px', 
            textAlign:'left',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {resultMsg || "No results yet. Start analysis to see summary."}
          </pre>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Logs</h3>
            <button 
              onClick={() => setLogsVisible(!logsVisible)}
              style={{ padding: '4px 12px', fontSize: '0.75rem', boxShadow: 'none' }}
            >
              {logsVisible ? 'Hide' : 'Show'}
            </button>
          </div>
          
          {logsVisible && (
            <div style={{ 
              height: '400px', 
              overflowY: 'auto', 
              background: '#1e1e1e', 
              color: '#d4d4d4', 
              padding: '1rem', 
              borderRadius: '12px',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              {logs.length === 0 ? (
                <div style={{ color: 'rgba(255, 255, 255, 0.3)', textAlign: 'center', marginTop: '2rem' }}>
                  No logs generated yet.
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    <span style={{ color: '#569cd6' }}>[{log.date}]</span>{' '}
                    <span style={{ 
                      color: log.log_type === 'Minimal' ? '#4fc1ff' : 
                             log.log_type === 'Necessary' ? '#dcdcaa' : '#b5cea8'
                    }}>[{log.log_type}]</span>:{' '}
                    {log.message}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>

      <style>{`
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
          gap: 1rem;
          justify-content: center;
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
      `}</style>
    </div>
  );
}
