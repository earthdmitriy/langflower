use langflower_launcher::ports::{allocate_port, is_port_free, DEFAULT_LISTEN_PORT};

#[test]
fn allocate_port_skips_reserved() {
	let reserved = [DEFAULT_LISTEN_PORT];
	let port = allocate_port(&reserved).expect("port");
	assert_ne!(port, DEFAULT_LISTEN_PORT);
	assert!(port > DEFAULT_LISTEN_PORT);
}

#[test]
fn allocate_port_skips_bound_listener() {
	let listener = std::net::TcpListener::bind(("127.0.0.1", DEFAULT_LISTEN_PORT));
	let port = allocate_port(&[]).expect("port");
	if listener.is_ok() {
		assert_ne!(port, DEFAULT_LISTEN_PORT);
	}
	assert!(is_port_free(port));
}
