import * as fs from "node:fs/promises";

/**
 * Tracks file read times and provides locking for concurrent write safety.
 * This ensures the read-before-edit pattern is enforced.
 */

interface FileStateStore {
  /** Map of sessionId -> filePath -> read timestamp */
  readTimes: Map<string, Map<string, Date>>;
  /** Map of filePath -> lock promise for serializing writes */
  locks: Map<string, Promise<void>>;
}

const state: FileStateStore = {
  readTimes: new Map(),
  locks: new Map(),
};

/**
 * Record that a file was read in a session.
 */
export function recordRead(sessionId: string, filePath: string): void {
  let sessionReads = state.readTimes.get(sessionId);
  if (!sessionReads) {
    sessionReads = new Map();
    state.readTimes.set(sessionId, sessionReads);
  }
  sessionReads.set(filePath, new Date());
}

/**
 * Get the last read time for a file in a session.
 */
export function getReadTime(
  sessionId: string,
  filePath: string
): Date | undefined {
  return state.readTimes.get(sessionId)?.get(filePath);
}

/**
 * Clear read times for a session.
 */
export function clearSession(sessionId: string): void {
  state.readTimes.delete(sessionId);
}

/**
 * Check if a file was read and hasn't been modified since.
 * @throws Error if file wasn't read or was modified externally
 */
export async function assertFileNotModified(
  sessionId: string,
  filePath: string
): Promise<void> {
  const readTime = getReadTime(sessionId, filePath);

  if (!readTime) {
    throw new Error(
      `Must read file "${filePath}" before editing. Use the read tool first.`
    );
  }

  try {
    const stat = await fs.stat(filePath);
    // Allow 50ms tolerance for filesystem timestamp fuzziness
    if (stat.mtime.getTime() > readTime.getTime() + 50) {
      throw new Error(
        `File "${filePath}" was modified since it was last read. Read it again before editing.`
      );
    }
  } catch (err) {
    // File might not exist yet (for new files), that's okay
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Execute a function while holding a lock on a file path.
 * This serializes concurrent writes to the same file.
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  const currentLock = state.locks.get(filePath) ?? Promise.resolve();

  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  state.locks.set(filePath, currentLock.then(() => nextLock));

  await currentLock;

  try {
    return await fn();
  } finally {
    release!();
  }
}

/**
 * Create a diff output showing changes.
 * Uses a simple unified diff format.
 */
export function createDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const output: string[] = [];
  output.push(`--- ${filePath}`);
  output.push(`+++ ${filePath}`);

  // Simple line-by-line diff
  const maxLines = Math.max(oldLines.length, newLines.length);
  let contextStart = -1;
  let changes: string[] = [];

  const flushChanges = () => {
    if (changes.length > 0) {
      output.push(`@@ -${contextStart + 1} @@`);
      output.push(...changes);
      changes = [];
      contextStart = -1;
    }
  };

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (changes.length > 0) {
        changes.push(` ${oldLine ?? ""}`);
        if (
          changes.filter((c) => c.startsWith(" ")).length > 3 &&
          changes[changes.length - 1].startsWith(" ")
        ) {
          flushChanges();
        }
      }
    } else {
      if (contextStart === -1) {
        contextStart = Math.max(0, i - 3);
        // Add context before
        for (let j = contextStart; j < i; j++) {
          if (oldLines[j] !== undefined) {
            changes.push(` ${oldLines[j]}`);
          }
        }
      }
      if (oldLine !== undefined) {
        changes.push(`-${oldLine}`);
      }
      if (newLine !== undefined) {
        changes.push(`+${newLine}`);
      }
    }
  }

  flushChanges();

  return output.join("\n");
}
