import { describe, it, expect, vi } from "vitest";

// Mock generateText before importing createAgentTools
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({ text: "done" }),
  };
});

import { createAgentTools } from "./create-agent-tools.js";

describe("createAgentTools", () => {
  it("includes file, fs, and todo tools by default", () => {
    const tools = createAgentTools();
    // File editing tools
    expect(tools).toHaveProperty("read");
    expect(tools).toHaveProperty("write");
    expect(tools).toHaveProperty("edit");
    expect(tools).toHaveProperty("multiEdit");
    // Fs tools
    expect(tools).toHaveProperty("list");
    expect(tools).toHaveProperty("glob");
    expect(tools).toHaveProperty("grep");
    // Todo tools
    expect(tools).toHaveProperty("todoRead");
    expect(tools).toHaveProperty("todoWrite");
  });

  it("excludes bash, webFetch, and task by default", () => {
    const tools = createAgentTools();
    expect(tools).not.toHaveProperty("bash");
    expect(tools).not.toHaveProperty("webFetch");
    expect(tools).not.toHaveProperty("task");
  });

  it("includes bash when options provided", () => {
    const tools = createAgentTools({ bash: {} });
    expect(tools).toHaveProperty("bash");
  });

  it("includes webFetch when options provided", () => {
    const tools = createAgentTools({ webFetch: {} });
    expect(tools).toHaveProperty("webFetch");
  });

  it("includes task when model provided", () => {
    const tools = createAgentTools({ task: { model: "mock" as any } });
    expect(tools).toHaveProperty("task");
  });

  it("excludes file tools when fileEdit is false", () => {
    const tools = createAgentTools({ fileEdit: false });
    expect(tools).not.toHaveProperty("read");
    expect(tools).not.toHaveProperty("write");
    expect(tools).toHaveProperty("glob");
  });

  it("excludes fs tools when fs is false", () => {
    const tools = createAgentTools({ fs: false });
    expect(tools).not.toHaveProperty("list");
    expect(tools).not.toHaveProperty("glob");
    expect(tools).not.toHaveProperty("grep");
    expect(tools).toHaveProperty("read");
  });

  it("excludes todo tools when todo is false", () => {
    const tools = createAgentTools({ todo: false });
    expect(tools).not.toHaveProperty("todoRead");
    expect(tools).not.toHaveProperty("todoWrite");
    expect(tools).toHaveProperty("read");
  });

  it("cascades baseDir to sub-tools", () => {
    const tools = createAgentTools({ baseDir: "/tmp" });
    // Just verify it doesn't throw and tools are created
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });
});
