use std::collections::HashSet;
use std::env;
use std::process::Command;

/// Win32 `CREATE_NO_WINDOW`. Console children of a GUI process must not flash.
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
pub fn hide_std(command: &mut Command) {
	use std::os::windows::process::CommandExt;
	command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_std(_command: &mut Command) {}

#[cfg(windows)]
pub fn hide_tokio(command: &mut tokio::process::Command) {
	command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_tokio(_command: &mut tokio::process::Command) {}

/// Deduped PATH: `primary` entries first, then any extra from `current`.
pub fn merge_path_entries(primary: &str, current: &str, sep: char) -> String {
	let mut parts = Vec::new();
	let mut seen = HashSet::new();
	let mut push = |raw: &str| {
		let trimmed = raw.trim();
		if trimmed.is_empty() {
			return;
		}
		let key = trimmed.to_ascii_lowercase();
		if seen.insert(key) {
			parts.push(trimmed.to_string());
		}
	};
	for part in primary.split(sep) {
		push(part);
	}
	for part in current.split(sep) {
		push(part);
	}
	parts.join(&sep.to_string())
}

/// Re-read OS PATH into this process (needed after winget / pkg install).
/// Keeps session entries (dev shells, CI toolcache) that are not in the
/// registry Path yet.
pub fn refresh_path() {
	#[cfg(windows)]
	{
		let mut command = Command::new("powershell.exe");
		hide_std(&mut command);
		let output = command
			.args([
				"-NoProfile",
				"-WindowStyle",
				"Hidden",
				"-Command",
				"[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
			])
			.output();
		if let Ok(output) = output {
			if output.status.success() {
				let registry = String::from_utf8_lossy(&output.stdout);
				let registry = registry.trim();
				if !registry.is_empty() {
					let current = env::var("PATH").unwrap_or_default();
					env::set_var(
						"PATH",
						merge_path_entries(registry, &current, ';'),
					);
				}
			}
		}
	}
	#[cfg(target_os = "macos")]
	{
		let current = env::var("PATH").unwrap_or_default();
		if !current.split(':').any(|part| part == "/usr/local/bin") {
			env::set_var("PATH", format!("/usr/local/bin:{current}"));
		}
	}
}

pub fn tokio_node() -> tokio::process::Command {
	#[cfg(windows)]
	{
		let mut command = tokio::process::Command::new("node.exe");
		hide_tokio(&mut command);
		command
	}
	#[cfg(not(windows))]
	{
		tokio::process::Command::new("node")
	}
}

pub fn program(name: &str) -> Command {
	#[cfg(windows)]
	{
		let exe = match name {
			"npm" => "npm.cmd",
			"winget" => "winget.exe",
			"node" => "node.exe",
			other => other,
		};
		let mut command = Command::new(exe);
		hide_std(&mut command);
		command
	}
	#[cfg(not(windows))]
	{
		Command::new(name)
	}
}
