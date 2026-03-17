import { describe, it, expect, beforeEach } from "vitest";
import { createTodoReadTool, createTodoWriteTool, createTodoTools } from "./tools.js";
import { getTodos, clearTodos } from "./state.js";

const sessionId = `todo-test-${Date.now()}`;
const ctx = { toolCallId: "1", messages: [] as any[], abortSignal: new AbortController().signal };

beforeEach(() => {
  clearTodos(sessionId);
});

describe("createTodoWriteTool", () => {
  it("writes todos", async () => {
    const tool = createTodoWriteTool({ sessionId });
    const result = await tool.execute({
      todos: [
        { id: "1", content: "First task", status: "pending", priority: "high" },
        { id: "2", content: "Second task", status: "in_progress", priority: "medium" },
      ],
    }, ctx);

    expect(result).toContain("2 item(s)");
    const todos = getTodos(sessionId);
    expect(todos).toHaveLength(2);
    expect(todos[0].content).toBe("First task");
  });

  it("replaces existing todos", async () => {
    const tool = createTodoWriteTool({ sessionId });
    await tool.execute({
      todos: [
        { id: "1", content: "Original", status: "pending", priority: "low" },
      ],
    }, ctx);

    await tool.execute({
      todos: [
        { id: "2", content: "Replacement", status: "completed", priority: "high" },
      ],
    }, ctx);

    const todos = getTodos(sessionId);
    expect(todos).toHaveLength(1);
    expect(todos[0].content).toBe("Replacement");
  });
});

describe("createTodoReadTool", () => {
  it("returns empty message when no todos", async () => {
    const tool = createTodoReadTool({ sessionId });
    const result = await tool.execute({}, ctx);
    expect(result).toContain("No todos found");
  });

  it("returns formatted todo list", async () => {
    const writeTool = createTodoWriteTool({ sessionId });
    await writeTool.execute({
      todos: [
        { id: "task-1", content: "Build feature", status: "in_progress", priority: "high" },
        { id: "task-2", content: "Write tests", status: "pending", priority: "medium" },
        { id: "task-3", content: "Old task", status: "completed", priority: "low" },
        { id: "task-4", content: "Dropped", status: "cancelled", priority: "low" },
      ],
    }, ctx);

    const readTool = createTodoReadTool({ sessionId });
    const result = await readTool.execute({}, ctx);
    expect(result).toContain("4 items");
    expect(result).toContain("[~]");
    expect(result).toContain("[ ]");
    expect(result).toContain("[x]");
    expect(result).toContain("[-]");
    expect(result).toContain("[high]");
    expect(result).toContain("Build feature");
  });
});

describe("createTodoTools", () => {
  it("creates both tools", () => {
    const tools = createTodoTools({ sessionId });
    expect(tools).toHaveProperty("todoRead");
    expect(tools).toHaveProperty("todoWrite");
  });
});
