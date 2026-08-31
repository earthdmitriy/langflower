import type { DividerPositions } from './langflower-bootstrap.js';

/**
 * One configured LLM provider under `provider.<id>` in `langflower.jsonc`.
 * Extra provider-specific fields (api key ref, base url, …) pass through
 * untyped — only `name` / `models` are structured today.
 */
export type LangflowerProviderConfig = {
	readonly name: string;
	readonly models?: readonly string[];
} & Readonly<Record<string, unknown>>;

/**
 * One configured tool the workflow can reference from a `tool-id-list` /
 * `tool-registration` uiSchema field.
 */
export type LangflowerToolConfig = {
	readonly id: string;
	readonly name: string;
} & Readonly<Record<string, unknown>>;

/**
 * One skill folder under `.langflower/skills/<id>/SKILL.md`.
 * Populated in-memory from the filesystem — never written to `langflower.jsonc`.
 */
export type LangflowerSkillConfig = {
	readonly id: string;
	readonly name: string;
	readonly description: string;
};

/** Runtime harness permission decision (OpenCode-style). */
export type LangflowerPermissionDecision = 'allow' | 'ask' | 'deny';

/**
 * Per-tool rules under `permission.<toolId>`: a single decision, or
 * pattern → decision map (`*`, `docs/**`, `git diff*`, …).
 */
export type LangflowerPermissionToolConfig =
	| LangflowerPermissionDecision
	| Readonly<Record<string, LangflowerPermissionDecision>>;

/** `langflower.jsonc` `permission` block keyed by tool id. */
export type LangflowerPermissionConfig = Readonly<
	Record<string, LangflowerPermissionToolConfig>
>;

/** `langflower.jsonc` `harness` sandbox options. */
export type LangflowerHarnessConfig = {
	readonly denyPaths?: readonly string[];
	/**
	 * Extra filesystem roots trusted for harness I/O outside the project
	 * directory (ADR-014 extension). Absolute paths preferred; relative
	 * entries resolve against the project root. Empty/missing → project
	 * root only. Typical use: Obsidian vault path.
	 */
	readonly allowedRoots?: readonly string[];
	/**
	 * Optional hostname allowlist for crawl / Fetch URL (`webFetch`).
	 * When set, only these hosts (exact match, case-insensitive) may be fetched.
	 * Private / loopback / link-local targets stay denied regardless.
	 */
	readonly allowedHosts?: readonly string[];
};

/**
 * System MCP stdio entry — connect fields match `common-mcp-stdio`
 * (id = map key). Display name comes from MCP `serverInfo.name` at connect.
 * Structural twin of common-nodes `SystemMcpStdioEntry` (package DAG).
 */
export type LangflowerMcpStdioServerConfig = {
	readonly kind: 'stdio';
	readonly command: string;
	/** Optional author tool-name filter (comma/space list), same as the node. */
	readonly toolNames?: string;
};

/**
 * System MCP http entry — connect fields match `common-mcp-http` (id = map key).
 */
export type LangflowerMcpHttpServerConfig = {
	readonly kind: 'http';
	readonly url: string;
	/** Optional shell CLI to launch a local HTTP MCP before connect. */
	readonly command?: string;
	readonly toolNames?: string;
	/** Optional HTTP headers; values may include `{lf_secrets:}` / `{env:}`. */
	readonly headers?: Readonly<Record<string, string>>;
};

export type LangflowerMcpServerConfig =
	LangflowerMcpStdioServerConfig | LangflowerMcpHttpServerConfig;

/**
 * Optional project MCP servers. Inspector **Enabled MCP** selects which ids
 * an agent may use — no separate allowlist.
 */
export type LangflowerMcpConfig = {
	readonly servers?: Readonly<Record<string, LangflowerMcpServerConfig>>;
};

/**
 * Parsed subset of `.langflower/langflower.jsonc`.
 *
 * Unknown top-level keys are preserved on disk by the server config service;
 * only known fields are typed here.
 */
export type LangflowerConfig = {
	/**
	 * Stem of the last opened workflow file under
	 * `.langflower/workflows/{id}.json`.
	 */
	readonly currentWorkflowId?: string;
	readonly model?: string;
	/**
	 * Default embedding identity `"providerId/modelId"`, distinct from chat
	 * {@link LangflowerConfig.model}.
	 */
	readonly embedding?: string;
	readonly provider?: Readonly<Record<string, LangflowerProviderConfig>>;
	/** Tools available to `optionsSource: 'langflower.tools'` uiSchema fields. */
	readonly tools?: readonly LangflowerToolConfig[];
	/**
	 * Skills catalog for `optionsSource: 'langflower.skills'` uiSchema fields.
	 * Server-only projection from `.langflower/skills/` — not persisted to jsonc.
	 */
	readonly skills?: readonly LangflowerSkillConfig[];
	/** Editor divider positions (sidebar + composer sizes). */
	readonly dividerPositions?: DividerPositions;
	/**
	 * Left node palette shown. Project jsonc only (same class as
	 * {@link LangflowerConfig.dividerPositions}). Omit = visible.
	 */
	readonly paletteVisible?: boolean;
	/**
	 * Runtime allow/ask/deny for harness tools (≠ author-time `enabledToolIds`).
	 */
	readonly permission?: LangflowerPermissionConfig;
	/** Project-root sandbox extras (deny path globs, …). */
	readonly harness?: LangflowerHarnessConfig;
	/**
	 * System MCP servers (same shape as MCP stdio/http nodes). Per-agent
	 * Inspector `enabledMcpIds` is the only enable gate.
	 */
	readonly mcp?: LangflowerMcpConfig;
	/**
	 * Bridge diagnostic JSONL logging under `.langflower/logs/`.
	 * Omit = inherit (Default in Settings); `true`/`false` set the scope.
	 */
	readonly serverLogs?: boolean;
};

/** Settings / config save target layer. */
export type LangflowerConfigScope = 'project' | 'global';

/**
 * Client → server: persist Settings edits for one scope, then re-broadcast
 * {@link LangflowerConfigSnapshotPayload}.
 *
 * `provider` is the full map for that scope (ids, names, models, non-secret
 * options). Provider secrets travel only in `providerApiKeys` — empty/missing
 * key leaves the existing disk `apiKey` unchanged; non-empty writes/replaces
 * (prefer `{env:VAR}` when the operator enters a placeholder).
 *
 * Named KV secrets use {@link LangflowerSecretsSaveRequestedPayload} on
 * `langflower.secrets.save.requested` — not this payload.
 */
export type LangflowerConfigSaveRequestedPayload = {
	readonly scope: LangflowerConfigScope;
	readonly model?: string;
	/**
	 * Default embedding identity `"providerId/modelId"`. Empty string clears
	 * the layer key (same as `model`). Omitted leaves the existing value.
	 */
	readonly embedding?: string;
	readonly provider?: Readonly<Record<string, LangflowerProviderConfig>>;
	readonly providerApiKeys?: Readonly<Record<string, string>>;
	/**
	 * `true` / `false` persist the scope key; `null` clears it (Default).
	 * Omitted leaves the existing scope value unchanged.
	 */
	readonly serverLogs?: boolean | null;
};

/**
 * Client → server: persist the user-global `langflower.secrets.json` map
 * (never the project tree). Independent of Settings jsonc `scope`.
 *
 * Both omitted → leave the file unchanged. `secretIds` is the surviving id
 * set (omit an id to delete). Non-empty `secretValues[id]` replaces;
 * empty/missing keeps the stored value. `secretValues` without `secretIds`
 * upserts only.
 */
export type LangflowerSecretsSaveRequestedPayload = {
	/**
	 * Surviving named-secret ids after Save. Omitted together with
	 * {@link LangflowerSecretsSaveRequestedPayload.secretValues} leaves the
	 * secrets file untouched.
	 */
	readonly secretIds?: readonly string[];
	/**
	 * Write-only new/replacement values keyed by secret id. Empty/missing
	 * entry keeps the existing stored value.
	 */
	readonly secretValues?: Readonly<Record<string, string>>;
};

/** Server → client authoritative config slice (effective + editable layers). */
export type LangflowerConfigSnapshotPayload = {
	/** Merged project > global (plus skills catalog when present). */
	readonly config: LangflowerConfig;
	/** Redacted project-layer file contents for Settings Project scope. */
	readonly projectConfig: LangflowerConfig;
	/** Redacted global-layer file contents for Settings Global scope. */
	readonly globalConfig: LangflowerConfig;
	/** Server-resolved absolute path of the global config file (S6 hint). */
	readonly globalPath: string;
	/** Ids present in the user-global secrets file — never values. */
	readonly secretIds: readonly string[];
	/** Server-resolved absolute path of `langflower.secrets.json`. */
	readonly secretsPath: string;
};

/**
 * Server → client: runtime permission ask inside the internal tool loop
 * (feed / composer Allow·Deny — not a canvas HITL port).
 */
export type RunnerPermissionAskPayload = {
	readonly runId: string;
	readonly askId: string;
	readonly nodeId: string;
	readonly toolId: string;
	readonly detail: string;
	readonly summary: string;
};

/** Client → server: Allow / Deny for a pending {@link RunnerPermissionAskPayload}. */
export type RunnerPermissionReplyPayload = {
	readonly runId: string;
	readonly askId: string;
	readonly decision: 'allow' | 'deny';
};

/** One model id from a live provider catalog fetch (phase 6). */
export type ProviderModelEntry = {
	readonly id: string;
	readonly name?: string;
};

/** Live catalog slice for one provider (never includes secrets). */
export type LangflowerProviderModelsCatalog = {
	readonly models: readonly ProviderModelEntry[];
	readonly error?: string;
};

/**
 * Server → client authoritative live model catalogs for every configured
 * provider id. Static jsonc models stay on {@link LangflowerConfigSnapshotPayload};
 * UI merges both. Pushed after config.snapshot (connect) and after Settings Save.
 */
export type LangflowerModelsCatalogSnapshotPayload = {
	readonly catalogs: Readonly<
		Record<string, LangflowerProviderModelsCatalog>
	>;
};

/**
 * Per-provider connection probe status on the Settings draft snapshot.
 * Keyed by draft row index string (`"0"`, `"1"`, …).
 */
export type ProviderConnectionStatus =
	| { readonly state: 'idle' }
	| { readonly state: 'checking' }
	| { readonly state: 'ok'; readonly modelCount: number }
	| { readonly state: 'error'; readonly message: string };

/**
 * Redacted Settings **form** draft (UI ↔ session). Not runtime credentials.
 * Snapshots send empty `providers[].apiKey` / `secrets[].value` so the
 * editor never redisplays stored secrets (`hasApiKey` / `hasValue` only).
 * LLM/embed nodes do not read this payload: they call host stream/embed
 * factories whose closures resolve keys on the server from jsonc
 * (`resolveProviderCredentials`). `ExecutionContext` has no `apiKey`.
 */
export type LangflowerConfigDraft = {
	readonly defaultProviderId: string;
	readonly defaultModelId: string;
	readonly defaultEmbeddingProviderId: string;
	readonly defaultEmbeddingModelId: string;
	readonly providers: readonly {
		readonly id: string;
		readonly name: string;
		readonly baseURL: string;
		readonly modelsText: string;
		readonly apiKey: string;
		readonly hasApiKey: boolean;
	}[];
	readonly secrets: readonly {
		readonly id: string;
		readonly value: string;
		readonly hasValue: boolean;
	}[];
	readonly serverLogs: 'off' | 'default' | 'on';
};

/**
 * Server → client: authoritative unsaved Settings draft for one scope,
 * including per-row connection status. Session memory; broadcast to all tabs.
 */
export type LangflowerConfigDraftSnapshotPayload = {
	readonly scope: LangflowerConfigScope;
	readonly draft: LangflowerConfigDraft;
	readonly baseline: LangflowerConfigDraft;
	readonly dirty: boolean;
	readonly connections: Readonly<Record<string, ProviderConnectionStatus>>;
};

/**
 * Client → server: replace the session draft for a scope (full draft).
 * Empty `providers[].apiKey` means keep the session pending key / saved key.
 */
export type LangflowerConfigDraftPatchRequestedPayload = {
	readonly scope: LangflowerConfigScope;
	readonly draft: LangflowerConfigDraft;
};

/** Client → server: re-seed draft from the saved layer for a scope. */
export type LangflowerConfigDraftDiscardRequestedPayload = {
	readonly scope: LangflowerConfigScope;
};
