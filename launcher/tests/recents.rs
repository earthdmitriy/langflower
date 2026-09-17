use langflower_launcher::recents::{
	merge_recent, parse_recents_json, remove_recent, serialize_recents, RECENTS_CAP,
};

#[test]
fn merge_recent_prepends_unique_and_caps() {
	let many: Vec<String> = (0..RECENTS_CAP).map(|i| format!("/p/{i}")).collect();
	assert_eq!(
		merge_recent(&["/old".to_string()], "/new"),
		vec!["/new".to_string(), "/old".to_string()]
	);
	assert_eq!(
		merge_recent(&["/a".to_string(), "/b".to_string()], "/b"),
		vec!["/b".to_string(), "/a".to_string()]
	);
	let merged = merge_recent(&many, "/fresh");
	assert_eq!(merged.len(), RECENTS_CAP);
	assert_eq!(merged[0], "/fresh");
	assert_eq!(
		merge_recent(&["/a".to_string()], "  "),
		vec!["/a".to_string()]
	);
}

#[test]
fn remove_recent_drops_matching_path() {
	assert_eq!(
		remove_recent(
			&["/a".to_string(), "/b".to_string(), "/c".to_string()],
			"/b",
		),
		vec!["/a".to_string(), "/c".to_string()]
	);
	assert_eq!(
		remove_recent(&["/a".to_string()], " /a "),
		Vec::<String>::new()
	);
	assert_eq!(
		remove_recent(&["/a".to_string()], "/missing"),
		vec!["/a".to_string()]
	);
	assert_eq!(
		remove_recent(&["/a".to_string()], "  "),
		vec!["/a".to_string()]
	);
}

#[test]
fn parse_recents_json_reads_and_degrades() {
	assert_eq!(
		parse_recents_json("{\"recents\":[\"/a\",\"/b\"]}").recents,
		vec!["/a".to_string(), "/b".to_string()]
	);
	assert!(parse_recents_json("nope").recents.is_empty());
	assert_eq!(
		parse_recents_json("{\"recents\":[1, \"/ok\"]}").recents,
		vec!["/ok".to_string()]
	);
}

#[test]
fn serialize_recents_round_trips() {
	let raw = serialize_recents(&["/a".to_string()]);
	assert_eq!(parse_recents_json(&raw).recents, vec!["/a".to_string()]);
}
