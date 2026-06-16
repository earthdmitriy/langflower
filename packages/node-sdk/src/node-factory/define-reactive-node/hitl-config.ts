/**
 * HITL input metadata — one input port declares one human action.
 *
 * UI renders the control in the feed panel; server forwards user action via
 * `runner.hitl.event` → `RuntimeRunner.pushIntoInput`.
 */

/** Substitute textarea value when building the final payload. */
export type HitlTextValue = { readonly from: 'textarea' };

/** Substitute uploaded file metadata when building the final payload. */
export type HitlFileValue = {
	readonly from: 'file';
	readonly accept?: string;
	readonly multiple?: boolean;
};

/** JSON-compatible payload template for button click or textarea submit. */
export type HitlPayloadTemplate =
	| string
	| number
	| boolean
	| null
	| HitlTextValue
	| HitlFileValue
	| readonly HitlPayloadTemplate[]
	| { readonly [key: string]: HitlPayloadTemplate };

/** Metadata returned after UI/server stages an uploaded file. */
export type HitlUploadedFile = {
	readonly fileId: string;
	readonly name: string;
	readonly mimeType: string;
	readonly size: number;
};

export type HitlTextareaControl = {
	readonly kind: 'textarea';
	readonly placeholder?: string;
	readonly submitLabel?: string;
	/**
	 * Footer slot: `chat-start` swaps with Stop (Chat Input); omit/`reply`
	 * stays with mid-run reply actions. Do not key UI layout off submitLabel.
	 */
	readonly role?: 'chat-start' | 'reply';
	readonly payload?: HitlPayloadTemplate;
};

export type HitlButtonControl = {
	readonly kind: 'button';
	readonly label: string;
	readonly payload: HitlPayloadTemplate;
};

/** Dedicated file picker control (payload may include `{ from: 'file' }`). */
export type HitlFileControl = {
	readonly kind: 'file';
	readonly label?: string;
	readonly accept?: string;
	readonly multiple?: boolean;
	readonly payload?: HitlPayloadTemplate;
};

export type HitlControl =
	HitlTextareaControl | HitlButtonControl | HitlFileControl;

/** One HITL control bound to a single input port. */
export type HitlInputConfig = {
	readonly title: string;
	/** Output port id whose value is shown as prompt/context in the feed panel. */
	readonly promptFrom?: string;
} & HitlControl;
