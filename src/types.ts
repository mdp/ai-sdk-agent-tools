/**
 * Shared option interfaces for ai-sdk-agent-tools.
 */

export interface BaseToolOptions {
  /** Base directory to resolve relative paths against. */
  baseDir?: string;
}

export interface SessionToolOptions extends BaseToolOptions {
  /** Session ID for tracking state. @default "default" */
  sessionId?: string;
}

export interface BashToolOptions extends BaseToolOptions {
  /** Allowed command patterns (checked first). If set, only matching commands run. */
  allowedCommands?: RegExp[];
  /** Blocked command patterns (checked after allowed). Matching commands are rejected. */
  blockedCommands?: RegExp[];
  /** Timeout in milliseconds. @default 30000 */
  timeout?: number;
  /** Approval callback. Return true to allow, false to reject. */
  approve?: (command: string) => Promise<boolean> | boolean;
}

export interface FsToolOptions extends BaseToolOptions {}

export interface WebFetchToolOptions {
  /** Allowed URL patterns. If set, only matching URLs are fetched. */
  allowedUrls?: RegExp[];
  /** Blocked URL patterns. Matching URLs are rejected. */
  blockedUrls?: RegExp[];
  /** Timeout in milliseconds. @default 10000 */
  timeout?: number;
  /** Maximum response body size in bytes. @default 1048576 (1MB) */
  maxResponseSize?: number;
}

export interface TodoToolOptions extends SessionToolOptions {}

export interface TaskToolOptions {
  /** The AI model to use for sub-agent calls (required). */
  model: Parameters<typeof import("ai").generateText>[0]["model"];
  /** Tools available to the sub-agent. */
  tools?: Record<string, import("ai").Tool>;
  /** System prompt for the sub-agent. */
  systemPrompt?: string;
  /** Maximum steps for the sub-agent. @default 20 */
  maxSteps?: number;
}

export interface AgentToolsOptions {
  /** Base directory cascaded to all tools that support it. */
  baseDir?: string;
  /** Session ID cascaded to tools that support it. */
  sessionId?: string;
  /** File editing tools options. Pass false to exclude. */
  fileEdit?: import("./file/tools.js").FileEditToolsOptions | false;
  /** Filesystem tools options. Pass false to exclude. */
  fs?: FsToolOptions | false;
  /** Todo tools options. Pass false to exclude. */
  todo?: TodoToolOptions | false;
  /** Bash tool options. Must pass an options object to enable (off by default). */
  bash?: BashToolOptions;
  /** Web fetch tool options. Must pass an options object to enable (off by default). */
  webFetch?: WebFetchToolOptions;
  /** Task (sub-agent) tool options. Must pass options with model to enable (off by default). */
  task?: TaskToolOptions;
}
