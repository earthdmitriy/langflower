/// Copy UTF-8 text to the system clipboard.
pub fn copy_text(text: &str) -> Result<(), String> {
	arboard::Clipboard::new()
		.and_then(|mut clipboard| clipboard.set_text(text.to_string()))
		.map_err(|error| error.to_string())
}
