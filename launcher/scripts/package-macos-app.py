#!/usr/bin/env python3
"""Build an unsigned Langflower.app from the launcher Mach-O.

Finder opens Terminal.app for a naked Unix binary. A `.app` bundle does
not. This script does not codesign or notarize.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

APP_BUNDLE_NAME = "Langflower.app"
BUNDLE_ID = "com.langflower.launcher"
BUNDLE_NAME = "Langflower"
EXECUTABLE_NAME = "langflower-launcher"
MIN_SYSTEM_VERSION = "11.0"

ICONSET_SIZES = (
	(16, "icon_16x16.png"),
	(32, "icon_16x16@2x.png"),
	(32, "icon_32x32.png"),
	(64, "icon_32x32@2x.png"),
	(128, "icon_128x128.png"),
	(256, "icon_128x128@2x.png"),
	(256, "icon_256x256.png"),
	(512, "icon_256x256@2x.png"),
	(512, "icon_512x512.png"),
	(1024, "icon_512x512@2x.png"),
)


def crate_root() -> Path:
	return Path(__file__).resolve().parent.parent


def read_crate_version(cargo_toml: Path) -> str:
	text = cargo_toml.read_text(encoding="utf-8")
	match = re.search(r'(?m)^version = "([^"]+)"', text)
	if match is None:
		raise SystemExit(f"Could not read version from {cargo_toml}")
	return match.group(1)


def info_plist_xml(version: str, has_icon: bool) -> str:
	safe_version = escape(version)
	icon_xml = ""
	if has_icon:
		icon_xml = (
			"\t<key>CFBundleIconFile</key>\n"
			"\t<string>AppIcon</string>\n"
		)
	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n'
		'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
		'"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
		'<plist version="1.0">\n'
		"<dict>\n"
		"\t<key>CFBundleDevelopmentRegion</key>\n"
		"\t<string>en</string>\n"
		"\t<key>CFBundleDisplayName</key>\n"
		f"\t<string>{escape(BUNDLE_NAME)}</string>\n"
		"\t<key>CFBundleExecutable</key>\n"
		f"\t<string>{escape(EXECUTABLE_NAME)}</string>\n"
		"\t<key>CFBundleIdentifier</key>\n"
		f"\t<string>{escape(BUNDLE_ID)}</string>\n"
		"\t<key>CFBundleInfoDictionaryVersion</key>\n"
		"\t<string>6.0</string>\n"
		f"{icon_xml}"
		"\t<key>CFBundleName</key>\n"
		f"\t<string>{escape(BUNDLE_NAME)}</string>\n"
		"\t<key>CFBundlePackageType</key>\n"
		"\t<string>APPL</string>\n"
		"\t<key>CFBundleShortVersionString</key>\n"
		f"\t<string>{safe_version}</string>\n"
		"\t<key>CFBundleVersion</key>\n"
		f"\t<string>{safe_version}</string>\n"
		"\t<key>LSMinimumSystemVersion</key>\n"
		f"\t<string>{escape(MIN_SYSTEM_VERSION)}</string>\n"
		"\t<key>NSHighResolutionCapable</key>\n"
		"\t<true/>\n"
		"</dict>\n"
		"</plist>\n"
	)


def add_execute_bit(path: Path) -> None:
	mode = path.stat().st_mode
	path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def build_icns(png: Path, dest_icns: Path) -> bool:
	if shutil.which("sips") is None or shutil.which("iconutil") is None:
		return False
	if not png.is_file():
		return False
	iconset = dest_icns.parent / "AppIcon.iconset"
	if iconset.exists():
		shutil.rmtree(iconset)
	iconset.mkdir(parents=True)
	try:
		for size, name in ICONSET_SIZES:
			out = iconset / name
			subprocess.run(
				[
					"sips",
					"-z",
					str(size),
					str(size),
					str(png),
					"--out",
					str(out),
				],
				check=True,
				stdout=subprocess.DEVNULL,
				stderr=subprocess.PIPE,
				text=True,
			)
		subprocess.run(
			["iconutil", "-c", "icns", str(iconset), "-o", str(dest_icns)],
			check=True,
			stdout=subprocess.DEVNULL,
			stderr=subprocess.PIPE,
			text=True,
		)
	finally:
		shutil.rmtree(iconset, ignore_errors=True)
	return dest_icns.is_file()


def package_app(
	bin_path: Path,
	app_dir: Path,
	version: str,
	icon_png: Path | None,
) -> None:
	if not bin_path.is_file():
		raise SystemExit(f"Missing binary {bin_path}")
	if app_dir.exists():
		shutil.rmtree(app_dir)
	macos_dir = app_dir / "Contents" / "MacOS"
	resources_dir = app_dir / "Contents" / "Resources"
	macos_dir.mkdir(parents=True)
	dest_bin = macos_dir / EXECUTABLE_NAME
	shutil.copy2(bin_path, dest_bin)
	add_execute_bit(dest_bin)

	has_icon = False
	if icon_png is not None and icon_png.is_file():
		resources_dir.mkdir(parents=True, exist_ok=True)
		has_icon = build_icns(icon_png, resources_dir / "AppIcon.icns")
		if not has_icon and not any(resources_dir.iterdir()):
			resources_dir.rmdir()

	plist_path = app_dir / "Contents" / "Info.plist"
	plist_path.write_text(info_plist_xml(version, has_icon), encoding="utf-8")


def zip_app(app_dir: Path, zip_path: Path) -> None:
	ditto = shutil.which("ditto")
	if ditto is None:
		raise SystemExit(
			"ditto is required to zip Langflower.app (macOS packager only)"
		)
	if not app_dir.is_dir():
		raise SystemExit(f"Missing app bundle {app_dir}")
	if app_dir.name != APP_BUNDLE_NAME:
		raise SystemExit(
			f"App directory must be named {APP_BUNDLE_NAME}, got {app_dir.name}"
		)
	zip_path = zip_path.resolve()
	zip_path.parent.mkdir(parents=True, exist_ok=True)
	if zip_path.exists():
		zip_path.unlink()
	subprocess.run(
		[ditto, "-c", "-k", "--keepParent", app_dir.name, str(zip_path)],
		cwd=app_dir.parent,
		check=True,
	)
	if not zip_path.is_file():
		raise SystemExit(f"ditto did not write {zip_path}")


def assert_self_test_bundle(app_dir: Path, version: str) -> None:
	exe = app_dir / "Contents" / "MacOS" / EXECUTABLE_NAME
	plist = app_dir / "Contents" / "Info.plist"
	if not exe.is_file():
		raise SystemExit(f"self-test: missing {exe}")
	if not plist.is_file():
		raise SystemExit(f"self-test: missing {plist}")
	if os.name != "nt":
		mode = stat.S_IMODE(exe.stat().st_mode)
		if mode & 0o111 == 0:
			raise SystemExit(f"self-test: {exe} is not executable (mode {oct(mode)})")
	text = plist.read_text(encoding="utf-8")
	required = (
		BUNDLE_ID,
		EXECUTABLE_NAME,
		version,
		"APPL",
		MIN_SYSTEM_VERSION,
		"NSHighResolutionCapable",
	)
	for snippet in required:
		if snippet not in text:
			raise SystemExit(f"self-test: Info.plist missing {snippet!r}")


def run_self_test() -> None:
	root = crate_root()
	version = read_crate_version(root / "Cargo.toml")
	icon_png = root / "ui" / "icon.png"
	with tempfile.TemporaryDirectory(prefix="langflower-app-") as raw:
		tmp = Path(raw)
		dummy = tmp / "dummy-bin"
		dummy.write_bytes(b"langflower-launcher-self-test\n")
		add_execute_bit(dummy)
		app_dir = tmp / APP_BUNDLE_NAME
		package_app(dummy, app_dir, version, icon_png)
		assert_self_test_bundle(app_dir, version)
		ditto = shutil.which("ditto")
		if ditto is not None:
			zpath = tmp / "langflower-launcher-macos-self-test.zip"
			zip_app(app_dir, zpath)
			with zipfile.ZipFile(zpath) as zf:
				names = zf.namelist()
			expected = f"{APP_BUNDLE_NAME}/Contents/MacOS/{EXECUTABLE_NAME}"
			if expected not in names and f"{expected}/" not in names:
				# ditto may emit a prefix-less or trailing-slash variant
				if not any(
					name.rstrip("/").endswith(
						f"{APP_BUNDLE_NAME}/Contents/MacOS/{EXECUTABLE_NAME}"
					)
					for name in names
				):
					raise SystemExit(
						f"self-test: zip missing {expected}; got {names}"
					)
	print(f"package-macos-app self-test ok (version {version})")


def parse_args(argv: list[str]) -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Package langflower-launcher as unsigned Langflower.app"
	)
	parser.add_argument(
		"--self-test",
		action="store_true",
		help="Build a dummy .app and assert layout (no cargo / Slint)",
	)
	parser.add_argument("--bin", type=Path, help="Path to langflower-launcher")
	parser.add_argument(
		"--app-dir",
		type=Path,
		help=f"Output directory named {APP_BUNDLE_NAME}",
	)
	parser.add_argument("--zip", type=Path, help="Output zip (requires ditto)")
	parser.add_argument(
		"--icon",
		type=Path,
		help="PNG used to build AppIcon.icns (default: launcher/ui/icon.png)",
	)
	return parser.parse_args(argv)


def main(argv: list[str]) -> int:
	args = parse_args(argv)
	if args.self_test:
		run_self_test()
		return 0
	if args.bin is None or args.app_dir is None:
		raise SystemExit("--bin and --app-dir are required unless --self-test")
	root = crate_root()
	version = read_crate_version(root / "Cargo.toml")
	icon_png = args.icon if args.icon is not None else root / "ui" / "icon.png"
	app_dir = args.app_dir
	if app_dir.name != APP_BUNDLE_NAME:
		raise SystemExit(
			f"--app-dir must end with {APP_BUNDLE_NAME}, got {app_dir}"
		)
	package_app(args.bin, app_dir, version, icon_png)
	print(f"wrote {app_dir} (version {version})")
	if args.zip is not None:
		zip_app(app_dir, args.zip)
		print(f"wrote {args.zip}")
	return 0


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))
