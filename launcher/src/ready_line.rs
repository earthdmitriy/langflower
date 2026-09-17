use serde_json::Value;

const READY_PREFIX: &str = "LANGFLOWER_READY ";

#[derive(Debug, Clone, PartialEq)]
pub struct ReadyPayload {
	pub url: String,
	pub port: i64,
	pub project_dir: String,
}

/// Parse one stdout line. Returns `None` when it is not a valid READY fact.
pub fn parse_ready_line(line: &str) -> Option<ReadyPayload> {
	let trimmed = line.replace('\r', "");
	let trimmed = trimmed.trim();
	let raw = trimmed.strip_prefix(READY_PREFIX)?;
	let parsed: Value = serde_json::from_str(raw).ok()?;
	let object = parsed.as_object()?;
	let url = object.get("url")?.as_str()?;
	if url.is_empty() {
		return None;
	}
	let port = object.get("port")?.as_i64()?;
	let project_dir = object.get("projectDir")?.as_str()?;
	if project_dir.is_empty() {
		return None;
	}
	Some(ReadyPayload {
		url: url.to_string(),
		port,
		project_dir: project_dir.to_string(),
	})
}

/// Scan a stdout chunk (possibly many lines) for the last valid READY fact.
pub fn parse_ready_chunk(chunk: &str) -> Option<ReadyPayload> {
	let mut found = None;
	for line in chunk.split(['\r', '\n']) {
		if let Some(parsed) = parse_ready_line(line) {
			found = Some(parsed);
		}
	}
	found
}
