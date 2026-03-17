import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createListTool, createGlobTool, createGrepTool, createFsTools } from "./tools.js";

let tmpDir: string;
const ctx = { toolCallId: "1", messages: [] as any[], abortSignal: new AbortController().signal };

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-tools-test-"));
  // Create test structure
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "lib"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "src", "index.ts"), "export const foo = 1;\nexport const bar = 2;\n");
  await fs.writeFile(path.join(tmpDir, "src", "utils.ts"), "export function helper() { return true; }\n");
  await fs.writeFile(path.join(tmpDir, "lib", "data.json"), '{"key": "value"}\n');
  await fs.writeFile(path.join(tmpDir, "readme.md"), "# Test Project\n");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createListTool", () => {
  it("lists files and directories", async () => {
    const tool = createListTool({ baseDir: tmpDir });
    const result = await tool.execute({ path: tmpDir }, ctx);
    expect(result).toContain("[dir]  src");
    expect(result).toContain("[dir]  lib");
    expect(result).toContain("[file]  readme.md");
  });

  it("lists subdirectory contents", async () => {
    const tool = createListTool({ baseDir: tmpDir });
    const result = await tool.execute({ path: path.join(tmpDir, "src") }, ctx);
    expect(result).toContain("[file]  index.ts");
    expect(result).toContain("[file]  utils.ts");
  });

  it("resolves relative paths with baseDir", async () => {
    const tool = createListTool({ baseDir: tmpDir });
    const result = await tool.execute({ path: "src" }, ctx);
    expect(result).toContain("[file]  index.ts");
  });
});

describe("createGlobTool", () => {
  it("finds files by pattern", async () => {
    const tool = createGlobTool({ baseDir: tmpDir });
    const result = await tool.execute({ pattern: "**/*.ts" }, ctx);
    expect(result).toContain("index.ts");
    expect(result).toContain("utils.ts");
    expect(result).not.toContain("data.json");
  });

  it("finds files with specific extension", async () => {
    const tool = createGlobTool({ baseDir: tmpDir });
    const result = await tool.execute({ pattern: "**/*.json" }, ctx);
    expect(result).toContain("data.json");
    expect(result).not.toContain("index.ts");
  });

  it("searches in subdirectory", async () => {
    const tool = createGlobTool({ baseDir: tmpDir });
    const result = await tool.execute({ pattern: "*.ts", path: "src" }, ctx);
    expect(result).toContain("index.ts");
  });
});

describe("createGrepTool", () => {
  it("finds matching lines", async () => {
    const tool = createGrepTool({ baseDir: tmpDir });
    const result = await tool.execute({ pattern: "export const" }, ctx);
    expect(result).toContain("index.ts");
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });

  it("filters by include pattern", async () => {
    const tool = createGrepTool({ baseDir: tmpDir });
    const result = await tool.execute({ pattern: "export", include: "**/*.ts" }, ctx);
    expect(result).toContain("index.ts");
    expect(result).not.toContain("data.json");
  });

  it("returns no matches message", async () => {
    const tool = createGrepTool({ baseDir: tmpDir });
    const result = await tool.execute({ pattern: "nonexistent_string_xyz" }, ctx);
    expect(result).toContain("No matches found");
  });

  it("handles invalid regex", async () => {
    const tool = createGrepTool({ baseDir: tmpDir });
    const result = await tool.execute({ pattern: "[invalid" }, ctx);
    expect(result).toContain("Invalid regex");
  });
});

describe("createFsTools", () => {
  it("creates all three tools", () => {
    const tools = createFsTools({ baseDir: tmpDir });
    expect(tools).toHaveProperty("list");
    expect(tools).toHaveProperty("glob");
    expect(tools).toHaveProperty("grep");
  });
});
