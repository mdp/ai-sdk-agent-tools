import type { Tool } from "ai";
import type { AgentToolsOptions } from "./types.js";
import { createFileEditTools } from "./file/tools.js";
import { createFsTools } from "./fs/tools.js";
import { createTodoTools } from "./todo/tools.js";
import { createBashTool } from "./bash/tools.js";
import { createWebFetchTool } from "./web/tools.js";
import { createTaskTool } from "./task/tools.js";

/**
 * Create a combined set of agent tools.
 *
 * - fileEdit: included by default (pass false to exclude)
 * - fs (glob, grep, list): included by default (pass false to exclude)
 * - todo: included by default (pass false to exclude)
 * - bash: OFF by default (must pass options object to enable)
 * - webFetch: OFF by default (must pass options object to enable)
 * - task: OFF by default (requires model option)
 */
export function createAgentTools(
  options: AgentToolsOptions = {}
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  // File editing tools (on by default)
  if (options.fileEdit !== false) {
    const fileOpts = {
      baseDir: options.baseDir,
      sessionId: options.sessionId,
      ...(typeof options.fileEdit === "object" ? options.fileEdit : {}),
    };
    const fileTools = createFileEditTools(fileOpts);
    Object.assign(tools, fileTools);
  }

  // Filesystem tools (on by default)
  if (options.fs !== false) {
    const fsOpts = {
      baseDir: options.baseDir,
      ...(typeof options.fs === "object" ? options.fs : {}),
    };
    const fsTools = createFsTools(fsOpts);
    Object.assign(tools, fsTools);
  }

  // Todo tools (on by default)
  if (options.todo !== false) {
    const todoOpts = {
      baseDir: options.baseDir,
      sessionId: options.sessionId,
      ...(typeof options.todo === "object" ? options.todo : {}),
    };
    const todoTools = createTodoTools(todoOpts);
    Object.assign(tools, todoTools);
  }

  // Bash tool (off by default)
  if (options.bash) {
    const bashOpts = {
      baseDir: options.baseDir,
      ...options.bash,
    };
    tools.bash = createBashTool(bashOpts);
  }

  // Web fetch tool (off by default)
  if (options.webFetch) {
    tools.webFetch = createWebFetchTool(options.webFetch);
  }

  // Task tool (off by default, requires model)
  if (options.task) {
    // Give the sub-agent all tools except itself (recursion guard)
    const taskTools = { ...tools };
    tools.task = createTaskTool({
      ...options.task,
      tools: options.task.tools ?? taskTools,
    });
  }

  return tools;
}
