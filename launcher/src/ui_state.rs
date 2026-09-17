#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunStatus {
	Ready,
	Starting,
	Running,
	Stopping,
	Error,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Chrome {
	pub show_start: bool,
	pub show_stop: bool,
	pub show_open: bool,
	pub start_enabled: bool,
	pub stop_enabled: bool,
	pub open_enabled: bool,
	pub browse_enabled: bool,
}

pub fn project_name(path: &str) -> String {
	let trimmed = path.trim().trim_end_matches(['/', '\\']);
	trimmed
		.rsplit(['/', '\\'])
		.next()
		.filter(|name| !name.is_empty())
		.unwrap_or(trimmed)
		.to_string()
}

/// Log prefix for a row. Detect/startup uses `launcher`; only real installs
/// use `install`.
pub fn log_channel(project_key: &str) -> String {
	match project_key {
		"installer" => "install".to_string(),
		"launcher" => "launcher".to_string(),
		other => project_name(other),
	}
}

/// First Details line after runtime detection.
pub fn detect_log_line(
	node_ok: bool,
	node_version: Option<&str>,
	min_node: &str,
	langflower_version: Option<&str>,
	update_available: bool,
) -> String {
	if node_ok && langflower_version.is_some() && !update_available {
		let node = node_version.unwrap_or("unknown");
		let cli = langflower_version.unwrap_or("unknown");
		return format!(
			"Node.js {node} and Langflower {cli} already have current versions."
		);
	}
	let node_line = match node_version {
		None => "Node.js not found".to_string(),
		Some(version) if node_ok => format!("Node {version}"),
		Some(version) => format!("Node {version} (need >= {min_node})"),
	};
	let cli_line = match langflower_version {
		None => "Langflower is not installed yet".to_string(),
		Some(version) if update_available => {
			format!("Langflower {version} — an update is available")
		}
		Some(version) => format!("Langflower {version}"),
	};
	format!("{node_line}. {cli_line}.")
}

pub fn busy(status: RunStatus) -> bool {
	matches!(
		status,
		RunStatus::Starting | RunStatus::Running | RunStatus::Stopping
	)
}

pub fn can_start(
	status: RunStatus,
	installing: bool,
	project: &str,
	node_ok: bool,
	cli_installed: bool,
) -> bool {
	if busy(status) || installing {
		return false;
	}
	if project.trim().is_empty() {
		return false;
	}
	node_ok && cli_installed
}

pub fn header_label(installing: bool) -> &'static str {
	if installing {
		"Working…"
	} else {
		"Ready"
	}
}

pub fn human_error(raw: &str) -> String {
	let trimmed = raw.trim();
	if trimmed.starts_with("child exited") {
		return "Langflower stopped unexpectedly".to_string();
	}
	if trimmed.contains("Not a directory") || trimmed.contains("could not be found") {
		return "That folder could not be found".to_string();
	}
	if trimmed.contains("Working directory is empty") || trimmed.contains("Choose a project") {
		return "Choose a project folder first".to_string();
	}
	if trimmed.contains("already running") {
		return "Langflower is already running".to_string();
	}
	if trimmed.contains("Failed to spawn") || trimmed.contains("Could not start") {
		return "Could not start Langflower".to_string();
	}
	if trimmed.contains("No free port") {
		return "No free port is available".to_string();
	}
	if trimmed.contains('\n') || trimmed.len() > 160 {
		return "Something went wrong. See Details.".to_string();
	}
	if trimmed.is_empty() {
		return "Something went wrong. See Details.".to_string();
	}
	trimmed.to_string()
}

pub fn hint_text(
	status: RunStatus,
	installing: bool,
	detail: Option<&str>,
	project: &str,
	node_ok: bool,
	cli_installed: bool,
	port: Option<u16>,
) -> String {
	if installing {
		return "This may take a minute…".to_string();
	}
	let name = project_name(project);
	match status {
		RunStatus::Starting => format!("Starting {name}…"),
		RunStatus::Stopping => format!("Stopping {name}…"),
		RunStatus::Running => match port {
			Some(port) => format!("{name} is running on port {port}"),
			None => format!("{name} is running"),
		},
		RunStatus::Error => human_error(detail.unwrap_or("")),
		RunStatus::Ready => {
			if !node_ok {
				"Node.js is required before you can start".to_string()
			} else if !cli_installed {
				"Install Langflower to continue".to_string()
			} else if project.trim().is_empty() {
				"Choose a project folder to get started".to_string()
			} else {
				"Ready to start".to_string()
			}
		}
	}
}

pub fn chrome(status: RunStatus, installing: bool, can_start: bool, ready: bool) -> Chrome {
	match status {
		RunStatus::Ready | RunStatus::Error => Chrome {
			show_start: true,
			show_stop: false,
			show_open: false,
			start_enabled: can_start,
			stop_enabled: false,
			open_enabled: false,
			browse_enabled: !installing,
		},
		RunStatus::Starting => Chrome {
			show_start: false,
			show_stop: true,
			show_open: false,
			start_enabled: false,
			stop_enabled: true,
			open_enabled: false,
			browse_enabled: !installing,
		},
		RunStatus::Running => Chrome {
			show_start: false,
			show_stop: true,
			show_open: true,
			start_enabled: false,
			stop_enabled: true,
			open_enabled: ready,
			browse_enabled: !installing,
		},
		RunStatus::Stopping => Chrome {
			show_start: false,
			show_stop: false,
			show_open: false,
			start_enabled: false,
			stop_enabled: false,
			open_enabled: false,
			browse_enabled: !installing,
		},
	}
}

pub fn header_rgb(installing: bool) -> (u8, u8, u8) {
	if installing {
		(0xB4, 0x53, 0x09)
	} else {
		(0x2F, 0x7D, 0x4A)
	}
}
