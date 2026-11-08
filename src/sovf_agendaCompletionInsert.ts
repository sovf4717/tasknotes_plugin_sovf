/**
 * sovf4717 - Agenda completion insert feature.
 *
 * When a task is marked complete, insert a line like "07:00 背单词"
 * immediately after the `![[TaskNotes/Views/agenda-default.base]]` embed
 * in the markdown note that hosts the agenda view.
 *
 * This module is pure (no Obsidian imports) so it can be unit-tested
 * without a plugin host.
 */

/** The exact embed pattern that triggers insertion. */
const AGENDA_EMBED_PATTERN = /!\[\[TaskNotes\/Views\/agenda-default\.base\]\]/;

/**
 * Get the current local time as "HH:mm" for agenda insertion.
 */
export function sovfGetCurrentTimeLabel(): string {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}

/**
 * Build a completion line string: "HH:mm taskTitle".
 */
export function sovfBuildCompletionLine(taskTitle: string): string {
	return `${sovfGetCurrentTimeLabel()} ${taskTitle}`;
}

/**
 * Insert a completion line immediately after the line containing the agenda
 * embed. The new line is "HH:mm taskTitle" and is placed so the most
 * recently completed task appears first (closest to the embed).
 *
 * @param markdownContent - Full markdown content of the host note
 * @param taskTitle - Title of the completed task
 * @param completionTime - "HH:mm" string (defaults to now)
 * @returns Updated markdown content, or the original if no embed found
 */
export function sovfInsertAgendaCompletionLine(
	markdownContent: string,
	taskTitle: string,
	completionTime?: string
): string {
	const timeLabel = completionTime ?? sovfGetCurrentTimeLabel();
	const embedMatch = AGENDA_EMBED_PATTERN.exec(markdownContent);
	if (!embedMatch) {
		return markdownContent;
	}

	// Find end of the line containing the embed.
	const embedEnd = embedMatch.index + embedMatch[0].length;
	const newlineAfter = markdownContent.indexOf("\n", embedEnd);
	const atEndOfFile = newlineAfter === -1;

	const insertLine = `${timeLabel} ${taskTitle}`;

	// Avoid duplicating an identical line immediately after the embed.
	if (!atEndOfFile) {
		const nextLine = markdownContent.slice(
			newlineAfter + 1,
			newlineAfter + 1 + insertLine.length
		);
		if (nextLine === insertLine) {
			return markdownContent;
		}
		// Normal case: the embed line ends with a newline at `newlineAfter`.
		// Insert the new line right after that newline.
		return (
			markdownContent.slice(0, newlineAfter + 1) +
			insertLine +
			"\n" +
			markdownContent.slice(newlineAfter + 1)
		);
	}

	// EOF case: the embed is the last line with no trailing newline.
	return markdownContent + "\n" + insertLine + "\n";
}