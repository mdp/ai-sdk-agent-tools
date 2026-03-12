# @mdp/ai-sdk-tools-file-editing

Generic file editing tools for [Vercel AI SDK v6](https://ai-sdk.dev) agents. Provides robust read, write, edit, and multi-edit capabilities with fuzzy matching to handle LLM imprecision.

## Installation

```bash
npm install @mdp/ai-sdk-tools-file-editing
```

**Peer dependencies:** `ai@^6.0.0` and `zod@^3.22.0`

## Quick Start

```typescript
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createFileEditTools } from "@mdp/ai-sdk-tools-file-editing";

// Create all tools with shared configuration
const tools = createFileEditTools({
  baseDir: process.cwd(),
  sessionId: "my-session",
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
  maxSteps: 10,
  prompt: "Read config.json and update the version to 2.0.0",
});
```

## Tools

### `createReadTool(options?)`

Reads files and returns content with line numbers.

```typescript
import { createReadTool } from "@mdp/ai-sdk-tools-file-editing";

const readTool = createReadTool({ baseDir: "/my/project" });

// AI agent usage:
// Input: { filePath: "src/index.ts" }
// Output: File content with line numbers:
//    1| import { foo } from './foo';
//    2| export function main() { ... }
```

### `createWriteTool(options?)`

Creates new files or completely rewrites existing files.

```typescript
import { createWriteTool } from "@mdp/ai-sdk-tools-file-editing";

const writeTool = createWriteTool({ baseDir: "/my/project" });

// AI agent usage:
// Input: { filePath: "new-file.txt", content: "Hello world" }
// Output: "File created: /my/project/new-file.txt (1 lines)"
```

### `createEditTool(options?)`

Performs find-and-replace with fuzzy matching. Handles LLM whitespace/indentation imprecision.

```typescript
import { createEditTool } from "@mdp/ai-sdk-tools-file-editing";

const editTool = createEditTool({ baseDir: "/my/project" });

// AI agent usage:
// Input: {
//   filePath: "src/config.ts",
//   oldString: 'version: "1.0.0"',
//   newString: 'version: "2.0.0"'
// }
// Output: Diff showing the change
```

### `createMultiEditTool(options?)`

Applies multiple edits to a single file atomically.

```typescript
import { createMultiEditTool } from "@mdp/ai-sdk-tools-file-editing";

const multiEditTool = createMultiEditTool({ baseDir: "/my/project" });

// AI agent usage:
// Input: {
//   filePath: "src/config.ts",
//   edits: [
//     { oldString: 'name: "old"', newString: 'name: "new"' },
//     { oldString: 'version: "1.0"', newString: 'version: "2.0"' }
//   ]
// }
```

### `createFileEditTools(options?)`

Convenience function that creates all tools at once:

```typescript
const { read, write, edit, multiEdit } = createFileEditTools({
  sessionId: "my-session",
  baseDir: "/my/project",
});
```

## Options

```typescript
interface FileEditToolsOptions {
  /**
   * Session ID for tracking file reads.
   * Each session maintains its own read history.
   * @default "default"
   */
  sessionId?: string;

  /**
   * Whether to enforce read-before-edit.
   * When true, edit and write tools fail if the file wasn't read first.
   * @default true
   */
  requireReadBeforeEdit?: boolean;

  /**
   * Base directory to resolve relative paths against.
   * If not set, paths must be absolute.
   */
  baseDir?: string;

  /**
   * Maximum number of lines to return when reading a file.
   * @default 2000
   */
  maxReadLines?: number;

  /**
   * Maximum characters per line when reading.
   * Longer lines will be truncated.
   * @default 2000
   */
  maxLineLength?: number;
}
```

## Fuzzy Matching

The edit tool uses cascading replacement strategies to handle LLM imprecision:

1. **Exact match** - Direct string match
2. **Line-trimmed** - Ignores leading/trailing whitespace per line
3. **Block anchor** - Matches first/last lines, fuzzy middle
4. **Whitespace normalized** - Collapses all whitespace
5. **Indentation flexible** - Ignores indentation differences
6. **Escape normalized** - Handles `\n`, `\t` escape sequences
7. **Trimmed boundary** - Matches trimmed text at line boundaries
8. **Context aware** - 50% similarity threshold matching

This ensures edits work even when the LLM doesn't reproduce whitespace exactly.

## Safety Features

- **Read-before-edit**: By default, you must read a file before editing it
- **Stale edit detection**: Fails if file was modified externally since last read
- **File locking**: Serializes concurrent writes to the same file
- **Atomic multi-edit**: All edits succeed or none are applied

## Advanced: Using Individual Utilities

```typescript
import {
  replace,
  levenshtein,
  similarity,
  recordRead,
  assertFileNotModified,
  withFileLock,
  createDiff,
} from "@mdp/ai-sdk-tools-file-editing";

// Fuzzy string replacement
const newContent = replace(content, oldStr, newStr, false);

// String similarity (0-1)
const sim = similarity("hello", "helo"); // ~0.8

// Manual file state tracking
recordRead("session-1", "/path/to/file");
await assertFileNotModified("session-1", "/path/to/file");

// File locking for concurrent access
await withFileLock("/path/to/file", async () => {
  // ... exclusive access
});
```

## Example: Complete Agent Setup

```typescript
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createFileEditTools } from "@mdp/ai-sdk-tools-file-editing";

async function runAgent(task: string) {
  const tools = createFileEditTools({
    baseDir: process.cwd(),
    sessionId: crypto.randomUUID(),
  });

  const result = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a helpful coding assistant. When editing files:
1. Always read a file before editing it
2. Preserve the exact indentation from the read output
3. If edit fails with "multiple matches", include more context`,
    tools,
    maxSteps: 20,
    prompt: task,
  });

  return result.text;
}

// Usage
await runAgent("Add a new export to src/index.ts for the UserService class");
```

## Contributing

### Setup

```bash
npm install
npm run build
npm run typecheck
```

### Publishing (Maintainers)

This package uses npm OIDC trusted publishing - no npm tokens required.

**One-time setup on npmjs.com:**

1. Go to https://www.npmjs.com/package/@mdp/ai-sdk-tools-file-editing/settings
2. Under "Trusted Publishers", add a new GitHub Actions publisher:
   - Owner: `mdp`
   - Repository: `ai-sdk-tools-file-editing`
   - Workflow filename: `publish.yml`

**To publish a new version:**

```bash
# Update version in package.json
npm version patch  # or minor, or major

# Push the tag to trigger publish
git push --follow-tags
```

The GitHub Action will automatically build and publish to npm using OIDC authentication.

## License

MIT
