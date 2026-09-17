use std::cell::RefCell;
use std::path::Path;
use std::rc::Rc;
use std::sync::mpsc;
use std::time::Duration;

use slint::{CloseRequestResponse, ComponentHandle, ModelRc, VecModel};
use tokio::runtime::Handle;

use crate::child;
use crate::clipboard;
use crate::detect::{self, DetectRuntime};
use crate::install;
use crate::instances::{project_key, InstanceManager};
use crate::open_url::{open_help_manual, open_url};
use crate::ports::allocate_port;
use crate::recents::{
	merge_recent, parse_recents_json, read_recents, remove_recent, serialize_recents,
	write_recents,
};
use crate::ui_event::{UiEvent, UiSender};
use crate::ui_state::{
	can_start, chrome, detect_log_line, header_label, header_rgb, hint_text, human_error,
	log_channel, project_name, RunStatus,
};

slint::include_modules!();

const LOG_CAP: usize = 2000;

struct Model {
	detect: Option<DetectRuntime>,
	skipped_update: bool,
	recents: Vec<String>,
	log_lines: Vec<String>,
	installing: bool,
	instances: InstanceManager,
}

struct Ctx {
	ui: LauncherWindow,
	model: Model,
	rt: Handle,
	rx: mpsc::Receiver<UiEvent>,
	sender: UiSender,
	_timer: slint::Timer,
}

thread_local! {
	static CTX: RefCell<Option<Rc<RefCell<Ctx>>>> = const { RefCell::new(None) };
}

fn with_ctx<R>(f: impl FnOnce(&LauncherWindow, &mut Model, &Handle, &UiSender) -> R) -> Option<R> {
	CTX.with(|slot| {
		let holder = slot.borrow();
		let ctx_rc = holder.as_ref()?.clone();
		drop(holder);
		let mut ctx = ctx_rc.borrow_mut();
		let ui = ctx.ui.clone_strong();
		let rt = ctx.rt.clone();
		let sender = ctx.sender.clone();
		Some(f(&ui, &mut ctx.model, &rt, &sender))
	})
}

fn project_from_ui(ui: &LauncherWindow) -> String {
	ui.get_project_path().to_string()
}

fn pick_folder() -> Option<String> {
	rfd::FileDialog::new()
		.set_title("Choose your project")
		.pick_folder()
		.map(|path| path.to_string_lossy().into_owned())
}

fn persist_recents(model: &mut Model, path: &str) {
	model.recents = merge_recent(&model.recents, path);
	let _ = write_recents(&serialize_recents(&model.recents));
}

fn forget_recent(model: &mut Model, path: &str) {
	model.recents = remove_recent(&model.recents, path);
	let _ = write_recents(&serialize_recents(&model.recents));
}

fn append_log(model: &mut Model, project_key_value: &str, text: &str) {
	let prefix = format!("[{}] ", log_channel(project_key_value));
	for line in text.split_inclusive('\n') {
		if line.is_empty() {
			continue;
		}
		if line.ends_with('\n') {
			model.log_lines.push(format!("{prefix}{line}"));
		} else {
			model.log_lines.push(format!("{prefix}{line}\n"));
		}
	}
	if model.log_lines.len() > LOG_CAP {
		let extra = model.log_lines.len() - LOG_CAP;
		model.log_lines.drain(0..extra);
	}
}

fn apply_detect(model: &mut Model, detect: DetectRuntime) {
	model.skipped_update = false;
	append_log(
		model,
		"launcher",
		&format!(
			"{}\n",
			detect_log_line(
				detect.node_ok,
				detect.node_version.as_deref(),
				&detect.min_node,
				detect.langflower_version.as_deref(),
				detect.update_available,
			)
		),
	);
	if detect.registry_version.is_none() && detect.langflower_version.is_some() {
		append_log(
			model,
			"launcher",
			"Could not reach the package registry; using the installed copy.\n",
		);
	}
	model.detect = Some(detect);
}

fn selected_status(model: &Model, project: &str) -> RunStatus {
	model.instances.row_status(project)
}

fn sync_ui(ui: &LauncherWindow, model: &Model) {
	let project = project_from_ui(ui);
	let detect = model.detect.as_ref();
	let node_ok = detect.map(|item| item.node_ok).unwrap_or(false);
	let cli_installed = detect
		.map(|item| item.langflower_version.is_some())
		.unwrap_or(false);
	let status = selected_status(model, &project);
	let instance = model.instances.get(&project);
	let startable = can_start(status, model.installing, &project, node_ok, cli_installed);
	let view = chrome(
		status,
		model.installing,
		startable,
		instance
			.map(|item| item.status == RunStatus::Running && item.url.is_some())
			.unwrap_or(false),
	);
	let (red, green, blue) = header_rgb(model.installing);
	ui.set_status_text(header_label(model.installing).into());
	ui.set_status_color(slint::Color::from_rgb_u8(red, green, blue));
	ui.set_hint_text(
		hint_text(
			status,
			model.installing,
			instance.and_then(|item| item.error.as_deref()),
			&project,
			node_ok,
			cli_installed,
			instance.and_then(|item| item.display_port()),
		)
		.into(),
	);
	ui.set_details_text(model.log_lines.concat().into());
	ui.set_show_start(view.show_start);
	ui.set_show_stop(view.show_stop);
	ui.set_show_open(view.show_open);
	ui.set_start_enabled(view.start_enabled);
	ui.set_stop_enabled(view.stop_enabled);
	ui.set_open_enabled(view.open_enabled);
	ui.set_browse_enabled(view.browse_enabled);
	ui.set_project_enabled(!model.installing);
	let recents: Vec<RecentItem> = model
		.recents
		.iter()
		.map(|path| {
			let inst = model.instances.get(path);
			let row_status = inst.map(|item| item.status).unwrap_or(RunStatus::Ready);
			RecentItem {
				name: project_name(path).into(),
				path: path.into(),
				status_text: InstanceManager::recent_status_text(row_status).into(),
				status_kind: InstanceManager::recent_kind(row_status).into(),
				port_text: InstanceManager::recent_port_text(inst).into(),
				show_open: inst
					.map(|item| item.status == RunStatus::Running && item.url.is_some())
					.unwrap_or(false),
			}
		})
		.collect();
	ui.set_recents(ModelRc::new(VecModel::from(recents)));

	ui.set_show_install_node(false);
	ui.set_show_install_cli(false);
	ui.set_show_skip_update(false);
	if !model.installing && !model.instances.has_live_process() {
		if let Some(detect) = detect {
			if !detect.node_ok {
				ui.set_show_install_node(true);
			} else if detect.langflower_version.is_none() {
				ui.set_install_cli_label("Install Langflower".into());
				ui.set_show_install_cli(true);
			} else if detect.update_available && !model.skipped_update {
				let local = detect.langflower_version.as_deref().unwrap_or("?");
				let remote = detect.registry_version.as_deref().unwrap_or("latest");
				ui.set_install_cli_label(format!("Update ({local} → {remote})").into());
				ui.set_show_install_cli(true);
				ui.set_show_skip_update(true);
			}
		}
	}
}

fn try_open(model: &mut Model, url: &str) {
	if let Err(message) = open_url(url) {
		append_log(model, "launcher", &format!("{message}\n"));
	}
}

fn handle_event(ui: &LauncherWindow, model: &mut Model, rt: &Handle, sender: &UiSender, event: UiEvent) {
	match event {
		UiEvent::Log {
			project_key: key,
			text,
			..
		} => {
			append_log(model, &key, &text);
		}
		UiEvent::Ready {
			project_key: key,
			payload,
		} => {
			if let Ok(port) = u16::try_from(payload.port) {
				if port > 0 {
					model
						.instances
						.mark_ready(&key, port, payload.url.clone());
					if let Some(url) = model.instances.take_auto_open_url(&key) {
						try_open(model, &url);
					}
				}
			}
		}
		UiEvent::Exit {
			project_key: key,
			code,
		} => {
			model.instances.mark_exit(&key, code);
			if let Some(instance) = model.instances.get(&key) {
				if instance.status == RunStatus::Error {
					if let Some(raw) = instance.error.clone() {
						append_log(model, &key, &format!("{raw}\n"));
						if let Some(instance) = model.instances.get_mut(&key) {
							instance.error = Some(human_error(&raw));
						}
					}
				}
			}
		}
		UiEvent::SpawnFailed {
			project_key: key,
			message,
		} => {
			append_log(model, &key, &format!("{message}\n"));
			model.instances.mark_spawn_failed(&key, &human_error(&message));
		}
		UiEvent::DetectDone(result) => match result {
			Ok(detect) => apply_detect(model, detect),
			Err(message) => {
				append_log(model, "launcher", &format!("{message}\n"));
			}
		},
		UiEvent::InstallDone(result) => {
			model.installing = false;
			match result {
				Ok(()) => {
					append_log(model, "installer", "Installer finished.\n");
					let tx = sender.clone();
					rt.spawn_blocking(move || {
						tx.send(UiEvent::DetectDone(detect::detect_runtime()));
					});
				}
				Err(message) => {
					append_log(model, "installer", &format!("{message}\n"));
				}
			}
		}
	}
	sync_ui(ui, model);
}

pub fn drain_events() {
	let events: Vec<UiEvent> = CTX.with(|slot| {
		let holder = slot.borrow();
		let Some(ctx) = holder.as_ref() else {
			return Vec::new();
		};
		let ctx = ctx.borrow();
		let mut events = Vec::new();
		while let Ok(event) = ctx.rx.try_recv() {
			events.push(event);
		}
		events
	});
	for event in events {
		with_ctx(|ui, model, rt, sender| {
			handle_event(ui, model, rt, sender, event);
		});
	}
}

fn wire_callbacks(ui: &LauncherWindow) {
	ui.on_browse_clicked(|| {
		with_ctx(|ui, model, _, _| {
			if model.installing {
				return;
			}
			if let Some(folder) = pick_folder() {
				ui.set_project_path(folder.into());
				sync_ui(ui, model);
			}
		});
	});
	ui.on_recent_clicked(|path| {
		with_ctx(|ui, model, _, _| {
			ui.set_project_path(path);
			sync_ui(ui, model);
		});
	});
	ui.on_recent_open_clicked(|path| {
		with_ctx(|ui, model, _, _| {
			if let Some(url) = model.instances.url_for(&path.to_string()) {
				try_open(model, &url);
				sync_ui(ui, model);
			}
		});
	});
	ui.on_recent_remove_clicked(|path| {
		with_ctx(|ui, model, _, _| {
			forget_recent(model, &path.to_string());
			sync_ui(ui, model);
		});
	});
	ui.on_project_edited(|_| {
		with_ctx(|ui, model, _, _| {
			sync_ui(ui, model);
		});
	});
	ui.on_start_clicked(|| {
		with_ctx(|ui, model, rt, sender| {
			let project_dir = project_from_ui(ui);
			let detect = model.detect.as_ref();
			let node_ok = detect.map(|item| item.node_ok).unwrap_or(false);
			let cli_installed = detect
				.map(|item| item.langflower_version.is_some())
				.unwrap_or(false);
			let status = selected_status(model, &project_dir);
			if !can_start(
				status,
				model.installing,
				&project_dir,
				node_ok,
				cli_installed,
			) {
				return;
			}
			if !Path::new(project_dir.trim()).is_dir() {
				let message = format!("That folder could not be found: {}", project_dir.trim());
				append_log(model, &project_dir, &format!("{message}\n"));
				model
					.instances
					.mark_spawn_failed(&project_dir, &human_error(&message));
				sync_ui(ui, model);
				return;
			}
			let port = match allocate_port(&model.instances.reserved_ports()) {
				Ok(port) => port,
				Err(message) => {
					append_log(model, &project_dir, &format!("{message}\n"));
					model
						.instances
						.mark_spawn_failed(&project_dir, &human_error(&message));
					sync_ui(ui, model);
					return;
				}
			};
			let slot = match model.instances.begin_start(&project_dir, port) {
				Ok(slot) => slot,
				Err(message) => {
					append_log(model, &project_dir, &format!("{message}\n"));
					sync_ui(ui, model);
					return;
				}
			};
			persist_recents(model, project_dir.trim());
			sync_ui(ui, model);
			let key = project_key(&project_dir);
			let tx = sender.clone();
			rt.spawn(async move {
				if let Err(message) =
					child::spawn_cli(tx.clone(), slot, project_dir, port, key.clone()).await
				{
					tx.send(UiEvent::SpawnFailed {
						project_key: key,
						message,
					});
				}
			});
		});
	});
	ui.on_stop_clicked(|| {
		with_ctx(|ui, model, rt, sender| {
			let project_dir = project_from_ui(ui);
			let Some(slot) = model.instances.mark_stopping(&project_dir) else {
				return;
			};
			sync_ui(ui, model);
			let key = project_key(&project_dir);
			let tx = sender.clone();
			rt.spawn(async move {
				if let Err(message) = child::stop_cli(tx.clone(), &slot, key.clone()).await {
					tx.send(UiEvent::Log {
						project_key: key,
						stream: "stderr",
						text: format!("{message}\n"),
					});
				}
			});
		});
	});
	ui.on_open_clicked(|| {
		with_ctx(|ui, model, _, _| {
			let project_dir = project_from_ui(ui);
			if let Some(url) = model.instances.url_for(&project_dir) {
				try_open(model, &url);
				sync_ui(ui, model);
			}
		});
	});
	ui.on_install_node_clicked(|| {
		with_ctx(|ui, model, rt, sender| {
			let any_child = model.instances.has_live_process();
			model.installing = true;
			append_log(model, "installer", "Installing Node.js…\n");
			sync_ui(ui, model);
			let tx = sender.clone();
			rt.spawn(async move {
				let result = install::install_node(tx.clone(), any_child).await;
				tx.send(UiEvent::InstallDone(result));
			});
		});
	});
	ui.on_install_cli_clicked(|| {
		with_ctx(|ui, model, rt, sender| {
			let any_child = model.instances.has_live_process();
			model.installing = true;
			append_log(model, "installer", "Installing Langflower…\n");
			sync_ui(ui, model);
			let tx = sender.clone();
			rt.spawn(async move {
				let result = install::install_langflower(tx.clone(), any_child).await;
				tx.send(UiEvent::InstallDone(result));
			});
		});
	});
	ui.on_skip_clicked(|| {
		with_ctx(|ui, model, _, _| {
			model.skipped_update = true;
			append_log(model, "installer", "Skipped Langflower update.\n");
			sync_ui(ui, model);
		});
	});
	ui.on_copy_log_clicked(|| {
		with_ctx(|ui, model, _, _| {
			let text = model.log_lines.concat();
			if let Err(message) = clipboard::copy_text(&text) {
				append_log(
					model,
					"launcher",
					&format!("Could not copy log: {message}\n"),
				);
				sync_ui(ui, model);
			}
		});
	});
	ui.on_help_clicked(|| {
		with_ctx(|ui, model, _, _| {
			if let Err(message) = open_help_manual() {
				append_log(
					model,
					"launcher",
					&format!("Could not open help: {message}\n"),
				);
				sync_ui(ui, model);
			}
		});
	});
}

pub fn run(rt: Handle) {
	let ui = LauncherWindow::new().expect("create launcher window");
	let (tx, rx) = mpsc::channel();
	let sender = UiSender::new(tx);
	let mut model = Model {
		detect: None,
		skipped_update: false,
		recents: Vec::new(),
		log_lines: Vec::new(),
		installing: false,
		instances: InstanceManager::default(),
	};
	if let Ok(raw) = read_recents() {
		model.recents = parse_recents_json(&raw).recents;
	}
	if let Some(first) = model.recents.first().cloned() {
		ui.set_project_path(first.into());
	}
	sync_ui(&ui, &model);

	let timer = slint::Timer::default();
	timer.start(slint::TimerMode::Repeated, Duration::from_millis(50), || {
		drain_events();
	});

	CTX.with(|holder| {
		*holder.borrow_mut() = Some(Rc::new(RefCell::new(Ctx {
			ui: ui.clone_strong(),
			model,
			rt: rt.clone(),
			rx,
			sender: sender.clone(),
			_timer: timer,
		})));
	});

	wire_callbacks(&ui);

	{
		let tx = sender.clone();
		rt.spawn_blocking(move || {
			tx.send(UiEvent::DetectDone(detect::detect_runtime()));
		});
	}

	ui.window().on_close_requested(move || {
		let slots = with_ctx(|_, model, _, _| model.instances.all_slots()).unwrap_or_default();
		rt.block_on(async {
			for slot in slots {
				child::stop_cli_silent(&slot).await;
			}
		});
		CTX.with(|holder| {
			*holder.borrow_mut() = None;
		});
		let _ = slint::quit_event_loop();
		CloseRequestResponse::HideWindow
	});

	ui.run().expect("run launcher");
	CTX.with(|holder| {
		*holder.borrow_mut() = None;
	});
}
