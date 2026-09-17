use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::path_env::{hide_tokio, refresh_path};
use crate::ui_event::{UiEvent, UiSender};

async fn stream_status(tx: UiSender, mut command: Command) -> Result<(), String> {
	command.stdout(Stdio::piped()).stderr(Stdio::piped());
	hide_tokio(&mut command);
	let mut child = command
		.spawn()
		.map_err(|error| format!("Failed to start installer: {error}"))?;
	if let Some(stdout) = child.stdout.take() {
		let tx = tx.clone();
		tokio::spawn(async move {
			let mut lines = BufReader::new(stdout).lines();
			while let Ok(Some(line)) = lines.next_line().await {
				tx.send(UiEvent::Log {
					project_key: "installer".to_string(),
					stream: "stdout",
					text: format!("{line}\n"),
				});
			}
		});
	}
	if let Some(stderr) = child.stderr.take() {
		let tx = tx.clone();
		tokio::spawn(async move {
			let mut lines = BufReader::new(stderr).lines();
			while let Ok(Some(line)) = lines.next_line().await {
				tx.send(UiEvent::Log {
					project_key: "installer".to_string(),
					stream: "stderr",
					text: format!("{line}\n"),
				});
			}
		});
	}
	let status = child.wait().await.map_err(|error| error.to_string())?;
	if status.success() {
		return Ok(());
	}
	if status.code() == Some(-1978335189) {
		return Ok(());
	}
	Err(format!(
		"Installer exited {}",
		status.code().unwrap_or(-1)
	))
}

fn tokio_program(name: &str) -> Command {
	#[cfg(windows)]
	{
		let exe = match name {
			"npm" => "npm.cmd",
			"winget" => "winget.exe",
			"curl" => "curl.exe",
			other => other,
		};
		Command::new(exe)
	}
	#[cfg(not(windows))]
	{
		Command::new(name)
	}
}

pub async fn install_langflower(tx: UiSender, any_child: bool) -> Result<(), String> {
	if any_child {
		return Err("Stop Langflower before installing".to_string());
	}
	refresh_path();
	let mut command = tokio_program("npm");
	command.args(["install", "-g", "langflower@latest"]);
	stream_status(tx, command).await?;
	refresh_path();
	Ok(())
}

#[cfg(windows)]
async fn install_node_windows(tx: UiSender) -> Result<(), String> {
	let mut command = tokio_program("winget");
	command.args([
		"install",
		"--id",
		"OpenJS.NodeJS.LTS",
		"-e",
		"--accept-package-agreements",
		"--accept-source-agreements",
	]);
	stream_status(tx, command).await?;
	refresh_path();
	Ok(())
}

#[cfg(target_os = "macos")]
fn lts_pkg_url() -> Result<(String, String), String> {
	let output = crate::path_env::program("curl")
		.args(["-fsSL", "https://nodejs.org/dist/index.json"])
		.output()
		.map_err(|error| error.to_string())?;
	if !output.status.success() {
		return Err("Could not download Node.js version index".to_string());
	}
	let index: serde_json::Value =
		serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())?;
	let list = index
		.as_array()
		.ok_or_else(|| "Unexpected Node.js index".to_string())?;
	for entry in list {
		let lts = entry.get("lts");
		let is_lts = match lts {
			Some(value) if value.is_string() => true,
			Some(value) if value.as_bool() == Some(true) => true,
			_ => false,
		};
		if !is_lts {
			continue;
		}
		let version = entry
			.get("version")
			.and_then(|value| value.as_str())
			.ok_or_else(|| "LTS entry missing version".to_string())?;
		let url = format!("https://nodejs.org/dist/{version}/node-{version}.pkg");
		return Ok((version.to_string(), url));
	}
	Err("No Node.js LTS release found".to_string())
}

#[cfg(target_os = "macos")]
async fn install_node_macos(tx: UiSender) -> Result<(), String> {
	let (version, url) = lts_pkg_url()?;
	let pkg = std::env::temp_dir().join(format!("langflower-node-{version}.pkg"));
	tx.send(UiEvent::Log {
		project_key: "installer".to_string(),
		stream: "stdout",
		text: format!("Downloading Node.js {version}…\n"),
	});
	let mut download = tokio_program("curl");
	download.args([
		"-fL",
		"--retry",
		"3",
		"-o",
		pkg.to_str().ok_or_else(|| "temp path".to_string())?,
		&url,
	]);
	stream_status(tx, download).await?;
	let pkg_display = pkg.display().to_string();
	let script = format!(
		"do shell script \"installer -pkg '{}' -target /\" with administrator privileges",
		pkg_display.replace('\\', "\\\\").replace('"', "\\\"")
	);
	let mut elevate = Command::new("osascript");
	elevate.args(["-e", &script]);
	stream_status(tx, elevate).await?;
	refresh_path();
	Ok(())
}

pub async fn install_node(tx: UiSender, any_child: bool) -> Result<(), String> {
	if any_child {
		return Err("Stop Langflower before installing Node.js".to_string());
	}
	refresh_path();
	#[cfg(windows)]
	{
		return install_node_windows(tx).await;
	}
	#[cfg(target_os = "macos")]
	{
		return install_node_macos(tx).await;
	}
	#[cfg(not(any(windows, target_os = "macos")))]
	{
		let _ = tx;
		Err("Linux Node install is out of scope for launcher v1".to_string())
	}
}
