#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
	let runtime = tokio::runtime::Builder::new_multi_thread()
		.enable_all()
		.build()
		.expect("tokio runtime");
	langflower_launcher::ui::run(runtime.handle().clone());
}
