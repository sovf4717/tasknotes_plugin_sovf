/**
 * sovf4717 - Independent Obsidian plugin entry point.
 *
 * Standalone Obsidian plugin (id: sovf4717) that extends TaskNotes
 * WITHOUT modifying any TaskNotes source files.
 *
 * It works entirely through TaskNotes' public API (`.api`):
 *   - waits for tasknotes to load (polls app.plugins.getPlugin("tasknotes"))
 *   - listens for `task.completed` / `task.status.changed` events
 *   - reads the task title via `.api.tasks.get(path)`
 *   - inserts a "HH:mm taskTitle" line into notes that embed the agenda base
 *
 * All feature logic lives in the sovf_ prefixed files in this directory.
 * No TaskNotes source file is modified, so upstream `git pull` stays conflict-free.
 */

import { App, EventRef, Plugin, TFile } from "obsidian";
import { sovfGetCurrentTimeLabel, sovfInsertAgendaCompletionLine } from "./sovf_agendaCompletionInsert";
import { sovfNavigateAllCalendarsToDailyNote, sovfResolveDailyNoteDate } from "./sovf_calendarNavigation";

// ─── Minimal public-ABI shapes (no tasknotes source imports) ────────────────

/**
 * The public API surface of tasknotes we rely on. This mirrors a subset of
 * TaskNotesPublicAPI so we never import tasknotes source (keeps merge safety).
 */
interface SovfTaskNotesPublicApi {
	on: (
		event: string,
		handler: (
			payload: {
				task?: { path: string; title?: string; [k: string]: unknown };
				after?: { path: string; title?: string; [k: string]: unknown };
				before?: { path: string; title?: string; [k: string]: unknown };
				taskPath?: string;
				event: string;
				timestamp: string;
			}
		) => void
	) => EventRef | unknown;
	off: (ref: EventRef | unknown) => void;
	tasks: {
		get: (path: string) => Promise<{ path: string; title?: string; [k: string]: unknown } | null>;
	};
}

interface SovfTaskNotesPlugin {
	api?: SovfTaskNotesPublicApi;
}

/**
 * Poll until the tasknotes plugin instance (and its .api) is available.
 * Returns the plugin, or null if not found within the time budget.
 */
async function waitForTaskNotesPlugin(
	app: App,
	maxAttempts = 120,
	intervalMs = 500
): Promise<SovfTaskNotesPlugin | null> {
	for (let i = 0; i < maxAttempts; i++) {
		const pluginsService = (app as unknown as { plugins?: { getPlugin(id: string): unknown } }).plugins;
			const instance = (pluginsService?.getPlugin("tasknotes") ?? null) as SovfTaskNotesPlugin | null;
		if (instance && instance.api) {
			return instance;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return null;
}

/**
 * Find all markdown files whose cached content embeds the agenda base.
 * Uses Obsidian's cached metadata for speed (no full file reads).
 */
async function findAgendaEmbedFiles(app: App): Promise<string[]> {
	const EMBED_SUBSTRING = "![[TaskNotes/Views/agenda-default.base]]";
	const result: string[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		try {
			// cachedRead returns the raw markdown text without triggering file-read
			// events or writing mtime; it is far more reliable than reading the
			// metadata cache, which does not expose the full document body.
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

// ─── Plugin class ────────────────────────────────────────────────────────────

export default class Sovf4717Plugin extends Plugin {
	private tasknotes: SovfTaskNotesPlugin | null = null;
	private eventRefs: Array<EventRef | unknown> = [];
	private agendaRefreshIntervalId: number | null = null;

	async onload(): Promise<void> {
		// Wait for tasknotes to load and expose its public .api.
		this.tasknotes = await waitForTaskNotesPlugin(this.app);

		if (!this.tasknotes) {
			console.warn(
				"[sovf4717] TaskNotes plugin (with .api) not found. sovf4717 will remain idle."
			);
			return;
		}

		this.registerAgendaCompletionInsert();
		this.registerDiaryNavigation();
	}

	async onunload(): Promise<void> {
		if (this.agendaRefreshIntervalId !== null) {
			window.clearInterval(this.agendaRefreshIntervalId);
			this.agendaRefreshIntervalId = null;
		}
		// Detach tasknotes event refs via .api.off()
		const api = this.tasknotes?.api;
		if (api) {
			for (const ref of this.eventRefs) {
				try {
					api.off(ref as EventRef);
				} catch {
					// Ignore detach errors
				}
			}
		}
		this.eventRefs = [];
	}

	// ── Agenda completion insert ────────────────────────────────────────────

	/**
	 * On any task completion / status→done transition, insert
	 * "HH:mm taskTitle" into each note that embeds the agenda base.
	 */
	private registerAgendaCompletionInsert(): void {
		const app = this.app;
		const api = this.tasknotes!.api!;

		// Cache the list of agenda embed files; refresh every 30s.
		let agendaEmbedFiles: string[] = [];
		void (async () => { agendaEmbedFiles = await findAgendaEmbedFiles(app); })();
		this.agendaRefreshIntervalId = window.setInterval(
			() => { void (async () => { agendaEmbedFiles = await findAgendaEmbedFiles(app); })(); },
			30_000
		);

		/**
		 * Handle a task completion event.
		 * payload.task (or .after) is the completed task; use .path to read title
		 * from the public API if not present in the payload.
		 */
		const handleCompletion = (
			payload: {
				task?: { path: string; title?: string };
				after?: { path: string; title?: string };
				taskPath?: string;
			}
		): void => {
			const task = payload.after ?? payload.task;
			const taskPath = task?.path ?? payload.taskPath;
			if (!taskPath) return;

			// Resolve the task title from the payload or the public API.
			const resolveTitle = async (): Promise<string> => {
				if (task?.title) return task.title;
				try {
					const fullTask = await api.tasks.get(taskPath);
					return fullTask?.title ?? taskPath.replace(/\.md$/i, "").replace(/^.*\//, "");
				} catch {
					return taskPath.replace(/\.md$/i, "").replace(/^.*\//, "");
				}
			};

			void (async () => {
				const taskTitle = await resolveTitle();
				const timeLabel = sovfGetCurrentTimeLabel();

				for (const embedPath of agendaEmbedFiles) {
					const embedFile = app.vault.getAbstractFileByPath(embedPath);
					if (!(embedFile instanceof TFile)) continue;
					try {
						const embedContent = await app.vault.read(embedFile);
						const updated = sovfInsertAgendaCompletionLine(embedContent, taskTitle, timeLabel);
						if (updated !== embedContent) {
							await app.vault.modify(embedFile, updated);
						}
					} catch {
						// Silently ignore read/write errors
					}
				}
			})();
		};

		// Register listeners via tasknotes public .api.
		// "task.completed" fires when a task is explicitly marked complete.
		// "task.status.changed" catches status→done transitions too.
		try {
			const ref1 = api.on("task.completed", handleCompletion as never);
			const ref2 = api.on("task.status.changed", handleCompletion as never);
			this.eventRefs.push(ref1, ref2);
		} catch (error) {
			console.error("[sovf4717] Failed to register tasknotes event listeners:", error);
		}
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
			sovfNavigateAllCalendarsToDailyNote(dateStr);
		};

		this.registerEvent(workspace.on("active-leaf-change", tryNavigateToDiaryNote));
		this.registerEvent(workspace.on("file-open", tryNavigateToDiaryNote));
	}
}