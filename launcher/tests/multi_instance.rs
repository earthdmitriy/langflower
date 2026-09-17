use std::time::Duration;

use langflower_launcher::child::{self, ChildSlot};
use langflower_launcher::ports::allocate_port;
use langflower_launcher::ui_event::{UiEvent, UiSender};

fn stub_bin() -> String {
	std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
		.join("tests")
		.join("stub-langflower.mjs")
		.to_string_lossy()
		.into_owned()
}

fn wait_two_ready(
	rx: &std::sync::mpsc::Receiver<UiEvent>,
	key_a: &str,
	key_b: &str,
) -> ((u16, String), (u16, String)) {
	let deadline = std::time::Instant::now() + Duration::from_secs(15);
	let mut ready_a = None;
	let mut ready_b = None;
	let mut extras = Vec::new();
	while std::time::Instant::now() < deadline {
		match rx.recv_timeout(Duration::from_millis(200)) {
			Ok(UiEvent::Ready {
				project_key,
				payload,
			}) => {
				let value = (payload.port as u16, payload.url);
				if project_key == key_a {
					ready_a = Some(value);
				} else if project_key == key_b {
					ready_b = Some(value);
				} else {
					extras.push(format!("ready other={project_key}"));
				}
			}
			Ok(UiEvent::Log {
				project_key,
				stream,
				text,
			}) => {
				extras.push(format!("log [{project_key}/{stream}] {}", text.trim()));
			}
			Ok(UiEvent::Exit {
				project_key,
				code,
			}) => {
				extras.push(format!("exit {project_key} code={code:?}"));
			}
			Ok(UiEvent::SpawnFailed {
				project_key,
				message,
			}) => {
				extras.push(format!("spawn-failed {project_key}: {message}"));
			}
			Ok(_) => {}
			Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
			Err(error) => panic!("{error}"),
		}
		if let (Some(a), Some(b)) = (ready_a.clone(), ready_b.clone()) {
			return (a, b);
		}
	}
	panic!(
		"timed out waiting for READY from both stubs (a={key_a}, b={key_b}). events: {extras:?}"
	);
}

#[tokio::test(flavor = "multi_thread")]
async fn two_stubs_bind_distinct_ports_and_stop_independently() {
	#[allow(unused_unsafe)]
	unsafe {
		std::env::set_var("LANGFLOWER_LAUNCHER_BIN", stub_bin());
	}
	let dir_a = std::env::temp_dir().join("lf-launcher-a");
	let dir_b = std::env::temp_dir().join("lf-launcher-b");
	std::fs::create_dir_all(&dir_a).unwrap();
	std::fs::create_dir_all(&dir_b).unwrap();

	let port_a = allocate_port(&[]).unwrap();
	let port_b = allocate_port(&[port_a]).unwrap();
	assert_ne!(port_a, port_b);

	let (tx, rx) = std::sync::mpsc::channel();
	let sender = UiSender::without_ui_wake(tx);
	let slot_a = ChildSlot::new();
	let slot_b = ChildSlot::new();
	let key_a = dir_a.to_string_lossy().into_owned();
	let key_b = dir_b.to_string_lossy().into_owned();

	child::spawn_cli(
		sender.clone(),
		slot_a.clone(),
		key_a.clone(),
		port_a,
		key_a.clone(),
	)
	.await
	.expect("spawn a");
	child::spawn_cli(
		sender.clone(),
		slot_b.clone(),
		key_b.clone(),
		port_b,
		key_b.clone(),
	)
	.await
	.expect("spawn b");

	let (ready_a, ready_b) = wait_two_ready(&rx, &key_a, &key_b);
	let (port_ready_a, url_a) = ready_a;
	let (port_ready_b, url_b) = ready_b;
	assert_eq!(port_ready_a, port_a);
	assert_eq!(port_ready_b, port_b);
	assert_ne!(url_a, url_b);

	child::stop_cli(sender.clone(), &slot_a, key_a.clone())
		.await
		.expect("stop a");
	assert!(
		child::has_child(&slot_b).expect("slot b"),
		"B must stay running after A stops"
	);

	child::stop_cli(sender, &slot_b, key_b).await.expect("stop b");
}
