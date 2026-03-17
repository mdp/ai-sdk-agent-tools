import { tool, generateText, stepCountIs, type Tool } from "ai";
import { z } from "zod";
import type { TaskToolOptions } from "../types.js";

/**
 * Create a sub-agent task tool.
 *
 * Spawns a sub-agent with its own model, tools, and system prompt.
 * The consumer provides the model — this library stays provider-agnostic.
 */
export function createTaskTool(options: TaskToolOptions) {
  const maxSteps = options.maxSteps ?? 20;

  return tool({
    description: `Spawn a sub-agent to handle a complex task.

Creates a new AI agent with its own context to work on a specific sub-task.
The sub-agent has access to the same tools and will return its final response.
Use this for tasks that benefit from focused, independent reasoning.`,

    inputSchema: z.object({
      description: z
        .string()
        .describe("Brief description of the sub-task (3-5 words)"),
      prompt: z
        .string()
        .describe("Detailed instructions for the sub-agent"),
    }),

    execute: async ({ prompt }) => {
      try {
        const result = await generateText({
          model: options.model,
          tools: (options.tools ?? {}) as Record<string, Tool>,
          system: options.systemPrompt,
          prompt,
          stopWhen: stepCountIs(maxSteps),
        });
        return result.text || "(sub-agent produced no text output)";
      } catch (error) {
        return `Sub-agent error: ${(error as Error).message}`;
      }
    },
  });
}
