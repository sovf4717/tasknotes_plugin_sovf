/**
 * sovf4717 - Recurrence context menu extensions.
 * Adds "End after done N times" option to the custom recurrence modal.
 * Standalone; no tasknotes source imports.
 */

/**
 * Input type for building a sovf recurrence rule string.
 */
export interface SovedCustomRecurrenceRuleInput {
	freq: string;
	byWeekDay?: string[];
	byMonthDay?: number[];
	byMonth?: number[];
	bySetPos?: number;
	endType: "never" | "count" | "until" | "doneCount";
	count?: number;
	until: string;
	doneCount?: number;
	monthlyType?: string;
	yearlyType?: string;
}

/**
 * Build a recurrence rule string, optionally with the non-standard
 * ENDONDONE terminator. Does not modify the upstream RecurrenceContextMenu.
 */
export function sovfBuildCustomRecurrenceRule(
	input: SovedCustomRecurrenceRuleInput
): string {
	const parts: string[] = [];
	switch (input.endType) {
		case "count":
			if (input.count && input.count > 0) {
				parts.push(`COUNT=${input.count}`);
			}
			break;
		case "until":
			if (input.until) {
				parts.push(`UNTIL=${input.until.replace(/-/g, "")}`);
			}
			break;
		case "doneCount":
			if (input.doneCount && input.doneCount > 0) {
				parts.push(`ENDONDONE=${input.doneCount}`);
			}
			break;
	}
	return parts.join(";");
}