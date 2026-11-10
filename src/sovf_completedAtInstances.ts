/**
 * sovf4717 - completedAtInstances utility.
 *
 * Records and manages per-occurrence completion timestamps for recurring tasks.
 * Stored in frontmatter as a list of {date, at} objects.
 * Self-contained; no tasknotes imports.
 */

import type { SovfCompletedAtInstance } from "./sovf_types";

export const SOVF_COMPLETED_AT_INSTANCES_PROPERTY = "completedAtInstances";
export const SOVF_COMPLETED_AT_PROPERTY = "completedAt";
/**
 * Build a completion timestamp value in "YYYY-MM-DDTHH:mm" format.
 * Always records the actual clock time at the moment of completion.
 */
export function sovfBuildCompletedAtValue(occurrenceDate: string, now: Date = new Date()): string {
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	return `${occurrenceDate}T${hh}:${mm}`;
}

/**
 * Parse and validate a single raw frontmatter value into a SovfCompletedAtInstance.
 */
export function sovfParseCompletedAtInstance(value: unknown): SovfCompletedAtInstance | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const date = typeof record.date === "string" ? record.date.trim() : "";
	const at = typeof record.at === "string" ? record.at.trim() : "";
	if (!/\d{4}-\d{2}-\d{2}/.test(date) || at.length < 16) {
		return null;
	}
	return { date, at };
}

/**
 * Normalize a raw frontmatter value into a clean SovfCompletedAtInstance array.
 * Deduplicates by date (latest entry wins).
 */
export function sovfNormalizeCompletedAtInstances(value: unknown): SovfCompletedAtInstance[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = new Map<string, SovfCompletedAtInstance>();
	for (const raw of value) {
		const entry = sovfParseCompletedAtInstance(raw);
		if (entry) {
			seen.set(entry.date, entry);
		}
	}
	return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Upsert a completion timestamp for a given date in the instance list.
 */
export function sovfUpsertCompletedAtInstanceList(
	value: unknown,
	dateStr: string,
	at: string
): SovfCompletedAtInstance[] {
	const list = sovfNormalizeCompletedAtInstances(value);
	const filtered = list.filter((entry) => entry.date !== dateStr);
	filtered.push({ date: dateStr, at });
	return filtered.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Remove a specific date's entry from the instance list.
 */
export function sovfRemoveCompletedAtInstance(
	value: unknown,
	dateStr: string
): SovfCompletedAtInstance[] {
	return sovfNormalizeCompletedAtInstances(value).filter((entry) => entry.date !== dateStr);
}

/**
 * Keep only the entries whose occurrence date is strictly before the given date.
 */
export function sovfFilterCompletedAtInstancesBefore(
	value: unknown,
	dateStr: string
): SovfCompletedAtInstance[] {
	return sovfNormalizeCompletedAtInstances(value).filter((entry) => entry.date < dateStr);
}

/**
 * Get the "at" value (HH:mm portion) for a given occurrence date, or undefined.
 */
export function sovfGetCompletedAtTimeForDate(
	task: { completedAtInstances?: unknown; customProperties?: Record<string, unknown> } | null | undefined,
	dateStr: string,
	extraSources: readonly unknown[] = []
): string | undefined {
	const sources = [
		task?.completedAtInstances,
		task?.customProperties?.[SOVF_COMPLETED_AT_INSTANCES_PROPERTY],
		...extraSources,
	];
	for (const source of sources) {
		const list = sovfNormalizeCompletedAtInstances(source);
		const found = list.find((entry) => entry.date === dateStr);
		if (found) {
			return sovfFormatCompletedAtTime(found.at);
		}
	}
	return undefined;
}

export function sovfFormatCompletedAtTime(atValue: string): string {
	const match = /^(?:\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(atValue.trim());
	return match ? match[1] : "";
}

// ── Alias exports (non-prefixed names used by test files) ───────────────────

export { sovfBuildCompletedAtValue as buildCompletedAtValue };
export { sovfNormalizeCompletedAtInstances as normalizeCompletedAtInstances };
export { sovfUpsertCompletedAtInstanceList as upsertCompletedAtInstanceList };
export { sovfRemoveCompletedAtInstance as removeCompletedAtInstance };
export { sovfFilterCompletedAtInstancesBefore as filterCompletedAtInstancesBefore };
export { sovfFormatCompletedAtTime as formatCompletedAtTime };
export { sovfGetCompletedAtTimeForDate as getCompletedAtTimeForDate };
export { SOVF_COMPLETED_AT_INSTANCES_PROPERTY as COMPLETED_AT_INSTANCES_PROPERTY };