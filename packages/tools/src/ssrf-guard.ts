import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
	'localhost',
	'localhost.localdomain',
	'metadata.google.internal',
]);

const isIpv4Private = (ip: string): boolean => {
	const parts = ip.split('.').map((part) => Number(part));

	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	) {
		return false;
	}

	const a = parts[0] ?? 0;
	const b = parts[1] ?? 0;

	if (a === 10) {
		return true;
	}

	if (a === 127) {
		return true;
	}

	if (a === 0) {
		return true;
	}

	if (a === 169 && b === 254) {
		return true;
	}

	if (a === 172 && b >= 16 && b <= 31) {
		return true;
	}

	if (a === 192 && b === 168) {
		return true;
	}

	if (a === 100 && b >= 64 && b <= 127) {
		return true;
	}

	return false;
};

const isIpv6Private = (ip: string): boolean => {
	const normalized = ip.toLowerCase();

	if (normalized === '::1' || normalized === '::') {
		return true;
	}

	if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
		return true;
	}

	if (normalized.startsWith('fe80:')) {
		return true;
	}

	// IPv4-mapped IPv6 (:ffff:x.x.x.x)
	const mapped = normalized.match(/^:ffff:(\d+\.\d+\.\d+\.\d+)$/i);

	if (mapped?.[1] !== undefined) {
		return isIpv4Private(mapped[1]);
	}

	return false;
};

/** True when the address is loopback, private, link-local, or metadata. */
export const isBlockedIpAddress = (address: string): boolean => {
	const family = net.isIP(address);

	if (family === 4) {
		return isIpv4Private(address);
	}

	if (family === 6) {
		return isIpv6Private(address);
	}

	return true;
};

export type AssertUrlSafeOptions = {
	readonly allowedHosts?: readonly string[];
	/** When true, skip DNS resolution (hostname-only checks). */
	readonly skipDns?: boolean;
};

/**
 * Validated URL plus addresses that passed the SSRF check.
 * Callers should pin the TCP connect to {@link pinnedAddresses} so DNS cannot
 * rebind between check and fetch.
 */
export type SafeFetchTarget = {
	readonly url: URL;
	/** Public addresses validated at check time; empty when `skipDns`. */
	readonly pinnedAddresses: readonly string[];
};

/**
 * Reject non-http(s) URLs, blocked hostnames, and (by default) private IPs
 * after DNS resolution. Optional `allowedHosts` is an exact hostname allowlist.
 */
export const assertUrlSafeForFetch = async (
	rawUrl: string,
	options: AssertUrlSafeOptions = {},
): Promise<SafeFetchTarget> => {
	let parsed: URL;

	try {
		parsed = new URL(rawUrl);
	} catch {
		throw new Error(`Invalid URL: ${rawUrl}`);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(
			`Blocked URL protocol «${parsed.protocol}» (only http/https).`,
		);
	}

	const hostname = parsed.hostname.toLowerCase();

	if (hostname.length === 0) {
		throw new Error('URL hostname is empty.');
	}

	if (
		BLOCKED_HOSTNAMES.has(hostname) ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local')
	) {
		throw new Error(`Blocked hostname «${hostname}».`);
	}

	const allowed = options.allowedHosts?.map((host) => host.toLowerCase());

	if (allowed !== undefined && allowed.length > 0) {
		if (!allowed.includes(hostname)) {
			throw new Error(
				`Hostname «${hostname}» is not in harness.allowedHosts.`,
			);
		}
	}

	if (net.isIP(hostname) !== 0) {
		if (isBlockedIpAddress(hostname)) {
			throw new Error(`Blocked IP address «${hostname}».`);
		}

		return { url: parsed, pinnedAddresses: [hostname] };
	}

	if (options.skipDns === true) {
		return { url: parsed, pinnedAddresses: [] };
	}

	const records = await dns.lookup(hostname, { all: true, verbatim: true });

	if (records.length === 0) {
		throw new Error(`DNS lookup failed for «${hostname}».`);
	}

	const blocked = records.find((record) =>
		isBlockedIpAddress(record.address),
	);

	if (blocked !== undefined) {
		throw new Error(
			`Blocked: «${hostname}» resolves to private/link-local address ${blocked.address}.`,
		);
	}

	return {
		url: parsed,
		pinnedAddresses: records.map((record) => record.address),
	};
};
