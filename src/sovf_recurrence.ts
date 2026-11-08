/**
 * sovf4717 - Recurrence ENDONDONE (end-after-done) feature.
 *
 * Adds support for a non-standard RRULE property ENDONDONE=n that stops a
 * recurring task after n completions. Self-contained; no tasknotes imports.
 */

/**
 * Extract the "end after done N times" cap encoded in a recurrence rule as the
 * non-standard ENDONDONE property, or null when the rule carries no such cap.
 */
export function sovfGetRecurrenceEndAfterDoneCount(recurrence?: string | null): number | null {
	if (!recurrence || typeof recurrence !== "string") return null;
	const match = recurrence.match(/(?:^|;)ENDONDONE=(\d+)(?:;|$)/);
	if (!match) return null;
	const count = Number.parseInt(match[1], 10);
	return Number.isFinite(count) && count > 0 ? count : null;
}

/**
 * Check whether a recurring task should terminate on the next completion.
 * Returns true if the task has reached its ENDONDONE cap.
 */
export function sovfWillTerminateOnCompletion(
	recurrence: string | undefined,
	completeInstancesCount: number
): boolean {
	const cap = sovfGetRecurrenceEndAfterDoneCount(recurrence);
	if (cap === null) return false;
	return completeInstancesCount >= cap;
}

/**
 * ENDONDONE is not a valid RFC 5545 RRULE part and the underlying rrule parser
 * rejects it, so any rule handed to a parse-based model function must have it
 * removed first.
 */
export function sovfStripEndAfterDoneFromRecurrence(recurrence?: string): string | undefined {
	if (!recurrence || typeof recurrence !== "string") return recurrence;
	const parts = recurrence.split(";").filter((part) => !/^ENDONDONE=\d+$/.test(part));
	const stripped = parts.join(";");
	return stripped === recurrence ? recurrence : stripped || undefined;
}

/**
 * Strip ENDONDONE from a task object's recurrence field for model-function input.
 */
export function sovfStripForModel<T extends { recurrence?: string; complete_instances?: string[] }>(
	task: T
): T {
	const stripped = sovfStripEndAfterDoneFromRecurrence(task.recurrence);
	if (stripped === task.recurrence) {
		return task;
	}
	return { ...task, recurrence: stripped };
}

// ── Alias exports (non-prefixed names used by test files) ───────────────────

export { sovfGetRecurrenceEndAfterDoneCount as getRecurrenceEndAfterDoneCount };
export { sovfStripEndAfterDoneFromRecurrence as stripEndAfterDoneFromRecurrence };

/**
 * Determine whether a task object has reached its ENDONDONE completion cap.
 */
export function isRecurrenceTerminated(task: {
	recurrence?: string;
	complete_instances?: string[];
}): boolean {
	return sovfWillTerminateOnCompletion(task.recurrence, task.complete_instances?.length ?? 0);
}