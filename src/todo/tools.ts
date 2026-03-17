import { tool } from "ai";
import { z } from "zod/v4";
import { getTodos, setTodos, type TodoItem } from "./state.js";
import type { TodoToolOptions } from "../types.js";

const todoItemSchema = z.object({
  id: z.string().describe("Unique identifier for the todo item"),
  content: z.string().describe("Description of the task"),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .describe("Current status"),
  priority: z.enum(["high", "medium", "low"]).describe("Priority level"),
});

/**
 * Create a todo write tool that replaces the entire todo list.
 */
export function createTodoWriteTool(options: TodoToolOptions = {}) {
  const sessionId = options.sessionId ?? "default";

  return tool({
    description: `Write/replace the entire todo list.

Replaces the current todo list with the provided items.
Use this to track tasks, progress, and priorities during a session.`,

    inputSchema: z.object({
      todos: z.array(todoItemSchema).describe("The complete list of todo items"),
    }),

    execute: async ({ todos }) => {
      setTodos(sessionId, todos as TodoItem[]);
      return `Updated todo list: ${todos.length} item(s)`;
    },
  });
}

/**
 * Create a todo read tool that returns the current todo list.
 */
export function createTodoReadTool(options: TodoToolOptions = {}) {
  const sessionId = options.sessionId ?? "default";

  return tool({
    description: `Read the current todo list.

Returns all todo items with their status and priority.`,

    inputSchema: z.object({}),

    execute: async () => {
      const todos = getTodos(sessionId);
      if (todos.length === 0) {
        return "No todos found.";
      }

      const statusIcons: Record<string, string> = {
        pending: "[ ]",
        in_progress: "[~]",
        completed: "[x]",
        cancelled: "[-]",
      };

      const lines = todos.map((t) => {
        const icon = statusIcons[t.status] || "[ ]";
        return `${icon} [${t.priority}] ${t.id}: ${t.content}`;
      });

      return `Todo list (${todos.length} items):\n${lines.join("\n")}`;
    },
  });
}

export function createTodoTools(options: TodoToolOptions = {}) {
  return {
    todoRead: createTodoReadTool(options),
    todoWrite: createTodoWriteTool(options),
  };
}
