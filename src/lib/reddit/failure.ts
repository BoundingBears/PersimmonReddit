// What went wrong with a request to Reddit, sorted into the few cases the app
// can say something useful about.
//
// Before this existed the only test for success was the status code, and a
// refusal does not always come with a failing one. Asked for JSON it will not
// give, Reddit may answer 403 with its "blocked" page, or it may redirect to a
// sign-in page and answer 200 with HTML. That second case went through as
// data: the parsers threw "Cannot read properties of undefined (reading
// 'children')", the page showed that sentence to the user, and the HTML was
// saved in the feed cache, so Retry kept getting the same thing back.
//
// Pure functions, no imports from the app, so they can be tested directly.

export type FailureKind =
	// Reddit will not serve this to an app that is not signed in.
	| 'refused'
	// The request never got an answer.
	| 'offline'
	| 'slow'
	| 'rate-limited'
	// The community exists but is closed to this reader.
	| 'private'
	| 'restricted'
	| 'banned'
	| 'missing'
	| 'reddit-down'
	// An answer arrived and was not what the endpoint is supposed to return.
	| 'unreadable';

export interface Failure {
	kind: FailureKind;
	status?: number;
	// A whole sentence, ready to show.
	message: string;
	cause?: unknown;
}

const MESSAGES: Record<FailureKind, string> = {
	refused: 'Reddit refused. It is turning away apps that are not signed in.',
	offline: 'No answer from Reddit. Check your connection.',
	slow: 'Reddit took too long to answer.',
	'rate-limited': 'Reddit asked the app to slow down. Give it a minute.',
	private: 'This community is private.',
	restricted: 'Reddit only shows this community to signed-in accounts.',
	banned: 'Reddit has banned this community.',
	missing: 'Reddit has nothing at this address.',
	'reddit-down': 'Reddit is having trouble right now.',
	unreadable: 'Reddit sent something the app could not read.'
};

/**
 * For a catch-all: something threw that none of the cases above describe,
 * which means a fault in the app itself. The exception goes to the log. Its
 * text is never what the user reads: "Cannot read properties of undefined"
 * tells them nothing and tells them wrongly that it is theirs to understand.
 */
export const UNEXPECTED = 'Something went wrong inside the app. Try again.';

export function failure(kind: FailureKind, status?: number, cause?: unknown): Failure {
	return { kind, status, message: MESSAGES[kind], cause };
}

/** A web page where JSON was asked for: a block page, or a sign-in page. */
export function looksLikeHtml(data: unknown, headers: Record<string, string> = {}): boolean {
	const type = (headers['content-type'] ?? headers['Content-Type'] ?? '').toLowerCase();
	if (type.includes('text/html')) return true;
	return typeof data === 'string' && /<\s*(!doctype|html|head|body)\b/i.test(data.slice(0, 2000));
}

/** Every endpoint the app reads answers with a JSON object or array. */
export function isJsonBody(data: unknown): data is object {
	return data !== null && typeof data === 'object';
}

// Reddit's own error envelope: {"reason": "private", "message": "Forbidden", "error": 403}
function reasonOf(data: unknown): string {
	if (!isJsonBody(data) || Array.isArray(data)) return '';
	const reason = (data as Record<string, unknown>).reason;
	return typeof reason === 'string' ? reason.toLowerCase() : '';
}

/** Null when the response is a usable answer. */
export function failureFor(
	status: number,
	data: unknown,
	headers: Record<string, string> = {}
): Failure | null {
	if (status >= 200 && status < 300) {
		if (isJsonBody(data) && !looksLikeHtml(data, headers)) return null;
		// Nothing, or a page: Reddit sent the request somewhere else (a sign-in
		// page, usually) and that somewhere answered politely.
		return failure(looksLikeHtml(data, headers) ? 'refused' : 'unreadable', status);
	}
	if (status === 429) return failure('rate-limited', status);
	const reason = reasonOf(data);
	if (status === 401 || status === 403) {
		if (reason === 'private') return failure('private', status);
		if (reason === 'quarantined' || reason === 'gated') return failure('restricted', status);
		return failure('refused', status);
	}
	if (status === 404) return failure(reason === 'banned' ? 'banned' : 'missing', status);
	if (status >= 500) return failure('reddit-down', status);
	return { kind: 'unreadable', status, message: `Reddit answered with an error (${status}).` };
}

/** A request that threw instead of answering. */
export function failureFromThrown(cause: unknown): Failure {
	const text = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause);
	return failure(/timeout|timed out|abort/i.test(text) ? 'slow' : 'offline', undefined, cause);
}

/**
 * How long to leave Reddit alone after it answers 429 (too many requests):
 * what it asked for in Retry-After, within reason.
 */
export function coolDownMs(headers: Record<string, string> = {}, attempt = 0): number {
	const asked = Number(headers['retry-after'] ?? headers['Retry-After']);
	const ms = Number.isFinite(asked) && asked > 0 ? asked * 1000 : 2000 * 2 ** attempt;
	return Math.min(Math.max(ms, 2000), 60_000);
}

/**
 * Whether asking again could get a different answer. A refusal, a private
 * community or a missing page will say the same thing every time.
 */
export function worthRetrying(kind: FailureKind): boolean {
	return kind === 'offline' || kind === 'slow' || kind === 'rate-limited' || kind === 'reddit-down';
}
