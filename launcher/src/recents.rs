use std::fs;
use std::path::PathBuf;

use serde_json::Value;

pub const RECENTS_CAP: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecentsFile {
	pub recents: Vec<String>,
}

fn global_dir() -> Result<PathBuf, String> {
	#[cfg(windows)]
	{
		let appdata = std::env::var("APPDATA")
			.map_err(|_| "APPDATA is not set".to_string())?;
		Ok(PathBuf::from(appdata).join("langflower"))
	}
	#[cfg(target_os = "macos")]
	{
		let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
		Ok(PathBuf::from(home)
			.join("Library")
			.join("Application Support")
			.join("langflower"))
	}
	#[cfg(not(any(windows, target_os = "macos")))]
	{
		let home = std::env::var("XDG_CONFIG_HOME").ok().map(PathBuf::from);
		let dir = match home {
			Some(path) => path.join("langflower"),
			None => {
				let home = std::env::var("HOME")
					.map_err(|_| "HOME is not set".to_string())?;
				PathBuf::from(home).join(".config").join("langflower")
			}
		};
		Ok(dir)
	}
}

fn recents_path() -> Result<PathBuf, String> {
	Ok(global_dir()?.join("launcher.json"))
}

/// Most-recent first, unique, capped. Empty `next` is ignored.
pub fn merge_recent(recents: &[String], next: &str) -> Vec<String> {
	let normalized = next.trim();
	if normalized.is_empty() {
		return recents.to_vec();
	}
	let mut rest: Vec<String> = recents
		.iter()
		.filter(|entry| entry.as_str() != normalized)
		.cloned()
		.collect();
	let mut out = vec![normalized.to_string()];
	out.append(&mut rest);
	out.truncate(RECENTS_CAP);
	out
}

/// Drop `path` from recents. Unknown or empty paths leave the list unchanged.
pub fn remove_recent(recents: &[String], path: &str) -> Vec<String> {
	let normalized = path.trim();
	if normalized.is_empty() {
		return recents.to_vec();
	}
	recents
		.iter()
		.filter(|entry| entry.as_str() != normalized)
		.cloned()
		.collect()
}

/// Parse recents JSON. Unknown / invalid shapes become an empty list.
pub fn parse_recents_json(raw: &str) -> RecentsFile {
	let Ok(parsed) = serde_json::from_str::<Value>(raw) else {
		return RecentsFile { recents: vec![] };
	};
	let Some(array) = parsed.get("recents").and_then(Value::as_array) else {
		return RecentsFile { recents: vec![] };
	};
	let recents = array
		.iter()
		.filter_map(Value::as_str)
		.map(str::trim)
		.filter(|entry| !entry.is_empty())
		.map(str::to_string)
		.collect();
	RecentsFile { recents }
}

pub fn serialize_recents(recents: &[String]) -> String {
	let value = serde_json::json!({ "recents": recents });
	format!(
		"{}\n",
		serde_json::to_string(&value).unwrap_or_else(|_| "{\"recents\":[]}".to_string())
	)
}

pub fn read_recents() -> Result<String, String> {
	let path = recents_path()?;
	match fs::read_to_string(&path) {
		Ok(raw) => Ok(raw),
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
			Ok("{\"recents\":[]}\n".to_string())
		}
		Err(error) => Err(error.to_string()),
	}
}

pub fn write_recents(contents: &str) -> Result<(), String> {
	let path = recents_path()?;
	if let Some(parent) = path.parent() {
		fs::create_dir_all(parent).map_err(|error| error.to_string())?;
	}
	fs::write(path, contents).map_err(|error| error.to_string())
}
