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

#[cfg(target_os = "macos")]
const MACOS_PATH_MARKER: &str = "__LF_PATH__";
#[cfg(target_os = "macos")]
const MACOS_KNOWN_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin"];

/// Login-shell PATH, then known Node directories, then the process PATH.
///
/// A Finder-launched `.app` does not inherit Terminal's PATH. Shell entries
/// stay first so the Node a terminal would run wins. Duplicates are dropped.
pub fn macos_search_path(shell: &str, known: &str, current: &str) -> String {
	let with_known = merge_path_entries(shell, known, ':');
	merge_path_entries(&with_known, current, ':')
}

/// Re-read OS PATH into this process (needed after winget / pkg install).
/// Keeps session entries (dev shells, CI toolcache) that are not in the
/// registry Path yet. On macOS, prepends the login-shell PATH and the usual
/// Node directories so a `.app` sees the same `node` as Terminal.
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
		let shell = login_shell_path();
		let known = macos_known_dirs();
		env::set_var("PATH", macos_search_path(&shell, &known, &current));
	}
}

#[cfg(target_os = "macos")]
fn macos_known_dirs() -> String {
	use std::path::Path;

	MACOS_KNOWN_DIRS
		.iter()
		.copied()
		.filter(|dir| Path::new(dir).is_dir())
		.collect::<Vec<_>>()
		.join(":")
}

#[cfg(target_os = "macos")]
fn login_shell_path() -> String {
	use std::sync::OnceLock;

	static CACHE: OnceLock<String> = OnceLock::new();
	CACHE.get_or_init(probe_login_shell_path).clone()
}

#[cfg(target_os = "macos")]
fn probe_login_shell_path() -> String {
	use std::path::Path;

	for bin in ["/bin/zsh", "/bin/bash"] {
		if !Path::new(bin).is_file() {
			continue;
		}
		if let Some(path) = shell_path_from(bin) {
			return path;
		}
	}
	String::new()
}

#[cfg(target_os = "macos")]
fn shell_path_from(bin: &str) -> Option<String> {
	use std::process::Stdio;
	use std::sync::mpsc;
	use std::thread;
	use std::time::Duration;

	let script = format!(
		"printf '\\n{marker}\\n%s\\n' \"$PATH\"",
		marker = MACOS_PATH_MARKER,
	);
	let mut child = Command::new(bin)
		.args(["-lic", &script])
		.stdin(Stdio::null())
		.stdout(Stdio::piped())
		.stderr(Stdio::null())
		.spawn()
		.ok()?;
	let pid = child.id();
	let (tx, rx) = mpsc::channel();
	thread::spawn(move || {
		let _ = tx.send(child.wait_with_output());
	});
	let output = match rx.recv_timeout(Duration::from_secs(3)) {
		Ok(result) => result.ok()?,
		Err(_) => {
			unsafe {
				libc::kill(pid as i32, libc::SIGKILL);
			}
			let _ = rx.recv_timeout(Duration::from_secs(1));
			return None;
		}
	};
	if !output.status.success() {
		return None;
	}
	path_after_marker(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "macos")]
fn path_after_marker(stdout: &str) -> Option<String> {
	let rest = stdout.rsplit_once(MACOS_PATH_MARKER)?.1;
	let path = rest.trim().lines().next()?.trim();
	if path.is_empty() {
		None
	} else {
		Some(path.to_string())
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
