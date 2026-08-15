/**
 * Sub-Agent registration / spawn / result wire contracts (ADR-021 L0).
 * Separate from `ToolHandle` — never part of agent tool inventory.
 *
 * Named wire types (not `json`) so RuntimeEditor connection checks reject
 * unrelated structured payloads. Custom nodes:
 * `import { SUBAGENT_RESULT_WIRE_TYPE, type SubAgentResultPayload } from
 * '@langflower/common-nodes/ai/sub-agent-protocol'`.
 */

/** Wire type strings owned by `@langflower/node-sdk` (`defineLlmNode`). */
export {
	SUBAGENT_REGISTRATION_WIRE_TYPE,
	SUBAGENT_RESULT_WIRE_TYPE,
	SUBAGENT_SPAWN_WIRE_TYPE,
} from '@langflower/node-sdk/llm';

type SubAgentSkillAnnounce = {
	readonly skillId: string;
	readonly description: string;
};

/** On Sub-Agent `registration` out → main `subagentRegistration` in (combine). */
export type SubAgentRegistration = {
	readonly targetNodeId: string;
	readonly name: string;
	readonly description: string;
	readonly skills: readonly SubAgentSkillAnnounce[];
};

/** Main `subagent` out → Sub-Agent `task` in (fan-out; filter by nodeId). */
export type SubAgentSpawnPayload = {
	readonly callId: string;
	readonly nodeId: string;
	/** Empty string when the main agent chose no skill. */
	readonly skillId: string;
	readonly task: string;
};

/** Sub-Agent `result` out → main `subagentResult` in (merge; router by callId). */
export type SubAgentResultPayload = {
	readonly callId: string;
	readonly result: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isSkillAnnounce = (value: unknown): value is SubAgentSkillAnnounce =>
	isRecord(value) &&
	typeof value.skillId === 'string' &&
	typeof value.description === 'string';

const isSubAgentRegistration = (
	value: unknown,
): value is SubAgentRegistration =>
	isRecord(value) &&
	typeof value.targetNodeId === 'string' &&
	typeof value.name === 'string' &&
	typeof value.description === 'string' &&
	Array.isArray(value.skills) &&
	value.skills.every(isSkillAnnounce);

export const isSubAgentSpawnPayload = (
	value: unknown,
): value is SubAgentSpawnPayload =>
	isRecord(value) &&
	typeof value.callId === 'string' &&
	typeof value.nodeId === 'string' &&
	typeof value.skillId === 'string' &&
	typeof value.task === 'string';

export const isSubAgentResultPayload = (
	value: unknown,
): value is SubAgentResultPayload =>
	isRecord(value) &&
	typeof value.callId === 'string' &&
	typeof value.result === 'string';

/** Flatten multi-wire combine values (single reg or arrays). */
export const flattenSubAgentRegistrations = (
	wired: unknown,
): readonly SubAgentRegistration[] => {
	const root = wired ?? [];
	const list = Array.isArray(root) ? root : [root];

	return list.flatMap((item) => {
		if (Array.isArray(item)) {
			return item.filter(isSubAgentRegistration);
		}

		if (isSubAgentRegistration(item)) {
			return [item];
		}

		return [];
	});
};
