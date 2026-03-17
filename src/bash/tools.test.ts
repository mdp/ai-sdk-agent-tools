import { describe, it, expect } from "vitest";
import * as os from "node:os";
import { createBashTool } from "./tools.js";

const ctx = { toolCallId: "1", messages: [] as any[], abortSignal: new AbortController().signal };

describe("createBashTool", () => {
  it("executes a simple command", async () => {
    const tool = createBashTool({ baseDir: os.tmpdir() });
    const result = await tool.execute({ command: "echo hello" }, ctx);
    expect(result).toContain("Exit code: 0");
    expect(result).toContain("hello");
  });

  it("captures stderr", async () => {
    const tool = createBashTool({ baseDir: os.tmpdir() });
    const result = await tool.execute({ command: "echo err >&2" }, ctx);
    expect(result).toContain("stderr:");
    expect(result).toContain("err");
  });

  it("reports non-zero exit code", async () => {
    const tool = createBashTool({ baseDir: os.tmpdir() });
    const result = await tool.execute({ command: "exit 42" }, ctx);
    expect(result).toContain("Exit code:");
  });

  it("respects allowedCommands", async () => {
    const tool = createBashTool({
      allowedCommands: [/^echo /],
    });
    const allowed = await tool.execute({ command: "echo hi" }, ctx);
    expect(allowed).toContain("Exit code: 0");

    const blocked = await tool.execute({ command: "ls -la" }, ctx);
    expect(blocked).toContain("Command not allowed");
  });

  it("respects blockedCommands", async () => {
    const tool = createBashTool({
      blockedCommands: [/rm\s/],
    });
    const result = await tool.execute({ command: "rm -rf /" }, ctx);
    expect(result).toContain("Command blocked");
  });

  it("respects approve callback", async () => {
    const tool = createBashTool({
      approve: (cmd) => cmd.startsWith("echo"),
    });

    const allowed = await tool.execute({ command: "echo ok" }, ctx);
    expect(allowed).toContain("Exit code: 0");

    const denied = await tool.execute({ command: "ls" }, ctx);
    expect(denied).toContain("Command not approved");
  });

  it("times out long commands", async () => {
    const tool = createBashTool({ timeout: 500 });
    const result = await tool.execute({ command: "sleep 10" }, ctx);
    expect(result).toContain("timed out");
  }, 5000);

  it("uses baseDir as cwd", async () => {
    const tool = createBashTool({ baseDir: os.tmpdir() });
    const result = await tool.execute({ command: "pwd" }, ctx);
    expect(result).toContain(os.tmpdir());
  });
});
