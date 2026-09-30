use langflower_launcher::path_env::{macos_search_path, merge_path_entries};

#[test]
fn merge_path_entries_keeps_primary_first_and_appends_new() {
	assert_eq!(
		merge_path_entries(r"C:\Windows;C:\node", r"C:\node;C:\ci-tools", ';'),
		r"C:\Windows;C:\node;C:\ci-tools"
	);
	assert_eq!(
		merge_path_entries("/usr/bin", "/usr/bin:/opt/ci", ':'),
		"/usr/bin:/opt/ci"
	);
}

#[test]
fn macos_search_path_prefers_shell_then_known_dirs() {
	let path = macos_search_path(
		"/Users/me/.nvm/versions/node/v22/bin:/opt/homebrew/bin",
		"/opt/homebrew/bin:/usr/local/bin",
		"/usr/bin:/bin",
	);
	assert_eq!(
		path,
		"/Users/me/.nvm/versions/node/v22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
	);
}

#[test]
fn macos_search_path_empty_shell_still_prepends_known_dirs() {
	let path = macos_search_path("", "/opt/homebrew/bin:/usr/local/bin", "/usr/bin:/bin");
	assert_eq!(path, "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
}
