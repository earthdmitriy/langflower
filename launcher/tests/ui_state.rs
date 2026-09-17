use langflower_launcher::ui_state::{
	can_start, chrome, detect_log_line, header_label, hint_text, human_error, log_channel,
	project_name, RunStatus,
};

#[test]
fn project_name_uses_last_segment() {
	assert_eq!(project_name(r"D:\Win\Projects\prompts"), "prompts");
	assert_eq!(project_name(r"D:\Win\Projects\prompts\"), "prompts");
	assert_eq!(project_name("  /tmp/demo  "), "demo");
	assert_eq!(project_name("/tmp/demo/"), "demo");
}

#[test]
fn can_start_is_per_selected_project() {
	assert!(!can_start(RunStatus::Ready, false, "", true, true));
	assert!(!can_start(RunStatus::Starting, false, "/p", true, true));
	assert!(!can_start(RunStatus::Running, false, "/p", true, true));
	assert!(can_start(RunStatus::Ready, false, "/p", true, true));
	assert!(can_start(RunStatus::Error, false, "/p", true, true));
}

#[test]
fn chrome_keeps_browse_while_another_project_could_run() {
	let starting = chrome(RunStatus::Starting, false, false, false);
	assert!(starting.browse_enabled);
	assert!(starting.show_stop);
	assert!(!starting.show_start);
	let running = chrome(RunStatus::Running, false, false, true);
	assert!(running.browse_enabled);
	assert!(running.show_stop);
	assert!(running.show_open);
	let ready = chrome(RunStatus::Ready, false, true, false);
	assert!(ready.show_start);
	assert!(!ready.show_stop);
	assert!(!ready.show_open);
}

#[test]
fn labels_are_consumer_facing() {
	assert_eq!(header_label(false), "Ready");
	assert_eq!(
		human_error("child exited 1"),
		"Langflower stopped unexpectedly"
	);
	assert_eq!(
		hint_text(
			RunStatus::Running,
			false,
			None,
			"/tmp/prompts",
			true,
			true,
			Some(4011),
		),
		"prompts is running on port 4011"
	);
}

#[test]
fn detect_log_line_when_versions_are_current() {
	assert_eq!(
		detect_log_line(true, Some("v22.22.3"), "22.22.3", Some("0.1.2"), false),
		"Node.js v22.22.3 and Langflower 0.1.2 already have current versions."
	);
	assert_eq!(log_channel("launcher"), "launcher");
	assert_eq!(log_channel("installer"), "install");
}

#[test]
fn detect_log_line_when_langflower_is_missing() {
	assert_eq!(
		detect_log_line(true, Some("v22.22.3"), "22.22.3", None, false),
		"Node v22.22.3. Langflower is not installed yet."
	);
}
