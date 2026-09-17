use std::net::TcpListener;

/// Same default as `@langflower/shared` `DEFAULT_PORT`.
pub const DEFAULT_LISTEN_PORT: u16 = 4010;
const PORT_SCAN_COUNT: u16 = 100;

/// True when `127.0.0.1:port` can be bound (then the probe socket is dropped).
pub fn is_port_free(port: u16) -> bool {
	TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Next free port starting at 4010, skipping `reserved` (already assigned
/// to launcher-owned instances, including ones still starting).
pub fn allocate_port(reserved: &[u16]) -> Result<u16, String> {
	for offset in 0..PORT_SCAN_COUNT {
		let port = DEFAULT_LISTEN_PORT + offset;
		if reserved.contains(&port) {
			continue;
		}
		if is_port_free(port) {
			return Ok(port);
		}
	}
	let last = DEFAULT_LISTEN_PORT + PORT_SCAN_COUNT - 1;
	Err(format!(
		"No free port in {DEFAULT_LISTEN_PORT}–{last}. Stop another Langflower instance or free a port."
	))
}
