import { tool } from "ai";
import { z } from "zod/v4";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  recordRead,
  assertFileNotModified,
  withFileLock,
  createDiff,
} from "./file-state.js";
import { replace } from "./replacers.js";

export interface FileEditToolsOptions {
  /**
   * Session ID for tracking file reads.
   * Each session maintains its own read history.
   * @default "default"
   */
  sessionId?: string;

  /**
   * Whether to enforce read-before-edit.
   * When true, edit and write tools will fail if the file wasn't read first.
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

const defaultOptions: Required<FileEditToolsOptions> = {
  sessionId: "default",
  requireReadBeforeEdit: true,
  baseDir: "",
  maxReadLines: 2000,
  maxLineLength: 2000,
};

function resolvePath(filePath: string, baseDir: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  if (!baseDir) {
    throw new Error(
      `Path "${filePath}" is relative but no baseDir configured. Use absolute paths or set baseDir option.`
    );
  }
  return path.resolve(baseDir, filePath);
}

/**
 * Create a read file tool for AI SDK v6.
 *
 * This tool reads files and returns them with line numbers.
 * It tracks read times for the read-before-edit pattern.
 */
export function createReadTool(options: FileEditToolsOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return tool({
    description: `Read a file from the filesystem.

Returns the file content with line numbers for reference.
You should read a file before editing it to understand its contents.

Usage:
- Provide the file path (absolute or relative to configured base directory)
- Returns content with line numbers in format: "  1| content"
- For partial reads, use offset and limit parameters`,

    inputSchema: z.object({
      filePath: z.string().describe("Path to the file to read"),
      offset: z
        .number()
        .optional()
        .describe("Line number to start reading from (1-indexed)"),
      limit: z.number().optional().describe("Maximum number of lines to read"),
    }),

    execute: async ({ filePath, offset, limit }) => {
      const resolvedPath = resolvePath(filePath, opts.baseDir);

      const content = await fs.readFile(resolvedPath, "utf-8");
      let lines = content.split("\n");

      // Apply offset and limit
      const startLine = offset ? Math.max(1, offset) - 1 : 0;
      const endLine = limit
        ? Math.min(startLine + limit, lines.length)
        : Math.min(startLine + opts.maxReadLines, lines.length);

      lines = lines.slice(startLine, endLine);

      // Truncate long lines
      lines = lines.map((line) =>
        line.length > opts.maxLineLength
          ? line.slice(0, opts.maxLineLength) + "..."
          : line
      );

      // Record read time for this file
      recordRead(opts.sessionId, resolvedPath);

      // Format with line numbers
      const numbered = lines
        .map((line, i) => {
          const lineNum = (startLine + i + 1).toString().padStart(4, " ");
          return `${lineNum}| ${line}`;
        })
        .join("\n");

      const totalLines = content.split("\n").length;
      const header = `File: ${resolvedPath} (${totalLines} lines total)`;
      const rangeInfo =
        startLine > 0 || endLine < totalLines
          ? `Showing lines ${startLine + 1}-${endLine} of ${totalLines}`
          : "";

      return [header, rangeInfo, "", numbered].filter(Boolean).join("\n");
    },
  });
}

/**
 * Create a write file tool for AI SDK v6.
 *
 * This tool writes content to a file, creating it if it doesn't exist.
 * For existing files, it enforces read-before-write when configured.
 */
export function createWriteTool(options: FileEditToolsOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return tool({
    description: `Write content to a file.

Creates the file if it doesn't exist, or overwrites existing content.
For existing files, you must read the file first using the read tool.

Usage:
- Use for creating new files or completely rewriting existing files
- For small changes to existing files, prefer the edit tool instead
- Parent directories will be created automatically if needed`,

    inputSchema: z.object({
      filePath: z.string().describe("Path to the file to write"),
      content: z.string().describe("The content to write to the file"),
    }),

    execute: async ({ filePath, content }) => {
      const resolvedPath = resolvePath(filePath, opts.baseDir);

      return withFileLock(resolvedPath, async () => {
        // Check if file exists
        let exists = false;
        let originalContent = "";
        try {
          originalContent = await fs.readFile(resolvedPath, "utf-8");
          exists = true;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            throw err;
          }
        }

        // If file exists and we require read-before-edit, check it
        if (exists && opts.requireReadBeforeEdit) {
          await assertFileNotModified(opts.sessionId, resolvedPath);
        }

        // Create parent directories if needed
        const dir = path.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });

        // Write the file
        await fs.writeFile(resolvedPath, content, "utf-8");

        // Update read time since we now know the content
        recordRead(opts.sessionId, resolvedPath);

        if (exists) {
          const diff = createDiff(resolvedPath, originalContent, content);
          return `File updated: ${resolvedPath}\n\n${diff}`;
        } else {
          const lineCount = content.split("\n").length;
          return `File created: ${resolvedPath} (${lineCount} lines)`;
        }
      });
    },
  });
}

/**
 * Create an edit file tool for AI SDK v6.
 *
 * This tool performs find-and-replace operations on files with fuzzy matching.
 * It handles LLM imprecision by trying multiple matching strategies.
 */
export function createEditTool(options: FileEditToolsOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return tool({
    description: `Edit a file by replacing text.

Performs exact string replacement with fuzzy matching to handle whitespace differences.
You must read the file first using the read tool before editing.

Usage:
- Provide oldString: the exact text to replace (copy from read output)
- Provide newString: the replacement text
- For renaming across the file, use replaceAll: true

Rules:
- oldString must exist in the file exactly (fuzzy matching handles minor whitespace)
- oldString must be unique unless replaceAll is true
- If multiple matches found, include more surrounding context
- Preserve the indentation style from the original file`,

    inputSchema: z.object({
      filePath: z.string().describe("Path to the file to edit"),
      oldString: z.string().describe("The text to replace"),
      newString: z
        .string()
        .describe("The replacement text (must differ from oldString)"),
      replaceAll: z
        .boolean()
        .optional()
        .describe("Replace all occurrences instead of just the first unique match"),
    }),

    execute: async ({ filePath, oldString, newString, replaceAll = false }) => {
      const resolvedPath = resolvePath(filePath, opts.baseDir);

      return withFileLock(resolvedPath, async () => {
        // Enforce read-before-edit
        if (opts.requireReadBeforeEdit) {
          await assertFileNotModified(opts.sessionId, resolvedPath);
        }

        // Read current content
        const content = await fs.readFile(resolvedPath, "utf-8");

        // Apply replacement with fuzzy matching
        const newContent = replace(content, oldString, newString, replaceAll);

        // Write back
        await fs.writeFile(resolvedPath, newContent, "utf-8");

        // Update read time
        recordRead(opts.sessionId, resolvedPath);

        // Return diff
        const diff = createDiff(resolvedPath, content, newContent);
        return `Edit applied: ${resolvedPath}\n\n${diff}`;
      });
    },
  });
}

/**
 * Create a multi-edit tool for AI SDK v6.
 *
 * This tool applies multiple edits to a single file atomically.
 * All edits must succeed or none are applied.
 */
export function createMultiEditTool(options: FileEditToolsOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return tool({
    description: `Apply multiple edits to a single file atomically.

All edits are applied sequentially. Each edit operates on the result of previous edits.
If ANY edit fails, NONE are applied.

Usage:
- Use when making several related changes to one file
- Edits are applied in order, so later edits see earlier changes
- More efficient than multiple single edits`,

    inputSchema: z.object({
      filePath: z.string().describe("Path to the file to edit"),
      edits: z
        .array(
          z.object({
            oldString: z.string().describe("Text to replace"),
            newString: z.string().describe("Replacement text"),
            replaceAll: z
              .boolean()
              .optional()
              .describe("Replace all occurrences"),
          })
        )
        .describe("Array of edit operations to apply"),
    }),

    execute: async ({ filePath, edits }) => {
      const resolvedPath = resolvePath(filePath, opts.baseDir);

      return withFileLock(resolvedPath, async () => {
        // Enforce read-before-edit
        if (opts.requireReadBeforeEdit) {
          await assertFileNotModified(opts.sessionId, resolvedPath);
        }

        // Read current content
        let content = await fs.readFile(resolvedPath, "utf-8");
        const originalContent = content;

        // Apply each edit sequentially
        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i];
          try {
            content = replace(
              content,
              edit.oldString,
              edit.newString,
              edit.replaceAll ?? false
            );
          } catch (err) {
            throw new Error(
              `Edit ${i + 1}/${edits.length} failed: ${(err as Error).message}`
            );
          }
        }

        // Write back
        await fs.writeFile(resolvedPath, content, "utf-8");

        // Update read time
        recordRead(opts.sessionId, resolvedPath);

        const diff = createDiff(resolvedPath, originalContent, content);
        return `Applied ${edits.length} edits: ${resolvedPath}\n\n${diff}`;
      });
    },
  });
}

/**
 * Create all file editing tools with shared options.
 *
 * @returns Object containing read, write, edit, and multiEdit tools
 */
export function createFileEditTools(options: FileEditToolsOptions = {}) {
  return {
    read: createReadTool(options),
    write: createWriteTool(options),
    edit: createEditTool(options),
    multiEdit: createMultiEditTool(options),
  };
}
