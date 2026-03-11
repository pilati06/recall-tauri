import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";

// --- Types ---

export interface LogMessage {
  log_type: string;
  message: string;
  date: string;
}

export interface BatchResult {
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

export interface ProgressEvent {
  file: string;
  status: string;
  result: string | null;
  time_ms: number | null;
  progress: number;
}

export interface BatchLogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "error";
}

interface AnalysisContextType {
  // Single Analysis State
  singleAnalysis: {
    resultMsg: string;
    filePath: string;
    logs: LogMessage[];
    pastedText: string;
    logsVisible: boolean;
    isAnalyzing: boolean;
    setResultMsg: (msg: string) => void;
    setFilePath: (path: string) => void;
    setLogs: React.Dispatch<React.SetStateAction<LogMessage[]>>;
    setPastedText: (text: string) => void;
    setLogsVisible: (visible: boolean) => void;
    setIsAnalyzing: (val: boolean) => void;
  };
  
  // Batch Analysis State
  batchAnalysis: {
    folderPath: string | null;
    isAnalyzing: boolean;
    progress: number;
    currentFile: string;
    results: BatchResult[];
    logs: BatchLogEntry[];
    setFolderPath: (path: string | null) => void;
    setIsAnalyzing: (val: boolean) => void;
    setProgress: (val: number) => void;
    setCurrentFile: (val: string) => void;
    setResults: React.Dispatch<React.SetStateAction<BatchResult[]>>;
    setLogs: React.Dispatch<React.SetStateAction<BatchLogEntry[]>>;
    addLog: (message: string, type?: "info" | "success" | "error") => void;
    batchCsvPath: string;
    setBatchCsvPath: (path: string) => void;
  };
}

// --- Context ---

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined);

export const useAnalysisContext = () => {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error("useAnalysisContext must be used within an AnalysisProvider");
  return context;
};

// --- Provider ---

export const AnalysisProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Single Analysis State
  const [singleResultMsg, setSingleResultMsg] = useState("");
  const [singleFilePath, setSingleFilePath] = useState("");
  const [singleLogs, setSingleLogs] = useState<LogMessage[]>([]);
  const [singlePastedText, setSinglePastedText] = useState("");
  const [singleLogsVisible, setSingleLogsVisible] = useState(false);
  const [singleIsAnalyzing, setSingleIsAnalyzing] = useState(false);

  // Batch Analysis State
  const [batchFolderPath, setBatchFolderPath] = useState<string | null>(null);
  const [batchIsAnalyzing, setBatchIsAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchCurrentFile, setBatchCurrentFile] = useState("");
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchLogs, setBatchLogs] = useState<BatchLogEntry[]>([]);
  const [batchCsvPath, setBatchCsvPath] = useState("");

  const addBatchLog = useCallback((message: string, type: "info" | "success" | "error" = "info") => {
    const entry: BatchLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setBatchLogs(prev => [...prev.slice(-49), entry]);
  }, []);

  // Listeners
  useEffect(() => {
    // Single Analysis Log Listener
    const unlistenLog = listen<LogMessage>("log-message", (event) => {
      console.log("Context received log:", event.payload);
      setSingleLogs((prevLogs) => [...prevLogs, event.payload]);
    });

    // Single Analysis Memory Overflow Listener
    const unlistenMemory = listen<string>("memory-overflow", (event) => {
      setSingleResultMsg(
        `⚠️ MEMORY OVERFLOW\n\nThe analysis was terminated because memory usage exceeded the safe limit.\n\n${event.payload}`
      );
    });

    // Batch Analysis Progress Listener
    const unlistenBatch = listen<ProgressEvent>("batch-progress", (event) => {
      setBatchProgress(event.payload.progress * 100);
      setBatchCurrentFile(event.payload.file);
      
      const fileName = event.payload.file.split(/[\\/]/).pop() || event.payload.file;

      if (event.payload.status === "Processing") {
        addBatchLog(`Processing: ${fileName}`, "info");
      } else if (event.payload.status === "Success") {
        addBatchLog(`Completed: ${fileName}`, "success");
        if (event.payload.result) {
          const [csvPart, summaryPart] = event.payload.result.split(";SUMMARY_DATA:");
          const parts = csvPart.split(";");
          
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
            info: summaryPart || "",
          };
          setBatchResults((prev) => [...prev, newResult]);
        }
      } else {
        addBatchLog(`Error: ${fileName} - ${event.payload.result || "Unknown error"}`, "error");
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
        setBatchResults((prev) => [...prev, newResult]);
      }
    });

    return () => {
      unlistenLog.then(f => f());
      unlistenMemory.then(f => f());
      unlistenBatch.then(f => f());
    };
  }, [addBatchLog]);

  const value = {
    singleAnalysis: {
      resultMsg: singleResultMsg,
      filePath: singleFilePath,
      logs: singleLogs,
      pastedText: singlePastedText,
      logsVisible: singleLogsVisible,
      isAnalyzing: singleIsAnalyzing,
      setResultMsg: setSingleResultMsg,
      setFilePath: setSingleFilePath,
      setLogs: setSingleLogs,
      setPastedText: setSinglePastedText,
      setLogsVisible: setSingleLogsVisible,
      setIsAnalyzing: setSingleIsAnalyzing,
    },
    batchAnalysis: {
      folderPath: batchFolderPath,
      isAnalyzing: batchIsAnalyzing,
      progress: batchProgress,
      currentFile: batchCurrentFile,
      results: batchResults,
      logs: batchLogs,
      setFolderPath: setBatchFolderPath,
      setIsAnalyzing: setBatchIsAnalyzing,
      setProgress: setBatchProgress,
      setCurrentFile: setBatchCurrentFile,
      setResults: setBatchResults,
      setLogs: setBatchLogs,
      addLog: addBatchLog,
      batchCsvPath,
      setBatchCsvPath,
    }
  };

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
};
