# TaskNotes SOVF - 个人扩展插件（tasknotes-plugin-sovf）

面向 [TaskNotes](https://github.com/callumalpass/tasknotes) 的个人伴生扩展插件。
本插件通过 TaskNotes 的**公共 API**（`.api`）工作，**不修改任何 TaskNotes 源码**，
因此与上游 TaskNotes 更新保持零冲突（上游 `git pull` 不会发生合并冲突）。

## 功能

- **Agenda 完成时间插入**：当 `agenda-default.base` 中的任务被勾选完成时，会在
  嵌入该 agenda base 的笔记中（即包含 `![[TaskNotes/Views/agenda-default.base]]` 的那行下方）
  插入一行 `HH:mm 任务名称`。例如在 7 点完成任务「背单词」，则插入 `7:00 背单词`。
- **每日笔记日历联动导航**：切换到某一天的日记/每日笔记时，自动把所有已注册的
  日历视图导航到对应日期。
- **ENDONDONE（完成 N 次后停止）重复规则**：为非标准 RRULE 属性 `ENDONDONE=n` 提供支持，
  使重复任务在完成 n 次后自动终止；并维护 `completedAt`（按次记录的完成时间）。
- **按次完成时间追踪（completedAt）**：为每个重复任务的发生日期记录本地完成时间，
  完成某一天不会覆盖其他已记录日期的时间。

## 运行前提

- 已安装并启用 [TaskNotes](https://github.com/callumalpass/tasknotes) 插件（版本 >= 4.13.x）。
- Obsidian >= 1.12.2。
- 本插件**依赖** TaskNotes 暴露的公共 API；若 TaskNotes 未加载，本插件会保持空闲并输出警告日志。

## 安装 / 构建

本仓库是一个独立 Obsidian 插件（`manifest.json` 中 `id = tasknotes-plugin-sovf`）。

```powershell
# 1. 安装依赖
npm install

# 2. 类型检查 + 生产构建（esbuild 产出 main.js）
npm run build

# 3. 一键构建并复制产物到 Obsidian 插件目录（默认：C:\Users\sovf\Documents\Obsidian Vault\.obsidian\plugins\tasknotes-plugin-sovf）
.\build.ps1

# 或者手动复制产物
npm run copy
```

`build.ps1` 会：

1. 若缺少 `node_modules` 则先执行 `npm install`；
2. 执行 `npm run build`（tsc 类型检查 + esbuild 生产打包）；
3. 校验产物（`main.js` / `manifest.json` / `versions.json`）存在；
4. 将产物复制到 Obsidian vault 的 `.obsidian/plugins/tasknotes-plugin-sovf`，
   这样重新加载（或重启）Obsidian 即可安装/更新成功。

可通过 `-Vault <path>` 或环境变量 `OBSIDIAN_VAULT_PATH` 覆盖目标 vault 路径。
复制完成后，在 Obsidian 中重启或重新加载插件即可生效。

## 目录结构

```
src/
  main.ts                        # 插件入口（等待 tasknotes 公共 API 就绪后注册事件）
  sovf_agendaCompletionInsert.ts # agenda 完成时间插入（纯函数，可单测）
  sovf_calendarNavigation.ts     # 日历视图导航到指定日期
  sovf_recurrence.ts             # ENDONDONE 重复规则解析/剥离
  sovf_recurrenceContextMenu.ts  # 自定义 RRULE 构建（含 ENDONDONE）
  sovf_completedAtInstances.ts   # 按次完成时间（completedAt）工具函数
  sovf_taskRecurringPlanning.ts  # 重复任务完成时的按次时间记录
  sovf_taskPropertyUpdate.ts     # completedAt 属性的写入
  sovf_basesFormulas.ts          # bases/视图 的额外公式辅助
  sovf_types.ts                  # 共享类型
```

## 与 TaskNotes 的关系

- 本插件**只读** TaskNotes 的公共 API 与 vault 文件，不改动 TaskNotes 任何源码。
- 所有功能逻辑均以 `sovf_` 前缀的独立文件实现，保证上游合并零冲突。
- 安装时请确保与 TaskNotes 共存于同一 vault；本插件文件夹名为 `tasknotes-plugin-sovf`。

## 许可

MIT。