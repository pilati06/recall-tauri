pub mod algorithms;
pub mod model;
pub mod parser;
pub mod utils;

use algorithms::action_extractor::*;
use algorithms::clause_decomposer::*;
use algorithms::conflict_searcher::*;
use model::actions::*;
use model::automata::*;
use model::contracts::*;
use utils::*;
use std::fs;
use std::path::Path;
use std::time::Instant;
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri::{Emitter, Manager};
use std::sync::Mutex;
use tauri_plugin_shell::process::CommandChild;
use std::collections::{HashMap, HashSet};

pub struct AnalysisState {
    pub child_processes: Mutex<HashMap<String, CommandChild>>,
    pub stopped_processes: Mutex<HashSet<String>>,
    pub locked_files: Mutex<HashMap<String, Vec<std::fs::File>>>,
}

#[derive(Clone, Serialize)]
struct SymbolEntry {
    id: String,
    symbol_type: String,
    value: String,
}

#[derive(Clone, Serialize)]
struct BatchProgress {
    file: String,
    status: String,
    result: Option<String>,
    time_ms: Option<u64>,
    progress: f32,
}

#[tauri::command]
async fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    if let Some(folder_path) = folder {
        return Ok(Some(folder_path.to_string()));
    }
    Ok(None)
}

#[tauri::command]
async fn run_batch_analysis(
    app: tauri::AppHandle, 
    folder_path: String,
    export_automaton: bool,
    export_min_automaton: bool,
    use_pruning: bool
) -> Result<String, String> {
    let state = app.state::<AnalysisState>();
    
    // Clear stop flag before starting
    {
        let mut stopped = state.stopped_processes.lock().unwrap();
        stopped.remove("batch_analysis");
    }

    let path = Path::new(&folder_path);
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("rcl") {
            files.push(path.to_string_lossy().to_string());
        }
    }

    if files.is_empty() {
        return Err("No .rcl files found in the directory".to_string());
    }

    use tauri::Emitter;
    let total = files.len() as f32;
    let mut csv_results = String::from("file;time_ms;states;transitions;individuals;actions;conflicting;conflict_count;automaton_size_mb;max_memory_mb;obs\n");

    let add_log = |message: &str, status: &str| {
        let _ = app.emit("batch-progress", BatchProgress {
            file: "".to_string(),
            status: status.to_string(),
            result: Some(message.to_string()),
            time_ms: None,
            progress: 0.0,
        });
    };

    for (i, file_path) in files.iter().enumerate() {
        // Check if stopped before starting a new file
        {
            let stopped = state.stopped_processes.lock().unwrap();
            if stopped.contains("batch_analysis") {
                add_log("Batch analysis stopped by user.", "info");
                break;
            }
        }

        let file_name = Path::new(file_path).file_name().and_then(|s| s.to_str()).unwrap_or(file_path);
        
        let _ = app.emit("batch-progress", BatchProgress {
            file: file_path.to_string(),
            status: "Processing".to_string(),
            result: None,
            time_ms: None,
            progress: (i as f32) / total,
        });

        let start = Instant::now();
        
        // Lock the file during its processing time with Windows-safe sharing mode
        let _rcl_file = FileUtil::open_protected(file_path, false, false, false)
            .map_err(|e| format!("Failed to open {} for protection: {}", file_name, e))?;

        let sidecar = app.shell().sidecar("analyzer").map_err(|e| e.to_string())?;
        
        let mut args = vec![file_path.clone(), "-t".to_string()];
        
        if export_automaton {
            args.push("-g".to_string());
        }
        if export_min_automaton {
            args.push("-m".to_string());
        }
        if !use_pruning {
            args.push("-n".to_string());
        }

        // Use spawn to allow killing the process later
        let (mut rx, child) = sidecar
            .args(args)
            .spawn()
            .map_err(|e| format!("Failed to spawn batch sidecar: {}", e))?;

        // Register batch process
        {
            let mut processes = state.child_processes.lock().unwrap();
            processes.insert("batch_analysis".to_string(), child);
        }

        let mut stdout_full = String::new();
        let mut stderr = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    stdout_full.push_str(&String::from_utf8_lossy(&line_bytes));
                }
                CommandEvent::Stderr(line_bytes) => {
                    stderr.push_str(&String::from_utf8_lossy(&line_bytes));
                }
                _ => {}
            }
        }

        let elapsed = start.elapsed().as_millis() as u64;

        // Unregister after file is done
        {
            let mut processes = state.child_processes.lock().unwrap();
            processes.remove("batch_analysis");
        }

        // Final check: was it stopped during execution?
        {
            let stopped = state.stopped_processes.lock().unwrap();
            if stopped.contains("batch_analysis") {
                add_log(&format!("File {} analysis interrupted (stopped).", file_name), "info");
                break;
            }
        }

        let mut summary = String::new();
        let mut in_summary = false;
        for line in stdout_full.lines() {
            if line.trim() == "FINAL_SUMMARY_START" {
                in_summary = true;
                continue;
            }
            if line.trim() == "FINAL_SUMMARY_END" {
                in_summary = false;
                continue;
            }
            if in_summary {
                summary.push_str(line);
                summary.push('\n');
            }
        }
        let summary = summary.trim().to_string();

        let stdout = stdout_full.lines()
            .find(|l| l.trim().starts_with("RESULT_CSV:"))
            .map(|l| l.trim().replace("RESULT_CSV:", ""))
            .unwrap_or_default();

        if !stdout.is_empty() {
            csv_results.push_str(&format!("{};{}\n", file_name, stdout));
            let _ = app.emit("batch-progress", BatchProgress {
                file: file_path.to_string(),
                status: "Success".to_string(),
                result: Some(format!("{};SUMMARY_DATA:{}", stdout, summary)),
                time_ms: Some(elapsed),
                progress: (i + 1) as f32 / total,
            });
        } else {
            let mut error_msg = stderr;
            if error_msg.is_empty() {
                error_msg = stdout_full.lines()
                    .find(|l| l.contains("CRITICAL:"))
                    .map(|l| l.trim().to_string())
                    .unwrap_or_else(|| "Unknown error or interrupted".to_string());
            }
            
            csv_results.push_str(&format!("{};{};-;-;-;-;-;-;-;-;{} \n", 
                file_name, 
                elapsed, 
                error_msg.replace(";", ",").replace("\n", " ")
            ));
            let _ = app.emit("batch-progress", BatchProgress {
                file: file_path.to_string(),
                status: "Error".to_string(),
                result: Some(error_msg),
                time_ms: Some(elapsed),
                progress: (i + 1) as f32 / total,
            });
        }
    }

    let folder_name = Path::new(&folder_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("batch_results");
    
    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let results_filename = format!("{}_{}.csv", folder_name, timestamp);
    let results_path = Path::new(&folder_path).join(results_filename);
    
    fs::write(&results_path, &csv_results).map_err(|e| format!("Failed to save results: {}", e))?;

    Ok(format!("Batch analysis completed. Results saved to {}", results_path.display()))
}

async fn run_analysis_internal(app_handle: tauri::AppHandle, path: String, mode: String, export_automaton: bool, export_min_automaton: bool, use_pruning: bool) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_shell::process::CommandEvent;
    use std::sync::{Arc, Mutex};

    let sidecar = app_handle.shell().sidecar("analyzer").map_err(|e| e.to_string())?;
    
    let mut args = vec![path.clone()];
    if mode == "Verbose" {
        args.push("-v".to_string());
    } else if mode == "Test" {
        args.push("-t".to_string());
    }

    if export_automaton {
        args.push("-g".to_string());
    }

    if export_min_automaton {
        args.push("-m".to_string());
    }

    if !use_pruning {
        args.push("-n".to_string());
    }

    let (mut rx, child) = sidecar
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Lock the input file to prevent deletion during analysis (Windows persistent protection)
    let file = FileUtil::open_protected(&path, false, false, false)
        .map_err(|e| format!("Failed to open file for protection: {}", e))?;

    // Store the child process and the locked handle for the single analysis
    {
        let state = app_handle.state::<AnalysisState>();
        let mut processes = state.child_processes.lock().unwrap();
        processes.insert("single_analysis".to_string(), child);
        
        let mut locks = state.locked_files.lock().unwrap();
        locks.insert("single_analysis".to_string(), vec![file]);
    }

    let stdout_acc = Arc::new(Mutex::new(String::new()));
    let stderr_acc = Arc::new(Mutex::new(String::new()));
    
    let stdout_acc_clone = stdout_acc.clone();
    let stderr_acc_clone = stderr_acc.clone();
    let app_clone = app_handle.clone();

    let get_date = || chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let start_instant = std::time::Instant::now();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes).to_string();
                stdout_acc_clone.lock().unwrap().push_str(&line);
                
                for l in line.lines() {
                    let trimmed = l.trim();
                    if trimmed == "FINAL_SUMMARY_START" || trimmed == "FINAL_SUMMARY_END" || trimmed.starts_with("RESULT_CSV:") {
                        continue;
                    }
                    let _ = app_clone.emit("log-message", LogPayload {
                        log_type: LogType::Minimal,
                        message: l.to_string(),
                        date: get_date(),
                    });
                }
            }
            CommandEvent::Stderr(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes).to_string();
                stderr_acc_clone.lock().unwrap().push_str(&line);
                
                for l in line.lines() {
                    let _ = app_clone.emit("log-message", LogPayload {
                        log_type: LogType::Necessary,
                        message: l.to_string(),
                        date: get_date(),
                    });
                }
            }
            CommandEvent::Terminated(status) => {
                let stdout = stdout_acc.lock().unwrap().clone();
                let stderr = stderr_acc.lock().unwrap().clone();
                let elapsed = start_instant.elapsed().as_millis();

                // Cleanup here since we return early
                {
                    let state = app_handle.state::<AnalysisState>();
                    let mut processes = state.child_processes.lock().unwrap();
                    processes.remove("single_analysis");
                    
                    let mut locks = state.locked_files.lock().unwrap();
                    locks.remove("single_analysis");
                }
                if status.code == Some(0) {
                    let mut in_summary = false;
                    let mut summary_lines = Vec::new();
                    
                    for line in stdout.lines() {
                        let trimmed = line.trim();
                        if trimmed == "FINAL_SUMMARY_START" {
                            in_summary = true;
                            continue;
                        }
                        if trimmed == "FINAL_SUMMARY_END" {
                            in_summary = false;
                            continue;
                        }
                        if in_summary {
                            summary_lines.push(line);
                        }
                    }

                    let csv_line = stdout.lines()
                        .find(|l| l.trim().starts_with("RESULT_CSV:"))
                        .map(|l| l.trim().replace("RESULT_CSV:", ""))
                        .unwrap_or_default();

                    let summary = if summary_lines.is_empty() {
                        // Fallback: everything except CSV and completion markers
                        stdout.lines()
                            .filter(|l| {
                                let t = l.trim();
                                !t.starts_with("RESULT_CSV:") && 
                                t != "Analysis completed successfully" && // Match analyzer's success message
                                t != "FINAL_SUMMARY_START" && 
                                t != "FINAL_SUMMARY_END"
                            })
                            .collect::<Vec<_>>()
                            .join("\n")
                    } else {
                        summary_lines.join("\n")
                    };

                    let final_result = if !csv_line.is_empty() {
                        format!("{};SUMMARY_DATA:{}", csv_line, summary.trim())
                    } else {
                        // If for some reason CSV wasn't found, we use our manual timer as first column
                        format!("{};0;0;0;0;0;0;0;0;SUMMARY_DATA:{}", elapsed, summary.trim())
                    };

                    return Ok(final_result);
                } else {
                    let mut is_stopped = false;
                    {
                        let state = app_handle.state::<AnalysisState>();
                        let mut stopped = state.stopped_processes.lock().unwrap();
                        if stopped.remove("single_analysis") {
                            is_stopped = true;
                        }
                    }

                    if is_stopped {
                        return Err("Analysis stopped by the user.".to_string());
                    }

                    let mut error_msg = stderr.trim().to_string();
                    if error_msg.is_empty() {
                        error_msg = stdout.lines()
                            .find(|l| l.contains("CRITICAL:"))
                            .map(|l| l.trim().to_string())
                            .unwrap_or_else(|| format!("Analysis failed with exit code {:?}", status.code));
                    }
                    
                    // Return structured error with time
                    return Ok(format!("{};0;0;0;0;0;0;0;0;ERROR_DATA:{}", elapsed, error_msg));
                }
            }
            _ => {}
        }
    }

    // Remove the process and lock from tracking after finished
    {
        let state = app_handle.state::<AnalysisState>();
        let mut processes = state.child_processes.lock().unwrap();
        processes.remove("single_analysis");

        let mut locks = state.locked_files.lock().unwrap();
        locks.remove("single_analysis");
    }

    Err("Sidecar process closed unexpectedly".to_string())
}

#[tauri::command]
async fn process_file(app_handle: tauri::AppHandle, path: String, mode: String, export_automaton: bool, export_min_automaton: bool, use_pruning: bool) -> Result<String, String> {
    if !std::path::Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }
    run_analysis_internal(app_handle, path, mode, export_automaton, export_min_automaton, use_pruning).await
}

fn get_next_versioned_stem(parent: &Path, stem: &str) -> String {
    let mut n = 1;
    loop {
        let name = format!("{} ({})", stem, n);
        let path = parent.join(format!("{}.rcl", name));
        if !path.exists() {
            return name;
        }
        n += 1;
    }
}

#[tauri::command]
async fn analyze_text(
    app_handle: tauri::AppHandle,
    text: String,
    mode: String,
    export_automaton: bool,
    export_min_automaton: bool,
    use_pruning: bool,
    origin_path: Option<String>,
) -> Result<String, String> {
    use std::path::PathBuf;

    // 1. Determine if the content has changed or is new
    let mut has_changed = true;
    let mut original_stem = String::from("contract");
    let mut base_output_dir: Option<PathBuf> = None;

    if let Some(ref orig) = origin_path {
        let orig_path = std::path::Path::new(orig);
        if orig_path.exists() {
            if let Ok(orig_content) = fs::read_to_string(orig_path) {
                if orig_content.trim() == text.trim() {
                    has_changed = false;
                }
            }
            // Strip any existing version numbers like " (1)" OR timestamps like "_2024..." from the stem for base matching
            let stem_full = orig_path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("contract");
            
            let re_v = regex::Regex::new(r"\s\(\d+\)$").unwrap();
            let re_ts = regex::Regex::new(r"_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$").unwrap();
            
            let stem_no_v = re_v.replace(stem_full, "").to_string();
            original_stem = re_ts.replace(&stem_no_v, "").to_string();
            
            base_output_dir = orig_path.parent().map(|p| p.to_path_buf());
        }
    }

    // 2. Generate unique and base names for this analysis run
    let ts = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let temp_stem = format!("recall_analysis_{}", ts);
    let base_recall_stem = String::from("recall_analysis"); // Used when no original file
    
    // Resolve final output directory and stems
    let re_ts = regex::Regex::new(r"_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$").unwrap();
    let re_v = regex::Regex::new(r"\s\(\d+\)$").unwrap();

    let (output_dir, _output_stem_no_ts, output_stem_for_rcl, output_stem_ts): (PathBuf, String, String, String) = if let Some(parent) = base_output_dir {
        // Case 1 & 2: Selected file
        let current_stem = Path::new(origin_path.as_ref().unwrap()).file_stem().and_then(|s| s.to_str()).unwrap_or(&original_stem).to_string();
        
        if has_changed {
            // If the current file is already versioned, we keep the SAME versioned name (overwrite)
            // Otherwise, we create a NEW version (increment)
            let stem_for_rcl = if re_v.is_match(&current_stem) {
                current_stem.clone()
            } else {
                get_next_versioned_stem(&parent, &original_stem)
            };
            
            let stem_ts = format!("{}_{}", re_ts.replace(&stem_for_rcl, ""), ts);
            (parent, original_stem, stem_for_rcl, stem_ts)
        } else {
            // Unchanged: use the CURRENT stem
            let current_stem_no_ts = re_ts.replace(&current_stem, "").to_string();
            let stem_ts = format!("{}_{}", current_stem_no_ts, ts);
            (parent, original_stem, current_stem, stem_ts)
        }
    } else {
        // Case 3: Pasted contract (no original file) -> use TIMESTAMP for rcl to avoid overwriting
        let docs_dir: PathBuf = dirs::document_dir()
            .or_else(|| dirs::home_dir().map(|h| h.join("Documents")))
            .unwrap_or_else(|| std::env::temp_dir());
        let recall_dir = docs_dir.join("Recall");
        let stem_ts = format!("{}_{}", base_recall_stem, ts);
        (recall_dir, base_recall_stem.clone(), stem_ts.clone(), stem_ts)
    };

    // 3. Always write analysis content to a TEMP file first
    let temp_dir = std::env::temp_dir();
    let temp_rcl = temp_dir.join(format!("{}.rcl", temp_stem));
    let temp_rcl_str = temp_rcl.to_string_lossy().to_string();

    fs::write(&temp_rcl, &text)
        .map_err(|e| format!("Failed to create temp analysis file: {}", e))?;

    // 4. Run the analysis using the temp file path
    let result = run_analysis_internal(
        app_handle,
        temp_rcl_str.clone(),
        mode,
        export_automaton,
        export_min_automaton,
        use_pruning,
    )
    .await;

    // 5. Ensure output directory exists
    if let Err(e) = fs::create_dir_all(&output_dir) {
        eprintln!("Warning: could not create output dir '{}': {}", output_dir.display(), e);
    } else {
        // 6. Copy temp outputs (.result, .log) to final destination
        
        // Log is special: APPEND to the log corresponding to the current rcl version
        let src_log = temp_dir.join(format!("{}.log", temp_stem));
        let dst_log = output_dir.join(format!("{}.log", output_stem_for_rcl));
        if src_log.exists() {
            if let Ok(log_content) = fs::read(&src_log) {
                use std::io::Write;
                let mut options = fs::OpenOptions::new();
                options.create(true).append(true);
                if let Ok(mut file) = options.open(&dst_log) {
                    let _ = writeln!(file, "\n--- Analysis Execution: {} ---", ts);
                    let _ = file.write_all(&log_content);
                }
            }
            let _ = fs::remove_file(&src_log);
        }

        // Result and others: always WITH timestamp, based on the versioned stem
        let src_res = temp_dir.join(format!("{}.result", temp_stem));
        let dst_res = output_dir.join(format!("{}.result", output_stem_ts));
        if src_res.exists() {
            let _ = fs::copy(&src_res, &dst_res);
            let _ = fs::remove_file(&src_res);
        }

        // Conditionally copy .dot / _min.dot
        if export_automaton {
            let src = temp_dir.join(format!("{}.dot", temp_stem));
            let dst = output_dir.join(format!("{}.dot", output_stem_ts));
            if src.exists() {
                let _ = fs::copy(&src, &dst);
                let _ = fs::remove_file(&src);
            }
        }
        if export_min_automaton {
            let src = temp_dir.join(format!("{}_min.dot", temp_stem));
            let dst = output_dir.join(format!("{}_min.dot", output_stem_ts));
            if src.exists() {
                let _ = fs::copy(&src, &dst);
                let _ = fs::remove_file(&src);
            }
        }

        // 7. Save the .rcl contract itself WITH versioning (only if modified or new)
        if has_changed || origin_path.is_none() {
            let dst_rcl = output_dir.join(format!("{}.rcl", output_stem_for_rcl));
            let _ = fs::write(&dst_rcl, &text);
        }
    }

    // Always clean up the temp .rcl
    let _ = fs::remove_file(&temp_rcl);

    match result {
        Ok(res) => {
            let final_rcl_path = output_dir.join(format!("{}.rcl", output_stem_for_rcl));
            Ok(format!("{};FILES_PATH:{}", res, final_rcl_path.to_string_lossy()))
        },
        Err(e) => Err(e)
    }
}


#[tauri::command]
async fn stop_analysis(state: tauri::State<'_, AnalysisState>) -> Result<(), String> {
    let mut processes = state.child_processes.lock().map_err(|e| e.to_string())?;
    
    let mut stopped_any = false;

    // Check single analysis
    if let Some(child) = processes.remove("single_analysis") {
        {
            let mut stopped = state.stopped_processes.lock().unwrap();
            stopped.insert("single_analysis".to_string());
        }
        let _ = child.kill();
        stopped_any = true;
    }

    // Check batch analysis
    if let Some(child) = processes.remove("batch_analysis") {
        {
            let mut stopped = state.stopped_processes.lock().unwrap();
            stopped.insert("batch_analysis".to_string());
        }
        let _ = child.kill();
        stopped_any = true;
    }

    if stopped_any {
        Ok(())
    } else {
        Err("No active analysis to stop".to_string())
    }
}


#[tauri::command]
async fn get_related_files(path: String) -> HashMap<String, String> {
    let mut related = HashMap::new();
    let rcl_path = Path::new(&path);
    let parent = rcl_path.parent().unwrap_or(Path::new(""));
    let stem = rcl_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

    if stem.is_empty() {
        return related;
    }

    let extensions = vec!["log", "result", "dot", "csv", "min_dot"];
    
    // Regex for timestamp: _YYYY-MM-DD_HH-MM-SS
    let re_ts = regex::Regex::new(r"_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$").unwrap();
    // Regex for version: (N)
    let re_v = regex::Regex::new(r"\s\(\d+\)$").unwrap();
    
    let stem_no_ts = re_ts.replace(stem, "").to_string();
    let base_stem = re_v.replace(&stem_no_ts, "").to_string();

    for ext_key in extensions {
        let ext = if ext_key == "min_dot" { "dot" } else { ext_key };
        
        let file_path = if ext_key == "log" {
            // Log logic: try direct match, versioned log, then base log
            let logs_to_try = vec![
                parent.join(format!("{}.log", stem)),
                parent.join(format!("{}.log", stem_no_ts)),
                parent.join(format!("{}.log", base_stem)),
            ];
            
            let mut found_log = logs_to_try[0].clone();
            for log in logs_to_try {
                if log.exists() {
                    found_log = log;
                    break;
                }
            }
            found_log
        } else {
            // Other files use the current stem
            let current_stem = stem;
            if ext_key == "min_dot" {
                parent.join(format!("{}_min.dot", current_stem))
            } else {
                parent.join(format!("{}.{}", current_stem, ext))
            }
        };

        if file_path.exists() {
            related.insert(ext_key.to_string(), file_path.to_string_lossy().to_string());
        } else if ext_key != "log" {
            // If not found and not a log, look for the MOST RECENT timestamped version
            // Note: we strip any existing TS from 'stem' to keep results tied to the base version (e.g. "contract (1)_TS.result")
            let stem_prefix = re_ts.replace(stem, "").to_string();
            if let Ok(entries) = fs::read_dir(parent) {
                let mut matches = Vec::new();
                let pattern = if ext_key == "min_dot" {
                    format!(r"{}(_\d{{4}}-\d{{2}}-\d{{2}}_\d{{2}}-\d{{2}}-\d{{2}})_min\.dot$", regex::escape(&stem_prefix))
                } else {
                    format!(r"{}(_\d{{4}}-\d{{2}}-\d{{2}}_\d{{2}}-\d{{2}}-\d{{2}})\.{}$", regex::escape(&stem_prefix), regex::escape(ext))
                };
                if let Ok(re_file) = regex::Regex::new(&pattern) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if re_file.is_match(&name) {
                            if let Ok(meta) = entry.metadata() {
                                if let Ok(modified) = meta.modified() {
                                    matches.push((modified, entry.path().to_string_lossy().to_string()));
                                }
                            }
                        }
                    }
                }
                matches.sort_by(|a, b| b.0.cmp(&a.0)); // Newest first
                if let Some((_, path)) = matches.into_iter().next() {
                    related.insert(ext_key.to_string(), path);
                }
            }
        }
    }
    
    related
}

#[tauri::command]
async fn get_symbol_table(file_path: String) -> Result<Vec<SymbolEntry>, String> {
    // We try to read from the .result file first as it's cleaner (overwritten per session)
    // If not found or empty, fallback to .log (which might be appended)
    let path = Path::new(&file_path);
    let parent = path.parent().unwrap_or(Path::new(""));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    
    if stem.is_empty() {
        return Err("Invalid file path".to_string());
    }

    let mut result_path = parent.join(format!("{}.result", stem));
    
    // Regexes
    let re_ts = regex::Regex::new(r"_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$").unwrap();
    let re_v = regex::Regex::new(r"\s\(\d+\)$").unwrap();
    
    let stem_no_ts = re_ts.replace(stem, "").to_string();
    let base_stem = re_v.replace(&stem_no_ts, "").to_string();
    
    // Try direct stem first, then versioned, then base
    let logs_to_try = vec![
        parent.join(format!("{}.log", stem)),
        parent.join(format!("{}.log", stem_no_ts)),
        parent.join(format!("{}.log", base_stem)),
    ];
    let mut log_path = logs_to_try[0].clone();
    for log in logs_to_try {
        if log.exists() {
            log_path = log;
            break;
        }
    }

    // Fallback for result_path if it doesn't exist (e.g. searching from original rcl)
    if !result_path.exists() {
        if let Ok(entries) = fs::read_dir(parent) {
            let mut matches = Vec::new();
            let stem_prefix = re_ts.replace(stem, "").to_string();
            let pattern = format!(r"{}(_\d{{4}}-\d{{2}}-\d{{2}}_\d{{2}}-\d{{2}}-\d{{2}})\.result$", regex::escape(&stem_prefix));
            if let Ok(re_file) = regex::Regex::new(&pattern) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if re_file.is_match(&name) {
                        if let Ok(meta) = entry.metadata() {
                            if let Ok(modified) = meta.modified() {
                                matches.push((modified, entry.path()));
                            }
                        }
                    }
                }
            }
            matches.sort_by(|a, b| b.0.cmp(&a.0));
            if let Some((_, path)) = matches.into_iter().next() {
                result_path = path;
            }
        }
    }

    let content = if result_path.exists() {
        fs::read_to_string(&result_path).map_err(|e| e.to_string())?
    } else if log_path.exists() {
        fs::read_to_string(&log_path).map_err(|e| e.to_string())?
    } else {
        return Err("No result or log file found for this analysis".to_string());
    };

    let mut symbols = Vec::new();
    let mut in_table = false;
    
    // Regex matches something like "(1)      action  neo.saveWorld"
    let re = regex::Regex::new(r"\((\d+)\)\s+(\w+)\s+(.+)").unwrap();

    for line in content.lines() {
        if line.contains("Table of Symbols") {
            in_table = true;
            continue;
        }

        if in_table {
            if let Some(caps) = re.captures(line) {
                symbols.push(SymbolEntry {
                    id: caps[1].to_string(),
                    symbol_type: caps[2].to_string(),
                    value: caps[3].trim().to_string(),
                });
            } else if !line.trim().is_empty() && symbols.len() > 0 {
                // If we hit a non-empty line that doesn't match the regex after we've already found symbols,
                // we've probably reached the end of the table.
                // However, the sidecar might log other things. Common end markers?
                // For now, if it's not a symbol line and we have symbols, let's keep looking or stop if it's a known delimiter.
                if line.contains("----------------") || line.contains("[") {
                    // break; // Optional: stop if we hit a log header
                }
            }
        }
    }

    if symbols.is_empty() {
        return Err("No symbols found in log".to_string());
    }

    Ok(symbols)
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AnalysisState {
            child_processes: Mutex::new(HashMap::new()),
            stopped_processes: Mutex::new(HashSet::new()),
            locked_files: Mutex::new(HashMap::new()),
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            process_file,
            analyze_text,
            read_file,
            select_directory,
            run_batch_analysis,
            stop_analysis,
            get_related_files,
            get_symbol_table
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
