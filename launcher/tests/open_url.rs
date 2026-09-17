use langflower_launcher::open_url::{
	is_allowed_open_url, HELP_MANUAL_URL,
};

#[test]
fn allows_localhost_editor_urls() {
	assert!(is_allowed_open_url("http://127.0.0.1:4010"));
	assert!(is_allowed_open_url("http://127.0.0.1:4109/"));
}

#[test]
fn allows_the_github_user_manual() {
	assert!(is_allowed_open_url(HELP_MANUAL_URL));
	assert!(HELP_MANUAL_URL.ends_with("/docs/public/launcher.md"));
}

#[test]
fn refuses_other_https_and_hostnames() {
	assert!(!is_allowed_open_url("https://example.com"));
	assert!(!is_allowed_open_url("http://localhost:4010"));
	assert!(!is_allowed_open_url(
		"https://github.com/earthdmitriy/langflower"
	));
}
