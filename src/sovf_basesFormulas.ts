/**
 * sovf4717 - Bases formula and template extensions.
 * Adds completedAtTime formula and agenda sorting by completion time.
 * Self-contained; no tasknotes imports.
 */

const completedAtProperty = "completedAt";
const completedAtInstancesProperty = "completedAtInstances";

/**
 * Generate the sovf-specific Bases formulas that extend the upstream set.
 * These formulas should be merged into the result of generateAllFormulas().
 */
export function sovfGenerateExtraFormulas(): Record<string, string> {
	return {
		// Completion time of day (HH:mm) recorded when a task was marked complete.
		// Prefer the per-occurrence history (completedAtInstances) so a recurring
		// task shows the most recently completed occurrence's time; fall back to
		// the single completedAt field when no per-occurrence data exists.
		completedAtTime: `if(${completedAtInstancesProperty} && list(${completedAtInstancesProperty}).length > 0, date(list(${completedAtInstancesProperty}).last().at).format("HH:mm"), if(${completedAtProperty}, date(${completedAtProperty}).format("HH:mm"), ""))`,
	};
}

/**
 * Return the agenda order array with completedAtTime inserted after dueIn.
 * This should be used when generating the agenda Bases template.
 */
export function sovfAgendaOrderArray(baseOrder: string[]): string[] {
	const result = [...baseOrder];
	const dueInIndex = result.indexOf("formula.dueIn");
	const insertIndex = dueInIndex >= 0 ? dueInIndex + 1 : result.length;
	result.splice(insertIndex, 0, "formula.completedAtTime");
	return result;
}

/**
 * Return the agenda properties YAML block including completedAtTime.
 */
export function sovfAgendaPropertiesYaml(hasDueIn: boolean): string {
	if (hasDueIn) {
		return `
properties:
  formula.dueIn:
    displayName: Due in
  formula.completedAtTime:
    displayName: Completed at
`;
	}
	return `
properties:
  formula.completedAtTime:
    displayName: Completed at
`;
}