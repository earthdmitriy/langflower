import type { HitlUploadedFile } from '@langflower/node-sdk';
import express, { type Express, type Request, type Response } from 'express';
import type { LangflowerSession } from '../session/langflower-session.js';
import {
	createSessionUploadRawOptions,
	isSessionUploadFileId,
	isSessionUploadMime,
	SESSION_UPLOAD_NAME_HEADER,
	SESSION_UPLOAD_ROUTE,
	sessionUploadByteLengthAllowed,
	sessionUploadContentType,
	sessionUploadDeclaredLength,
} from '../workflow-sessions/session-upload.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';

export type SessionUploadRouteDeps = {
	readonly session: LangflowerSession;
	readonly store: WorkflowSessionStore;
};

export type SessionUploadRouteOptions = {
	/** Defaults to the 50 MB provider ceiling. Tests may pass a smaller ceiling. */
	readonly maxBytes?: number;
};

const NO_SESSION = 'No workflow session is bound';

const sendFailure = (
	response: Response,
	status: number,
	code: string,
	message: string,
): void => {
	response.status(status).json({ ok: false, code, message });
};

const uploadStatus = (code: string): number => {
	switch (code) {
		case 'MIME':
			return 415;
		case 'TOO_LARGE':
			return 413;
		case 'INVALID_NAME':
		case 'INVALID_ID':
			return 400;
		case 'NOT_FOUND':
			return 404;
		default:
			return 500;
	}
};

const isPayloadTooLarge = (error: unknown): boolean => {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const status = 'status' in error ? error.status : undefined;
	const type = 'type' in error ? error.type : undefined;
	return status === 413 || type === 'entity.too.large';
};

const boundWorkflowSession = (
	session: LangflowerSession,
): { readonly workflowId: string; readonly sessionId: string } | undefined => {
	if (session.binding.kind !== 'workflowSession') {
		return undefined;
	}

	const workflowId =
		session.activeWorkflow?.workflowId ?? session.activeWorkflowId;

	if (workflowId === undefined || workflowId.length === 0) {
		return undefined;
	}

	return { workflowId, sessionId: session.binding.sessionId };
};

const readBody = (request: Request): Buffer | undefined => {
	const body: unknown = request.body;
	return Buffer.isBuffer(body) ? body : undefined;
};

const headerText = (header: string | string[] | undefined): string => {
	if (Array.isArray(header)) {
		return header[0] ?? '';
	}
	return header ?? '';
};

/**
 * Localhost bulk hatch for one session upload (ADR-006, ADR-012).
 * `POST` body is raw bytes. `Content-Type` is the MIME.
 * `X-Langflower-File-Name` is the original name. The response is
 * `HitlUploadedFile`. `GET` serves those bytes for a later `<img>`.
 */
export const mountSessionUploadRoutes = (
	app: Express,
	deps: SessionUploadRouteDeps,
	options?: SessionUploadRouteOptions,
): void => {
	const maxBytes = options?.maxBytes ?? createSessionUploadRawOptions().limit;
	const parser = express.raw(createSessionUploadRawOptions(maxBytes));

	app.post(SESSION_UPLOAD_ROUTE, (request, response, next) => {
		if (boundWorkflowSession(deps.session) === undefined) {
			sendFailure(response, 409, 'NO_SESSION', NO_SESSION);
			return;
		}

		// body-parser drains the socket before it reports a limit error, so a
		// declared length at or over the ceiling is refused before express.raw.
		const declared = sessionUploadDeclaredLength(
			request.headers['content-length'],
		);
		if (
			declared !== undefined &&
			!sessionUploadByteLengthAllowed(declared, maxBytes)
		) {
			sendFailure(response, 413, 'TOO_LARGE', 'File must be under 50 MB');
			return;
		}

		parser(request, response, (error: unknown) => {
			if (error !== undefined) {
				if (isPayloadTooLarge(error)) {
					sendFailure(
						response,
						413,
						'TOO_LARGE',
						'File must be under 50 MB',
					);
					return;
				}
				next(error);
				return;
			}

			void handlePost(request, response, deps, maxBytes);
		});
	});

	app.get(`${SESSION_UPLOAD_ROUTE}/:fileId`, (request, response) => {
		void handleGet(request, response, deps);
	});
};

const handlePost = async (
	request: Request,
	response: Response,
	deps: SessionUploadRouteDeps,
	maxBytes: number,
): Promise<void> => {
	try {
		const bound = boundWorkflowSession(deps.session);

		if (bound === undefined) {
			sendFailure(response, 409, 'NO_SESSION', NO_SESSION);
			return;
		}

		const mimeType = sessionUploadContentType(
			request.headers['content-type'],
		);

		if (!isSessionUploadMime(mimeType)) {
			sendFailure(response, 415, 'MIME', 'MIME type is not allowed');
			return;
		}

		const body = readBody(request);

		if (body === undefined) {
			sendFailure(response, 400, 'INVALID', 'Expected a raw body');
			return;
		}

		if (!sessionUploadByteLengthAllowed(body.length, maxBytes)) {
			sendFailure(response, 413, 'TOO_LARGE', 'File must be under 50 MB');
			return;
		}

		const written = await deps.store.writeUpload(
			bound.workflowId,
			bound.sessionId,
			{
				name: headerText(request.headers[SESSION_UPLOAD_NAME_HEADER]),
				mimeType,
				bytes: body,
			},
		);

		if (!written.ok) {
			sendFailure(
				response,
				uploadStatus(written.code),
				written.code,
				written.message,
			);
			return;
		}

		const file: HitlUploadedFile = written.value;
		response.status(200).json(file);
	} catch (error) {
		if (response.headersSent) {
			return;
		}

		sendFailure(
			response,
			500,
			'WRITE_FAILED',
			error instanceof Error ? error.message : 'Upload failed',
		);
	}
};

const handleGet = async (
	request: Request,
	response: Response,
	deps: SessionUploadRouteDeps,
): Promise<void> => {
	try {
		const bound = boundWorkflowSession(deps.session);

		if (bound === undefined) {
			sendFailure(response, 409, 'NO_SESSION', NO_SESSION);
			return;
		}

		const fileId = request.params.fileId;

		if (fileId === undefined || !isSessionUploadFileId(fileId)) {
			sendFailure(response, 400, 'INVALID_ID', 'fileId is not valid');
			return;
		}

		const loaded = await deps.store.readUpload(
			bound.workflowId,
			bound.sessionId,
			fileId,
		);

		if (!loaded.ok) {
			sendFailure(
				response,
				uploadStatus(loaded.code),
				loaded.code,
				loaded.message,
			);
			return;
		}

		response.status(200);
		response.setHeader('Content-Type', loaded.value.file.mimeType);
		response.setHeader('Content-Length', String(loaded.value.bytes.length));
		response.end(loaded.value.bytes);
	} catch (error) {
		if (response.headersSent) {
			return;
		}

		sendFailure(
			response,
			500,
			'WRITE_FAILED',
			error instanceof Error ? error.message : 'Upload read failed',
		);
	}
};
