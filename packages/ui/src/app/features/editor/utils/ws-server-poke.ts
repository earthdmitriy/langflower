/**
 * Periodic WebSocket probe used after transport disconnect.
 * On a successful open, fires `onReachable` once and stops.
 */

export type WsServerPokeHandle = {
	readonly stop: () => void;
};

export type WsProbeSocket = {
	close(): void;
	onopen: ((ev: Event) => void) | null;
	onerror: ((ev: Event) => void) | null;
	onclose: ((ev: CloseEvent) => void) | null;
};

export type WsProbeSocketConstructor = new (url: string) => WsProbeSocket;

export type StartWsServerPokeOptions = {
	readonly url: string;
	readonly intervalMs: number;
	readonly onReachable: () => void;
	/** Defaults to global `WebSocket`. Injected in unit tests. */
	readonly WebSocketImpl?: WsProbeSocketConstructor;
};

export const DEFAULT_WS_SERVER_POKE_INTERVAL_MS = 2000;

export const startWsServerPoke = (
	options: StartWsServerPokeOptions,
): WsServerPokeHandle => {
	const WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;
	let stopped = false;
	let reached = false;
	let active: WsProbeSocket | null = null;
	let timer: ReturnType<typeof setInterval> | undefined;

	const clearActive = (): void => {
		if (active === null) {
			return;
		}
		const socket = active;
		active = null;
		socket.onopen = null;
		socket.onerror = null;
		socket.onclose = null;
		try {
			socket.close();
		} catch {
			// Ignore close errors on already-closed sockets.
		}
	};

	const markReachable = (): void => {
		if (stopped || reached) {
			return;
		}
		reached = true;
		stopped = true;
		if (timer !== undefined) {
			clearInterval(timer);
			timer = undefined;
		}
		clearActive();
		options.onReachable();
	};

	const poke = (): void => {
		if (stopped || reached) {
			return;
		}
		if (active !== null) {
			return;
		}

		let socket: WsProbeSocket;
		try {
			socket = new WebSocketImpl(options.url);
		} catch {
			return;
		}

		active = socket;

		socket.onopen = () => {
			markReachable();
		};
		socket.onerror = () => {
			clearActive();
		};
		socket.onclose = () => {
			if (active === socket) {
				clearActive();
			}
		};
	};

	poke();
	timer = setInterval(poke, options.intervalMs);

	return {
		stop: () => {
			if (stopped) {
				return;
			}
			stopped = true;
			if (timer !== undefined) {
				clearInterval(timer);
				timer = undefined;
			}
			clearActive();
		},
	};
};
