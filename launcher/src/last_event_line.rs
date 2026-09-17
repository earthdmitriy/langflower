const LAST_EVENT_PREFIX: &str = "Last event:";

/// Latest `Last event:` line in `text`. Handles TTY `\r` overwrites.
pub fn latest_last_event_line(text: &str) -> Option<String> {
	let mut found = None;
	for part in text.split(['\r', '\n']) {
		let line = part.trim();
		if line.starts_with(LAST_EVENT_PREFIX) {
			found = Some(line.to_string());
		}
	}
	found
}
