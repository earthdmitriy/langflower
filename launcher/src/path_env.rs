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

/// Re-read OS PATH into this process (needed after winget / pkg install).
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
				let combined = String::from_utf8_lossy(&output.stdout);
				let combined = combined.trim();
				if !combined.is_empty() {
					env::set_var("PATH", combined);
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
