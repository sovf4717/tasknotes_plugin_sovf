/**
 * sovf4717 - Task property update helpers.
 * Writes completedAt / completedAtInstances to frontmatter alongside
 * the upstream completedDate when a task is marked complete.
 * Self-contained; no tasknotes imports.
 */

import {
	SOVF_COMPLETED_AT_INSTANCES_PROPERTY,
	SOVF_COMPLETED_AT_PROPERTY,
	sovfBuildCompletedAtValue,
	sovfNormalizeCompletedAtInstances,
	sovfRemoveCompletedAtInstance,
	sovfUpsertCompletedAtInstanceList,
} from "./sovf_completedAtInstances";

export { SOVF_COMPLETED_AT_INSTANCES_PROPERTY, SOVF_COMPLETED_AT_PROPERTY };

/**
 * Get the current local date-time string in "YYYY-MM-DDTHH:mm" format.
 */
export function sovfGetCurrentDateTimeString(): string {
	return sovfBuildCompletedAtValue(
		`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(
			new Date().getDate()
		).padStart(2, "0")}`
	);
}

/**
 * Write the completedAt field to frontmatter when a task is marked complete.
 * Pass isCompleted=false to clear it.
 */
export function sovfWriteCompletedAt(
	frontmatter: Record<string, unknown>,
	isCompleted: boolean,
	currentDateTime?: string
): void {
	const dateTime = currentDateTime ?? sovfGetCurrentDateTimeString();
	if (isCompleted) {
		frontmatter[SOVF_COMPLETED_AT_PROPERTY] = dateTime;
	} else {
		delete frontmatter[SOVF_COMPLETED_AT_PROPERTY];
	}
}

/**
 * Write the completedAtInstances field to frontmatter for recurring tasks.
 * - isCompleted=true: upsert the occurrence date with current timestamp
 * - isCompleted=false: remove the occurrence date
 */
export function sovfWriteCompletedAtInstances(
	frontmatter: Record<string, unknown>,
	isCompleted: boolean,
	dateStr: string,
	completedAtValue?: string
): void {
	let instances = sovfNormalizeCompletedAtInstances(
		frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY]
	);
	if (isCompleted && completedAtValue) {
		instances = sovfUpsertCompletedAtInstanceList(instances, dateStr, completedAtValue);
	} else if (!isCompleted) {
		instances = sovfRemoveCompletedAtInstance(instances, dateStr);
	}
	if (instances.length > 0) {
		frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY] = instances;
	} else {
		delete frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY];
	}
}