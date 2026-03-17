import { tool } from "ai";
import { z } from "zod/v4";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FsToolOptions } from "../types.js";

function resolvePath(filePath: string, baseDir?: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  if (!baseDir) {
    throw new Error(
      `Path "${filePath}" is relative but no baseDir configured.`
    );
  }
  return path.resolve(baseDir, filePath);
}

/**
 * Create a directory listing tool.
 */
export function createListTool(options: FsToolOptions = {}) {
  return tool({
    description: `List files and directories at a given path.

Returns entries with [dir] or [file] indicators.
Useful for exploring the project structure.`,

    inputSchema: z.object({
      path: z.string().describe("Directory path to list"),
    }),

    execute: async ({ path: dirPath }) => {
      const resolved = resolvePath(dirPath, options.baseDir);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const lines = entries.map((entry) => {
        const indicator = entry.isDirectory() ? "[dir]" : "[file]";
        return `${indicator}  ${entry.name}`;
      });
      return `Directory: ${resolved}\n\n${lines.join("\n")}`;
    },
  });
}

/**
 * Create a glob file search tool.
 */
export function createGlobTool(options: FsToolOptions = {}) {
  return tool({
    description: `Find files matching a glob pattern.

Searches for files using glob patterns like "**/*.ts" or "src/**/*.test.ts".
Returns matching file paths, limited to 1000 results.`,

    inputSchema: z.object({
      pattern: z.string().describe("Glob pattern to match files"),
      path: z
        .string()
        .optional()
        .describe("Directory to search in (defaults to baseDir)"),
    }),

    execute: async ({ pattern, path: searchPath }) => {
      const { default: fg } = await import("fast-glob");
      const cwd = searchPath
        ? resolvePath(searchPath, options.baseDir)
        : options.baseDir || process.cwd();

      const files = await fg(pattern, {
        cwd,
        dot: false,
        ignore: ["**/node_modules/**", "**/.git/**"],
        onlyFiles: true,
        absolute: false,
      });

      const limited = files.slice(0, 1000);
      const header =
        limited.length < files.length
          ? `Found ${files.length} files (showing first 1000):`
          : `Found ${limited.length} file(s):`;

      return `${header}\n${limited.join("\n")}`;
    },
  });
}

/**
 * Create a grep content search tool.
 */
export function createGrepTool(options: FsToolOptions = {}) {
  return tool({
    description: `Search file contents using a regular expression.

Searches files for lines matching a regex pattern.
Returns matches in "filepath:linenum: content" format, limited to 100 matches.
Skips binary files, node_modules, and .git by default.`,

    inputSchema: z.object({
      pattern: z.string().describe("Regular expression pattern to search for"),
      path: z
        .string()
        .optional()
        .describe("Directory to search in (defaults to baseDir)"),
      include: z
        .string()
        .optional()
        .describe("Glob pattern to filter files (e.g. '*.ts')"),
    }),

    execute: async ({ pattern, path: searchPath, include }) => {
      const { default: fg } = await import("fast-glob");
      const cwd = searchPath
        ? resolvePath(searchPath, options.baseDir)
        : options.baseDir || process.cwd();

      const globPattern = include || "**/*";
      const files = await fg(globPattern, {
        cwd,
        dot: false,
        ignore: ["**/node_modules/**", "**/.git/**"],
        onlyFiles: true,
        absolute: false,
      });

      let regex: RegExp;
      try {
        regex = new RegExp(pattern);
      } catch {
        return `Invalid regex pattern: ${pattern}`;
      }

      const matches: string[] = [];
      const MAX_MATCHES = 100;

      for (const file of files) {
        if (matches.length >= MAX_MATCHES) break;

        const fullPath = path.join(cwd, file);
        let content: string;
        try {
          content = await fs.readFile(fullPath, "utf-8");
        } catch {
          continue;
        }

        // Skip binary files (check for null bytes in first 1024 chars)
        if (content.slice(0, 1024).includes("\0")) continue;

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= MAX_MATCHES) break;
          if (regex.test(lines[i])) {
            matches.push(`${file}:${i + 1}: ${lines[i]}`);
          }
        }
      }

      if (matches.length === 0) {
        return `No matches found for pattern: ${pattern}`;
      }

      const header =
        matches.length >= MAX_MATCHES
          ? `Found 100+ matches (showing first 100):`
          : `Found ${matches.length} match(es):`;

      return `${header}\n${matches.join("\n")}`;
    },
  });
}

export function createFsTools(options: FsToolOptions = {}) {
  return {
    list: createListTool(options),
    glob: createGlobTool(options),
    grep: createGrepTool(options),
  };
}
