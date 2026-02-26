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
//use rayon::ThreadPoolBuilder;

use std::fs;
use std::path::Path;
use std::time::Instant;
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;
use tauri::Emitter;

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
async fn run_batch_analysis(app: tauri::AppHandle, folder_path: String) -> Result<String, String> {
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

    for (i, file_path) in files.iter().enumerate() {
        let file_name = Path::new(file_path).file_name().and_then(|s| s.to_str()).unwrap_or(file_path);
        
        let _ = app.emit("batch-progress", BatchProgress {
            file: file_name.to_string(),
            status: "Processing".to_string(),
            result: None,
            time_ms: None,
            progress: (i as f32) / total,
        });

        let start = Instant::now();
        let sidecar = app.shell().sidecar("analyzer").map_err(|e| e.to_string())?;
        let output = sidecar
            .args([file_path, "-t"])
            .output()
            .await
            .map_err(|e| e.to_string())?;
        
        let elapsed = start.elapsed().as_millis() as u64;

        let stdout_full = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        let stdout = stdout_full.lines()
            .find(|l| l.trim().starts_with("RESULT_CSV:"))
            .map(|l| l.trim().replace("RESULT_CSV:", ""))
            .unwrap_or_default();

        if output.status.success() && !stdout.is_empty() {
            csv_results.push_str(&format!("{};{}\n", file_name, stdout));
            let _ = app.emit("batch-progress", BatchProgress {
                file: file_name.to_string(),
                status: "Success".to_string(),
                result: Some(stdout),
                time_ms: Some(elapsed),
                progress: (i + 1) as f32 / total,
            });
        } else {
            let mut error_msg = stderr;
            if error_msg.is_empty() {
                error_msg = stdout_full.lines()
                    .find(|l| l.contains("CRITICAL:"))
                    .map(|l| l.trim().to_string())
                    .unwrap_or_else(|| "Unknown error".to_string());
            }
            
            csv_results.push_str(&format!("{};{};-;-;-;-;-;-;-;-;{} (Exit {})\n", 
                file_name, 
                elapsed, 
                error_msg.replace(";", ",").replace("\n", " "), 
                output.status.code().unwrap_or(-1)
            ));
            let _ = app.emit("batch-progress", BatchProgress {
                file: file_name.to_string(),
                status: "Error".to_string(),
                result: Some(error_msg),
                time_ms: Some(elapsed),
                progress: (i + 1) as f32 / total,
            });
        }
    }

    let results_path = Path::new(&folder_path).join("batch_results.csv");
    fs::write(&results_path, &csv_results).map_err(|e| format!("Failed to save results: {}", e))?;

    Ok(format!("Batch analysis completed. Results saved to {}", results_path.display()))
}

async fn run_analysis_internal(app_handle: tauri::AppHandle, path: String, mode: String) -> Result<String, String> {
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

    let (mut rx, _child) = sidecar
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let stdout_acc = Arc::new(Mutex::new(String::new()));
    let stderr_acc = Arc::new(Mutex::new(String::new()));
    let stdout_acc_clone = stdout_acc.clone();
    let stderr_acc_clone = stderr_acc.clone();
    let app_clone = app_handle.clone();

    let get_date = || chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes).to_string();
                stdout_acc_clone.lock().unwrap().push_str(&line);
                
                for l in line.lines() {
                    let trimmed = l.trim();
                    if trimmed == "FINAL_SUMMARY_START" || trimmed == "FINAL_SUMMARY_END" {
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

                if status.code == Some(0) {
                    // Success: Extract the human-readable summary between markers
                    let mut in_summary = false;
                    let mut summary_lines = Vec::new();
                    
                    for line in stdout.lines() {
                        if line == "FINAL_SUMMARY_START" {
                            in_summary = true;
                            continue;
                        }
                        if line == "FINAL_SUMMARY_END" {
                            in_summary = false;
                            continue;
                        }
                        if in_summary {
                            summary_lines.push(line);
                        }
                    }

                    let summary = if summary_lines.is_empty() {
                        // Fallback: everything except CSV and completion message
                        stdout.lines()
                            .filter(|l| !l.starts_with("RESULT_CSV:") && *l != "Analysis completed." && *l != "FINAL_SUMMARY_START" && *l != "FINAL_SUMMARY_END")
                            .collect::<Vec<_>>()
                            .join("\n")
                    } else {
                        summary_lines.join("\n")
                    };
                    
                    return Ok(summary.trim().to_string());
                } else {
                    let mut error_msg = stderr.trim().to_string();
                    if error_msg.is_empty() {
                        error_msg = stdout.lines()
                            .find(|l| l.contains("CRITICAL:"))
                            .map(|l| l.trim().to_string())
                            .unwrap_or_else(|| format!("Analysis failed with exit code {:?}", status.code));
                    }
                    return Err(error_msg);
                }
            }
            _ => {}
        }
    }

    Err("Sidecar process closed unexpectedly".to_string())
}

#[tauri::command]
async fn process_file(app_handle: tauri::AppHandle, path: String, mode: String) -> Result<String, String> {
    if !std::path::Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }
    run_analysis_internal(app_handle, path, mode).await
}

#[tauri::command]
async fn analyze_text(app_handle: tauri::AppHandle, text: String, mode: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(format!("contract_{}.rcl", chrono::Utc::now().timestamp_millis()));
    let path_str = temp_file_path.to_string_lossy().to_string();

    fs::write(&temp_file_path, text).map_err(|e| format!("Failed to create temp file: {}", e))?;

    let result = run_analysis_internal(app_handle, path_str, mode).await;

    // Cleanup ignored for now or we can use a scopeguard/manual delete
    let _ = fs::remove_file(temp_file_path);

    result
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            process_file,
            analyze_text,
            select_directory,
            run_batch_analysis
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
