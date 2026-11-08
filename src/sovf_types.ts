/**
 * sovf4717 - Shared types for sovf extensions.
 * Independent Obsidian plugin: does not import from tasknotes source.
 */

/**
 * Recorded completion time of a single recurring-task occurrence.
 */
export interface SovfCompletedAtInstance {
	date: string; // Occurrence date (YYYY-MM-DD)
	at: string; // Local date-time (YYYY-MM-DDTHH:mm) when that occurrence was completed
}

/**
 * Minimal shape of a tasknotes task as seen from the outside.
 */
export interface SovfTaskLike {
	path: string;
	title: string;
	status?: string;
	complete_instances?: string[];
	recurrence?: string;
	// customProperties is how tasknotes exposes extra frontmatter fields
	customProperties?: Record<string, unknown>;
	completedAt?: string;
	completedAtInstances?: SovfCompletedAtInstance[];
}

/**
 * Minimal shape of the tasknotes plugin instance that sovf4717 depends on.
 */
export interface SovfTaskNotesPluginLike {
	/** Obsidian app instance */
	app: {
		vault: {
			read: (file: { path: string }) => Promise<string>;
			modify: (file: { path: string }, newContent: string) => Promise<void>;
			cachedRead: (file: { path: string }) => Promise<string | null>;
			on: (event: string, cb: (...args: unknown[]) => void) => unknown;
		};
		workspace: {
			on: (event: string, cb: (...args: unknown[]) => void) => unknown;
			getActiveFile: () => { path: string } | null;
		};
	};
	/**
	 * TaskNotes event emitter (inherits Obsidian `Events`).
	 * Fires events like "task-updated", "data-changed", etc.
	 */
	emitter: {
		on: (event: string, cb: (...args: unknown[]) => void) => unknown;
		offref: (ref: unknown) => void;
	};
	onUnloaded?: () => void;
}