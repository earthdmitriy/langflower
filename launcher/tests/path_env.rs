use langflower_launcher::path_env::merge_path_entries;

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
