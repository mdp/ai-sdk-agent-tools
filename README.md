# @mdp/ai-sdk-agent-tools

Comprehensive agent toolkit for [Vercel AI SDK v6](https://ai-sdk.dev). Provides file editing, filesystem (glob/grep/ls), bash execution, web fetch, todo tracking, and sub-agent task delegation tools.

## Installation

```bash
npm install @mdp/ai-sdk-agent-tools
```

**Peer dependencies:** `ai@^6.0.0` and `zod@^3.22.0`

## Quick Start

```typescript
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createAgentTools } from "@mdp/ai-sdk-agent-tools";

const tools = createAgentTools({
  baseDir: process.cwd(),
  sessionId: "my-session",
  bash: {}, // opt-in
  webFetch: {}, // opt-in
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
  maxSteps: 20,
  prompt: "Read config.json and update the version to 2.0.0",
});
```

## `createAgentTools(options?)`

One-call factory that assembles every tool group. Returns a flat `Record<string, Tool>`.

| Group | Default | Key | Tools created |
| --- | --- | --- | --- |
| File editing | **on** | `fileEdit` | `read`, `write`, `edit`, `multiEdit` |
| Filesystem | **on** | `fs` | `list`, `glob`, `grep` |
| Todo | **on** | `todo` | `todoRead`, `todoWrite` |
| Bash | **off** | `bash` | `bash` |
| Web fetch | **off** | `webFetch` | `webFetch` |
| Task (sub-agent) | **off** | `task` | `task` |

Pass `false` to disable a default-on group. Pass an options object `{}` to enable an off-by-default group.

```typescript
const tools = createAgentTools({
  baseDir: process.cwd(),
  sessionId: "my-session",
  fs: false, // disable filesystem tools
  bash: { timeout: 60000 }, // enable bash with 60s timeout
  webFetch: { allowedUrls: [/^https:\/\/api\.example\.com/] },
  task: { model: anthropic("claude-sonnet-4-20250514") },
});
```

## Tools

### File Editing — `read`, `write`, `edit`, `multiEdit`

Read files with line numbers, create/overwrite files, find-and-replace with fuzzy matching, or apply multiple edits atomically.

```typescript
import { createFileEditTools } from "@mdp/ai-sdk-agent-tools";

const { read, write, edit, multiEdit } = createFileEditTools({
  baseDir: "/my/project",
  sessionId: "my-session",
});
```

The edit tool uses cascading fuzzy-match strategies (exact, line-trimmed, whitespace-normalized, indentation-flexible, etc.) to handle LLM imprecision.

### Filesystem — `list`, `glob`, `grep`

Directory listing, fast glob pattern matching, and content search with regex support.

```typescript
import { createFsTools } from "@mdp/ai-sdk-agent-tools";

const { list, glob, grep } = createFsTools({ baseDir: "/my/project" });
```

### Bash — `bash`

Shell command execution with allowlist/blocklist filtering and optional approval callback.

```typescript
import { createBashTool } from "@mdp/ai-sdk-agent-tools";

const bash = createBashTool({
  baseDir: "/my/project",
  timeout: 30000,
  blockedCommands: [/rm\s+-rf/],
  approve: async (cmd) => confirm(`Run: ${cmd}?`),
});
```

### Web Fetch — `webFetch`

Fetches URLs and returns text content with URL filtering and size limits.

```typescript
import { createWebFetchTool } from "@mdp/ai-sdk-agent-tools";

const webFetch = createWebFetchTool({
  allowedUrls: [/^https:\/\/api\.example\.com/],
  timeout: 10000,
  maxResponseSize: 1048576,
});
```

### Todo — `todoRead`, `todoWrite`

Session-scoped task list for the agent to track its own work.

```typescript
import { createTodoTools } from "@mdp/ai-sdk-agent-tools";

const { todoRead, todoWrite } = createTodoTools({ sessionId: "my-session" });
```

### Task (Sub-agent) — `task`

Delegates subtasks to a separate `generateText` call. The sub-agent receives all other enabled tools by default (without the task tool itself, to prevent recursion).

```typescript
import { createTaskTool } from "@mdp/ai-sdk-agent-tools";

const task = createTaskTool({
  model: anthropic("claude-sonnet-4-20250514"),
  systemPrompt: "You are a helpful coding assistant.",
  maxSteps: 20,
});
```

## Options

```typescript
interface AgentToolsOptions {
  /** Base directory cascaded to all tools. */
  baseDir?: string;
  /** Session ID cascaded to tools that support it. */
  sessionId?: string;
  /** File editing tools. Pass false to exclude. */
  fileEdit?: FileEditToolsOptions | false;
  /** Filesystem tools. Pass false to exclude. */
  fs?: FsToolOptions | false;
  /** Todo tools. Pass false to exclude. */
  todo?: TodoToolOptions | false;
  /** Bash tool. Pass options to enable (off by default). */
  bash?: BashToolOptions;
  /** Web fetch tool. Pass options to enable (off by default). */
  webFetch?: WebFetchToolOptions;
  /** Task (sub-agent) tool. Pass options with model to enable (off by default). */
  task?: TaskToolOptions;
}
```

## Safety Features

- **Read-before-edit**: By default, you must read a file before editing it
- **Stale edit detection**: Fails if file was modified externally since last read
- **File locking**: Serializes concurrent writes to the same file
- **Atomic multi-edit**: All edits succeed or none are applied
- **Bash filtering**: Allowlist/blocklist patterns and approval callbacks
- **Web fetch filtering**: URL allowlist/blocklist and response size limits
- **Task recursion guard**: Sub-agents don't get the task tool

## Contributing

```bash
npm install
npm run build
npm run typecheck
npm test
```

## License

MIT
