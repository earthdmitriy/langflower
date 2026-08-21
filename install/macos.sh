#!/usr/bin/env bash
# Self-contained macOS installer for Node.js (latest LTS if needed) and langflower.
# Download and run this file alone — no other repo files required.
set -euo pipefail

MIN_NODE='22.22.3'
NVM_VERSION='v0.40.7'

info() {
	printf '[langflower-install] %s\n' "$*"
}

err() {
	printf '[langflower-install] ERROR: %s\n' "$*" >&2
}

die() {
	err "$*"
	exit 1
}

version_ge() {
	# Return 0 if $1 >= $2 (semver-ish via sort -V).
	local left="$1"
	local right="$2"
	local first
	first="$(printf '%s\n%s\n' "$right" "$left" | sort -V | head -n1)"
	[[ "$first" == "$right" ]]
}

load_nvm_if_present() {
	export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
	if [[ -s "$NVM_DIR/nvm.sh" ]]; then
		# shellcheck disable=SC1090
		. "$NVM_DIR/nvm.sh"
	fi
}

node_meets_minimum() {
	load_nvm_if_present
	if ! command -v node >/dev/null 2>&1; then
		return 1
	fi
	local raw
	raw="$(node -v 2>/dev/null || true)"
	raw="${raw#v}"
	[[ -n "$raw" ]] || return 1
	version_ge "$raw" "$MIN_NODE"
}

install_node_lts() {
	if ! command -v curl >/dev/null 2>&1; then
		die 'curl is required to install nvm. Install curl and re-run this script.'
	fi

	export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
	if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
		info "Installing nvm ${NVM_VERSION} into ${NVM_DIR}..."
		curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
	else
		info "nvm already present at ${NVM_DIR}."
	fi

	# shellcheck disable=SC1090
	. "$NVM_DIR/nvm.sh"

	info 'Installing latest Node.js LTS via nvm (nvm install --lts)...'
	nvm install --lts
	nvm alias default 'lts/*' >/dev/null 2>&1 || true
	nvm use --lts >/dev/null

	if ! node_meets_minimum; then
		die "Node.js is still missing or below ${MIN_NODE} after nvm install."
	fi
}

global_langflower_version() {
	load_nvm_if_present
	if ! command -v npm >/dev/null 2>&1; then
		printf ''
		return 0
	fi
	# Prefer npm's JSON; fall back to empty when not installed.
	npm list -g --depth=0 --json 2>/dev/null \
		| node -e '
			let s = "";
			process.stdin.on("data", (c) => (s += c));
			process.stdin.on("end", () => {
				try {
					const j = JSON.parse(s || "{}");
					const v = j.dependencies && j.dependencies.langflower && j.dependencies.langflower.version;
					process.stdout.write(v || "");
				} catch {
					process.stdout.write("");
				}
			});
		' \
		|| true
}

ensure_langflower() {
	load_nvm_if_present
	command -v npm >/dev/null 2>&1 || die 'npm was not found on PATH after ensuring Node.js.'

	local local_ver remote_ver
	local_ver="$(global_langflower_version)"

	if [[ -z "$local_ver" ]]; then
		info 'Installing langflower globally (npm install -g langflower)...'
		npm install -g langflower
		return 0
	fi

	info "langflower ${local_ver} is installed; checking npm registry..."
	remote_ver="$(npm view langflower version 2>/dev/null || true)"
	remote_ver="$(printf '%s' "$remote_ver" | tr -d '[:space:]')"
	[[ -n "$remote_ver" ]] || die 'Could not read langflower version from the npm registry.'

	if [[ "$remote_ver" == "$local_ver" ]]; then
		info "langflower ${local_ver} is already up to date."
		return 0
	fi

	info "Updating langflower ${local_ver} -> ${remote_ver}..."
	npm install -g langflower@latest
}

main() {
	info 'Langflower macOS installer'
	info "Minimum Node.js: ${MIN_NODE} (installs latest LTS if needed)"

	if node_meets_minimum; then
		info "Node.js $(node -v) already meets the minimum; skipping Node install."
	else
		info "Node.js missing or below ${MIN_NODE}."
		install_node_lts
	fi

	ensure_langflower
	load_nvm_if_present

	local lf_ver
	lf_ver="$(global_langflower_version)"
	[[ -n "$lf_ver" ]] || lf_ver='(unknown)'

	printf '\n'
	info "Done. node $(node -v) | npm $(npm -v) | langflower ${lf_ver}"
	info 'Start with:  langflower'
	info 'Or:          langflower ./my-project'
}

main "$@"
