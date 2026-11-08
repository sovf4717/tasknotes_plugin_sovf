/**
 * sovf4717 - Calendar navigation to daily notes.
 *
 * Registers calendar view instances so the plugin can navigate them
 * to the date of the active diary note.
 * Self-contained; no tasknotes imports.
 */

type SovfCalendarViewLike = {
	navigateToDailyNote?: (dateStr: string) => void;
};

let registeredCalendars: SovfCalendarViewLike[] = [];

/**
 * Register a calendar view so sovf4717 can navigate it to a diary date.
 */
export function sovfRegisterCalendarView(view: SovfCalendarViewLike): void {
	if (!registeredCalendars.includes(view)) {
		registeredCalendars.push(view);
	}
}

/**
 * Unregister a calendar view.
 */
export function sovfUnregisterCalendarView(view: SovfCalendarViewLike): void {
	registeredCalendars = registeredCalendars.filter((v) => v !== view);
}

/**
 * Navigate all registered calendar views to the given date string (YYYY-MM-DD).
 */
export function sovfNavigateAllCalendarsToDailyNote(dateStr: string): void {
	registeredCalendars.forEach((cal) => {
		if (typeof cal.navigateToDailyNote === "function") {
			cal.navigateToDailyNote(dateStr);
		}
	});
}

/**
 * Resolve the date a note stands for, or null when it is not a daily note.
 * Prefers a date in the filename. Falls back to today for notes inside the
 * diary folder, whose filenames may not contain a date.
 */
const DIARY_FOLDER_NAME = "日记";
const DATED_NOTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function sovfResolveDailyNoteDate(path: string): string | null {
	const lastSlash = path.lastIndexOf("/");
	const basename = path
		.slice(lastSlash + 1)
		.replace(/\.md$/i, "")
		.trim();
	const match = basename.match(DATED_NOTE_PATTERN);
	if (match) {
		return `${match[1]}-${match[2]}-${match[3]}`;
	}

	const segments = path.split("/");
	segments.pop();
	const inDiaryFolder = segments.some((segment) => segment === DIARY_FOLDER_NAME);
	if (!inDiaryFolder) return null;

	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
		now.getDate()
	).padStart(2, "0")}`;
}