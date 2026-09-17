/**
 * Ensure a portable Rust toolchain under <repo>/.tools/rust and run a
 * command with RUSTUP_HOME / CARGO_HOME / PATH. Does not touch the
 * user profile PATH.
 *
 * On Windows, Git ships `/usr/bin/link` (coreutils), which is not MSVC
 * `link.exe`. If Visual Studio Build Tools are missing, this wrapper
 * uses the `windows-gnu` toolchain and MinGW gcc (e.g. w64devkit).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..',
);
const rustRoot = path.join(repoRoot, '.tools', 'rust');
const rustupHome = path.join(rustRoot, 'rustup');
const cargoHome = path.join(rustRoot, 'cargo');
const cargoBin = path.join(cargoHome, 'bin');
const isWin = process.platform === 'win32';
const exe = (name) => (isWin ? `${name}.exe` : name);

const log = (msg) => {
	process.stderr.write(`${msg}\n`);
};

const findOnPath = (fileName, pathStr, skip) => {
	for (const dir of pathStr.split(path.delimiter)) {
		if (!dir) {
			continue;
		}
		const candidate = path.join(dir, fileName);
		if (!existsSync(candidate)) {
			continue;
		}
		if (skip && skip(candidate)) {
			continue;
		}
		return candidate;
	}
	return null;
};

const isGitOrUsrBin = (filePath) => /[\\/](Git|usr)[\\/]/i.test(filePath);

const findMsvcLink = (pathStr) =>
	findOnPath(exe('link'), pathStr, (filePath) => {
		if (isGitOrUsrBin(filePath)) {
			return true;
		}
		return /mingw|w64devkit|msys/i.test(filePath);
	});

const findGcc = (pathStr) => findOnPath(exe('gcc'), pathStr, isGitOrUsrBin);

const rustupHost = (pathStr) => {
	if (!isWin) {
		if (process.platform === 'darwin') {
			return process.arch === 'arm64'
				? 'aarch64-apple-darwin'
				: 'x86_64-apple-darwin';
		}
		return process.arch === 'arm64'
			? 'aarch64-unknown-linux-gnu'
			: 'x86_64-unknown-linux-gnu';
	}
	if (findMsvcLink(pathStr)) {
		return process.arch === 'arm64'
			? 'aarch64-pc-windows-msvc'
			: 'x86_64-pc-windows-msvc';
	}
	if (findGcc(pathStr)) {
		return process.arch === 'arm64'
			? 'aarch64-pc-windows-gnu'
			: 'x86_64-pc-windows-gnu';
	}
	log('No MSVC link.exe (VS Build Tools) and no MinGW gcc on PATH.');
	log(
		'Install "Desktop development with C++" or put gcc on PATH (w64devkit).',
	);
	process.exit(1);
};

const rustEnv = () => {
	const pathStr = process.env.PATH ?? '';
	const host = rustupHost(pathStr);
	const parts = [cargoBin];
	if (host.includes('windows-gnu')) {
		const gcc = findGcc(pathStr);
		if (gcc) {
			parts.push(path.dirname(gcc));
		}
	} else if (host.includes('windows-msvc')) {
		const link = findMsvcLink(pathStr);
		if (link) {
			parts.push(path.dirname(link));
		}
	}
	parts.push(pathStr);
	const env = {
		...process.env,
		RUSTUP_HOME: rustupHome,
		CARGO_HOME: cargoHome,
		PATH: parts.join(path.delimiter),
	};
	const scratch = path.join(rustRoot, 'tmp');
	mkdirSync(scratch, { recursive: true });
	env.TMP = scratch;
	env.TEMP = scratch;
	env.TMPDIR = scratch;
	env.CARGO_TARGET_DIR = path.join(repoRoot, 'launcher', 'target');
	if (host.includes('windows-gnu')) {
		const gcc = findGcc(pathStr);
		if (gcc) {
			env.CC = gcc;
			env.CXX = findOnPath(exe('g++'), pathStr, isGitOrUsrBin) ?? gcc;
			env.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = gcc;
			applyMingwCompat(env, gcc);
		}
		env.CMAKE_GENERATOR = env.CMAKE_GENERATOR || 'MinGW Makefiles';
	}
	return env;
};

const applyMingwCompat = (env, gcc) => {
	const printed = spawnSync(gcc, ['-print-libgcc-file-name'], {
		encoding: 'utf8',
		windowsHide: true,
	});
	const libgcc = (printed.stdout || '').trim();
	if (!libgcc || !existsSync(libgcc)) {
		return;
	}
	const gccLibDir = path.dirname(libgcc);
	const sysrootLib = path.resolve(path.dirname(gcc), '..', 'lib');
	const compatDir = path.join(rustRoot, 'mingw-compat');
	mkdirSync(compatDir, { recursive: true });
	const gccEh = path.join(compatDir, 'libgcc_eh.a');
	if (!existsSync(gccEh)) {
		copyFileSync(libgcc, gccEh);
	}
	const libDirs = [compatDir, gccLibDir];
	if (existsSync(sysrootLib)) {
		libDirs.push(sysrootLib);
	}
	const joined = libDirs.join(path.delimiter);
	env.LIBRARY_PATH = env.LIBRARY_PATH
		? `${joined}${path.delimiter}${env.LIBRARY_PATH}`
		: joined;
	const linkArgs = libDirs.map((dir) => `-L ${dir}`).join(' ');
	env.RUSTFLAGS = env.RUSTFLAGS ? `${env.RUSTFLAGS} ${linkArgs}` : linkArgs;
};

const rustcPath = () => path.join(cargoBin, exe('rustc'));
const rustupPath = () => path.join(cargoBin, exe('rustup'));

const rustcOk = (env) => {
	const probe = spawnSync(rustcPath(), ['--version'], {
		env,
		encoding: 'utf8',
		windowsHide: true,
	});
	return probe.status === 0;
};

const rustcHostTriple = (env) => {
	const probe = spawnSync(rustcPath(), ['-vV'], {
		env,
		encoding: 'utf8',
		windowsHide: true,
	});
	if (probe.status !== 0) {
		return null;
	}
	const match = (probe.stdout || '').match(/^host:\s+(\S+)/m);
	return match ? match[1] : null;
};

const rustupInitName = () => (isWin ? 'rustup-init.exe' : 'rustup-init');

const seedDownloadsFromLegacyHome = () => {
	const src = path.join(os.homedir(), '.rustup', 'downloads');
	const dest = path.join(rustupHome, 'downloads');
	if (!existsSync(src)) {
		return;
	}
	mkdirSync(dest, { recursive: true });
	for (const name of readdirSync(src)) {
		const from = path.join(src, name);
		const to = path.join(dest, name);
		if (!existsSync(to)) {
			copyFileSync(from, to);
		}
	}
};

const rustupInitHost = () => {
	if (!isWin) {
		return rustupHost(process.env.PATH ?? '');
	}
	return process.arch === 'arm64'
		? 'aarch64-pc-windows-msvc'
		: 'x86_64-pc-windows-msvc';
};

const downloadRustupInit = async (initPath) => {
	const url = `https://static.rust-lang.org/rustup/dist/${rustupInitHost()}/${rustupInitName()}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(
			`Failed to download rustup-init (${res.status} ${url})`,
		);
	}
	const buf = Buffer.from(await res.arrayBuffer());
	writeFileSync(initPath, buf);
	if (!isWin) {
		chmodSync(initPath, 0o755);
	}
};

const runRustup = (env, args) => {
	const result = spawnSync(rustupPath(), args, {
		env,
		stdio: 'inherit',
		windowsHide: true,
	});
	if (result.status !== 0) {
		process.exit(result.status === null ? 1 : result.status);
	}
};

const ensurePortableRust = async () => {
	mkdirSync(rustupHome, { recursive: true });
	mkdirSync(cargoHome, { recursive: true });
	mkdirSync(cargoBin, { recursive: true });
	const host = rustupHost(process.env.PATH ?? '');
	let env = rustEnv();
	if (!existsSync(rustupPath())) {
		log(`Installing portable Rust into ${rustRoot}`);
		seedDownloadsFromLegacyHome();
		const initPath = path.join(rustRoot, rustupInitName());
		if (!existsSync(initPath)) {
			log('Downloading rustup-init…');
			await downloadRustupInit(initPath);
		}
		const result = spawnSync(
			initPath,
			[
				'-y',
				'--no-modify-path',
				'--profile',
				'minimal',
				'--default-toolchain',
				'stable',
				'--default-host',
				host,
			],
			{ env, stdio: 'inherit', windowsHide: true },
		);
		if (result.status !== 0) {
			process.exit(result.status === null ? 1 : result.status);
		}
		env = rustEnv();
	}
	if (rustcHostTriple(env) !== host) {
		const toolchain = `stable-${host}`;
		log(`Selecting toolchain ${toolchain}`);
		runRustup(env, [
			'toolchain',
			'install',
			toolchain,
			'--profile',
			'minimal',
		]);
		runRustup(env, ['default', toolchain]);
		env = rustEnv();
	}
	if (!rustcOk(env)) {
		log('Portable rustc is not runnable.');
		process.exit(1);
	}
	return env;
};

const injectCargoArgs = (args) => args;

const argv = process.argv.slice(2);
const ensureOnly = argv.length === 0 || argv[0] === '--ensure';

const env = await ensurePortableRust();
if (ensureOnly) {
	const rustc = spawnSync(rustcPath(), ['-vV'], {
		env,
		encoding: 'utf8',
		windowsHide: true,
	});
	const cargo = spawnSync(path.join(cargoBin, exe('cargo')), ['--version'], {
		env,
		encoding: 'utf8',
		windowsHide: true,
	});
	process.stdout.write(rustc.stdout || '');
	process.stdout.write(cargo.stdout || '');
	process.exit(0);
}

const commandArgs = injectCargoArgs(argv);
const crateRoot = path.join(repoRoot, 'launcher');
const child = spawn(commandArgs[0], commandArgs.slice(1), {
	env,
	stdio: 'inherit',
	shell: isWin,
	cwd: commandArgs[0] === 'cargo' ? crateRoot : process.cwd(),
});
child.on('exit', (code, signal) => {
	if (signal) {
		process.exit(1);
	}
	process.exit(code ?? 1);
});
