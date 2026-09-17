use langflower_launcher::ready_line::{parse_ready_chunk, parse_ready_line};

#[test]
fn parses_cli_ready_fact() {
	let line = "LANGFLOWER_READY {\"url\":\"http://127.0.0.1:4010\",\"port\":4010,\"projectDir\":\"/tmp/demo\"}";
	let parsed = parse_ready_line(line).expect("ready");
	assert_eq!(parsed.url, "http://127.0.0.1:4010");
	assert_eq!(parsed.port, 4010);
	assert_eq!(parsed.project_dir, "/tmp/demo");
}

#[test]
fn ignores_human_logs_and_malformed_json() {
	assert!(parse_ready_line("Starting Langflower...").is_none());
	assert!(parse_ready_line("LANGFLOWER_READY not-json").is_none());
	assert!(parse_ready_line("LANGFLOWER_READY {\"port\":4010}").is_none());
}

#[test]
fn parse_ready_chunk_returns_last_valid_line() {
	let chunk = [
		"Starting Langflower...",
		"LANGFLOWER_READY {\"url\":\"http://127.0.0.1:4010\",\"port\":4010,\"projectDir\":\"/a\"}",
		"Langflower running at http://127.0.0.1:4010",
	]
	.join("\n");
	assert_eq!(parse_ready_chunk(&chunk).map(|ready| ready.port), Some(4010));
}
