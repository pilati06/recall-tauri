import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

interface LogMessage {
  log_type: string;
  message: string;
  date: string;
}

export function AnalysisPage() {
  const [selectedMode] = useState('Default');

  const [resultMsg, setResultMsg] = useState("");
  const [filePath, setFilePath] = useState("");
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [pastedText, setPastedText] = useState("");

  const [logsVisible, setLogsVisible] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsVisible && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsVisible]);

  useEffect(() => {
    const unlisten = listen<LogMessage>("log-message", (event) => {
      console.log("Frontend received log:", event.payload); // DEBUG
      setLogs((prevLogs) => [...prevLogs, event.payload]);
    });

    const unlistenMemory = listen<string>("memory-overflow", (event) => {
      setResultMsg(
        `⚠️ MEMORY OVERFLOW\n\nThe analysis was terminated because memory usage exceeded the safe limit.\n\n${event.payload}`
      );
    });

    return () => {
      unlisten.then((f) => f());
      unlistenMemory.then((f) => f());
    };
  }, []);

  async function selectAndProcessFile() {
    try {
      const selectedPath = await open({
        title: "Selecione o arquivo para processar",
        filters: [{ name: 'RCL', extensions: ['rcl'] }],
      });

      if (selectedPath) {
        const pathString = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
        setFilePath(pathString);
        setLogs([]); // Clear previous logs
        setResultMsg("Processing Contract...");

        const response = await invoke("process_file", { 
          path: pathString, 
          mode: selectedMode 
        });

        setResultMsg(String(response) || "Analysis completed (no output)");
      } else {
        setFilePath("");
        setResultMsg("No file selected.");
      }
    } catch (error) {
      console.error("Erro ao selecionar ou processar arquivo:", error);
      const errorStr = String(error);
      setResultMsg(errorStr || "An unknown error occurred during analysis.");
    }
  }

  async function analyzePastedText() {
    if (!pastedText.trim()) {
      setResultMsg("Please paste a contract before analyzing.");
      return;
    }

    try {
      setFilePath(""); // Clear file path if analyzing pasted text
      setLogs([]); 
      setResultMsg("Processing Pasted Contract...");

      const response = await invoke("analyze_text", { 
        text: pastedText, 
        mode: selectedMode 
      });

      setResultMsg(String(response) || "Analysis completed (no output)");
    } catch (error) {
      console.error("Erro ao analisar texto colado:", error);
      const errorStr = String(error);
      setResultMsg(errorStr || "An unknown error occurred during analysis.");
    }
  }

  return (
    <div className="analysis-page">
      <h1>Analysis Tool</h1>
      <p className="subtitle">High-performance analysis tool for RCL files.</p>
      
      {/* <div className="mode-selector">
        {modes.map(mode => (
          <label key={mode}>
            <input
              type="radio"
              value={mode}
              checked={selectedMode === mode}
              onChange={handleChange}
            />
            {mode}
          </label>
        ))}
      </div> */}

      {/* <div className="row" style={{ marginBottom: '2rem' }}>
        
      </div> */}

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
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Paste Contract</h3>
        <textarea
          placeholder="Paste your .rcl contract content here..."
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
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
            boxSizing: 'border-box'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <button onClick={selectAndProcessFile} 
          style={{
              alignSelf: 'center',
              padding: '0.8rem 2rem',
            }}>
            Select and Process File
          </button>
          <button 
            onClick={analyzePastedText}
            disabled={!pastedText.trim()}
            style={{
              alignSelf: 'center',
              padding: '0.8rem 2rem',
              opacity: pastedText.trim() ? 1 : 0.5,
              cursor: pastedText.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Analyze Pasted Contract
          </button>
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
      `}</style>
    </div>
  );
}
