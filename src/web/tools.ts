import { tool } from "ai";
import { z } from "zod/v4";
import type { WebFetchToolOptions } from "../types.js";

/**
 * Create a web fetch tool.
 */
export function createWebFetchTool(options: WebFetchToolOptions = {}) {
  const timeout = options.timeout ?? 10_000;
  const maxResponseSize = options.maxResponseSize ?? 1_048_576; // 1MB

  return tool({
    description: `Fetch a URL and return its content.

Makes an HTTP request and returns the response status, content type, and body.
Response body is truncated to ${Math.round(maxResponseSize / 1024)}KB.`,

    inputSchema: z.object({
      url: z.string().url().describe("The URL to fetch"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional HTTP headers"),
    }),

    execute: async ({ url, headers }) => {
      // Check allowed URLs
      if (options.allowedUrls && options.allowedUrls.length > 0) {
        const allowed = options.allowedUrls.some((pattern) =>
          pattern.test(url)
        );
        if (!allowed) {
          return `URL not allowed: ${url}`;
        }
      }

      // Check blocked URLs
      if (options.blockedUrls && options.blockedUrls.length > 0) {
        const blocked = options.blockedUrls.some((pattern) =>
          pattern.test(url)
        );
        if (blocked) {
          return `URL blocked: ${url}`;
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") || "unknown";
        const body = await response.text();
        const truncatedBody =
          body.length > maxResponseSize
            ? body.slice(0, maxResponseSize) +
              `\n... (truncated, ${body.length} total chars)`
            : body;

        return `Status: ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${truncatedBody}`;
      } catch (error) {
        if (controller.signal.aborted) {
          return `Request timed out after ${timeout}ms: ${url}`;
        }
        return `Fetch error: ${(error as Error).message}`;
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
