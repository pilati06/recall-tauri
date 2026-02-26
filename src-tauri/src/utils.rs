use super::*;
use chrono::Local;
use rayon::prelude::*;
use rustc_hash::FxHashSet;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{self, BufWriter, Write};
use std::path::Path as LogPath;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use sysinfo::{Pid, ProcessesToUpdate, System};
use serde::Serialize;
use tauri::Emitter;

#[cfg(target_os = "macos")]
mod macos_mem {
    use libc::{
        c_int, kern_return_t, mach_msg_type_number_t, mach_task_self, task_flavor_t, task_info,
    };
    use std::mem;

    const TASK_VM_INFO: task_flavor_t = 22;
    const KERN_SUCCESS: kern_return_t = 0;

    #[repr(C)]
    #[derive(Default)]
    struct task_vm_info_data_t {
        virtual_size: u64,
        integer_size: u64,
        resident_size: u64,
        resident_size_peak: u64,
        device: u64,
        device_peak: u64,
        internal: u64,
        internal_peak: u64,
        external: u64,
        external_peak: u64,
        reusable: u64,
        reusable_peak: u64,
        purgeable_volatile_pmap: u64,
        purgeable_volatile_resident: u64,
        purgeable_volatile_virtual: u64,
        compressed: u64,
        compressed_peak: u64,
        compressed_lifetime: u64,
        pub phys_footprint: u64,
        min_address: u64,
        max_address: u64,
        _padding: [u64; 10],
    }

    pub fn get_phys_footprint_mb() -> u64 {
        unsafe {
            #[allow(deprecated)]
            let task = mach_task_self();
            let mut info: task_vm_info_data_t = mem::zeroed();
            let mut count = (mem::size_of::<task_vm_info_data_t>() / mem::size_of::<i32>())
                as mach_msg_type_number_t;

            let ret = task_info(
                task,
                TASK_VM_INFO,
                &mut info as *mut task_vm_info_data_t as *mut i32,
                &mut count,
            );

            if ret == KERN_SUCCESS {
                info.phys_footprint / 1024 / 1024
            } else {
                0
            }
        }
    }
}

#[derive(Clone, Debug)]
pub struct CompressedConcurrentActions {
    pub source_map: Arc<Vec<Arc<RelativizedAction>>>,
    pub valid_masks: Vec<u32>,
}

// ==================== memory management =================

pub struct MemoryGuard {
    max_usage_mb: u64,
    logger: Logger,
    pub max_rss_used: Arc<AtomicU64>,
    pub max_total_used: Arc<AtomicU64>,
    start_time: std::time::Instant,
    app_handle: Option<tauri::AppHandle>,
}

impl MemoryGuard {
    pub fn new(max_usage_mb: u64, logger: Logger) -> Self {
        Self {
            max_usage_mb,
            logger,
            max_rss_used: Arc::new(AtomicU64::new(0)),
            max_total_used: Arc::new(AtomicU64::new(0)),
            start_time: std::time::Instant::now(),
            app_handle: None,
        }
    }

    pub fn with_app_handle(mut self, app_handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    pub fn start_monitoring(&self) -> Arc<AtomicBool> {
        let should_terminate = Arc::new(AtomicBool::new(false));
        let clone = should_terminate.clone();
        let max_usage = self.max_usage_mb;
        let max_rss_shared = self.max_rss_used.clone();
        let max_total_shared = self.max_total_used.clone();
        let logger = self.logger.clone();
        let start_time = self.start_time;
        let app_handle = self.app_handle.clone();

        std::thread::spawn(move || {
            let mut sys = System::new_all();

            loop {
                if clone.load(Ordering::Relaxed) {
                    break;
                }

                sys.refresh_memory();
                sys.refresh_processes(ProcessesToUpdate::All, true);

                let current_pid = sysinfo::get_current_pid().unwrap();
                if let Some(process) = sys.process(Pid::from_u32(current_pid.as_u32())) {
                    let rss_mb = process.memory() / 1024 / 1024;

                    let total_mb = if cfg!(target_os = "windows") {
                        process.virtual_memory() / 1024 / 1024
                    } else if cfg!(target_os = "macos") {
                        #[cfg(target_os = "macos")]
                        {
                            let fp = macos_mem::get_phys_footprint_mb();
                            if fp > 0 {
                                std::cmp::max(fp, rss_mb)
                            } else {
                                rss_mb
                            }
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            rss_mb
                        }
                    } else {
                        rss_mb
                    };

                    if rss_mb > max_rss_shared.load(Ordering::Relaxed) {
                        max_rss_shared.store(rss_mb, Ordering::Relaxed);
                    }
                    if total_mb > max_total_shared.load(Ordering::Relaxed) {
                        max_total_shared.store(total_mb, Ordering::Relaxed);
                    }

                    if total_mb > max_usage {
                        let total_label = "Total Memory";
                        let elapsed_ms = start_time.elapsed().as_millis();
                        let msg = format!("CRITICAL: Memory usage exceeded! RAM: {}MB, {}: {}MB (Limit: {}MB) - Execution Time: {}ms", 
                            rss_mb, total_label, total_mb, max_usage, elapsed_ms);

                        logger.log(LogType::Necessary, &msg);

                        let msg_term = "TERMINATING PROCESS TO PREVENT SYSTEM CRASH";
                        logger.log(LogType::Necessary, msg_term);

                        let rss_peak = max_rss_shared.load(Ordering::Relaxed);
                        let total_peak = max_total_shared.load(Ordering::Relaxed);

                        let mut summary = String::new();
                        summary.push_str(
                            "\n-------------------------------------------------------\n",
                        );
                        summary.push_str(&format!("Completed in {}ms\n", elapsed_ms));
                        summary.push_str(&format!("Max RAM: {}MB\n", rss_peak));
                        summary.push_str(&format!("Max Total Memory: {}MB\n", total_peak));
                        summary
                            .push_str("-------------------------------------------------------\n");

                        if logger.configuration.is_test() {
                            println!("{}", msg);
                        } else {
                            logger.log(LogType::Minimal, &summary);
                        }

                        if let Some(ref handle) = app_handle {
                            use tauri::Emitter;
                            let _ = handle.emit("memory-overflow", &msg);
                            std::thread::sleep(Duration::from_millis(500));
                        }

                        std::process::exit(137);
                    }
                }

                std::thread::sleep(Duration::from_millis(100));
            }
        });

        should_terminate
    }
}

// ==================== symbol_type.rs ====================
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SymbolType {
    Action,
    Individual,
}

impl std::fmt::Display for SymbolType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            SymbolType::Action => write!(f, "action"),
            SymbolType::Individual => write!(f, "individual"),
        }
    }
}

// ==================== symbol.rs ====================
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Symbol {
    pub id: i32,
    pub value: String,
    pub symbol_type: SymbolType,
}

impl Symbol {
    pub fn new(id: i32, value: String, symbol_type: SymbolType) -> Self {
        Symbol {
            id,
            value,
            symbol_type,
        }
    }

    pub fn id(&self) -> i32 {
        self.id
    }

    pub fn value(&self) -> &str {
        &self.value
    }

    pub fn symbol_type(&self) -> SymbolType {
        self.symbol_type
    }
}

impl std::fmt::Display for Symbol {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{} | {} | {}\n", self.id, self.value, self.symbol_type)
    }
}

// ==================== symbol_table.rs ====================

static INSTANCE: OnceLock<Arc<Mutex<SymbolTable>>> = OnceLock::new();

#[derive(Debug, Clone)]
pub struct SymbolTable {
    id_base: i32,
    dictionary: Vec<Symbol>,
    lookup: HashMap<(String, SymbolType), i32>,
}

impl SymbolTable {
    fn new() -> Self {
        SymbolTable {
            id_base: 1,
            dictionary: Vec::new(),
            lookup: HashMap::new(),
        }
    }

    pub fn instance() -> Arc<Mutex<SymbolTable>> {
        INSTANCE
            .get_or_init(|| Arc::new(Mutex::new(SymbolTable::new())))
            .clone()
    }

    pub fn add_symbol(&mut self, value: String, symbol_type: SymbolType) -> i32 {
        if let Some(&id) = self.lookup.get(&(value.clone(), symbol_type)) {
            return id;
        }

        let id = self.id_base;
        self.id_base += 1;
        let symbol = Symbol::new(id, value.clone(), symbol_type);
        self.dictionary.push(symbol);
        self.lookup.insert((value, symbol_type), id);
        id
    }

    pub fn get_symbol_by_id(&self, id: i32) -> Option<&Symbol> {
        self.dictionary.iter().find(|s| s.id == id)
    }

    pub fn get_dictionary(&self) -> &[Symbol] {
        &self.dictionary
    }

    pub fn get_actions(&self) -> Vec<&Symbol> {
        self.dictionary
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Action)
            .collect()
    }

    pub fn get_individuals(&self) -> Vec<&Symbol> {
        self.dictionary
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Individual)
            .collect()
    }

    pub fn clear(&mut self) {
        self.id_base = 1;
        self.dictionary.clear();
        self.lookup.clear();
    }

    pub fn len(&self) -> usize {
        self.dictionary.len()
    }

    pub fn is_empty(&self) -> bool {
        self.dictionary.is_empty()
    }
}

impl Default for SymbolTable {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for SymbolTable {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        writeln!(f, "Table of Symbols")?;
        for symbol in &self.dictionary {
            writeln!(
                f,
                "({})  {:>10}  {}",
                symbol.id,
                format!("{}", symbol.symbol_type),
                symbol.value
            )?;
        }
        Ok(())
    }
}

// ==================== log_level.rs ====================
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum LogLevel {
    Normal,
    Verbose,
}

// ==================== log_type.rs ====================
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum LogType {
    Minimal,
    Necessary,
    Additional,
}

// ==================== run_configuration.rs ====================

#[derive(Debug, Clone)]
pub struct RunConfiguration {
    contract_file_name: String,
    result_file_name: String,
    export_decompositions: bool,
    export_automaton: bool,
    continue_on_conflict: bool,
    export_min_automaton: bool,
    use_prunning: bool,
    decompositions_file_name: String,
    automaton_file_name: String,
    min_automaton_file_name: String,
    log_level: LogLevel,
    global_log_filename: String,
    test: bool,
}

impl RunConfiguration {
    pub fn new() -> Self {
        Self {
            contract_file_name: String::new(),
            result_file_name: String::new(),
            export_decompositions: false,
            export_automaton: false,
            continue_on_conflict: false,
            export_min_automaton: false,
            use_prunning: true,
            decompositions_file_name: String::new(),
            automaton_file_name: String::new(),
            min_automaton_file_name: String::new(),
            log_level: LogLevel::Normal,
            global_log_filename: String::new(),
            test: false,
        }
    }

    // Getters
    pub fn contract_file_name(&self) -> &str {
        &self.contract_file_name
    }
    pub fn result_file_name(&self) -> &str {
        &self.result_file_name
    }
    pub fn is_export_decompositions(&self) -> bool {
        self.export_decompositions
    }
    pub fn is_export_automaton(&self) -> bool {
        self.export_automaton
    }
    pub fn is_continue_on_conflict(&self) -> bool {
        self.continue_on_conflict
    }
    pub fn is_export_min_automaton(&self) -> bool {
        self.export_min_automaton
    }
    pub fn is_use_prunning(&self) -> bool {
        self.use_prunning
    }
    pub fn is_test(&self) -> bool {
        self.test
    }
    pub fn decompositions_file_name(&self) -> &str {
        &self.decompositions_file_name
    }
    pub fn automaton_file_name(&self) -> &str {
        &self.automaton_file_name
    }
    pub fn min_automaton_file_name(&self) -> &str {
        &self.min_automaton_file_name
    }
    pub fn log_level(&self) -> LogLevel {
        self.log_level
    }
    pub fn global_log_filename(&self) -> &str {
        &self.global_log_filename
    }

    // Setters
    pub fn set_contract_file_name(&mut self, name: String) {
        self.contract_file_name = name;
    }
    pub fn set_result_file_name(&mut self, name: String) {
        self.result_file_name = name;
    }
    pub fn set_export_decompositions(&mut self, value: bool) {
        self.export_decompositions = value;
    }
    pub fn set_export_automaton(&mut self, value: bool) {
        self.export_automaton = value;
    }
    pub fn set_continue_on_conflict(&mut self, value: bool) {
        self.continue_on_conflict = value;
    }
    pub fn set_export_min_automaton(&mut self, value: bool) {
        self.export_min_automaton = value;
    }
    pub fn set_use_prunning(&mut self, value: bool) {
        self.use_prunning = value;
    }
    pub fn set_log_level(&mut self, level: LogLevel) {
        self.log_level = level;
    }
    pub fn set_global_log_filename(&mut self, name: String) {
        self.global_log_filename = name;
    }
    pub fn set_automaton_file_name(&mut self, name: String) {
        self.automaton_file_name = name;
    }
    pub fn set_min_automaton_file_name(&mut self, name: String) {
        self.min_automaton_file_name = name;
    }
    pub fn set_decompositions_file_name(&mut self, name: String) {
        self.decompositions_file_name = name;
    }
    pub fn set_test(&mut self, value: bool) {
        self.test = value;
    }
}

impl Default for RunConfiguration {
    fn default() -> Self {
        Self::new()
    }
}

// ==================== file_util.rs ====================

pub struct FileUtil;

impl FileUtil {
    pub fn write_to_file(filename: &str, lines: &[&str]) -> io::Result<bool> {
        let file = File::create(filename)?;
        let mut writer = BufWriter::new(file);

        for line in lines {
            writeln!(writer, "{}", line)?;
        }

        writer.flush()?;
        Ok(true)
    }
}

// ==================== logger.rs ====================

#[derive(Clone)]
pub struct Logger {
    level: LogLevel,
    configuration: RunConfiguration,
    global_log_filename: String,
    bw_global: Arc<Mutex<Option<BufWriter<File>>>>,
    bw_local: Arc<Mutex<Option<BufWriter<File>>>>,
    contract_name: String,
    app_handle: Option<tauri::AppHandle>,
}

#[derive(Serialize, Clone)]
pub struct LogPayload {
    pub log_type: LogType,
    pub message: String,
    pub date: String,
}

impl Logger {
    pub fn new(configuration: RunConfiguration) -> std::io::Result<Self> {
        let global_log_filename = configuration.global_log_filename().to_string();
        let contract_name = LogPath::new(configuration.contract_file_name())
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("contract")
            .to_string();

        let global_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&global_log_filename)?;

        let local_file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(configuration.result_file_name())?;

        Ok(Self {
            level: configuration.log_level(),
            configuration: configuration.clone(),
            global_log_filename,
            bw_global: Arc::new(Mutex::new(Some(BufWriter::new(global_file)))),
            bw_local: Arc::new(Mutex::new(Some(BufWriter::new(local_file)))),
            contract_name,
            app_handle: None,
        })
    }

    pub fn strip_ansi_codes(text: &str) -> String {
        let re = regex::Regex::new(r"\x1B\[[0-9;]*m").unwrap();
        re.replace_all(text, "").to_string()
    }

    pub fn with_app_handle(mut self, app_handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    pub fn log(&self, log_type: LogType, text: &str) {
        let date_info = self.get_date_info();
        let formatted_text = self.format(text);

        if let Some(ref handle) = self.app_handle {
            let _ = handle.emit(
                "log-message",
                LogPayload {
                    log_type,
                    message: formatted_text.clone(),
                    date: date_info.clone(),
                },
            );
        }

        match self.level {
            LogLevel::Normal => {
                match log_type {
                    LogType::Minimal => {
                        let msg =
                            format!("{} [{}]: {}", date_info, self.contract_name, formatted_text);
                        self.write_global(&msg);
                        println!("{}", formatted_text);
                    }
                    LogType::Necessary => {
                        let msg =
                            format!("{} [{}]: {}", date_info, self.contract_name, formatted_text);
                        self.write_global(&msg);
                        println!("{}", formatted_text);
                    }
                    LogType::Additional => {}
                }
                let local_msg = format!("{}: {}", date_info, formatted_text);
                self.write_local(&local_msg);
            }
            LogLevel::Verbose => {
                let local_msg = format!("{}: {}", date_info, formatted_text);
                let global_msg =
                    format!("{} [{}]: {}", date_info, self.contract_name, formatted_text);
                self.write_local(&local_msg);
                self.write_global(&global_msg);
                println!("{}", formatted_text);
            }
        }
    }

    fn write_global(&self, line: &str) {
        if let Ok(mut lock) = self.bw_global.lock() {
            if let Some(ref mut writer) = *lock {
                if writeln!(writer, "{}", line).is_err() {
                    eprintln!(
                        "Failed to write to global log file: {}",
                        self.global_log_filename
                    );
                    println!("{}", line);
                }
                let _ = writer.flush();
            }
        }
    }

    fn write_local(&self, line: &str) {
        if let Ok(mut lock) = self.bw_local.lock() {
            if let Some(ref mut writer) = *lock {
                if writeln!(writer, "{}", line).is_err() {
                    eprintln!(
                        "Failed to write to local log file: {}",
                        self.configuration.result_file_name()
                    );
                    println!("{}", line);
                }
                let _ = writer.flush();
            }
        }
    }

    fn get_date_info(&self) -> String {
        Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
    }

    fn format(&self, text: &str) -> String {
        Self::strip_ansi_codes(text)
    }
}

// ==================== contract_util.rs ====================
pub struct ContractUtil;

impl ContractUtil {
    pub fn is_valid(actions: &FxHashSet<Arc<RelativizedAction>>, conflicts: &[Conflict]) -> bool {
        if actions.is_empty() {
            return false;
        }

        for conflict in conflicts {
            let count_a = actions
                .iter()
                .filter(|ra| ra.action.value == conflict.a.value)
                .count();

            if count_a == 0 {
                continue;
            }

            let count_b = actions
                .iter()
                .filter(|ra| ra.action.value == conflict.b.value)
                .count();

            if count_b == 0 {
                continue;
            }

            if conflict.conflict_type == ConflictType::Global {
                return false;
            }

            if conflict.conflict_type == ConflictType::Relativized {
                let has_relativized_conflict = actions
                    .iter()
                    .filter(|ra| ra.action.value == conflict.a.value)
                    .any(|ra_a| {
                        actions.iter().any(|ra_b| {
                            ra_b.action.value == conflict.b.value && ra_b.sender == ra_a.sender
                        })
                    });

                if has_relativized_conflict {
                    return false;
                }
            }
        }
        true
    }

    pub fn calculate_concurrent_relativized_actions(
        relativized_actions: FxHashSet<Arc<RelativizedAction>>,
        conflicts: &[Conflict],
        _config: &RunConfiguration,
        logger: &mut Logger,
    ) -> CompressedConcurrentActions {
        let current_time = std::time::Instant::now();

        let n = relativized_actions.len();

        if n > 30 {
            let msg = format!("CRITICAL: Can't calculate the set of concurrent relativized actions. (Number of actions {}). Maximum supported is 30.", n);
            logger.log(LogType::Necessary, &msg);
            panic!("{}", msg);
        }

        let size: u64 = 1u64 << n; // 2^n
        let mut check_vec: Vec<u32> = Vec::new();
        if let Err(_) = check_vec.try_reserve(size as usize) {
            let bytes = size * 4;
            let gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
            let msg = format!("CRITICAL: Memory allocation of approx {:.2} GB failed for {} concurrent action combinations.", gb, size);
            logger.log(LogType::Necessary, &msg);
            panic!("{}", msg);
        }

        let src: Vec<Arc<RelativizedAction>> = relativized_actions.into_iter().collect();
        let src_arc = Arc::new(src);

        let size: u64 = 1u64 << n; // 2^n

        let mut valid_masks: Vec<u32> = (0..size)
            .into_par_iter()
            .filter_map(|mask| {
                let mut temp_set = FxHashSet::default();
                let mut temp_mask = mask as u32;

                while temp_mask > 0 {
                    let idx = temp_mask.trailing_zeros();
                    if let Some(act) = src_arc.get(idx as usize) {
                        temp_set.insert(act.clone());
                    }
                    temp_mask &= temp_mask - 1;
                }

                if Self::is_valid(&temp_set, conflicts) {
                    Some(mask as u32)
                } else {
                    None
                }
            })
            .collect();

        valid_masks.sort_by(|a, b| b.count_ones().cmp(&a.count_ones()));

        let mut sys = System::new_all();
        sys.refresh_all();
        let pid = sysinfo::get_current_pid().unwrap();
        let process_mb = if let Some(process) = sys.process(pid) {
            process.memory() / 1024 / 1024
        } else {
            0
        };

        let elapsed = current_time.elapsed();

        logger.log(
            LogType::Necessary,
            &format!(
                "Calculated {} concurrent actions in {:?} (Memory: {}MB)",
                valid_masks.len(),
                elapsed,
                process_mb
            ),
        );

        CompressedConcurrentActions {
            source_map: src_arc,
            valid_masks,
        }
    }
}

// ==================== automaton_exporter.rs ====================

pub struct AutomatonExporter;

impl AutomatonExporter {
    pub fn dump_states(automaton: &Automaton) -> String {
        let mut output = String::from("id;clause;situation\n");

        let mut states: Vec<_> = automaton.states.iter().collect();
        states.sort_by_key(|s| s.id);

        for state in states {
            let clause_str = if let Some(ref clause) = state.clause {
                format!("{}", clause)
            } else {
                String::from("")
            };

            let situation_str = match state.situation {
                StateSituation::Violating => "violating",
                StateSituation::Satisfaction => "satisfaction",
                StateSituation::Conflicting => "conflicting",
                StateSituation::ConflictFree => "conflictFree",
                StateSituation::NotChecked => "notChecked",
            };

            output.push_str(&format!("{};{};{}\n", state.id, clause_str, situation_str));
        }

        output
    }

    pub fn dump_to_dot(automaton: &Automaton) -> String {
        let mut output = String::from("digraph contract {\nrankdir=LR;\n");

        output.push_str("node [shape = point, color=white, fontcolor=white]; start;\n");

        for state in automaton.states.iter() {
            if state.situation == StateSituation::NotChecked
                || state.situation == StateSituation::ConflictFree
            {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=black, fontcolor=black, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        for state in automaton.states.iter() {
            if state.situation == StateSituation::Violating {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=red, fontcolor=white, style=filled, fillcolor=red, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        for state in automaton.states.iter() {
            if state.situation == StateSituation::Satisfaction {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=green, fontcolor=white, style=filled, fillcolor=green, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        for state in automaton.states.iter() {
            if state.situation == StateSituation::Conflicting {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=orange, fontcolor=white, style=filled, fillcolor=orange, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        if let Some(ref initial) = automaton.initial {
            output.push_str(&format!("start -> S{}\n", initial.id));
        }

        {
            let symbol_table = SymbolTable::instance();
            let table = symbol_table.lock().unwrap();

            for transition in automaton.transitions.iter() {
                let actions_vec = transition.actions();
                let actions_str = Self::format_actions(&actions_vec, &table);
                output.push_str(&format!(
                    "\tS{} -> S{} [ label = \"{}\" ];\n",
                    transition.from,
                    transition.to,
                    actions_str.replace("\"", "\\\"")
                ));
            }
        }

        output.push_str("}\n");
        output
    }

    pub fn dump_to_text(automaton: &Automaton) -> String {
        let mut output = String::new();

        // Obter symbol table
        let symbol_table = SymbolTable::instance();
        let table = symbol_table.lock().unwrap();

        // A: Ações
        let actions: Vec<String> = table
            .get_actions()
            .iter()
            .map(|s| s.value.clone())
            .collect();
        output.push_str(&format!("A:{}\n", actions.join(";")));

        // I: Indivíduos
        let individuals: Vec<String> = table
            .get_individuals()
            .iter()
            .map(|s| s.value.clone())
            .collect();
        output.push_str(&format!("I:{}\n", individuals.join(";")));

        // Q: Estados
        let mut states_ids: Vec<usize> = automaton.states.iter().map(|s| s.id).collect();
        states_ids.sort();
        let states_str: Vec<String> = states_ids.iter().map(|id| id.to_string()).collect();
        output.push_str(&format!("Q:{}\n", states_str.join(";")));

        // V: Estados violating
        let mut violations: Vec<usize> = automaton
            .states
            .iter()
            .filter(|s| s.situation == StateSituation::Violating)
            .map(|s| s.id)
            .collect();
        violations.sort();
        let violations_str: Vec<String> = violations.iter().map(|id| id.to_string()).collect();
        output.push_str(&format!("V:{}\n", violations_str.join(";")));

        // S: Estados satisfaction
        let mut satisfactions: Vec<usize> = automaton
            .states
            .iter()
            .filter(|s| s.situation == StateSituation::Satisfaction)
            .map(|s| s.id)
            .collect();
        satisfactions.sort();
        let satisfactions_str: Vec<String> =
            satisfactions.iter().map(|id| id.to_string()).collect();
        output.push_str(&format!("S:{}\n", satisfactions_str.join(";")));

        // T: Transições
        let mut transitions_strs = Vec::new();
        for transition in automaton.transitions.iter() {
            let mut actions_parts = Vec::new();
            let transition_actions = transition.actions();

            for ra in transition_actions.iter() {
                let sender_name = table
                    .get_symbol_by_id(ra.sender)
                    .map(|s| s.value.as_str())
                    .unwrap_or("?");

                let action_name = table
                    .get_symbol_by_id(ra.action.value)
                    .map(|s| s.value.as_str())
                    .unwrap_or("?");

                let receiver_name = table
                    .get_symbol_by_id(ra.receiver)
                    .map(|s| s.value.as_str())
                    .unwrap_or("?");

                actions_parts.push(format!("{}?{}?{}", sender_name, action_name, receiver_name));
            }

            let transition_str = format!(
                "{}-{}-{};",
                transition.from,
                actions_parts.join(","),
                transition.to
            );
            transitions_strs.push(transition_str);
        }

        output.push_str(&format!("T:{}\n", transitions_strs.join("")));

        output
    }

    pub fn dump_to_min_dot(automaton: &Automaton) -> String {
        let mut output = String::from("digraph contract {\nrankdir=LR;\n");

        output.push_str("node [shape = point, color=white, fontcolor=white]; start;\n");

        for state in automaton.states.iter() {
            if state.situation == StateSituation::NotChecked
                || state.situation == StateSituation::ConflictFree
            {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=black, fontcolor=black, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        for state in automaton.states.iter() {
            if state.situation == StateSituation::Violating {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=red, fontcolor=white, style=filled, fillcolor=red, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        for state in automaton.states.iter() {
            if state.situation == StateSituation::Satisfaction {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=green, fontcolor=white, style=filled, fillcolor=green, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        for state in automaton.states.iter() {
            if state.situation == StateSituation::Conflicting {
                let tooltip = if let Some(ref clause) = state.clause {
                    format!("{}", clause)
                } else {
                    String::from("")
                };
                output.push_str(&format!(
                    "node [shape = circle, color=orange, fontcolor=white, style=filled, fillcolor=orange, tooltip=\"{}\"]; S{} ;\n",
                    tooltip.replace("\"", "\\\""),
                    state.id
                ));
            }
        }

        if let Some(ref initial) = automaton.initial {
            output.push_str(&format!("start -> S{}\n", initial.id));
        }

        let mut transition_map: HashMap<(usize, usize), Vec<std::sync::Arc<RelativizedAction>>> =
            HashMap::new();

        for transition in automaton.transitions.iter() {
            let key = (transition.from, transition.to);

            transition_map
                .entry(key)
                .and_modify(|existing_actions| {
                    if transition.actions().len() > existing_actions.len() {
                        *existing_actions = transition.actions().clone();
                    }
                })
                .or_insert_with(|| transition.actions().clone());
        }

        let mut sorted_transitions: Vec<_> = transition_map.into_iter().collect();
        sorted_transitions.sort_by_key(|(k, _)| *k);

        {
            let symbol_table = SymbolTable::instance();
            let table = symbol_table.lock().unwrap();

            for ((from, to), actions) in sorted_transitions {
                let actions_str = Self::format_actions(&actions, &table);
                output.push_str(&format!(
                    "\tS{} -> S{} [ label = \"{}\" ];\n",
                    from,
                    to,
                    actions_str.replace("\"", "\\\"")
                ));
            }
        }

        output.push_str("}\n");
        output
    }

    // ==================== Funções auxiliares ====================

    fn format_actions(
        actions: &[std::sync::Arc<RelativizedAction>],
        symbol_table: &SymbolTable,
    ) -> String {
        if actions.is_empty() {
            return String::from("ε");
        }

        let formatted: Vec<String> = actions
            .iter()
            .map(|ra| ra.format_with_symbols(symbol_table))
            .collect();

        formatted.join(", ")
    }
}

pub fn parse_command_line(args: &[String]) -> RunConfiguration {
    let mut config = RunConfiguration::new();

    if args.is_empty() || args[0].starts_with('-') {
        print_usage();
        return config;
    }

    let contract_path = LogPath::new(&args[0]);
    config.set_contract_file_name(args[0].clone());

    let file_stem = contract_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("contract");

    let parent = contract_path.parent().unwrap_or(LogPath::new(""));

    config.set_result_file_name(
        parent
            .join(format!("{}.result", file_stem))
            .to_string_lossy()
            .into_owned(),
    );
    config.set_global_log_filename(
        parent
            .join(format!("{}.log", file_stem))
            .to_string_lossy()
            .into_owned(),
    );
    config.set_automaton_file_name(
        parent
            .join(format!("{}.dot", file_stem))
            .to_string_lossy()
            .into_owned(),
    );
    config.set_min_automaton_file_name(
        parent
            .join(format!("{}_min.dot", file_stem))
            .to_string_lossy()
            .into_owned(),
    );
    config.set_decompositions_file_name(
        parent
            .join(format!("{}.csv", file_stem))
            .to_string_lossy()
            .into_owned(),
    );

    let mut i = 1;
    while i < args.len() {
        let arg = &args[i];

        if arg.starts_with('-') && !arg.starts_with("--") && arg.len() > 2 {
            for ch in arg.chars().skip(1) {
                match ch {
                    'h' => {
                        print_usage();
                        std::process::exit(0);
                    }
                    'v' => {
                        config.set_log_level(LogLevel::Verbose);
                    }
                    'g' => {
                        config.set_export_automaton(true);
                        config.set_export_decompositions(true);
                    }
                    'n' => {
                        config.set_use_prunning(false);
                    }
                    'c' => {
                        config.set_continue_on_conflict(true);
                    }
                    'm' => {
                        config.set_export_automaton(true);
                        config.set_export_min_automaton(true);
                    }
                    't' => {
                        config.set_test(true);
                    }
                    _ => {
                        eprintln!("Unknown option: -{}", ch);
                        print_usage();
                        std::process::exit(1);
                    }
                }
            }

            i += 1;
            continue;
        }

        match arg.as_str() {
            "-h" | "--help" => {
                print_usage();
                std::process::exit(0);
            }
            "-v" | "--verbose" => {
                config.set_log_level(LogLevel::Verbose);
            }
            "-g" => {
                config.set_export_automaton(true);
                config.set_export_decompositions(true);
            }
            "-n" | "--no-prunning" => {
                config.set_use_prunning(false);
            }
            "-c" | "--continue" => {
                config.set_continue_on_conflict(true);
            }
            "-m" => {
                config.set_export_automaton(true);
                config.set_export_min_automaton(true);
            }
            "-t" => {
                config.set_test(true);
            }
            _ => {
                eprintln!("Unknown option: {}", arg);
                print_usage();
                std::process::exit(1);
            }
        }

        i += 1;
    }

    config
}

pub fn print_usage() {
    println!("recall - RelativizEd ContrAct Language anaLyser (v1.0)\n");
    println!("USAGE:");
    println!("    recall <CONTRACT_FILE> [OPTIONS]\n");
    println!("OPTIONS:");
    println!("    -h, --help          Print this message and exit");
    println!("    -v, --verbose       Turn on the verbose mode");
    println!("    -g                  Exports the automaton into a graphviz file");
    println!("                        Default filename is <CONTRACT_FILE>.dot");
    println!("    -n, --no-prunning   Don't use the prunning method");
    println!("    -c, --continue      Continues the analysis if a conflict is found");
    println!("    -m                  Export minimized automaton");
    println!("    -t                  Test mode (outputs CSV metrics)\n");
    println!("EXAMPLES:");
    println!("    recall contract.rcl");
    println!("        Analyzes a contract in the file 'contract.rcl'");
    println!("    recall contract.rcl -g");
    println!("        Analyzes the contract and writes automaton in a file\n");
    println!("Please report issues to: edson.luiz.pilati@uel.br / bonifacio@uel.br");
    println!("More information: https://recall-site.github.io/");
}

pub fn print_result(automaton: &Automaton, ms: u64, rss: u64, total: u64) -> String {
    let mut output = String::new();

    output.push_str("\n-------------------------------------------------------\n\n");

    if automaton.conflict_found {
        output.push_str(&format!(
            "{}[CONFLICT] {}A conflict was found in the analyzed contract.{}\n",
            ConsoleColors::FG_RED,
            ConsoleColors::FG_WHITE,
            ConsoleColors::RESET
        ));
        output.push_str(&print_trace(automaton));
    } else {
        output.push_str(&format!(
            "{}[CONFLICT-FREE] {}The analyzed contract is conflict-free.{}\n",
            ConsoleColors::FG_GREEN,
            ConsoleColors::FG_WHITE,
            ConsoleColors::RESET
        ));
    }

    output.push_str("\n-------------------------------------------------------\n");

    output.push_str(&format!("Completed in {}ms\n", ms));
    output.push_str(&format!("Max RAM: {}MB\n", rss));
    output.push_str(&format!("Max Total Memory: {}MB\n", total));

    output.push_str("-------------------------------------------------------\n");

    output
}

pub fn print_trace(automaton: &Automaton) -> String {
    let mut output = String::new();
    output.push_str("\n-------------------------------------------------------\n");

    let conflicts = automaton.get_conflicts();

    for state in conflicts {
        output.push_str(&format!("Conflict found in state (s{})\n", state.id));

        if let Some(ref conflict_info) = state.conflict_information {
            output.push_str(&format!("Conflict: {}\n", conflict_info));
        }

        output.push_str("-------------------------------------------------------\n");

        let mut trace_summary = String::from("Trace: ");
        let mut trace_details = String::from("Stacktrace: \n");

        let mut current_state = state.clone();

        while !current_state.trace.is_empty() {
            if let Some(&transition_id) = current_state.trace.first() {
                if let Some(transition) = automaton.get_transition_by_id(transition_id) {
                    trace_summary.push_str(&format!("(s{})", transition.to));

                    trace_details.push_str(&format!(
                        "{}(s{}){}",
                        ConsoleColors::FG_YELLOW,
                        transition.to,
                        ConsoleColors::RESET
                    ));

                    if let Some(to_state) = automaton.get_state_by_id(transition.to) {
                        trace_details.push_str(&format!(" - {}\n", to_state));
                    }

                    trace_details.push_str(&format!(
                        "{}<T{}> - {}[{}]{}\n",
                        ConsoleColors::FG_RED,
                        transition.id,
                        ConsoleColors::FG_BLUE,
                        transition
                            .actions()
                            .iter()
                            .map(|a| a.to_string())
                            .collect::<Vec<_>>()
                            .join(", "),
                        ConsoleColors::RESET
                    ));

                    trace_summary.push_str(&format!("<--T{}--", transition.id));

                    if let Some(from_state) = automaton.get_state_by_id(transition.from) {
                        current_state = from_state.clone();
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        trace_summary.push_str(&format!("(s{})\n", current_state.id));
        trace_details.push_str(&format!(
            "{}(s{}){}",
            ConsoleColors::FG_YELLOW,
            current_state.id,
            ConsoleColors::RESET
        ));

        if let Some(ref clause) = current_state.clause {
            trace_details.push_str(&format!(" - {}\n", clause));
        }

        output.push_str(&trace_summary);
        output.push_str("-------------------------------------------------------\n");
        output.push_str(&trace_details);
        output.push_str("-------------------------------------------------------\n");
    }

    output
}

pub fn get_automaton_data(
    time: u64,
    memory: u64,
    automaton: &Automaton,
    contract: &Contract,
) -> String {
    let automaton_size_mb = estimate_automaton_size(automaton) as f64 / (1024.0 * 1024.0);

    format!(
        "{};{};{};{};{};{};{};{:.2};{:.2};success",
        time,
        automaton.states.len(),
        automaton.transitions.len(),
        contract.individuals.len(),
        contract.actions.len(),
        if automaton.conflict_found { 1 } else { 0 },
        automaton.get_conflicts().len(),
        automaton_size_mb,
        memory as f64
    )
}

pub fn estimate_automaton_size(automaton: &Automaton) -> usize {
    let mut total = std::mem::size_of_val(automaton);

    let states_capacity = automaton.states.capacity();
    total += states_capacity * (std::mem::size_of::<State>() + 16);

    for state in &automaton.states {
        total += state.trace.capacity() * std::mem::size_of::<usize>();
    }

    let transitions_capacity = automaton.transitions.capacity();
    total += transitions_capacity * (std::mem::size_of::<Transition>() + 16);

    let map_capacity = automaton.state_map.capacity();
    total += map_capacity * (std::mem::size_of::<Clause>() + std::mem::size_of::<usize>() + 16);

    total
}

pub fn get_system_memory_info() -> (u64, u64) {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_memory();
    let ram = sys.total_memory() / 1024 / 1024;
    let swap = sys.total_swap() / 1024 / 1024;
    (ram, swap)
}

pub fn calculate_safe_memory_limit(total_ram_mb: u64, total_swap_mb: u64) -> u64 {
    let total_available = total_ram_mb + total_swap_mb;

    let percentage = if total_available >= 32 * 1024 {
        0.95
    } else if total_available >= 16 * 1024 {
        0.90
    } else {
        0.85
    };

    let limit = (total_available as f64 * percentage) as u64;

    if total_available > 4096 {
        limit.min(total_available - 2048)
    } else {
        limit.max(1024)
    }
}

pub struct ConsoleColors;

impl ConsoleColors {
    pub const RESET: &'static str = "\u{001B}[0m";
    pub const FG_RED: &'static str = "\u{001B}[31m";
    pub const FG_GREEN: &'static str = "\u{001B}[32m";
    pub const FG_YELLOW: &'static str = "\u{001B}[33m";
    pub const FG_BLUE: &'static str = "\u{001B}[34m";
    pub const FG_WHITE: &'static str = "\u{001B}[37m";
}
