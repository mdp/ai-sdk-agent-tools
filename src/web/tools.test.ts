import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWebFetchTool } from "./tools.js";

const ctx = { toolCallId: "1", messages: [] as any[], abortSignal: new AbortController().signal };

describe("createWebFetchTool", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches a URL successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<h1>Hello</h1>"),
    }) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result).toContain("Status: 200 OK");
    expect(result).toContain("Content-Type: text/html");
    expect(result).toContain("<h1>Hello</h1>");
  });

  it("respects allowedUrls", async () => {
    const tool = createWebFetchTool({
      allowedUrls: [/^https:\/\/example\.com/],
    });

    const result = await tool.execute({ url: "https://evil.com" }, ctx);
    expect(result).toContain("URL not allowed");
  });

  it("respects blockedUrls", async () => {
    const tool = createWebFetchTool({
      blockedUrls: [/evil\.com/],
    });

    const result = await tool.execute({ url: "https://evil.com/path" }, ctx);
    expect(result).toContain("URL blocked");
  });

  it("truncates large responses", async () => {
    const bigBody = "x".repeat(2000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve(bigBody),
    }) as any;

    const tool = createWebFetchTool({ maxResponseSize: 100 });
    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result).toContain("truncated");
    expect(result).not.toContain(bigBody);
  });

  it("handles fetch errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result).toContain("Fetch error");
    expect(result).toContain("Network error");
  });
});
