fn main() {
	println!("cargo:rerun-if-changed=ui/app-window.slint");
	println!("cargo:rerun-if-changed=ui/icon.png");
	println!("cargo:rerun-if-changed=ui/icon.ico");
	slint_build::compile("ui/app-window.slint").expect("compile Slint UI");
	embed_windows_icon();
}

fn embed_windows_icon() {
	let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
	if target_os != "windows" {
		return;
	}
	let mut res = winresource::WindowsResource::new();
	res.set_icon("ui/icon.ico");
	res.compile().expect("embed Windows icon");
}
