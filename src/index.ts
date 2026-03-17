/**
 * @mdp/ai-sdk-agent-tools
 *
 * Comprehensive agent toolkit for Vercel AI SDK v6.
 * Provides file editing, filesystem, bash, web fetch, todo, and sub-agent tools.
 */

// Combined factory
export { createAgentTools } from "./create-agent-tools.js";

// File editing tools
export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createMultiEditTool,
  createFileEditTools,
  type FileEditToolsOptions,
} from "./file/tools.js";

// File state utilities
export {
  recordRead,
  getReadTime,
  clearSession,
  assertFileNotModified,
  withFileLock,
  createDiff,
} from "./file/file-state.js";

// Replacer utilities
export {
  replace,
  levenshtein,
  similarity,
  REPLACERS,
  type Replacer,
} from "./file/replacers.js";

// Filesystem tools
export {
  createListTool,
  createGlobTool,
  createGrepTool,
  createFsTools,
} from "./fs/tools.js";

// Bash tool
export { createBashTool } from "./bash/tools.js";

// Web fetch tool
export { createWebFetchTool } from "./web/tools.js";

// Todo tools
export {
  createTodoReadTool,
  createTodoWriteTool,
  createTodoTools,
} from "./todo/tools.js";
export { getTodos, setTodos, clearTodos, type TodoItem } from "./todo/state.js";

// Task (sub-agent) tool
export { createTaskTool } from "./task/tools.js";

// Types
export type {
  BaseToolOptions,
  SessionToolOptions,
  BashToolOptions,
  FsToolOptions,
  WebFetchToolOptions,
  TodoToolOptions,
  TaskToolOptions,
  AgentToolsOptions,
} from "./types.js";
