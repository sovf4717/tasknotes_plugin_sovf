var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => Sovf4717Plugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/sovf_agendaCompletionInsert.ts
var AGENDA_EMBED_PATTERN = /!\[\[TaskNotes\/Views\/agenda-default\.base\]\]/;
function sovfGetCurrentTimeLabel() {
  const now = /* @__PURE__ */ new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
function sovfInsertAgendaCompletionLine(markdownContent, taskTitle, completionTime) {
  const timeLabel = completionTime != null ? completionTime : sovfGetCurrentTimeLabel();
  const embedMatch = AGENDA_EMBED_PATTERN.exec(markdownContent);
  if (!embedMatch) {
    return markdownContent;
  }
  const embedEnd = embedMatch.index + embedMatch[0].length;
  const newlineAfter = markdownContent.indexOf("\n", embedEnd);
  const atEndOfFile = newlineAfter === -1;
  const insertLine = `${timeLabel} ${taskTitle}`;
  if (!atEndOfFile) {
    const nextLine = markdownContent.slice(
      newlineAfter + 1,
      newlineAfter + 1 + insertLine.length
    );
    if (nextLine === insertLine) {
      return markdownContent;
    }
    return markdownContent.slice(0, newlineAfter + 1) + insertLine + "\n" + markdownContent.slice(newlineAfter + 1);
  }
  return markdownContent + "\n" + insertLine + "\n";
}

// src/sovf_calendarNavigation.ts
var registeredCalendars = [];
function sovfNavigateAllCalendarsToDailyNote(dateStr) {
  registeredCalendars.forEach((cal) => {
    if (typeof cal.navigateToDailyNote === "function") {
      cal.navigateToDailyNote(dateStr);
    }
  });
}
var DIARY_FOLDER_NAME = "\u65E5\u8BB0";
var DATED_NOTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
function sovfResolveDailyNoteDate(path) {
  const lastSlash = path.lastIndexOf("/");
  const basename = path.slice(lastSlash + 1).replace(/\.md$/i, "").trim();
  const match = basename.match(DATED_NOTE_PATTERN);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const segments = path.split("/");
  segments.pop();
  const inDiaryFolder = segments.some((segment) => segment === DIARY_FOLDER_NAME);
  if (!inDiaryFolder) return null;
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

// src/main.ts
async function waitForTaskNotesPlugin(app, maxAttempts = 120, intervalMs = 500) {
  var _a;
  for (let i = 0; i < maxAttempts; i++) {
    const pluginsService = app.plugins;
    const instance = (_a = pluginsService == null ? void 0 : pluginsService.getPlugin("tasknotes")) != null ? _a : null;
    if (instance && instance.api) {
      return instance;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
async function findAgendaEmbedFiles(app) {
  const EMBED_SUBSTRING = "![[TaskNotes/Views/agenda-default.base]]";
  const result = [];
  for (const file of app.vault.getMarkdownFiles()) {
    try {
      const cachedContent = await app.vault.cachedRead(file);
      if (cachedContent && cachedContent.includes(EMBED_SUBSTRING)) {
        result.push(file.path);
      }
    } catch (e) {
    }
  }
  return result;
}
var Sovf4717Plugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.tasknotes = null;
    this.eventRefs = [];
    this.agendaRefreshIntervalId = null;
  }
  async onload() {
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
  async onunload() {
    var _a;
    if (this.agendaRefreshIntervalId !== null) {
      window.clearInterval(this.agendaRefreshIntervalId);
      this.agendaRefreshIntervalId = null;
    }
    const api = (_a = this.tasknotes) == null ? void 0 : _a.api;
    if (api) {
      for (const ref of this.eventRefs) {
        try {
          api.off(ref);
        } catch (e) {
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
  registerAgendaCompletionInsert() {
    const app = this.app;
    const api = this.tasknotes.api;
    let agendaEmbedFiles = [];
    void (async () => {
      agendaEmbedFiles = await findAgendaEmbedFiles(app);
    })();
    this.agendaRefreshIntervalId = window.setInterval(
      () => {
        void (async () => {
          agendaEmbedFiles = await findAgendaEmbedFiles(app);
        })();
      },
      3e4
    );
    const handleCompletion = (payload) => {
      var _a, _b;
      const task = (_a = payload.after) != null ? _a : payload.task;
      const taskPath = (_b = task == null ? void 0 : task.path) != null ? _b : payload.taskPath;
      if (!taskPath) return;
      const resolveTitle = async () => {
        var _a2;
        if (task == null ? void 0 : task.title) return task.title;
        try {
          const fullTask = await api.tasks.get(taskPath);
          return (_a2 = fullTask == null ? void 0 : fullTask.title) != null ? _a2 : taskPath.replace(/\.md$/i, "").replace(/^.*\//, "");
        } catch (e) {
          return taskPath.replace(/\.md$/i, "").replace(/^.*\//, "");
        }
      };
      void (async () => {
        const taskTitle = await resolveTitle();
        const timeLabel = sovfGetCurrentTimeLabel();
        for (const embedPath of agendaEmbedFiles) {
          const embedFile = app.vault.getAbstractFileByPath(embedPath);
          if (!(embedFile instanceof import_obsidian.TFile)) continue;
          try {
            const embedContent = await app.vault.read(embedFile);
            const updated = sovfInsertAgendaCompletionLine(embedContent, taskTitle, timeLabel);
            if (updated !== embedContent) {
              await app.vault.modify(embedFile, updated);
            }
          } catch (e) {
          }
        }
      })();
    };
    try {
      const ref1 = api.on("task.completed", handleCompletion);
      const ref2 = api.on("task.status.changed", handleCompletion);
      this.eventRefs.push(ref1, ref2);
    } catch (error) {
      console.error("[sovf4717] Failed to register tasknotes event listeners:", error);
    }
  }
  // ── Diary calendar navigation ──────────────────────────────────────────
  registerDiaryNavigation() {
    const workspace = this.app.workspace;
    let lastDailyNoteDate = null;
    const tryNavigateToDiaryNote = () => {
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
};
