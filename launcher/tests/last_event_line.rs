use langflower_launcher::last_event_line::latest_last_event_line;

#[test]
fn keeps_last_event_line_across_newlines() {
	let text = [
		"Starting Langflower...",
		"Last event: Coder · draft · pending",
		"Last event: Coder · draft · value · hello",
	]
	.join("\n");
	assert_eq!(
		latest_last_event_line(&text).as_deref(),
		Some("Last event: Coder · draft · value · hello")
	);
}

#[test]
fn treats_tty_carriage_returns_as_line_breaks() {
	assert_eq!(
		latest_last_event_line("Last event: A\rLast event: B · draft · pending").as_deref(),
		Some("Last event: B · draft · pending")
	);
}

#[test]
fn returns_none_when_missing() {
	assert_eq!(latest_last_event_line("Starting Langflower...\n"), None);
}
