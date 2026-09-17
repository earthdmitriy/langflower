use langflower_launcher::node_semver::{
	node_meets_minimum, parse_engines_node_min, parse_node_version, DEFAULT_MIN_NODE,
};

#[test]
fn parse_node_version_strips_leading_v() {
	assert_eq!(parse_node_version("v22.22.3"), Some((22, 22, 3)));
	assert_eq!(parse_node_version("22.22.3"), Some((22, 22, 3)));
}

#[test]
fn parse_node_version_rejects_junk() {
	assert_eq!(parse_node_version(""), None);
	assert_eq!(parse_node_version("node"), None);
}

#[test]
fn node_meets_minimum_compares_triples() {
	assert!(node_meets_minimum("v22.22.3", DEFAULT_MIN_NODE));
	assert!(node_meets_minimum("23.0.0", DEFAULT_MIN_NODE));
	assert!(!node_meets_minimum("22.22.2", DEFAULT_MIN_NODE));
	assert!(!node_meets_minimum("v18.20.0", DEFAULT_MIN_NODE));
}

#[test]
fn parse_engines_node_min_reads_gte() {
	assert_eq!(
		parse_engines_node_min(">=22.22.3").as_deref(),
		Some("22.22.3")
	);
	assert_eq!(
		parse_engines_node_min(">= 22.22.3").as_deref(),
		Some("22.22.3")
	);
	assert_eq!(parse_engines_node_min("^22"), None);
}
