import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
  createMultiEditTool,
  createFileEditTools,
} from "./tools.js";
import { clearSession } from "./file-state.js";

let tmpDir: string;
const sessionId = `tools-test-${Date.now()}`;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tools-test-"));
});

afterEach(async () => {
  clearSession(sessionId);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createReadTool", () => {
  it("reads a file with line numbers", async () => {
    const filePath = path.join(tmpDir, "read.txt");
    await fs.writeFile(filePath, "line1\nline2\nline3");

    const tool = createReadTool({ sessionId, baseDir: tmpDir });
    const result = await tool.execute({ filePath }, { toolCallId: "1", messages: [], abortSignal: new AbortController().signal });
    expect(result).toContain("line1");
    expect(result).toContain("line2");
    expect(result).toContain("line3");
    expect(result).toContain("3 lines total");
  });

  it("supports offset and limit", async () => {
    const filePath = path.join(tmpDir, "offset.txt");
    await fs.writeFile(filePath, "a\nb\nc\nd\ne");

    const tool = createReadTool({ sessionId, baseDir: tmpDir });
    const result = await tool.execute(
      { filePath, offset: 2, limit: 2 },
      { toolCallId: "2", messages: [], abortSignal: new AbortController().signal }
    );
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).toContain("Showing lines 2-3");
  });

  it("truncates long lines", async () => {
    const filePath = path.join(tmpDir, "long.txt");
    const longLine = "x".repeat(3000);
    await fs.writeFile(filePath, longLine);

    const tool = createReadTool({ sessionId, baseDir: tmpDir, maxLineLength: 100 });
    const result = await tool.execute({ filePath }, { toolCallId: "3", messages: [], abortSignal: new AbortController().signal });
    expect(result).toContain("...");
    expect(result).not.toContain(longLine);
  });

  it("resolves relative paths with baseDir", async () => {
    const filePath = path.join(tmpDir, "relative.txt");
    await fs.writeFile(filePath, "content");

    const tool = createReadTool({ sessionId, baseDir: tmpDir });
    const result = await tool.execute(
      { filePath: "relative.txt" },
      { toolCallId: "4", messages: [], abortSignal: new AbortController().signal }
    );
    expect(result).toContain("content");
  });

  it("throws on relative path without baseDir", async () => {
    const tool = createReadTool({ sessionId });
    await expect(
      tool.execute(
        { filePath: "relative.txt" },
        { toolCallId: "5", messages: [], abortSignal: new AbortController().signal }
      )
    ).rejects.toThrow("relative but no baseDir");
  });
});

describe("createWriteTool", () => {
  it("creates a new file", async () => {
    const filePath = path.join(tmpDir, "new.txt");

    const tool = createWriteTool({ sessionId, baseDir: tmpDir, requireReadBeforeEdit: false });
    const result = await tool.execute(
      { filePath, content: "hello world" },
      { toolCallId: "6", messages: [], abortSignal: new AbortController().signal }
    );
    expect(result).toContain("File created");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("hello world");
  });

  it("creates parent directories", async () => {
    const filePath = path.join(tmpDir, "sub", "dir", "file.txt");

    const tool = createWriteTool({ sessionId, baseDir: tmpDir, requireReadBeforeEdit: false });
    await tool.execute(
      { filePath, content: "nested" },
      { toolCallId: "7", messages: [], abortSignal: new AbortController().signal }
    );
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("nested");
  });

  it("overwrites existing file and shows diff", async () => {
    const filePath = path.join(tmpDir, "overwrite.txt");
    await fs.writeFile(filePath, "original");

    // Read first to satisfy read-before-edit
    const readTool = createReadTool({ sessionId, baseDir: tmpDir });
    await readTool.execute({ filePath }, { toolCallId: "8a", messages: [], abortSignal: new AbortController().signal });

    const writeTool = createWriteTool({ sessionId, baseDir: tmpDir });
    const result = await writeTool.execute(
      { filePath, content: "updated" },
      { toolCallId: "8", messages: [], abortSignal: new AbortController().signal }
    );
    expect(result).toContain("File updated");
    expect(result).toContain("-original");
    expect(result).toContain("+updated");
  });

  it("enforces read-before-edit for existing files", async () => {
    const filePath = path.join(tmpDir, "protected.txt");
    await fs.writeFile(filePath, "content");

    const tool = createWriteTool({ sessionId: `fresh-${Date.now()}`, baseDir: tmpDir });
    await expect(
      tool.execute(
        { filePath, content: "new content" },
        { toolCallId: "9", messages: [], abortSignal: new AbortController().signal }
      )
    ).rejects.toThrow("Must read file");
  });
});

describe("createEditTool", () => {
  it("performs a simple edit", async () => {
    const filePath = path.join(tmpDir, "edit.txt");
    await fs.writeFile(filePath, "hello world");

    const readTool = createReadTool({ sessionId, baseDir: tmpDir });
    await readTool.execute({ filePath }, { toolCallId: "10a", messages: [], abortSignal: new AbortController().signal });

    const editTool = createEditTool({ sessionId, baseDir: tmpDir });
    const result = await editTool.execute(
      { filePath, oldString: "hello", newString: "goodbye" },
      { toolCallId: "10", messages: [], abortSignal: new AbortController().signal }
    );
    expect(result).toContain("Edit applied");

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("goodbye world");
  });

  it("supports replaceAll", async () => {
    const filePath = path.join(tmpDir, "replaceall.txt");
    await fs.writeFile(filePath, "foo bar foo baz foo");

    const readTool = createReadTool({ sessionId, baseDir: tmpDir });
    await readTool.execute({ filePath }, { toolCallId: "11a", messages: [], abortSignal: new AbortController().signal });

    const editTool = createEditTool({ sessionId, baseDir: tmpDir });
    await editTool.execute(
      { filePath, oldString: "foo", newString: "qux", replaceAll: true },
      { toolCallId: "11", messages: [], abortSignal: new AbortController().signal }
    );

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("qux bar qux baz qux");
  });

  it("uses fuzzy matching for whitespace differences", async () => {
    const filePath = path.join(tmpDir, "fuzzy.txt");
    await fs.writeFile(filePath, "  hello  \n  world  ");

    const readTool = createReadTool({ sessionId, baseDir: tmpDir });
    await readTool.execute({ filePath }, { toolCallId: "12a", messages: [], abortSignal: new AbortController().signal });

    const editTool = createEditTool({ sessionId, baseDir: tmpDir });
    await editTool.execute(
      { filePath, oldString: "hello\nworld", newString: "replaced" },
      { toolCallId: "12", messages: [], abortSignal: new AbortController().signal }
    );

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("replaced");
  });

  it("enforces read-before-edit", async () => {
    const filePath = path.join(tmpDir, "no-read.txt");
    await fs.writeFile(filePath, "content");

    const editTool = createEditTool({ sessionId: `fresh-edit-${Date.now()}`, baseDir: tmpDir });
    await expect(
      editTool.execute(
        { filePath, oldString: "content", newString: "new" },
        { toolCallId: "13", messages: [], abortSignal: new AbortController().signal }
      )
    ).rejects.toThrow("Must read file");
  });
});

describe("createMultiEditTool", () => {
  it("applies multiple edits atomically", async () => {
    const filePath = path.join(tmpDir, "multi.txt");
    await fs.writeFile(filePath, "aaa\nbbb\nccc");

    const readTool = createReadTool({ sessionId, baseDir: tmpDir });
    await readTool.execute({ filePath }, { toolCallId: "14a", messages: [], abortSignal: new AbortController().signal });

    const multiTool = createMultiEditTool({ sessionId, baseDir: tmpDir });
    const result = await multiTool.execute(
      {
        filePath,
        edits: [
          { oldString: "aaa", newString: "xxx" },
          { oldString: "ccc", newString: "zzz" },
        ],
      },
      { toolCallId: "14", messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toContain("Applied 2 edits");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("xxx\nbbb\nzzz");
  });

  it("rolls back on failure (does not write partial edits)", async () => {
    const filePath = path.join(tmpDir, "rollback.txt");
    await fs.writeFile(filePath, "aaa\nbbb");

    const readTool = createReadTool({ sessionId, baseDir: tmpDir });
    await readTool.execute({ filePath }, { toolCallId: "15a", messages: [], abortSignal: new AbortController().signal });

    const multiTool = createMultiEditTool({ sessionId, baseDir: tmpDir });
    await expect(
      multiTool.execute(
        {
          filePath,
          edits: [
            { oldString: "aaa", newString: "xxx" },
            { oldString: "nonexistent", newString: "yyy" },
          ],
        },
        { toolCallId: "15", messages: [], abortSignal: new AbortController().signal }
      )
    ).rejects.toThrow("Edit 2/2 failed");

    // Original content should be preserved
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("aaa\nbbb");
  });

  it("later edits see results of earlier edits", async () => {
    const filePath = path.join(tmpDir, "chain.txt");
    await fs.writeFile(filePath, "hello world");

    const readTool = createReadTool({ sessionId, baseDir: tmpDir });
    await readTool.execute({ filePath }, { toolCallId: "16a", messages: [], abortSignal: new AbortController().signal });

    const multiTool = createMultiEditTool({ sessionId, baseDir: tmpDir });
    await multiTool.execute(
      {
        filePath,
        edits: [
          { oldString: "hello", newString: "goodbye" },
          { oldString: "goodbye world", newString: "farewell earth" },
        ],
      },
      { toolCallId: "16", messages: [], abortSignal: new AbortController().signal }
    );

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("farewell earth");
  });
});

describe("createFileEditTools", () => {
  it("creates all four tools", () => {
    const tools = createFileEditTools({ sessionId, baseDir: tmpDir });
    expect(tools).toHaveProperty("read");
    expect(tools).toHaveProperty("write");
    expect(tools).toHaveProperty("edit");
    expect(tools).toHaveProperty("multiEdit");
  });
});
