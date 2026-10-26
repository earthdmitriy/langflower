/** Hover-tooltip copy for ports shared by the LLM-class nodes. */
export const LLM_PORT_DESCRIPTIONS = {
	systemPrompt:
		'Extra system instructions for this agent. Appended to the built-in prompt and the instructions of connected tools and skills.',
	reasoning:
		"The model's thinking, streamed as it is produced. Empty when the model or its reasoning effort does not expose reasoning.",
	draftResponse:
		'The answer streamed token by token while the model is still working. Use `response` for the final text.',
	response:
		'The final answer, emitted once when the agent finishes its turn.',
} as const;
