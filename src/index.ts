/**
 * ai-sdk-tools-file-editing
 *
 * Generic file editing tools for Vercel AI SDK v6 agents.
 * Provides read, write, edit, and multi-edit capabilities with fuzzy matching.
 */

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createMultiEditTool,
  createFileEditTools,
  type FileEditToolsOptions,
} from "./tools.js";

export {
  replace,
  levenshtein,
  similarity,
  REPLACERS,
  type Replacer,
} from "./replacers.js";

export {
  recordRead,
  getReadTime,
  clearSession,
  assertFileNotModified,
  withFileLock,
  createDiff,
} from "./file-state.js";
