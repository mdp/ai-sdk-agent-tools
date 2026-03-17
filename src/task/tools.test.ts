import { describe, it, expect, vi } from "vitest";
import { createTaskTool } from "./tools.js";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({
      text: "Sub-agent completed the task successfully.",
    }),
  };
});

const ctx = { toolCallId: "1", messages: [] as any[], abortSignal: new AbortController().signal };

describe("createTaskTool", () => {
  it("calls generateText and returns result", async () => {
    const { generateText } = await import("ai");

    const tool = createTaskTool({
      model: "mock-model" as any,
      systemPrompt: "You are a helpful assistant.",
    });

    const result = await tool.execute(
      { description: "Test task", prompt: "Do something" },
      ctx
    );

    expect(result).toBe("Sub-agent completed the task successfully.");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        system: "You are a helpful assistant.",
        prompt: "Do something",
      })
    );
  });

  it("handles errors gracefully", async () => {
    const { generateText } = await import("ai");
    (generateText as any).mockRejectedValueOnce(new Error("API error"));

    const tool = createTaskTool({ model: "mock-model" as any });
    const result = await tool.execute(
      { description: "Failing task", prompt: "Fail" },
      ctx
    );

    expect(result).toContain("Sub-agent error");
    expect(result).toContain("API error");
  });
});
