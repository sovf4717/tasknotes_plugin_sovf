/**
 * sovf4717 - Recurring task completion planning extensions.
 * Records per-occurrence completion times and checks ENDONDONE termination.
 * Standalone; no tasknotes source imports.
 */

import { sovfGetRecurrenceEndAfterDoneCount } from "./sovf_recurrence";
import {
	sovfBuildCompletedAtValue,
	SOVF_COMPLETED_AT_INSTANCES_PROPERTY,
	sovfNormalizeCompletedAtInstances,
	sovfRemoveCompletedAtInstance,
	sovfUpsertCompletedAtInstanceList,
} from "./sovf_completedAtInstances";

export { sovfGetRecurrenceEndAfterDoneCount };

/**
 * Check whether a recurring task should terminate after the next completion.
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
 * Record (or remove) the completion timestamp for a recurring task occurrence.
 * Should be called after the upstream recurring completion plan is built.
 *
 * @param frontmatter - The task's frontmatter object
 * @param isCompleted - Whether the occurrence was just marked complete
 * @param dateStr - The occurrence date (YYYY-MM-DD)
 */
export function sovfRecordRecurringCompletionTime(
	frontmatter: Record<string, unknown>,
	isCompleted: boolean,
	dateStr: string
): void {
	if (isCompleted) {
		const value = sovfBuildCompletedAtValue(dateStr);
		frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY] = sovfUpsertCompletedAtInstanceList(
			sovfNormalizeCompletedAtInstances(frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY]),
			dateStr,
			value
		);
	} else {
		const filtered = sovfRemoveCompletedAtInstance(
			frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY],
			dateStr
		);
		if (filtered.length > 0) {
			frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY] = filtered;
		} else {
			delete frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY];
		}
	}
}