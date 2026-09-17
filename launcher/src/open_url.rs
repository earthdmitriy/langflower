/// User manual on GitHub (`docs/public/launcher.md` on `master`).
pub const HELP_MANUAL_URL: &str =
	"https://github.com/earthdmitriy/langflower/blob/master/docs/public/launcher.md";

/// Local editor URLs plus the launcher help page.
pub fn is_allowed_open_url(url: &str) -> bool {
	url.starts_with("http://127.0.0.1:") || url == HELP_MANUAL_URL
}

/// Open `url` in the OS browser. Localhost HTTP, or the help manual.
pub fn open_url(url: &str) -> Result<(), String> {
	if !is_allowed_open_url(url) {
		return Err("Refusing to open that URL".to_string());
	}
	open::that(url).map_err(|error| error.to_string())
}

/// Open the launcher user manual on GitHub.
pub fn open_help_manual() -> Result<(), String> {
	open_url(HELP_MANUAL_URL)
}
