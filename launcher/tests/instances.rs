use langflower_launcher::instances::InstanceManager;
use langflower_launcher::ui_state::RunStatus;

#[test]
fn begin_start_reserves_port_without_displaying_it() {
	let mut manager = InstanceManager::default();
	manager
		.begin_start("/tmp/demo-a", 4010)
		.expect("start a");
	assert_eq!(manager.reserved_ports(), vec![4010]);
	assert_eq!(manager.row_status("/tmp/demo-a"), RunStatus::Starting);
	assert!(manager.get("/tmp/demo-a").unwrap().display_port().is_none());
}

#[test]
fn second_project_can_start_while_first_is_running() {
	let mut manager = InstanceManager::default();
	manager.begin_start("/tmp/demo-a", 4010).unwrap();
	manager
		.mark_ready("/tmp/demo-a", 4010, "http://127.0.0.1:4010".into());
	assert_eq!(manager.row_status("/tmp/demo-a"), RunStatus::Running);
	assert_eq!(manager.get("/tmp/demo-a").unwrap().display_port(), Some(4010));
	manager.begin_start("/tmp/demo-b", 4011).unwrap();
	assert_eq!(manager.row_status("/tmp/demo-a"), RunStatus::Running);
	assert_eq!(manager.row_status("/tmp/demo-b"), RunStatus::Starting);
}

#[test]
fn stop_one_does_not_clear_the_other() {
	let mut manager = InstanceManager::default();
	manager.begin_start("/tmp/demo-a", 4010).unwrap();
	manager
		.mark_ready("/tmp/demo-a", 4010, "http://127.0.0.1:4010".into());
	manager.begin_start("/tmp/demo-b", 4011).unwrap();
	manager
		.mark_ready("/tmp/demo-b", 4011, "http://127.0.0.1:4011".into());
	manager.mark_stopping("/tmp/demo-a");
	manager.mark_exit("/tmp/demo-a", Some(0));
	assert_eq!(manager.row_status("/tmp/demo-a"), RunStatus::Ready);
	assert!(manager.get("/tmp/demo-a").unwrap().display_port().is_none());
	assert_eq!(manager.row_status("/tmp/demo-b"), RunStatus::Running);
	assert_eq!(manager.get("/tmp/demo-b").unwrap().display_port(), Some(4011));
}

#[test]
fn restart_does_not_restore_running() {
	let manager = InstanceManager::default();
	assert_eq!(manager.row_status("/tmp/demo-a"), RunStatus::Ready);
}

#[test]
fn same_project_cannot_start_twice() {
	let mut manager = InstanceManager::default();
	manager.begin_start("/tmp/demo-a", 4010).unwrap();
	assert!(manager.begin_start("/tmp/demo-a", 4011).is_err());
}

#[test]
fn spawn_failed_does_not_clear_other() {
	let mut manager = InstanceManager::default();
	manager.begin_start("/tmp/demo-a", 4010).unwrap();
	manager
		.mark_ready("/tmp/demo-a", 4010, "http://127.0.0.1:4010".into());
	manager.mark_spawn_failed("/tmp/demo-b", "Could not start Langflower");
	assert_eq!(manager.row_status("/tmp/demo-a"), RunStatus::Running);
	assert_eq!(manager.row_status("/tmp/demo-b"), RunStatus::Error);
	assert_eq!(manager.get("/tmp/demo-b").unwrap().display_port(), None);
}

#[test]
fn auto_open_url_is_consumed_once_after_ready() {
	let mut manager = InstanceManager::default();
	manager.begin_start("/tmp/demo-a", 4010).unwrap();
	assert!(manager.take_auto_open_url("/tmp/demo-a").is_none());
	manager
		.mark_ready("/tmp/demo-a", 4010, "http://127.0.0.1:4010".into());
	assert_eq!(
		manager.take_auto_open_url("/tmp/demo-a").as_deref(),
		Some("http://127.0.0.1:4010")
	);
	assert!(manager.take_auto_open_url("/tmp/demo-a").is_none());
}
