use std::path::PathBuf;
use std::process::Output;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use crate::node_semver::{
	node_meets_minimum, parse_engines_node_min, parse_node_version, DEFAULT_MIN_NODE,
};
use crate::path_env::{program, refresh_path};

#[derive(Clone)]
pub struct DetectRuntime {
	pub node_version: Option<String>,
	pub node_ok: bool,
	pub min_node: String,
	pub langflower_version: Option<String>,
	pub registry_version: Option<String>,
	pub update_available: bool,
}

fn run_capture(command: &mut std::process::Command) -> Result<Output, String> {
	command.output().map_err(|error| error.to_string())
}

fn stdout_trim(output: &Output) -> String {
	String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn node_version() -> Option<String> {
	let output = run_capture(program("node").arg("-v")).ok()?;
	if !output.status.success() {
		return None;
	}
	let version = stdout_trim(&output);
	if version.is_empty() {
		None
	} else {
		Some(version)
	}
}

fn npm_root_g() -> Option<PathBuf> {
	let output = run_capture(program("npm").args(["root", "-g"])).ok()?;
	if !output.status.success() {
		return None;
	}
	let root = stdout_trim(&output);
	if root.is_empty() {
		None
	} else {
		Some(PathBuf::from(root))
	}
}

fn langflower_version() -> Option<String> {
	let output = run_capture(program("npm").args([
		"list",
		"-g",
		"langflower",
		"--depth=0",
		"--json",
	]))
	.ok()?;
	let raw = stdout_trim(&output);
	let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
	json.get("dependencies")?
		.get("langflower")?
		.get("version")?
		.as_str()
		.map(str::to_string)
}

fn engines_min(pkg_root: &PathBuf) -> String {
	let path = pkg_root.join("langflower").join("package.json");
	let Ok(raw) = std::fs::read_to_string(path) else {
		return DEFAULT_MIN_NODE.to_string();
	};
	let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
		return DEFAULT_MIN_NODE.to_string();
	};
	let Some(engines) = json.get("engines").and_then(|value| value.get("node")) else {
		return DEFAULT_MIN_NODE.to_string();
	};
	let Some(spec) = engines.as_str() else {
		return DEFAULT_MIN_NODE.to_string();
	};
	parse_engines_node_min(spec).unwrap_or_else(|| DEFAULT_MIN_NODE.to_string())
}

fn registry_version() -> Option<String> {
	let output = run_capture(program("npm").args(["view", "langflower", "version"]))
		.ok()?;
	if !output.status.success() {
		return None;
	}
	let version = stdout_trim(&output);
	if version.is_empty() {
		None
	} else {
		Some(version)
	}
}

fn registry_version_timed() -> Option<String> {
	let (tx, rx) = mpsc::channel();
	thread::spawn(move || {
		let _ = tx.send(registry_version());
	});
	rx.recv_timeout(Duration::from_secs(12)).ok().flatten()
}

pub fn detect_runtime() -> Result<DetectRuntime, String> {
	refresh_path();
	let langflower = langflower_version();
	let min_node = npm_root_g()
		.map(|root| engines_min(&root))
		.unwrap_or_else(|| DEFAULT_MIN_NODE.to_string());
	let node = node_version();
	let node_ok = node
		.as_deref()
		.map(|version| node_meets_minimum(version, &min_node))
		.unwrap_or(false);
	let registry = if node_ok {
		registry_version_timed()
	} else {
		None
	};
	let update_available = match (&langflower, &registry) {
		(Some(local), Some(remote)) => match (
			parse_node_version(local),
			parse_node_version(remote),
		) {
			(Some(left), Some(right)) => right > left,
			_ => false,
		},
		_ => false,
	};
	Ok(DetectRuntime {
		node_version: node,
		node_ok,
		min_node,
		langflower_version: langflower,
		registry_version: registry,
		update_available,
	})
}

pub fn resolve_cli_bin() -> Result<PathBuf, String> {
	refresh_path();
	if let Ok(override_bin) = std::env::var("LANGFLOWER_LAUNCHER_BIN") {
		let path = PathBuf::from(override_bin);
		if path.is_file() {
			return Ok(path);
		}
		return Err(format!(
			"LANGFLOWER_LAUNCHER_BIN is not a file: {}",
			path.display()
		));
	}
	let root = npm_root_g().ok_or_else(|| {
		"Could not resolve npm global root (is npm on PATH?)".to_string()
	})?;
	let bin = root.join("langflower").join("bin").join("langflower.js");
	if bin.is_file() {
		return Ok(bin);
	}
	Err(format!(
		"Global langflower bin not found at {}",
		bin.display()
	))
}
