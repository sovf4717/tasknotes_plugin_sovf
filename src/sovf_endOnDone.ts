/**
 * sovf4717 - ENDONDONE (end-after-done-N-times) feature.
 *
 * Upstream TaskNotes stores recurrence as a standard RFC 5545 RRULE string, so
 * it cannot express "stop after N completions" directly. We therefore keep the
 * cap in a dedicated sovf frontmatter property (`endAfterDoneCount`) that sits
 * alongside the standard RRULE. When a recurring task has completed at least
 * that many occurrences, the sovf plugin removes the recurrence so the task no
 * longer appears on future dates in the agenda view.
 *
 * This module is pure (no Obsidian imports) so it can be unit-tested.
 */

/** Frontmatter key that carries the "end after N completions" cap. */
export const SOVF_END_AFTER_DONE_COUNT_PROPERTY = "endAfterDoneCount";

export interface SovfEndOnDoneSource {
	frontmatter?: Record<string, unknown>;
	recurrence?: string | null;
	completeInstances?: string[];
}

/**
 * Resolve the "end after done N times" cap for a task, or null when none is set.
 *
 * The cap may be declared either via the dedicated `endAfterDoneCount`
 * frontmatter property (preferred) or, for backwards compatibility, as a
 * non-standard `ENDONDONE=n` token embedded in the recurrence string.
 */
export function sovfEndAfterDoneCountFromTask(source: SovfEndOnDoneSource): number | null {
	// 1) Dedicated frontmatter property.
	const fmCount = source.frontmatter?.[SOVF_END_AFTER_DONE_COUNT_PROPERTY];
	const fmParsed = parseCapValue(fmCount);
	if (fmParsed !== null) return fmParsed;

	// 2) Legacy: ENDONDONE token embedded in the RRULE string.
	const rrule = source.recurrence;
	if (typeof rrule === "string" && rrule.length > 0) {
		const match = rrule.match(/(?:^|;)ENDONDONE=(\d+)(?:;|$)/);
		if (match) {
			const parsed = parseCapValue(match[1]);
			if (parsed !== null) return parsed;
		}
	}

	return null;
}

function parseCapValue(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed === "") return null;
		const parsed = Number.parseInt(trimmed, 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	}
	return null;
}

/**
 * True when a task has reached its ENDONDONE cap and should have its recurrence
 * cleared so it stops appearing on future dates.
 */
/**
 * Rewrite a sovf ENDONDONE cap into the standard RFC 5545 `COUNT=N` part that
 * TaskNotes' recurrence model actually understands. TaskNotes ignores the
 * non-standard `ENDONDONE=N` token (its parser only honours COUNT/UNTIL), so
 * a recurring task carrying ENDONDONE never stops on its own. By translating
 * the cap into COUNT=N we make TaskNotes natively bound the total number of
 * occurrences, which is exactly "end after N completions" for a daily task.
 *
 * - Removes any existing ENDONDONE token from the RRULE string.
 * - Appends/sets COUNT=cap unless a COUNT or UNTIL part is already present.
 * Returns the original string when no cap is found or it is already standard.
 */
export function sovfNormalizeEndOnDoneRecurrence(
	recurrence: string | undefined | null,
	capFromFrontmatter?: number | null
): string | undefined {
	if (recurrence === null || recurrence === undefined || recurrence.length === 0) {
		return recurrence as string | undefined;
	}
	// Resolve the effective cap: embedded ENDONDONE token, else the frontmatter value.
	const embedded = sovfEndAfterDoneCountFromTask({ recurrence });
	const cap = embedded ?? capFromFrontmatter ?? null;

	// Drop the non-standard ENDONDONE token (TaskNotes rejects it in rrule).
	const withoutEndOnDone = recurrence.replace(/(?:^|;)ENDONDONE=\d+(?:;|$)/, ";").replace(/;;/g, ";").replace(/;$/, "").replace(/^;/, "");
	const normalized = withoutEndOnDone || recurrence;

	if (cap === null) {
		return normalized;
	}

	// If a standard end (COUNT/UNTIL) is already present, just strip ENDONDONE.
	if (/(?:^|;)(COUNT|UNTIL)=/.test(normalized)) {
		return normalized;
	}

	return `${normalized};COUNT=${cap}`;
}
export function sovfIsEndOnDoneTerminated(source: SovfEndOnDoneSource): boolean {
	const cap = sovfEndAfterDoneCountFromTask(source);
	if (cap === null) return false;
	const count = source.completeInstances?.length ?? 0;
	return count >= cap;
}