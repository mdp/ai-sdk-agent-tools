/**
 * Cascading replacement strategies for fuzzy text matching.
 * These handle LLM imprecision when reproducing exact text.
 */

export type Replacer = (content: string, find: string) => Generator<string>;

/**
 * Calculate Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length);

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Calculate similarity ratio between two strings (0-1).
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Strategy 1: Exact match - yields the search string itself.
 */
export function* simpleReplacer(
  _content: string,
  find: string
): Generator<string> {
  yield find;
}

/**
 * Strategy 2: Match lines ignoring leading/trailing whitespace per line.
 */
export function* lineTrimmedReplacer(
  content: string,
  find: string
): Generator<string> {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false;
        break;
      }
    }
    if (matches) {
      // Yield the ACTUAL content from file (preserving real indentation)
      yield originalLines.slice(i, i + searchLines.length).join("\n");
    }
  }
}

/**
 * Strategy 3: Block anchor matching - match first/last lines exactly,
 * use similarity scoring for middle lines.
 */
export function* blockAnchorReplacer(
  content: string,
  find: string
): Generator<string> {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");

  // Need at least 3 lines for anchor matching
  if (searchLines.length < 3) return;

  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();

  // Find all candidates where first AND last lines match
  const candidates: Array<{ startLine: number; endLine: number }> = [];

  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() === firstLineSearch) {
      for (let j = i + 2; j < originalLines.length; j++) {
        if (originalLines[j].trim() === lastLineSearch) {
          candidates.push({ startLine: i, endLine: j });
          break;
        }
      }
    }
  }

  if (candidates.length === 0) return;

  // Score candidates by middle line similarity
  const SINGLE_CANDIDATE_THRESHOLD = 0.0;
  const MULTI_CANDIDATE_THRESHOLD = 0.3;

  const threshold =
    candidates.length === 1
      ? SINGLE_CANDIDATE_THRESHOLD
      : MULTI_CANDIDATE_THRESHOLD;

  let bestCandidate: (typeof candidates)[0] | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const originalMiddle = originalLines
      .slice(candidate.startLine + 1, candidate.endLine)
      .join("\n");
    const searchMiddle = searchLines.slice(1, -1).join("\n");
    const score = similarity(originalMiddle, searchMiddle);

    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    yield originalLines
      .slice(bestCandidate.startLine, bestCandidate.endLine + 1)
      .join("\n");
  }
}

/**
 * Strategy 4: Normalize all whitespace to single spaces.
 */
export function* whitespaceNormalizedReplacer(
  content: string,
  find: string
): Generator<string> {
  const normalizedFind = find.replace(/\s+/g, " ").trim();
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    // Try matching from this line forward
    for (let len = 1; len <= lines.length - i && len <= 20; len++) {
      const block = lines.slice(i, i + len).join("\n");
      const normalizedBlock = block.replace(/\s+/g, " ").trim();

      if (normalizedBlock === normalizedFind) {
        yield block;
      }
    }
  }
}

/**
 * Strategy 5: Ignore indentation differences.
 */
export function* indentationFlexibleReplacer(
  content: string,
  find: string
): Generator<string> {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n").map((l) => l.trimStart());

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trimStart() !== searchLines[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      yield originalLines.slice(i, i + searchLines.length).join("\n");
    }
  }
}

/**
 * Strategy 6: Handle escape sequences (\n, \t, etc.)
 */
export function* escapeNormalizedReplacer(
  content: string,
  find: string
): Generator<string> {
  // Try interpreting escape sequences in the search string
  const unescaped = find
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");

  if (unescaped !== find && content.includes(unescaped)) {
    yield unescaped;
  }
}

/**
 * Strategy 7: Match trimmed text at boundaries.
 */
export function* trimmedBoundaryReplacer(
  content: string,
  find: string
): Generator<string> {
  const trimmedFind = find.trim();
  const index = content.indexOf(trimmedFind);

  if (index !== -1) {
    // Try to expand to include surrounding whitespace
    let start = index;
    let end = index + trimmedFind.length;

    // Expand to line boundaries
    while (start > 0 && content[start - 1] !== "\n") {
      start--;
    }
    while (end < content.length && content[end] !== "\n") {
      end++;
    }

    const expanded = content.slice(start, end);
    if (expanded.trim() === trimmedFind) {
      yield expanded;
    } else {
      yield trimmedFind;
    }
  }
}

/**
 * Strategy 8: Context-aware matching with 50% similarity on middle.
 */
export function* contextAwareReplacer(
  content: string,
  find: string
): Generator<string> {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");

  if (searchLines.length < 2) return;

  const firstLine = searchLines[0].trim();
  const CONTEXT_THRESHOLD = 0.5;

  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLine) continue;

    // Try different lengths
    for (
      let len = searchLines.length - 1;
      len <= searchLines.length + 1;
      len++
    ) {
      if (i + len > originalLines.length) continue;

      const candidate = originalLines.slice(i, i + len).join("\n");
      const score = similarity(candidate, find);

      if (score >= CONTEXT_THRESHOLD) {
        yield candidate;
      }
    }
  }
}

/**
 * The ordered list of replacers to try.
 */
export const REPLACERS: Replacer[] = [
  simpleReplacer,
  lineTrimmedReplacer,
  blockAnchorReplacer,
  whitespaceNormalizedReplacer,
  indentationFlexibleReplacer,
  escapeNormalizedReplacer,
  trimmedBoundaryReplacer,
  contextAwareReplacer,
];

/**
 * Perform replacement with cascading fuzzy matching.
 *
 * @param content - The file content
 * @param oldString - The text to replace
 * @param newString - The replacement text
 * @param replaceAll - Whether to replace all occurrences
 * @returns The modified content
 * @throws Error if oldString not found or multiple matches (when not replaceAll)
 */
export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false
): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }

  let notFound = true;

  for (const replacer of REPLACERS) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search);
      if (index === -1) continue;

      notFound = false;

      if (replaceAll) {
        return content.replaceAll(search, newString);
      }

      // Check for uniqueness
      const lastIndex = content.lastIndexOf(search);
      if (index !== lastIndex) continue; // Multiple matches, try next replacer

      // Single unique match - apply replacement
      return (
        content.substring(0, index) +
        newString +
        content.substring(index + search.length)
      );
    }
  }

  if (notFound) {
    throw new Error(
      "Could not find oldString in the file. Ensure you have the exact text including whitespace."
    );
  }

  throw new Error(
    "Found multiple matches for oldString. Provide more surrounding context to make the match unique, or use replaceAll."
  );
}
