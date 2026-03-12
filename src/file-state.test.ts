import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  recordRead,
  getReadTime,
  clearSession,
  assertFileNotModified,
  withFileLock,
  createDiff,
} from "./file-state.js";

describe("recordRead / getReadTime", () => {
  const session = `test-${Date.now()}-${Math.random()}`;

  it("returns undefined for unread file", () => {
    expect(getReadTime(session, "/no/such/file")).toBeUndefined();
  });

  it("records and retrieves read time", () => {
    const before = new Date();
    recordRead(session, "/test/file.txt");
    const readTime = getReadTime(session, "/test/file.txt");
    expect(readTime).toBeInstanceOf(Date);
    expect(readTime!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("updates read time on subsequent reads", async () => {
    recordRead(session, "/test/update.txt");
    const first = getReadTime(session, "/test/update.txt")!;
    await new Promise((r) => setTimeout(r, 10));
    recordRead(session, "/test/update.txt");
    const second = getReadTime(session, "/test/update.txt")!;
    expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
  });
});

describe("clearSession", () => {
  it("removes all read times for a session", () => {
    const session = `clear-test-${Date.now()}`;
    recordRead(session, "/a.txt");
    recordRead(session, "/b.txt");
    clearSession(session);
    expect(getReadTime(session, "/a.txt")).toBeUndefined();
    expect(getReadTime(session, "/b.txt")).toBeUndefined();
  });

  it("does not affect other sessions", () => {
    const s1 = `s1-${Date.now()}`;
    const s2 = `s2-${Date.now()}`;
    recordRead(s1, "/file.txt");
    recordRead(s2, "/file.txt");
    clearSession(s1);
    expect(getReadTime(s1, "/file.txt")).toBeUndefined();
    expect(getReadTime(s2, "/file.txt")).toBeDefined();
  });
});

describe("assertFileNotModified", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-state-test-"));
  });

  it("throws if file was never read", async () => {
    const session = `assert-test-${Date.now()}`;
    await expect(
      assertFileNotModified(session, path.join(tmpDir, "file.txt"))
    ).rejects.toThrow("Must read file");
  });

  it("succeeds if file was read and not modified", async () => {
    const session = `assert-ok-${Date.now()}`;
    const filePath = path.join(tmpDir, "stable.txt");
    await fs.writeFile(filePath, "content");
    recordRead(session, filePath);
    await expect(
      assertFileNotModified(session, filePath)
    ).resolves.toBeUndefined();
  });

  it("throws if file was modified after read", async () => {
    const session = `assert-mod-${Date.now()}`;
    const filePath = path.join(tmpDir, "modified.txt");
    await fs.writeFile(filePath, "original");
    recordRead(session, filePath);
    // Wait then modify
    await new Promise((r) => setTimeout(r, 100));
    await fs.writeFile(filePath, "changed");
    await expect(
      assertFileNotModified(session, filePath)
    ).rejects.toThrow("was modified since");
  });

  it("succeeds if file does not exist (new file case)", async () => {
    const session = `assert-new-${Date.now()}`;
    const filePath = path.join(tmpDir, "nonexistent.txt");
    recordRead(session, filePath);
    await expect(
      assertFileNotModified(session, filePath)
    ).resolves.toBeUndefined();
  });
});

describe("withFileLock", () => {
  it("executes function and returns result", async () => {
    const result = await withFileLock("/test/lock.txt", async () => 42);
    expect(result).toBe(42);
  });

  it("serializes concurrent writes to same file", async () => {
    const order: number[] = [];
    const file = `/lock-test-${Date.now()}`;

    const p1 = withFileLock(file, async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
    });

    const p2 = withFileLock(file, async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it("allows concurrent writes to different files", async () => {
    const order: number[] = [];

    const p1 = withFileLock(`/lock-a-${Date.now()}`, async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
    });

    const p2 = withFileLock(`/lock-b-${Date.now()}`, async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    // 2 should complete before 1 since different files
    expect(order).toEqual([2, 1]);
  });

  it("releases lock on error", async () => {
    const file = `/lock-err-${Date.now()}`;
    await expect(
      withFileLock(file, async () => {
        throw new Error("oops");
      })
    ).rejects.toThrow("oops");

    // Should still be able to acquire lock
    const result = await withFileLock(file, async () => "ok");
    expect(result).toBe("ok");
  });
});

describe("createDiff", () => {
  it("shows added and removed lines", () => {
    const diff = createDiff("test.txt", "hello\nworld", "hello\nearth");
    expect(diff).toContain("--- test.txt");
    expect(diff).toContain("+++ test.txt");
    expect(diff).toContain("-world");
    expect(diff).toContain("+earth");
  });

  it("returns header only for identical content", () => {
    const diff = createDiff("test.txt", "hello", "hello");
    expect(diff).toContain("--- test.txt");
    expect(diff).not.toContain("-hello");
    expect(diff).not.toContain("+hello");
  });

  it("handles new lines added at end", () => {
    const diff = createDiff("test.txt", "line1", "line1\nline2");
    expect(diff).toContain("+line2");
  });

  it("handles lines removed from end", () => {
    const diff = createDiff("test.txt", "line1\nline2", "line1");
    expect(diff).toContain("-line2");
  });
});
