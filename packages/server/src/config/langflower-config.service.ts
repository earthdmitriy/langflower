import fs from 'node:fs/promises';
import path from 'node:path';
import type {
	DividerPositions,
	LangflowerConfig,
	LangflowerConfigScope,
	LangflowerHarnessConfig,
	LangflowerMcpConfig,
	LangflowerMcpServerConfig,
	LangflowerPermissionConfig,
	LangflowerPermissionDecision,
	LangflowerPermissionToolConfig,
	LangflowerProviderConfig,
	LangflowerToolConfig,
} from '@langflower/shared/langflower.js';
import {
	DIVIDER_MIN_COMPOSER_HEIGHT,
	DIVIDER_MIN_LEFT_WIDTH,
	DIVIDER_MIN_RIGHT_WIDTH,
	clampDividerSize,
	isValidMcpServerId,
	mergeLangflowerConfigLayers,
} from '@langflower/shared/langflower.js';
import { parseJsonc } from '../utils/parse-jsonc.js';
import { resolveGlobalLangflowerConfigPath } from './resolve-global-langflower-config-path.js';
import {
	LANGFLOWER_SECRETS_FILENAME,
	mergeLangflowerSecrets,
	parseLangflowerSecrets,
	serializeLangflowerSecrets,
	type LangflowerSecretsMap,
	type LangflowerSecretsWrite,
} from './langflower-secrets.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isPermissionDecision = (
	value: unknown,
): value is LangflowerPermissionDecision =>
	value === 'allow' || value === 'ask' || value === 'deny';

const parsePermissionToolConfig = (
	raw: unknown,
): LangflowerPermissionToolConfig | undefined => {
	if (isPermissionDecision(raw)) {
		return raw;
	}

	if (!isRecord(raw)) {
		return undefined;
	}

	const entries = Object.entries(raw).filter(
		(entry): entry is [string, LangflowerPermissionDecision] =>
			isPermissionDecision(entry[1]),
	);

	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const parsePermission = (
	raw: unknown,
): LangflowerPermissionConfig | undefined => {
	if (!isRecord(raw)) {
		return undefined;
	}

	const entries = Object.entries(raw).flatMap(
		([toolId, value]): readonly [
			string,
			LangflowerPermissionToolConfig,
		][] => {
			const parsed = parsePermissionToolConfig(value);
			return parsed === undefined ? [] : [[toolId, parsed]];
		},
	);

	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const parseHarness = (raw: unknown): LangflowerHarnessConfig | undefined => {
	if (!isRecord(raw)) {
		return undefined;
	}

	const denyPaths =
		Array.isArray(raw.denyPaths) &&
		raw.denyPaths.every((entry) => typeof entry === 'string')
			? (raw.denyPaths as readonly string[])
			: undefined;

	if (denyPaths === undefined) {
		return undefined;
	}

	return { denyPaths };
};

const parseProviderModels = (raw: unknown): readonly string[] | undefined => {
	if (Array.isArray(raw) && raw.every((model) => typeof model === 'string')) {
		return raw;
	}

	if (isRecord(raw)) {
		const ids = Object.keys(raw);
		return ids.length > 0 ? ids : undefined;
	}

	return undefined;
};

function parseProviders(
	raw: unknown,
): Readonly<Record<string, LangflowerProviderConfig>> | undefined {
	if (!isRecord(raw)) {
		return undefined;
	}

	const entries = Object.entries(raw).flatMap(
		([id, value]): readonly [string, LangflowerProviderConfig][] => {
			if (!isRecord(value) || typeof value.name !== 'string') {
				return [];
			}

			const models = parseProviderModels(value.models);

			return [
				[
					id,
					{
						...value,
						name: value.name,
						...(models !== undefined ? { models } : {}),
					},
				],
			];
		},
	);

	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseTools(raw: unknown): readonly LangflowerToolConfig[] | undefined {
	if (!Array.isArray(raw)) {
		return undefined;
	}

	const tools = raw.filter(
		(entry): entry is LangflowerToolConfig =>
			isRecord(entry) &&
			typeof entry.id === 'string' &&
			typeof entry.name === 'string',
	);

	return tools.length > 0 ? tools : undefined;
}

const parseMcpHttpHeaders = (
	raw: unknown,
): Readonly<Record<string, string>> | undefined => {
	if (!isRecord(raw)) {
		return undefined;
	}

	const headers = Object.fromEntries(
		Object.entries(raw).flatMap(([key, value]) =>
			typeof value === 'string' ? [[key, value] as const] : [],
		),
	);

	return Object.keys(headers).length > 0 ? headers : undefined;
};

const parseMcpServer = (
	raw: unknown,
): LangflowerMcpServerConfig | undefined => {
	if (!isRecord(raw) || typeof raw.kind !== 'string') {
		return undefined;
	}

	const toolNames =
		typeof raw.toolNames === 'string' && raw.toolNames.trim().length > 0
			? raw.toolNames.trim()
			: undefined;

	if (raw.kind === 'stdio') {
		const command =
			typeof raw.command === 'string' ? raw.command.trim() : '';

		if (command.length === 0) {
			return undefined;
		}

		return {
			kind: 'stdio',
			command,
			...(toolNames !== undefined ? { toolNames } : {}),
		};
	}

	if (raw.kind === 'http') {
		const url = typeof raw.url === 'string' ? raw.url.trim() : '';

		if (url.length === 0) {
			return undefined;
		}

		const command =
			typeof raw.command === 'string' && raw.command.trim().length > 0
				? raw.command.trim()
				: undefined;

		const headers = parseMcpHttpHeaders(raw.headers);

		return {
			kind: 'http',
			url,
			...(command !== undefined ? { command } : {}),
			...(toolNames !== undefined ? { toolNames } : {}),
			...(headers !== undefined ? { headers } : {}),
		};
	}

	return undefined;
};

const parseMcp = (raw: unknown): LangflowerMcpConfig | undefined => {
	if (!isRecord(raw) || !isRecord(raw.servers)) {
		return undefined;
	}

	const servers = Object.fromEntries(
		Object.entries(raw.servers).flatMap(
			([id, value]): readonly [string, LangflowerMcpServerConfig][] => {
				if (!isValidMcpServerId(id)) {
					return [];
				}

				const parsed = parseMcpServer(value);
				return parsed === undefined ? [] : [[id, parsed]];
			},
		),
	);

	if (Object.keys(servers).length === 0) {
		return undefined;
	}

	return { servers };
};

function parseLangflowerConfig(raw: unknown): LangflowerConfig {
	if (!isRecord(raw)) {
		return {};
	}

	const providers = parseProviders(raw.provider);
	const tools = parseTools(raw.tools);
	const permission = parsePermission(raw.permission);
	const harness = parseHarness(raw.harness);
	const mcp = parseMcp(raw.mcp);

	return {
		...(typeof raw.currentWorkflowId === 'string' &&
		raw.currentWorkflowId.length > 0
			? { currentWorkflowId: raw.currentWorkflowId }
			: {}),
		...(typeof raw.model === 'string' ? { model: raw.model } : {}),
		...(typeof raw.embedding === 'string'
			? { embedding: raw.embedding }
			: {}),
		...(typeof raw.serverLogs === 'boolean'
			? { serverLogs: raw.serverLogs }
			: {}),
		...(providers !== undefined ? { provider: providers } : {}),
		...(tools !== undefined ? { tools } : {}),
		...(permission !== undefined ? { permission } : {}),
		...(harness !== undefined ? { harness } : {}),
		...(mcp !== undefined ? { mcp } : {}),
		...parseDividerPositions(raw.dividerPositions),
		...(typeof raw.paletteVisible === 'boolean'
			? { paletteVisible: raw.paletteVisible }
			: {}),
	};
}

function parseDividerPositions(
	raw: unknown,
): { readonly dividerPositions?: DividerPositions } | Record<string, never> {
	if (!isRecord(raw)) {
		return {};
	}

	const leftWidth =
		typeof raw.leftWidth === 'number' && Number.isFinite(raw.leftWidth)
			? clampDividerSize(raw.leftWidth, DIVIDER_MIN_LEFT_WIDTH)
			: undefined;
	const rightWidth =
		typeof raw.rightWidth === 'number' && Number.isFinite(raw.rightWidth)
			? clampDividerSize(raw.rightWidth, DIVIDER_MIN_RIGHT_WIDTH)
			: undefined;
	const composerHeight =
		typeof raw.composerHeight === 'number' &&
		Number.isFinite(raw.composerHeight)
			? clampDividerSize(raw.composerHeight, DIVIDER_MIN_COMPOSER_HEIGHT)
			: undefined;

	if (
		leftWidth === undefined &&
		rightWidth === undefined &&
		composerHeight === undefined
	) {
		return {};
	}

	return {
		dividerPositions: {
			...(leftWidth !== undefined ? { leftWidth } : {}),
			...(rightWidth !== undefined ? { rightWidth } : {}),
			...(composerHeight !== undefined ? { composerHeight } : {}),
		} as DividerPositions,
	};
}

type LangflowerConfigPatch = {
	readonly [Key in keyof LangflowerConfig]?:
		LangflowerConfig[Key] | undefined;
};

function mergeLangflowerConfig(
	existing: unknown,
	patch: LangflowerConfigPatch,
): Record<string, unknown> {
	const merged: Record<string, unknown> = isRecord(existing)
		? { ...existing }
		: {};

	if ('currentWorkflowId' in patch) {
		if (patch.currentWorkflowId === undefined) {
			delete merged.currentWorkflowId;
		} else {
			merged.currentWorkflowId = patch.currentWorkflowId;
		}
	}

	if (patch.model !== undefined) {
		if (patch.model.trim().length === 0) {
			delete merged.model;
		} else {
			merged.model = patch.model;
		}
	}

	if (patch.embedding !== undefined) {
		if (patch.embedding.trim().length === 0) {
			delete merged.embedding;
		} else {
			merged.embedding = patch.embedding;
		}
	}

	if ('serverLogs' in patch) {
		if (patch.serverLogs === undefined) {
			delete merged.serverLogs;
		} else {
			merged.serverLogs = patch.serverLogs;
		}
	}

	if (patch.provider !== undefined) {
		merged.provider = patch.provider;
	}

	if (patch.dividerPositions !== undefined) {
		merged.dividerPositions = patch.dividerPositions;
	}

	if (patch.paletteVisible !== undefined) {
		merged.paletteVisible = patch.paletteVisible;
	}

	return merged;
}

function serializeLangflowerConfig(merged: Record<string, unknown>): string {
	return `${JSON.stringify(merged, null, '\t')}\n`;
}

const stripBridgeOnlyProviderFields = (
	provider: LangflowerProviderConfig,
): LangflowerProviderConfig => {
	const { hasApiKey: _hasApiKey, ...rest } =
		provider as LangflowerProviderConfig & {
			readonly hasApiKey?: boolean;
		};
	return rest;
};

const mergeProviderOptionsForSave = (
	formProvider: LangflowerProviderConfig,
	existingRaw: unknown,
	apiKeyInput: string | undefined,
): LangflowerProviderConfig => {
	const cleaned = stripBridgeOnlyProviderFields(formProvider);
	const existing = isRecord(existingRaw) ? existingRaw : {};
	const existingOptions = isRecord(existing.options) ? existing.options : {};
	const formOptions = isRecord(cleaned.options) ? cleaned.options : {};
	const {
		apiKey: _formKey,
		hasApiKey: _has,
		...safeFormOptions
	} = formOptions as Record<string, unknown> & {
		readonly apiKey?: unknown;
		readonly hasApiKey?: unknown;
	};

	const trimmedKey = apiKeyInput?.trim();
	const apiKey =
		trimmedKey !== undefined && trimmedKey.length > 0
			? trimmedKey
			: typeof existingOptions.apiKey === 'string'
				? existingOptions.apiKey
				: undefined;

	const options = {
		...safeFormOptions,
		...(apiKey !== undefined ? { apiKey } : {}),
	};

	const { options: _drop, ...withoutOptions } = cleaned;

	return {
		...withoutOptions,
		name: cleaned.name,
		...(cleaned.models !== undefined ? { models: cleaned.models } : {}),
		...(Object.keys(options).length > 0 ? { options } : {}),
	};
};

export type LangflowerConfigLayers = {
	readonly project: LangflowerConfig;
	readonly global: LangflowerConfig;
};

export type LangflowerConfigSettingsWrite = {
	readonly scope: LangflowerConfigScope;
	readonly model?: string;
	readonly embedding?: string;
	readonly provider?: Readonly<Record<string, LangflowerProviderConfig>>;
	readonly providerApiKeys?: Readonly<Record<string, string>>;
	readonly secretIds?: readonly string[];
	readonly secretValues?: Readonly<Record<string, string>>;
	/** `null` clears the scope key (Settings Default). */
	readonly serverLogs?: boolean | null;
};

export class LangflowerConfigService {
	private readonly globalConfigPath: string;

	constructor(
		private readonly projectDir: string,
		globalPath: string = resolveGlobalLangflowerConfigPath(),
	) {
		this.globalConfigPath = globalPath;
	}

	globalPath(): string {
		return this.globalConfigPath;
	}

	secretsPath(): string {
		return path.join(
			path.dirname(this.globalConfigPath),
			LANGFLOWER_SECRETS_FILENAME,
		);
	}

	private projectConfigPath(): string {
		return path.join(this.projectDir, '.langflower', 'langflower.jsonc');
	}

	private async readRawAt(filePath: string): Promise<unknown> {
		try {
			const raw = await fs.readFile(filePath, 'utf8');
			return parseJsonc(raw);
		} catch {
			return {};
		}
	}

	private async writeRawAt(
		filePath: string,
		merged: Record<string, unknown>,
	): Promise<void> {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, serializeLangflowerConfig(merged), 'utf8');
	}

	async readProject(): Promise<LangflowerConfig> {
		return parseLangflowerConfig(
			await this.readRawAt(this.projectConfigPath()),
		);
	}

	async readGlobal(): Promise<LangflowerConfig> {
		return parseLangflowerConfig(
			await this.readRawAt(this.globalConfigPath),
		);
	}

	async readLayers(): Promise<LangflowerConfigLayers> {
		const [project, global] = await Promise.all([
			this.readProject(),
			this.readGlobal(),
		]);
		return { project, global };
	}

	/** Effective config: project > global merge. */
	async read(): Promise<LangflowerConfig> {
		const layers = await this.readLayers();
		return mergeLangflowerConfigLayers(layers.global, layers.project);
	}

	async write(config: LangflowerConfig): Promise<void> {
		const merged = mergeLangflowerConfig(
			await this.readRawAt(this.projectConfigPath()),
			{
				...(config.currentWorkflowId !== undefined
					? { currentWorkflowId: config.currentWorkflowId }
					: {}),
				...(config.model !== undefined ? { model: config.model } : {}),
				...(config.embedding !== undefined
					? { embedding: config.embedding }
					: {}),
				...(config.provider !== undefined
					? { provider: config.provider }
					: {}),
			},
		);

		await this.writeRawAt(this.projectConfigPath(), merged);
	}

	private async writeSecretsFile(
		secrets: LangflowerSecretsMap,
	): Promise<void> {
		const filePath = this.secretsPath();
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(
			filePath,
			serializeLangflowerSecrets(secrets),
			'utf8',
		);

		try {
			await fs.chmod(filePath, 0o600);
		} catch {
			// Best-effort (Windows may ignore mode bits).
		}
	}

	/**
	 * Full secret values — server-only. Never put this map on the bridge.
	 */
	async readSecrets(): Promise<LangflowerSecretsMap> {
		try {
			return parseLangflowerSecrets(
				await this.readRawAt(this.secretsPath()),
			);
		} catch {
			return {};
		}
	}

	async listSecretIds(): Promise<readonly string[]> {
		return Object.keys(await this.readSecrets());
	}

	private async persistSecretsPatch(
		input: LangflowerSecretsWrite,
	): Promise<void> {
		const merged = mergeLangflowerSecrets(await this.readSecrets(), input);

		if (merged === undefined) {
			return;
		}

		await this.writeSecretsFile(merged);
	}

	/**
	 * Persist named KV secrets to the user-global file. Both omitted fields
	 * leave the file unchanged.
	 */
	async writeSecrets(patch: LangflowerSecretsWrite): Promise<void> {
		await this.persistSecretsPatch(patch);
	}

	/**
	 * Persist Settings Save for one scope. Preserves existing apiKey when the
	 * corresponding `providerApiKeys` entry is empty/missing. Named KV secrets
	 * write the user-global secrets file when `secretIds` / `secretValues` are
	 * present (independent of scope).
	 */
	async writeSettings(
		input: LangflowerConfigSettingsWrite,
	): Promise<LangflowerConfigLayers> {
		const filePath =
			input.scope === 'global'
				? this.globalConfigPath
				: this.projectConfigPath();
		const existingRaw = await this.readRawAt(filePath);
		const existingProviders = isRecord(existingRaw)
			? isRecord(existingRaw.provider)
				? existingRaw.provider
				: {}
			: {};

		const provider =
			input.provider === undefined
				? undefined
				: Object.fromEntries(
						Object.entries(input.provider).map(([id, entry]) => [
							id,
							mergeProviderOptionsForSave(
								entry,
								existingProviders[id],
								input.providerApiKeys?.[id],
							),
						]),
					);

		const patch: LangflowerConfigPatch = {
			...(input.model !== undefined ? { model: input.model } : {}),
			...(input.embedding !== undefined
				? { embedding: input.embedding }
				: {}),
			...(provider !== undefined ? { provider } : {}),
			...('serverLogs' in input
				? {
						serverLogs:
							input.serverLogs === null
								? undefined
								: input.serverLogs,
					}
				: {}),
		};

		const merged = mergeLangflowerConfig(existingRaw, patch);
		await this.writeRawAt(filePath, merged);
		await this.persistSecretsPatch(input);
		return this.readLayers();
	}

	async setCurrentWorkflowId(
		workflowId: string | undefined,
	): Promise<LangflowerConfig> {
		const merged = mergeLangflowerConfig(
			await this.readRawAt(this.projectConfigPath()),
			{
				currentWorkflowId: workflowId,
			},
		);

		await this.writeRawAt(this.projectConfigPath(), merged);
		return parseLangflowerConfig(merged);
	}

	async setDividerPositions(
		positions: DividerPositions,
	): Promise<LangflowerConfig> {
		const merged = mergeLangflowerConfig(
			await this.readRawAt(this.projectConfigPath()),
			{
				dividerPositions: positions,
			},
		);

		await this.writeRawAt(this.projectConfigPath(), merged);
		return parseLangflowerConfig(merged);
	}

	async setPaletteVisible(visible: boolean): Promise<LangflowerConfig> {
		const merged = mergeLangflowerConfig(
			await this.readRawAt(this.projectConfigPath()),
			{
				paletteVisible: visible,
			},
		);

		await this.writeRawAt(this.projectConfigPath(), merged);
		return parseLangflowerConfig(merged);
	}
}
