pub const DEFAULT_MIN_NODE: &str = "22.22.3";

pub type Triple = (u32, u32, u32);

/// Parse `v22.22.3` / `22.22.3` into a triple, or `None`.
pub fn parse_node_version(raw: &str) -> Option<Triple> {
	let trimmed = raw.trim().trim_start_matches(['v', 'V']);
	let mut chars = trimmed.chars().peekable();
	let mut parts = [0u32; 3];
	for (index, part) in parts.iter_mut().enumerate() {
		let mut digits = String::new();
		while let Some(ch) = chars.peek() {
			if ch.is_ascii_digit() {
				digits.push(*ch);
				chars.next();
			} else {
				break;
			}
		}
		if digits.is_empty() {
			return None;
		}
		*part = digits.parse().ok()?;
		if index < 2 {
			if chars.next() != Some('.') {
				return None;
			}
		}
	}
	Some((parts[0], parts[1], parts[2]))
}

/// Read the minimum from an `engines.node` range such as `>=22.22.3`.
pub fn parse_engines_node_min(engines_node: &str) -> Option<String> {
	let trimmed = engines_node.trim();
	let rest = trimmed.strip_prefix(">=")?.trim();
	let version = parse_node_version(rest)?;
	Some(format!("{}.{}.{}", version.0, version.1, version.2))
}

/// True when `version` is greater than or equal to `min` (`x.y.z`).
pub fn node_meets_minimum(version: &str, min: &str) -> bool {
	match (parse_node_version(version), parse_node_version(min)) {
		(Some(left), Some(right)) => left >= right,
		_ => false,
	}
}
