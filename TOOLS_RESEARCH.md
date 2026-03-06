# Report: Building AI Agent File Edit Tools with Vercel AI SDK

## Executive Summary

This report analyzes how opencode implements its file editing tools and provides guidance for building similar tools using the Vercel AI SDK. The key to high-quality AI file editing lies in three pillars:

1. **Robust fuzzy matching** - Handle LLM imprecision in reproducing exact text
2. **Safety mechanisms** - Prevent race conditions and stale edits
3. **Clear prompting** - Guide the LLM on tool usage patterns

---

## 1. Tool Architecture Overview

### 1.1 Core Edit Tools

opencode implements three primary editing approaches:

| Tool | Purpose | Best For |
|------|---------|----------|
| **Edit** | Find-and-replace with fuzzy matching | Targeted changes, single replacements |
| **Write** | Full file overwrite | New files, complete rewrites |
| **MultiEdit** | Sequential find-and-replace operations | Multiple changes to same file |
| **ApplyPatch** | Unified diff format | GPT models, multi-file atomic changes |

### 1.2 Tool Definition Pattern

```typescript
// packages/opencode/src/tool/tool.ts
export function define<Parameters extends z.ZodType, Result extends Metadata>(
  id: string,
  init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
): Info<Parameters, Result> {
  return {
    id,
    init: async (initCtx) => {
      const toolInfo = init instanceof Function ? await init(initCtx) : init
      const execute = toolInfo.execute
      toolInfo.execute = async (args, ctx) => {
        // Validate parameters with Zod
        try {
          toolInfo.parameters.parse(args)
        } catch (error) {
          throw new Error(`Tool called with invalid arguments: ${error}`)
        }
        const result = await execute(args, ctx)
        // Truncate output if needed
        return truncateOutput(result)
      }
      return toolInfo
    },
  }
}
```

---

## 2. The Edit Tool: Deep Dive

### 2.1 Schema Definition

```typescript
// Vercel AI SDK compatible schema
import { z } from "zod"

const editToolSchema = z.object({
  filePath: z.string().describe("The absolute path to the file to modify"),
  oldString: z.string().describe("The text to replace"),
  newString: z.string().describe("The text to replace it with (must be different from oldString)"),
  replaceAll: z.boolean().optional().describe("Replace all occurrences (default false)"),
})
```

### 2.2 The Cascading Replacer System (Critical)

The key innovation is **9 cascading replacement strategies** that handle LLM imprecision. When the exact `oldString` isn't found, the tool tries increasingly fuzzy matching:

```typescript
const REPLACERS = [
  SimpleReplacer,           // 1. Exact match
  LineTrimmedReplacer,      // 2. Match trimmed lines (flexible whitespace)
  BlockAnchorReplacer,      // 3. First/last line anchors with similarity scoring
  WhitespaceNormalizedReplacer, // 4. Collapse whitespace
  IndentationFlexibleReplacer,  // 5. Ignore indentation differences
  EscapeNormalizedReplacer,     // 6. Handle escape sequences (\n, \t, etc.)
  TrimmedBoundaryReplacer,      // 7. Match trimmed text
  ContextAwareReplacer,         // 8. 50% similarity threshold on middle lines
  MultiOccurrenceReplacer,      // 9. Find all occurrences for replaceAll
]
```

#### 2.2.1 SimpleReplacer
```typescript
// Direct exact match - yields the search string itself
function* SimpleReplacer(content: string, find: string) {
  yield find
}
```

#### 2.2.2 LineTrimmedReplacer
```typescript
// Match lines ignoring leading/trailing whitespace per line
function* LineTrimmedReplacer(content: string, find: string) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false
        break
      }
    }
    if (matches) {
      // Yield the ACTUAL content from file (preserving real indentation)
      yield actualContentFromFile(originalLines, i, searchLines.length)
    }
  }
}
```

#### 2.2.3 BlockAnchorReplacer (Most Sophisticated)

Uses **Levenshtein distance** for fuzzy matching with different thresholds:

```typescript
// Single candidate: 0% similarity threshold (very lenient)
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0

// Multiple candidates: 30% similarity required (choose best)
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3

function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length)

  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }
  return matrix[a.length][b.length]
}

function* BlockAnchorReplacer(content: string, find: string) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")

  // Need at least 3 lines for anchor matching
  if (searchLines.length < 3) return

  const firstLineSearch = searchLines[0].trim()
  const lastLineSearch = searchLines[searchLines.length - 1].trim()

  // Find all candidates where first AND last lines match
  const candidates = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() === firstLineSearch) {
      for (let j = i + 2; j < originalLines.length; j++) {
        if (originalLines[j].trim() === lastLineSearch) {
          candidates.push({ startLine: i, endLine: j })
          break
        }
      }
    }
  }

  // Score candidates by middle line similarity
  // Pick best match above threshold
  // ... (see full implementation in source)
}
```

### 2.3 The Replace Function

```typescript
function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.")
  }

  let notFound = true

  for (const replacer of REPLACERS) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search)
      if (index === -1) continue

      notFound = false

      if (replaceAll) {
        return content.replaceAll(search, newString)
      }

      // Check for uniqueness
      const lastIndex = content.lastIndexOf(search)
      if (index !== lastIndex) continue  // Multiple matches, try next replacer

      // Single unique match - apply replacement
      return content.substring(0, index) + newString + content.substring(index + search.length)
    }
  }

  if (notFound) {
    throw new Error("Could not find oldString in the file.")
  }
  throw new Error("Found multiple matches. Provide more context to make unique.")
}
```

---

## 3. Safety Mechanisms

### 3.1 File Time Tracking (Prevents Stale Edits)

```typescript
// packages/opencode/src/file/time.ts
export namespace FileTime {
  const state = {
    read: {} as Record<string, Record<string, Date | undefined>>,
    locks: new Map<string, Promise<void>>()
  }

  // Record when a file was read
  export function read(sessionID: string, file: string) {
    state.read[sessionID] = state.read[sessionID] || {}
    state.read[sessionID][file] = new Date()
  }

  // Serialize concurrent writes to same file
  export async function withLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = state.locks.get(filepath) ?? Promise.resolve()
    let release: () => void
    const nextLock = new Promise<void>(resolve => { release = resolve })
    state.locks.set(filepath, currentLock.then(() => nextLock))

    await currentLock
    try {
      return await fn()
    } finally {
      release!()
    }
  }

  // Assert file hasn't changed since last read
  export async function assert(sessionID: string, filepath: string) {
    const time = state.read[sessionID]?.[filepath]
    if (!time) {
      throw new Error(`Must read file ${filepath} before overwriting. Use Read tool first.`)
    }

    const mtime = fs.statSync(filepath)?.mtime
    // 50ms tolerance for filesystem timestamp fuzziness
    if (mtime && mtime.getTime() > time.getTime() + 50) {
      throw new Error(`File ${filepath} modified since last read. Read again first.`)
    }
  }
}
```

### 3.2 Read-Before-Edit Enforcement

The Read tool records timestamps:
```typescript
// In ReadTool execute()
FileTime.read(ctx.sessionID, filepath)  // Record read time
```

The Edit tool enforces it:
```typescript
// In EditTool execute()
await FileTime.assert(ctx.sessionID, filePath)  // Throws if not read
```

### 3.3 External Directory Protection

```typescript
async function assertExternalDirectory(ctx: Tool.Context, target?: string) {
  if (!target) return

  const worktree = Instance.worktree
  if (!target.startsWith(worktree)) {
    await ctx.ask({
      permission: "external_directory",
      patterns: [path.dirname(target) + "/*"],
      metadata: { target }
    })
  }
}
```

---

## 4. Vercel AI SDK Integration

### 4.1 Tool Definition for Vercel AI SDK

```typescript
import { tool } from "ai"
import { z } from "zod"

export const editTool = tool({
  description: `Performs exact string replacements in files.

Usage:
- You must use the read tool before editing. This tool will error without a prior read.
- Preserve exact indentation from the read output.
- The edit will FAIL if oldString is not found exactly.
- The edit will FAIL if oldString matches multiple locations - provide more context.
- Use replaceAll for renaming variables across the file.`,

  parameters: z.object({
    filePath: z.string().describe("Absolute path to the file"),
    oldString: z.string().describe("Text to replace"),
    newString: z.string().describe("Replacement text (must differ from oldString)"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences"),
  }),

  execute: async ({ filePath, oldString, newString, replaceAll }) => {
    // Implementation follows opencode patterns
  }
})
```

### 4.2 Complete Implementation Example

```typescript
import { tool } from "ai"
import { z } from "zod"
import { createTwoFilesPatch } from "diff"
import * as fs from "fs/promises"
import * as path from "path"

// File time tracking (simplified)
const fileReadTimes = new Map<string, Date>()

export const readTool = tool({
  description: "Reads a file from the filesystem.",
  parameters: z.object({
    filePath: z.string().describe("Absolute path to the file"),
  }),
  execute: async ({ filePath }) => {
    const content = await fs.readFile(filePath, "utf-8")
    const lines = content.split("\n")

    // Record read time for edit validation
    fileReadTimes.set(filePath, new Date())

    // Return with line numbers for LLM reference
    const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join("\n")
    return `<content>\n${numbered}\n</content>`
  }
})

export const editTool = tool({
  description: `Performs exact string replacements in files.

You MUST read the file first. The edit will fail otherwise.
Preserve exact indentation. Provide enough context for unique matches.`,

  parameters: z.object({
    filePath: z.string(),
    oldString: z.string(),
    newString: z.string(),
    replaceAll: z.boolean().optional(),
  }),

  execute: async ({ filePath, oldString, newString, replaceAll = false }) => {
    // Validation
    if (oldString === newString) {
      throw new Error("No changes: oldString and newString are identical")
    }

    // Check read time
    const readTime = fileReadTimes.get(filePath)
    if (!readTime) {
      throw new Error(`Must read ${filePath} before editing`)
    }

    const stat = await fs.stat(filePath)
    if (stat.mtime > new Date(readTime.getTime() + 50)) {
      throw new Error(`File modified since read. Read again first.`)
    }

    // Read current content
    const content = await fs.readFile(filePath, "utf-8")

    // Apply replacement with fuzzy matching
    const newContent = replace(content, oldString, newString, replaceAll)

    // Write back
    await fs.writeFile(filePath, newContent, "utf-8")

    // Update read time
    fileReadTimes.set(filePath, new Date())

    // Return diff for confirmation
    const diff = createTwoFilesPatch(filePath, filePath, content, newContent)
    return `Edit applied successfully.\n\n${diff}`
  }
})
```

### 4.3 Using with generateText/streamText

```typescript
import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"

const result = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools: {
    read: readTool,
    edit: editTool,
    write: writeTool,
  },
  maxSteps: 10, // Allow multi-step tool use
  messages: [
    { role: "user", content: "Fix the typo in src/utils.ts" }
  ],
})
```

---

## 5. The MultiEdit Tool

For multiple changes to the same file:

```typescript
export const multiEditTool = tool({
  description: `Multiple edits to a single file in one operation.

All edits apply sequentially. Each edit operates on the result of previous.
If ANY edit fails, NONE are applied (atomic).`,

  parameters: z.object({
    filePath: z.string(),
    edits: z.array(z.object({
      oldString: z.string(),
      newString: z.string(),
      replaceAll: z.boolean().optional(),
    })),
  }),

  execute: async ({ filePath, edits }) => {
    // Read file once
    let content = await fs.readFile(filePath, "utf-8")
    const original = content

    // Apply each edit sequentially
    for (const edit of edits) {
      content = replace(content, edit.oldString, edit.newString, edit.replaceAll)
    }

    // Write final result
    await fs.writeFile(filePath, content, "utf-8")

    const diff = createTwoFilesPatch(filePath, filePath, original, content)
    return `Applied ${edits.length} edits successfully.\n\n${diff}`
  }
})
```

---

## 6. The ApplyPatch Tool (Alternative Approach)

For models that work better with diff format:

```typescript
export const applyPatchTool = tool({
  description: `Apply changes using a patch format.

Format:
*** Begin Patch
*** Add File: <path>
+line1
+line2
*** Update File: <path>
@@ context line
-old line
+new line
*** Delete File: <path>
*** End Patch`,

  parameters: z.object({
    patchText: z.string().describe("The full patch text"),
  }),

  execute: async ({ patchText }) => {
    const { hunks } = parsePatch(patchText)

    for (const hunk of hunks) {
      switch (hunk.type) {
        case "add":
          await fs.writeFile(hunk.path, hunk.contents)
          break
        case "delete":
          await fs.unlink(hunk.path)
          break
        case "update":
          const newContent = applyChunks(hunk.path, hunk.chunks)
          await fs.writeFile(hunk.path, newContent)
          break
      }
    }

    return `Applied patch: ${hunks.length} files affected`
  }
})
```

---

## 7. Critical Prompting Guidelines

### 7.1 Tool Description Best Practices

The tool description is crucial for LLM behavior. Include:

1. **Prerequisites**: "You must read the file first"
2. **Failure modes**: "Will fail if oldString not found exactly"
3. **Formatting**: "Preserve exact indentation from read output"
4. **Disambiguation**: "Provide more context if multiple matches"

### 7.2 System Prompt Integration

```typescript
const systemPrompt = `
## File Editing Rules

1. ALWAYS read a file before editing it
2. When editing, preserve exact indentation from the read output
3. The line number prefix format is: number + colon + space (e.g., "1: ")
   Everything AFTER that space is the actual file content to match
4. Never include line number prefixes in oldString or newString
5. If edit fails with "multiple matches", include more surrounding context
6. Prefer editing existing files over creating new ones
`
```

---

## 8. LSP Integration (Optional Enhancement)

After edits, run diagnostics:

```typescript
async function runDiagnostics(filePath: string): Promise<Diagnostic[]> {
  // Touch file to trigger LSP analysis
  await lspClient.didOpen(filePath)
  await lspClient.didChange(filePath)

  // Get diagnostics
  const diagnostics = await lspClient.getDiagnostics(filePath)
  return diagnostics.filter(d => d.severity === DiagnosticSeverity.Error)
}

// In edit tool execute:
const errors = await runDiagnostics(filePath)
if (errors.length > 0) {
  return `Edit applied with errors:\n${formatErrors(errors)}`
}
```

---

## 9. Summary of Key Patterns

### Must-Have Features

1. **Read-before-edit enforcement** - Track file read times per session
2. **Fuzzy matching cascade** - Handle LLM whitespace/indentation imprecision
3. **File locking** - Serialize concurrent writes to same file
4. **Diff output** - Return unified diff for confirmation
5. **Clear error messages** - "Not found" vs "Multiple matches"

### Nice-to-Have Features

1. **LSP integration** - Report syntax errors after edit
2. **Atomic multi-edit** - All-or-nothing for multiple changes
3. **External directory protection** - Confirm edits outside project
4. **Patch format support** - Alternative for GPT models

### Replacer Priority Order

1. Exact match (SimpleReplacer)
2. Line-trimmed match (LineTrimmedReplacer)
3. Anchor-based fuzzy match (BlockAnchorReplacer)
4. Whitespace-normalized (WhitespaceNormalizedReplacer)
5. Indentation-flexible (IndentationFlexibleReplacer)
6. Escape-normalized (EscapeNormalizedReplacer)
7. Trimmed boundaries (TrimmedBoundaryReplacer)
8. Context-aware (ContextAwareReplacer)
9. Multi-occurrence (MultiOccurrenceReplacer)

---

## 10. Implementation Checklist

- [ ] Define read tool with line-numbered output
- [ ] Implement file time tracking per session
- [ ] Create edit tool with Zod schema
- [ ] Implement cascading replacer system
- [ ] Add Levenshtein distance for fuzzy matching
- [ ] Add file locking for concurrent access
- [ ] Return unified diffs in tool output
- [ ] Write clear tool descriptions with failure modes
- [ ] Add multiEdit tool for batch operations
- [ ] (Optional) Add applyPatch tool for diff format
- [ ] (Optional) Integrate LSP for post-edit diagnostics

---

## Appendix: Source References

The analysis in this report is based on the following opencode source files:

- `packages/opencode/src/tool/tool.ts` - Tool definition framework
- `packages/opencode/src/tool/edit.ts` - Edit tool with cascading replacers
- `packages/opencode/src/tool/write.ts` - Write tool implementation
- `packages/opencode/src/tool/multiedit.ts` - MultiEdit tool
- `packages/opencode/src/tool/apply_patch.ts` - ApplyPatch tool
- `packages/opencode/src/tool/read.ts` - Read tool with line numbering
- `packages/opencode/src/file/time.ts` - File time tracking and locking
- `packages/opencode/src/patch/index.ts` - Patch parsing and application
- `packages/opencode/src/tool/registry.ts` - Tool registration system
- `packages/opencode/src/tool/edit.txt` - Edit tool description/prompt
- `packages/opencode/src/tool/write.txt` - Write tool description/prompt
- `packages/opencode/src/tool/multiedit.txt` - MultiEdit tool description/prompt
- `packages/opencode/src/tool/apply_patch.txt` - ApplyPatch tool description/prompt
