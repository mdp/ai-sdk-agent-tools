import { tool } from "ai";
import { z } from "zod";
import { execFile } from "node:child_process";
import type { BashToolOptions } from "../types.js";

const MAX_OUTPUT_SIZE = 100 * 1024; // 100KB

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n... (truncated, ${str.length} total chars)`;
}

/**
 * Create a bash command execution tool.
 */
export function createBashTool(options: BashToolOptions = {}) {
  const timeout = options.timeout ?? 30_000;

  return tool({
    description: `Execute a bash command.

Runs a shell command and returns stdout, stderr, and exit code.
Use for system commands, build tools, git operations, etc.
Commands run with a ${timeout / 1000}s timeout.`,

    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
      timeout: z
        .number()
        .optional()
        .describe("Override timeout in milliseconds"),
      description: z
        .string()
        .optional()
        .describe("Brief description of what this command does"),
    }),

    execute: async ({ command, timeout: cmdTimeout }) => {
      // Check allowed commands
      if (options.allowedCommands && options.allowedCommands.length > 0) {
        const allowed = options.allowedCommands.some((pattern) =>
          pattern.test(command)
        );
        if (!allowed) {
          return `Command not allowed: ${command}`;
        }
      }

      // Check blocked commands
      if (options.blockedCommands && options.blockedCommands.length > 0) {
        const blocked = options.blockedCommands.some((pattern) =>
          pattern.test(command)
        );
        if (blocked) {
          return `Command blocked: ${command}`;
        }
      }

      // Check approval callback
      if (options.approve) {
        const approved = await options.approve(command);
        if (!approved) {
          return `Command not approved: ${command}`;
        }
      }

      const effectiveTimeout = cmdTimeout ?? timeout;

      return new Promise<string>((resolve) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), effectiveTimeout);

        execFile(
          "/bin/sh",
          ["-c", command],
          {
            cwd: options.baseDir || undefined,
            signal: controller.signal,
            maxBuffer: MAX_OUTPUT_SIZE * 2,
          },
          (error, stdout, stderr) => {
            clearTimeout(timer);

            if (controller.signal.aborted) {
              resolve(
                `Command timed out after ${effectiveTimeout}ms: ${command}`
              );
              return;
            }

            const exitCode = error ? (error as any).code ?? 1 : 0;
            const parts: string[] = [`Exit code: ${exitCode}`];

            if (stdout) {
              parts.push(`stdout:\n${truncate(stdout, MAX_OUTPUT_SIZE)}`);
            }
            if (stderr) {
              parts.push(`stderr:\n${truncate(stderr, MAX_OUTPUT_SIZE)}`);
            }
            if (!stdout && !stderr) {
              parts.push("(no output)");
            }

            resolve(parts.join("\n\n"));
          }
        );
      });
    },
  });
}
