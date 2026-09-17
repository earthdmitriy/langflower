use std::collections::HashMap;
use std::path::PathBuf;

use crate::child::{has_child, ChildSlot};
use crate::ui_state::{busy, RunStatus};

pub fn project_key(path: &str) -> String {
	let trimmed = path.trim();
	if trimmed.is_empty() {
		return String::new();
	}
	let resolved = std::fs::canonicalize(trimmed)
		.unwrap_or_else(|_| PathBuf::from(trimmed));
	let raw = resolved.to_string_lossy();
	#[cfg(windows)]
	{
		raw.to_lowercase()
	}
	#[cfg(not(windows))]
	{
		raw.into_owned()
	}
}

pub struct Instance {
	pub display_path: String,
	pub status: RunStatus,
	pub assigned_port: Option<u16>,
	pub bound_port: Option<u16>,
	pub url: Option<String>,
	pub error: Option<String>,
	pub stop_requested: bool,
	pub opened_browser: bool,
	slot: ChildSlot,
}

impl Instance {
	fn new(display_path: String) -> Self {
		Self {
			display_path,
			status: RunStatus::Ready,
			assigned_port: None,
			bound_port: None,
			url: None,
			error: None,
			stop_requested: false,
			opened_browser: false,
			slot: ChildSlot::new(),
		}
	}

	pub fn slot(&self) -> &ChildSlot {
		&self.slot
	}

	pub fn display_port(&self) -> Option<u16> {
		if self.status == RunStatus::Running {
			self.bound_port
		} else {
			None
		}
	}
}

#[derive(Default)]
pub struct InstanceManager {
	by_key: HashMap<String, Instance>,
}

impl InstanceManager {
	pub fn get(&self, path: &str) -> Option<&Instance> {
		if let Some(found) = self.by_key.get(path) {
			return Some(found);
		}
		self.by_key.get(&project_key(path))
	}

	pub fn get_mut(&mut self, path: &str) -> Option<&mut Instance> {
		if self.by_key.contains_key(path) {
			return self.by_key.get_mut(path);
		}
		self.by_key.get_mut(&project_key(path))
	}

	pub fn begin_start(
		&mut self,
		display_path: &str,
		port: u16,
	) -> Result<ChildSlot, String> {
		let key = project_key(display_path);
		if key.is_empty() {
			return Err("Choose a project folder first".to_string());
		}
		if let Some(existing) = self.by_key.get(&key) {
			if busy(existing.status) {
				return Err("Langflower is already running".to_string());
			}
		}
		let mut instance = Instance::new(display_path.trim().to_string());
		instance.status = RunStatus::Starting;
		instance.assigned_port = Some(port);
		instance.stop_requested = false;
		instance.opened_browser = false;
		instance.error = None;
		instance.bound_port = None;
		instance.url = None;
		let slot = instance.slot.clone();
		self.by_key.insert(key, instance);
		Ok(slot)
	}

	pub fn reserved_ports(&self) -> Vec<u16> {
		self.by_key
			.values()
			.filter(|instance| busy(instance.status))
			.filter_map(|instance| instance.assigned_port.or(instance.bound_port))
			.collect()
	}

	pub fn has_live_process(&self) -> bool {
		self.by_key.values().any(|instance| {
			busy(instance.status) || has_child(instance.slot()).unwrap_or(false)
		})
	}

	pub fn all_slots(&self) -> Vec<ChildSlot> {
		self.by_key
			.values()
			.map(|instance| instance.slot.clone())
			.collect()
	}

	pub fn row_status(&self, path: &str) -> RunStatus {
		self.get(path)
			.map(|instance| instance.status)
			.unwrap_or(RunStatus::Ready)
	}

	pub fn url_for(&self, path: &str) -> Option<String> {
		self.get(path)
			.filter(|instance| instance.status == RunStatus::Running)
			.and_then(|instance| instance.url.clone())
	}

	pub fn mark_ready(
		&mut self,
		path: &str,
		port: u16,
		url: String,
	) -> Option<&Instance> {
		let instance = self.get_mut(path)?;
		if instance.stop_requested {
			return Some(instance);
		}
		instance.status = RunStatus::Running;
		instance.bound_port = Some(port);
		instance.url = Some(url);
		instance.error = None;
		Some(instance)
	}

	/// Returns the instance URL once, the first time it becomes Running.
	pub fn take_auto_open_url(&mut self, path: &str) -> Option<String> {
		let instance = self.get_mut(path)?;
		if instance.status != RunStatus::Running || instance.opened_browser {
			return None;
		}
		let url = instance.url.clone()?;
		instance.opened_browser = true;
		Some(url)
	}

	pub fn mark_stopping(&mut self, path: &str) -> Option<ChildSlot> {
		let instance = self.get_mut(path)?;
		instance.stop_requested = true;
		instance.status = RunStatus::Stopping;
		Some(instance.slot.clone())
	}

	pub fn mark_exit(&mut self, path: &str, code: Option<i32>) {
		let Some(instance) = self.get_mut(path) else {
			return;
		};
		instance.assigned_port = None;
		instance.bound_port = None;
		instance.url = None;
		instance.opened_browser = false;
		if instance.stop_requested || code.unwrap_or(0) == 0 {
			instance.status = RunStatus::Ready;
			instance.error = None;
		} else {
			instance.status = RunStatus::Error;
			instance.error = Some(format!("child exited {}", code.unwrap_or(-1)));
		}
		instance.stop_requested = false;
	}

	pub fn mark_spawn_failed(&mut self, path: &str, message: &str) {
		let key = project_key(path);
		if key.is_empty() {
			return;
		}
		let instance = self
			.by_key
			.entry(key)
			.or_insert_with(|| Instance::new(path.trim().to_string()));
		instance.assigned_port = None;
		instance.bound_port = None;
		instance.url = None;
		instance.opened_browser = false;
		instance.stop_requested = false;
		instance.status = RunStatus::Error;
		instance.error = Some(message.to_string());
	}

	pub fn recent_kind(status: RunStatus) -> &'static str {
		match status {
			RunStatus::Ready => "stopped",
			RunStatus::Starting => "starting",
			RunStatus::Running => "running",
			RunStatus::Stopping => "stopping",
			RunStatus::Error => "error",
		}
	}

	pub fn recent_status_text(status: RunStatus) -> &'static str {
		match status {
			RunStatus::Ready => "Not running",
			RunStatus::Starting => "Starting…",
			RunStatus::Running => "Running",
			RunStatus::Stopping => "Stopping…",
			RunStatus::Error => "Failed to start",
		}
	}

	pub fn recent_port_text(instance: Option<&Instance>) -> String {
		match instance.and_then(Instance::display_port) {
			Some(port) => format!("port {port}"),
			None => String::new(),
		}
	}
}
