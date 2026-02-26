use recall_lib::parser::{build_ast, RCLParser, Rule};
use recall_lib::utils::{parse_command_line, Logger, MemoryGuard, LogType};
use recall_lib::algorithms::automata_constructor::AutomataConstructor;
use recall_lib::model::contracts::Contract;
use pest::Parser;
use std::fs;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: analyzer <contract_file> [options]");
        std::process::exit(1);
    }

    std::panic::set_hook(Box::new(|info| {
        let payload = info.payload();
        let msg = if let Some(s) = payload.downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        
        eprintln!("{}", msg);
        std::process::exit(101);
    }));
    let config_args = args[1..].to_vec();
    let config = parse_command_line(&config_args);
    let logger = Logger::new(config.clone())?;

    let mut constructor = AutomataConstructor::new(config.clone());
    let start = Instant::now();
    let mut analyzer_logger = logger.clone();

    let (total_ram_mb, total_swap_mb) = recall_lib::utils::get_system_memory_info();
    let max_process_mb = recall_lib::utils::calculate_safe_memory_limit(total_ram_mb, total_swap_mb);
    analyzer_logger.log(LogType::Necessary, "Memory guard active:");
    analyzer_logger.log(LogType::Necessary, &format!("   - System RAM: {}MB", total_ram_mb));
    analyzer_logger.log(LogType::Necessary, &format!("   - System Swap: {}MB", total_swap_mb));
    analyzer_logger.log(LogType::Necessary, &format!(
        "   - Process limit: {}MB ({:.0}% of Total RAM + Swap)",
        max_process_mb,
        (max_process_mb as f64 / (total_ram_mb + total_swap_mb) as f64) * 100.0
    ));

    analyzer_logger.log(LogType::Necessary, &format!("Using {:?}", config));
    analyzer_logger.log(LogType::Necessary, &format!("Analysing contract in {}", config.contract_file_name()));

    let input_string = fs::read_to_string(config.contract_file_name())?;
    let mut pairs = RCLParser::parse(Rule::main, &input_string)?;
    let main_pair = pairs.next().unwrap();
    let contract: Contract = build_ast(main_pair)?;

    analyzer_logger.log(LogType::Necessary, &format!("Loaded Contract: \n{}", contract));

    let symbol_table_wrapped = recall_lib::utils::SymbolTable::instance();
    let table = symbol_table_wrapped.lock().unwrap();
    analyzer_logger.log(LogType::Necessary, &format!("{}", *table));
    drop(table);

    analyzer_logger.log(LogType::Necessary, "Processing contract...");

    let memory_guard = MemoryGuard::new(max_process_mb, analyzer_logger.clone());
    let _guard_handle = memory_guard.start_monitoring();
    
    let automaton = constructor.process(contract.clone(), &mut analyzer_logger);
    let elapsed = start.elapsed();

    use recall_lib::utils::get_automaton_data;
    use std::sync::atomic::Ordering;
    let max_rss = memory_guard.max_rss_used.load(Ordering::Relaxed);
    let data = get_automaton_data(elapsed.as_millis() as u64, max_rss, &automaton, &contract);

    use recall_lib::utils::print_result;
    let max_total = memory_guard.max_total_used.load(Ordering::Relaxed);
    let result_summary = print_result(
        &automaton,
        elapsed.as_millis() as u64,
        max_rss,
        max_total,
    );
    
    // Use markers to help the main process extract the final summary
    println!("FINAL_SUMMARY_START");
    analyzer_logger.log(LogType::Minimal, &result_summary);
    println!("FINAL_SUMMARY_END");
    
    analyzer_logger.log(LogType::Minimal, "Analysis completed successfully");

    if config.is_test() {
        println!("RESULT_CSV:{}", data);
    } else {
        println!("Analysis completed.");
    }

    Ok(())
}
