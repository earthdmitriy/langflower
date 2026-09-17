use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;

use crate::detect::resolve_cli_bin;
use crate::path_env::{hide_tokio, refresh_path, tokio_node};
use crate::ready_line::parse_ready_line;
use crate::ui_event::{UiEvent, UiSender};

#[derive(Clone)]
pub struct ChildSlot {
	inner: Arc<Mutex<Option<Child>>>,
	cancel: Arc<AtomicBool>,
}

impl ChildSlot {
	pub fn new() -> Self {
		Self {
			inner: Arc::new(Mutex::new(None)),
			cancel: Arc::new(AtomicBool::new(false)),
		}
	}

	pub fn request_cancel(&self) {
		self.cancel.store(true, Ordering::SeqCst);
	}
}

async fn pipe_lines(
	tx: UiSender,
	project_key: String,
	reader: impl tokio::io::AsyncRead + Unpin,
	stream: &'static str,
) {
	let mut lines = BufReader::new(reader).lines();
	while let Ok(Some(line)) = lines.next_line().await {
		if let Some(payload) = parse_ready_line(&line) {
			tx.send(UiEvent::Ready {
				project_key: project_key.clone(),
				payload,
			});
		}
		tx.send(UiEvent::Log {
			project_key: project_key.clone(),
			stream,
			text: format!("{line}\n"),
		});
	}
}

pub async fn kill_tree(child: &mut Child) {
	if let Some(pid) = child.id() {
		#[cfg(windows)]
		{
			let mut killer = tokio::process::Command::new("taskkill.exe");
			hide_tokio(&mut killer);
			let _ = killer
				.args(["/F", "/T", "/PID", &pid.to_string()])
				.status()
				.await;
		}
		#[cfg(unix)]
		{
			unsafe {
				libc::kill(-(pid as i32), libc::SIGTERM);
			}
		}
	}
	let _ = child.start_kill();
}

pub fn has_child(state: &ChildSlot) -> Result<bool, String> {
	let slot = state.inner.lock().map_err(|error| error.to_string())?;
	Ok(slot.is_some())
}

pub async fn spawn_cli(
	tx: UiSender,
	state: ChildSlot,
	project_dir: String,
	port: u16,
	project_key: String,
) -> Result<(), String> {
	state.cancel.store(false, Ordering::SeqCst);
	refresh_path();
	let trimmed = project_dir.trim();
	if trimmed.is_empty() {
		return Err("Choose a project folder first".to_string());
	}
	if !Path::new(trimmed).is_dir() {
		return Err(format!("That folder could not be found: {trimmed}"));
	}
	{
		let slot = state.inner.lock().map_err(|error| error.to_string())?;
		if slot.is_some() {
			return Err("Langflower is already running".to_string());
		}
	}
	let bin = resolve_cli_bin()?;
	let mut command = tokio_node();
	command
		.arg(&bin)
		.arg(trimmed)
		.arg("--no-open")
		.arg("-p")
		.arg(port.to_string())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.kill_on_drop(true);
	#[cfg(unix)]
	{
		command.process_group(0);
	}
	let mut child = command
		.spawn()
		.map_err(|error| format!("Could not start Langflower: {error}"))?;
	let stdout = child
		.stdout
		.take()
		.ok_or_else(|| "missing stdout".to_string())?;
	let stderr = child
		.stderr
		.take()
		.ok_or_else(|| "missing stderr".to_string())?;
	tokio::spawn(pipe_lines(
		tx.clone(),
		project_key.clone(),
		stdout,
		"stdout",
	));
	tokio::spawn(pipe_lines(
		tx.clone(),
		project_key.clone(),
		stderr,
		"stderr",
	));
	{
		let mut slot = state.inner.lock().map_err(|error| error.to_string())?;
		if state.cancel.load(Ordering::SeqCst) {
			drop(slot);
			kill_tree(&mut child).await;
			tx.send(UiEvent::Exit {
				project_key,
				code: Some(0),
			});
			return Ok(());
		}
		*slot = Some(child);
	}
	let watch = state.inner.clone();
	tokio::spawn(async move {
		loop {
			tokio::time::sleep(Duration::from_millis(200)).await;
			let mut guard = match watch.lock() {
				Ok(guard) => guard,
				Err(_) => return,
			};
			let Some(child) = guard.as_mut() else {
				return;
			};
			match child.try_wait() {
				Ok(Some(status)) => {
					*guard = None;
					drop(guard);
					tx.send(UiEvent::Exit {
						project_key,
						code: status.code(),
					});
					return;
				}
				Ok(None) => {}
				Err(_) => {
					*guard = None;
					drop(guard);
					tx.send(UiEvent::Exit {
						project_key,
						code: None,
					});
					return;
				}
			}
		}
	});
	Ok(())
}

pub async fn stop_cli(
	tx: UiSender,
	state: &ChildSlot,
	project_key: String,
) -> Result<(), String> {
	state.request_cancel();
	let taken = {
		let mut slot = state.inner.lock().map_err(|error| error.to_string())?;
		slot.take()
	};
	let Some(mut child) = taken else {
		tx.send(UiEvent::Exit {
			project_key,
			code: Some(0),
		});
		return Ok(());
	};
	kill_tree(&mut child).await;
	let status = child.wait().await.ok();
	tx.send(UiEvent::Exit {
		project_key,
		code: status.and_then(|value| value.code()),
	});
	Ok(())
}

pub async fn stop_cli_silent(state: &ChildSlot) {
	state.request_cancel();
	let taken = state.inner.lock().ok().and_then(|mut slot| slot.take());
	if let Some(mut child) = taken {
		kill_tree(&mut child).await;
		let _ = child.wait().await;
	}
}
