	/**
	 * sovf4717 - Independent Obsidian plugin entry point.
	 *
	 * Standalone Obsidian plugin (id: tasknotes-plugin-sovf) that extends TaskNotes
	 * WITHOUT modifying any TaskNotes source files.
	 *
	 * It works entirely through TaskNotes' public API (`.api`), which is a
	 * TaskNotesAPI instance. Events are exposed under `api.events` (on/off),
	 * task mutations under `api.tasks`. We also drive the vault's markdown
	 * frontmatter directly for sovf-specific fields (completedAt,
	 * completedAtInstances, endAfterDoneCount) because those are sovf extensions.
	 *
	 * Features wired here:
	 *   1. Agenda completion-time insert: on task completion, insert "HH:mm
	 *      taskTitle" into every note that embeds agenda-default.base.
	 *   2. Diary calendar navigation: when the active file is a YYYY-MM-DD note,
	 *      ask TaskNotes to jump its calendar/agenda to that date.
	 *   3. ENDONDONE: recurring tasks may carry an `endAfterDoneCount`
	 *      frontmatter cap; after that many completions the recurrence is
	 *      removed so the task stops appearing on future dates.
	 *   4. completedAtInstances: per-occurrence local completion times recorded
	 *      to frontmatter without clobbering previously recorded dates.
	 */

import { App, EventRef, Notice, Plugin, TFile, parseYaml, stringifyYaml } from "obsidian";
import { sovfGetCurrentTimeLabel, sovfInsertAgendaCompletionLine } from "./sovf_agendaCompletionInsert";
import {
	sovfBuildCompletedAtValue,
	sovfNormalizeCompletedAtInstances,
	sovfGetCompletedAtTimeForDate,
	SOVF_COMPLETED_AT_INSTANCES_PROPERTY,
	SOVF_COMPLETED_AT_PROPERTY,
} from "./sovf_completedAtInstances";
import {
	SOVF_END_AFTER_DONE_COUNT_PROPERTY,
	sovfEndAfterDoneCountFromTask,
	sovfNormalizeEndOnDoneRecurrence,
} from "./sovf_endOnDone";
import { sovfResolveDailyNoteDate } from "./sovf_calendarNavigation";

// ─── Minimal public-ABI shapes (no tasknotes source imports) ────────────────

// TaskInfo-like shape as exposed by the TaskNotes public API.
interface SovfTaskInfo {
	path: string;
	title?: string;
	status?: string;
	recurrence?: string;
	complete_instances?: string[];
	archived?: boolean;
	scheduled?: string;
	customProperties?: Record<string, unknown>;
	[key: string]: unknown;
}

// Event payload shape emitted by api.events.
interface SovfTaskEventPayload {
	event: string;
	timestamp: string;
	taskPath?: string;
	task?: SovfTaskInfo;
	before?: SovfTaskInfo;
	after?: SovfTaskInfo;
	changes?: Record<string, unknown>;
	[key: string]: unknown;
}

// The `events` facade of TaskNotesAPI: api.events.on/off/list.
interface SovfEventsFacade {
	on: (event: string, handler: (payload: SovfTaskEventPayload) => void) => EventRef | unknown;
	off: (ref: EventRef | unknown) => void;
}

// The `tasks` facade of TaskNotesAPI.
interface SovfTasksFacade {
	get: (path: string) => Promise<SovfTaskInfo | null>;
	update: (
		path: string,
		patch: Record<string, unknown>,
		context?: unknown
	) => Promise<SovfTaskInfo>;
}

// The public API surface of tasknotes we rely on. Mirrors a subset of
// TaskNotesPublicAPI so we never import tasknotes source (keeps merge safety).
interface SovfTaskNotesPublicApi {
	events: SovfEventsFacade;
	tasks: SovfTasksFacade;
}

interface SovfTaskNotesPlugin {
	api?: SovfTaskNotesPublicApi;
	// TaskNotes also exposes navigateToDailyNote on the plugin itself.
	navigateToDailyNote?: (date: Date, options?: { isAlreadyLocal?: boolean }) => Promise<void>;
}

/** Poll until the tasknotes plugin instance (and its .api) is available. */
async function waitForTaskNotesPlugin(
	app: App,
	maxAttempts = 140,
	intervalMs = 500
): Promise<SovfTaskNotesPlugin | null> {
	for (let i = 0; i < maxAttempts; i++) {
		const pluginsService = (app as unknown as {
			plugins?: { getPlugin(id: string): unknown };
		}).plugins;
		const instance = (pluginsService?.getPlugin("tasknotes") ?? null) as SovfTaskNotesPlugin | null;
		if (instance && instance.api && instance.api.events) {
			return instance;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return null;
}

/** Find all markdown files whose content embeds the given base file. */
async function findBaseEmbedFiles(app: App, basePath: string): Promise<string[]> {
	const EMBED_SUBSTRING = `![[${basePath}]]`;
	const result: string[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		try {
			const cachedContent = await app.vault.cachedRead(file);
			if (cachedContent && cachedContent.includes(EMBED_SUBSTRING)) {
				result.push(file.path);
			}
		} catch {
			// Skip unreadable files
		}
	}
	return result;
}

/**
 * From a list of candidate diary paths (notes embedding the agenda base),
 * return only those whose resolved date matches the given occurrence date.
 * Falls back to the candidate(s) whose date is today when no candidate
 * matches the occurrence date exactly.
 */
function pickDiaryForDate(
	candidates: string[],
	occurrenceDate: string,
	todayStr: string
): string[] {
	if (candidates.length === 0) return [];
	const matched = candidates.filter(
		(p) => sovfResolveDailyNoteDate(p) === occurrenceDate
	);
	if (matched.length > 0) return matched;
	// Fall back to today's diary if the occurrence-date diary doesn't exist.
	const todayMatched = candidates.filter(
		(p) => sovfResolveDailyNoteDate(p) === todayStr
	);
	return todayMatched.length > 0 ? todayMatched : [candidates[0]];
}

// ─── Plugin class ────────────────────────────────────────────────────────────

export default class Sovf4717Plugin extends Plugin {
	private tasknotes: SovfTaskNotesPlugin | null = null;
	private eventRefs: Array<EventRef | unknown> = [];
	private agendaRefreshIntervalId: number | null = null;

	// The base file path that hosts the agenda view we insert into.
	private static readonly AGENDA_BASE = "TaskNotes/Views/agenda-default.base";
	// The embed marker string that must appear in the active note for insertion.
	private static readonly AGENDA_EMBED_MARKER = "![[TaskNotes/Views/agenda-default.base]]";

	async onload(): Promise<void> {
		// Wait for tasknotes to load and expose its public .api.
		this.tasknotes = await waitForTaskNotesPlugin(this.app);

		if (!this.tasknotes) {
			new Notice(
				"[sovf4717] TaskNotes (with .api) not found; sovf extensions idle.",
				8000
			);
			return;
		}

		this.registerCompletionSideEffects();
		this.registerDiaryNavigation();
	}

	async onunload(): Promise<void> {
		if (this.agendaRefreshIntervalId !== null) {
			window.clearInterval(this.agendaRefreshIntervalId);
			this.agendaRefreshIntervalId = null;
		}
		// Detach tasknotes event refs via api.events.off()
		const api = this.tasknotes?.api;
		if (api) {
			for (const ref of this.eventRefs) {
				try {
					api.events.off(ref as EventRef);
				} catch {
					// Ignore detach errors
				}
			}
		}
		this.eventRefs = [];
	}

	// ── Task completion side effects (agenda insert + ENDONDONE + completedAt) ─

	/**
	 * On task completion:
	 *   - insert "HH:mm taskTitle" into each note embedding the agenda base
	 *   - record per-occurrence completedAtInstances in the task frontmatter
	 *   - enforce ENDONDONE: clear recurrence once the completion cap is met
	 */
	private registerCompletionSideEffects(): void {
		const app = this.app;
		const api = this.tasknotes!.api!;

		// De-dup: recurring completion can fire both a `task.updated`-derived
		// completion and `recurring.instance.completed` for the same
		// (path, occurrenceDate) within a short window.
		const handled = new Map<string, number>();
		const DEDUP_WINDOW_MS = 15_000;

		// Resolve the occurrence date this completion belongs to. Prefer the
		// newest complete_instances entry (TaskNotes appends the new date at
		// the end); fall back to the scheduled date, then to today.
		// Resolve the occurrence date this completion belongs to. Prefer the
		// newest complete_instances entry (TaskNotes appends the new date at
		// the end); fall back to the scheduled date, then to today.
		// Resolve the occurrence date this completion belongs to. Use the
		// materialized occurrence's own date (`occurrence_date` / `occurrenceDate`
		// custom property) when present — TaskNotes sets it on recurring tasks
		// — else the newest complete_instances entry, else scheduled, else today.
		const resolveOccurrenceDate = (
			beforeTask: SovfTaskInfo | undefined | null,
			afterTask: SovfTaskInfo | undefined | null
		): string => {
			const after = afterTask;

			// 1) Authoritative source: the occurrence's own target date.
			const occurrenceDateField =
				(typeof after?.occurrence_date === "string" && after.occurrence_date) ||
				"";
			if (occurrenceDateField) return occurrenceDateField;

			// 2) Newest complete_instances entry (TaskNotes appends the new date
			//    at the end when a recurring instance is completed).
			const completeInstances: string[] =
				(after?.complete_instances as string[] | undefined) ??
				(after?.customProperties?.complete_instances as string[] | undefined) ??
				[];
			const beforeComplete: string[] =
				(beforeTask?.complete_instances as string[] | undefined) ??
				(beforeTask?.customProperties?.complete_instances as string[] | undefined) ??
				[];
			if (completeInstances.length > beforeComplete.length) {
				const newOnes = completeInstances.slice(beforeComplete.length);
				if (newOnes.length > 0) return newOnes[newOnes.length - 1];
			}

			// 3) Scheduled date (the occurrence the task is anchored to).
			const scheduled =
				(typeof after?.scheduled === "string" && after.scheduled) ||
				(typeof beforeTask?.scheduled === "string" && beforeTask.scheduled) ||
				"";

			// 4) Fall back to today.
			return scheduled || this.todayString();
		};

		const handleCompletion = async (
			payload: SovfTaskEventPayload
		): Promise<void> => {
			const beforeTask = payload.before;
			const afterTask = payload.after ?? payload.task;
			const taskPath = payload.taskPath ?? afterTask?.path ?? beforeTask?.path;
			if (!taskPath) return;

			const occurrenceDate = resolveOccurrenceDate(beforeTask, afterTask);
			const dedupKey = `${taskPath}\u0000${occurrenceDate}`;
			const last = handled.get(dedupKey);
			const nowTs = Date.now();
			if (last !== undefined && nowTs - last < DEDUP_WINDOW_MS) return;
			handled.set(dedupKey, nowTs);

			// Prune the dedup map to avoid unbounded growth.
			if (handled.size > 512) {
				for (const [key, ts] of handled) {
					if (nowTs - ts > DEDUP_WINDOW_MS) handled.delete(key);
				}
			}

			// 1) Write per-occurrence completedAtInstances + ENDONDONE to the
			//    task's own frontmatter first, so we can read the real
			//    completion time of this occurrence back for the diary line.
			await this.applyCompletionSideEffects(taskPath, afterTask, occurrenceDate);

			// 2) Resolve the task title robustly: payload (after -> before) -> API -> filename fallback.
			let taskTitle = afterTask?.title;
			if (!taskTitle) {
				taskTitle = beforeTask?.title;
			}
			if (!taskTitle) {
				try {
					const fullTask = await api.tasks.get(taskPath);
					taskTitle = fullTask?.title;
				} catch {
					/* ignore */
				}
			}
			if (!taskTitle) {
				taskTitle = taskPath.replace(/\.md$/i, "").replace(/^.*\//, "");
			}

			// 3) Time label: prefer the recorded completion time for THIS occurrence
			//    (B1), falling back to the trigger-time label when no recorded value
			//    exists (e.g. a one-shot task just completed now).
			const taskFile = app.vault.getAbstractFileByPath(taskPath);
			let recordedTime = "";
			if (taskFile instanceof TFile) {
				try {
					const raw = await app.vault.read(taskFile);
					const parsed = this.parseFrontmatter(raw);
					if (parsed) {
						recordedTime =
							sovfGetCompletedAtTimeForDate(
								parsed.frontmatter,
								occurrenceDate,
								[parsed.frontmatter[SOVF_COMPLETED_AT_PROPERTY]]
							) ??
							"";
					}
				} catch {
					/* ignore */
				}
			}
			const timeLabel = recordedTime || sovfGetCurrentTimeLabel();

			// 4) Insert the completion line into the CURRENTLY ACTIVE diary file
			//    (the one the user is looking at), just above the embed.
			//    We only touch a file when it actually embeds the agenda base.
			const activeFile = app.workspace.getActiveFile();
			if (activeFile && activeFile instanceof TFile) {
				const activeContent = await app.vault.read(activeFile);
				if (activeContent.includes(Sovf4717Plugin.AGENDA_EMBED_MARKER)) {
					try {
						const updated = sovfInsertAgendaCompletionLine(
							activeContent,
							taskTitle,
							timeLabel
						);
						if (updated !== activeContent) {
							await app.vault.modify(activeFile, updated);
						}
					} catch {
						// Silently ignore read/write errors
					}
				}
			}
		};

		// Register listeners via the api.events facade.
		try {
			const completedRef = api.events.on("task.completed", (payload) => {
				void handleCompletion(payload);
			});
			this.eventRefs.push(completedRef);
		} catch (error) {
			console.error("[sovf4717] Failed to register task.completed listener:", error);
		}

		// Recurring tasks do NOT fire task.completed (status is unchanged; only
		// complete_instances grows), so also listen for the recurring event.
		try {
			const recurringRef = api.events.on("recurring.instance.completed", (payload) => {
				void handleCompletion(payload);
			});
			this.eventRefs.push(recurringRef);
		} catch (error) {
			console.error(
				"[sovf4717] Failed to register recurring.instance.completed listener:",
				error
			);
		}
	}
	private async applyCompletionSideEffects(
		taskPath: string,
		afterTask: SovfTaskInfo | undefined,
		occurrenceDate?: string
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(taskPath);
		if (!(file instanceof TFile)) return;

		let raw: string;
		try {
			raw = await this.app.vault.read(file);
		} catch {
			return;
		}

		const parsed = this.parseFrontmatter(raw);
		if (!parsed) return;

		const { frontmatter, body } = parsed;

		// Determine the occurrence date this completion belongs to. Prefer the
		// caller-resolved date (newest complete_instances entry), else the
		// task's scheduled date, else today.
		const occurrenceDateValue =
			occurrenceDate ||
			(typeof afterTask?.scheduled === "string" && afterTask.scheduled) ||
			(typeof frontmatter.scheduled === "string" && frontmatter.scheduled) ||
			this.todayString();

		// completedAtInstances: upsert the occurrence's local completion time.
		// Do NOT clobber other recorded dates.
		const instances = sovfNormalizeCompletedAtInstances(
			frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY]
		);
		const now = new Date();
		const todayStr = this.todayString();
		const hh = String(now.getHours()).padStart(2, "0");
		const mm = String(now.getMinutes()).padStart(2, "0");
		// For today's occurrence record the real clock time; for back-dated
		// occurrences record midnight so we don't fabricate a time.
		const atValue =
			occurrenceDateValue === todayStr
				? `${todayStr}T${hh}:${mm}`
				: sovfBuildCompletedAtValue(occurrenceDateValue);
		const existing = instances.find((i) => i.date === occurrenceDateValue);
		if (existing) {
			existing.at = atValue;
		} else {
			instances.push({ date: occurrenceDateValue, at: atValue });
		}
		frontmatter[SOVF_COMPLETED_AT_INSTANCES_PROPERTY] = instances;

		// Also keep the single-valued completedAt (used by the base formula).
		frontmatter[SOVF_COMPLETED_AT_PROPERTY] = atValue;

		// ENDONDONE: if this is a recurring task with an endAfterDoneCount cap
		// and we have now reached it, clear the recurrence so future dates no
		// longer show the task. Use the complete_instances count after this
		// completion (the tasknotes updater already appended the occurrence).
		const recurrence = (frontmatter.recurrence as string) || afterTask?.recurrence;
		const completeInstances =
			(frontmatter.complete_instances as string[] | undefined) ??
			afterTask?.complete_instances ??
			[];
		const cap = sovfEndAfterDoneCountFromTask({
			frontmatter,
			recurrence,
			completeInstances,
		});
		// 1) Normalize so the TaskNotes model actually enforces the cap: rewrite
		//    a non-standard ENDONDONE=N token into a standard COUNT=N (the only
		//    bound the upstream recurrence engine understands).
		if (typeof frontmatter.recurrence === "string") {
			const normalized = sovfNormalizeEndOnDoneRecurrence(
				frontmatter.recurrence,
				sovfEndAfterDoneCountFromTask({ frontmatter })
			);
			if (normalized !== undefined && normalized !== frontmatter.recurrence) {
				frontmatter.recurrence = normalized;
			}
		}

		// 2) If the cap has been reached, fully terminate the recurrence.
		if (cap !== null && completeInstances.length >= cap) {
			delete frontmatter.recurrence;
			delete frontmatter[SOVF_END_AFTER_DONE_COUNT_PROPERTY];
		}

		const updated = this.serializeFrontmatter(frontmatter, body);
		await this.app.vault.modify(file, updated);
	}

	// ── Diary calendar navigation ──────────────────────────────────────────

private registerDiaryNavigation(): void {
		const workspace = this.app.workspace;
		let lastDailyNoteDate: string | null = null;

		const tryNavigateToDiaryNote = (): void => {
			const activeFile = workspace.getActiveFile();
			if (!activeFile) return;

			const dateStr = sovfResolveDailyNoteDate(activeFile.path);
			if (!dateStr || dateStr === lastDailyNoteDate) return;
			lastDailyNoteDate = dateStr;

			// 1) Ask TaskNotes to open the daily note (keeps existing behaviour).
			const plugin = this.tasknotes;
			if (plugin && typeof plugin.navigateToDailyNote === "function") {
				const [y, m, d] = dateStr.split("-").map(Number);
				const localDate = new Date(y, m - 1, d);
				void plugin.navigateToDailyNote(localDate, { isAlreadyLocal: true });
			}

			// 2) Drive the embedded Bases calendar to this date by updating the
			//    `initialDate` field in the agenda-default.base file. TaskNotes'
			//    CalendarView only calls gotoDate() when the initialDate config
			//    value changes (detected via shouldPreserveVisibleDateOnCalendarRecreate),
			//    so writing a new initialDate triggers the navigation.
			void this.updateAgendaBaseInitialDate(dateStr);
		};

		this.registerEvent(workspace.on("active-leaf-change", tryNavigateToDiaryNote));
		this.registerEvent(workspace.on("file-open", tryNavigateToDiaryNote));
	}

	/**
	 * Update the `initialDate` field in agenda-default.base to the given date string.
	 * This causes TaskNotes' Bases calendar to navigate to that date on next refresh.
	 */
	private async updateAgendaBaseInitialDate(dateStr: string): Promise<void> {
		const baseFile = this.app.vault.getAbstractFileByPath(
			Sovf4717Plugin.AGENDA_BASE
		) as TFile | null;
		if (!baseFile || !(baseFile instanceof TFile)) return;

		try {
			const raw = await this.app.vault.read(baseFile);
			// Replace or insert the initialDate line with the new date.
			const lines = raw.split("\n");
			let found = false;
			for (let i = 0; i < lines.length; i++) {
				if (/^\s*initialDate:/.test(lines[i])) {
					lines[i] = lines[i].replace(/^\s*initialDate:.*/, `    initialDate: "${dateStr}"`);
					found = true;
					break;
				}
			}
			if (!found) {
				// Append initialDate before the first closing brace or at the end of the view block
				lines.push(`    initialDate: "${dateStr}"`);
			}
			const updated = lines.join("\n");
			if (updated !== raw) {
				await this.app.vault.modify(baseFile, updated);
			}
		} catch {
			// Ignore write errors; navigation still works via navigateToDailyNote.
		}
	}
	// ── Frontmatter helpers ─────────────────────────────────────────────────

	private todayString(): string {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
			now.getDate()
		).padStart(2, "0")}`;
	}

	/** Parse a markdown note's YAML frontmatter into a record + body. */
	private parseFrontmatter(
		raw: string
	): { frontmatter: Record<string, unknown>; body: string } | null {
		const trimmed = raw.replace(/^\uFEFF/, "");
		if (!trimmed.startsWith("---")) return null;
		const secondDashes = trimmed.indexOf("\n---", 3);
		if (secondDashes === -1) return null;
		const yamlText = trimmed.slice(4, secondDashes);
		let frontmatter: Record<string, unknown>;
		try {
			const data = parseYaml(yamlText) as Record<string, unknown> | null;
			frontmatter = data ?? {};
		} catch {
			return null;
		}
		// Body begins after the closing "---" line.
		const afterClose = secondDashes + 4; // skip "\n---"
		const body = trimmed.slice(afterClose).replace(/^\n/, "");
		return { frontmatter, body };
	}

	/** Serialize frontmatter back to a markdown note. */
	private serializeFrontmatter(
		frontmatter: Record<string, unknown>,
		body: string
	): string {
		const yamlText = stringifyYaml(frontmatter);
		return `---\n${yamlText}---\n${body}`;
	}
}
