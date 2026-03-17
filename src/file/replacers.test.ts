import { describe, it, expect } from "vitest";
import {
  levenshtein,
  similarity,
  simpleReplacer,
  lineTrimmedReplacer,
  blockAnchorReplacer,
  whitespaceNormalizedReplacer,
  indentationFlexibleReplacer,
  escapeNormalizedReplacer,
  trimmedBoundaryReplacer,
  contextAwareReplacer,
  replace,
} from "./replacers.js";

function collect(gen: Generator<string>): string[] {
  return [...gen];
}

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns length for empty vs non-empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("computes single substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("computes insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("computes deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("handles completely different strings", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("abc", "abc")).toBe(1);
  });

  it("returns 1 for two empty strings", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("returns 0 for completely different strings of same length", () => {
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("returns a value between 0 and 1 for partially similar strings", () => {
    const s = similarity("hello", "hallo");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo(0.8);
  });
});

describe("simpleReplacer", () => {
  it("yields the find string as-is", () => {
    expect(collect(simpleReplacer("content", "find"))).toEqual(["find"]);
  });
});

describe("lineTrimmedReplacer", () => {
  it("matches lines ignoring leading/trailing whitespace", () => {
    const content = "  hello world  \n  foo bar  ";
    const find = "hello world\nfoo bar";
    const results = collect(lineTrimmedReplacer(content, find));
    expect(results).toEqual(["  hello world  \n  foo bar  "]);
  });

  it("returns empty when no match", () => {
    const content = "hello\nworld";
    const find = "foo\nbar";
    expect(collect(lineTrimmedReplacer(content, find))).toEqual([]);
  });

  it("finds match in the middle of content", () => {
    const content = "line1\n  target  \n  match  \nline4";
    const find = "target\nmatch";
    const results = collect(lineTrimmedReplacer(content, find));
    expect(results).toEqual(["  target  \n  match  "]);
  });
});

describe("blockAnchorReplacer", () => {
  it("requires at least 3 lines", () => {
    const content = "line1\nline2";
    const find = "line1\nline2";
    expect(collect(blockAnchorReplacer(content, find))).toEqual([]);
  });

  it("matches when first and last lines match exactly (trimmed)", () => {
    const content = "start\nmiddle stuff\nend";
    const find = "start\nmiddle things\nend";
    const results = collect(blockAnchorReplacer(content, find));
    expect(results).toEqual(["start\nmiddle stuff\nend"]);
  });

  it("returns empty when anchors don't match", () => {
    const content = "start\nmiddle\nend";
    const find = "begin\nmiddle\nfinish";
    expect(collect(blockAnchorReplacer(content, find))).toEqual([]);
  });
});

describe("whitespaceNormalizedReplacer", () => {
  it("matches with normalized whitespace", () => {
    const content = "hello   world\n  foo   bar";
    const find = "hello world\nfoo bar";
    const results = collect(whitespaceNormalizedReplacer(content, find));
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty when no match", () => {
    const content = "hello world";
    const find = "goodbye world";
    expect(collect(whitespaceNormalizedReplacer(content, find))).toEqual([]);
  });
});

describe("indentationFlexibleReplacer", () => {
  it("matches ignoring indentation differences", () => {
    const content = "    function foo() {\n      return 1;\n    }";
    const find = "function foo() {\n  return 1;\n}";
    const results = collect(indentationFlexibleReplacer(content, find));
    expect(results).toEqual([content]);
  });

  it("returns empty when content differs beyond indentation", () => {
    const content = "    function foo() {}";
    const find = "function bar() {}";
    expect(collect(indentationFlexibleReplacer(content, find))).toEqual([]);
  });
});

describe("escapeNormalizedReplacer", () => {
  it("matches when find contains literal escape sequences", () => {
    const content = "hello\nworld";
    const find = "hello\\nworld";
    const results = collect(escapeNormalizedReplacer(content, find));
    expect(results).toEqual(["hello\nworld"]);
  });

  it("handles \\t escape sequences", () => {
    const content = "hello\tworld";
    const find = "hello\\tworld";
    const results = collect(escapeNormalizedReplacer(content, find));
    expect(results).toEqual(["hello\tworld"]);
  });

  it("returns empty when no escape difference exists", () => {
    const content = "hello world";
    const find = "hello world";
    expect(collect(escapeNormalizedReplacer(content, find))).toEqual([]);
  });
});

describe("trimmedBoundaryReplacer", () => {
  it("matches trimmed text and expands to line boundaries", () => {
    const content = "before\n   target text   \nafter";
    const find = "target text";
    const results = collect(trimmedBoundaryReplacer(content, find));
    expect(results.length).toBe(1);
    expect(results[0].trim()).toBe("target text");
  });

  it("returns empty when text not found", () => {
    const content = "hello world";
    const find = "goodbye world";
    expect(collect(trimmedBoundaryReplacer(content, find))).toEqual([]);
  });
});

describe("contextAwareReplacer", () => {
  it("requires at least 2 lines", () => {
    const content = "single line";
    const find = "single line";
    expect(collect(contextAwareReplacer(content, find))).toEqual([]);
  });

  it("matches based on first line anchor and similarity", () => {
    const content = "function foo() {\n  return 1;\n}";
    const find = "function foo() {\n  return 2;\n}";
    const results = collect(contextAwareReplacer(content, find));
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("replace", () => {
  it("performs exact replacement", () => {
    const result = replace("hello world", "hello", "goodbye");
    expect(result).toBe("goodbye world");
  });

  it("throws when oldString equals newString", () => {
    expect(() => replace("content", "same", "same")).toThrow(
      "No changes to apply"
    );
  });

  it("throws when oldString not found", () => {
    expect(() => replace("hello world", "missing", "replacement")).toThrow(
      "Could not find oldString"
    );
  });

  it("throws when multiple exact matches and not replaceAll", () => {
    expect(() =>
      replace("hello hello", "hello", "goodbye")
    ).toThrow("multiple matches");
  });

  it("replaces all occurrences with replaceAll=true", () => {
    const result = replace("hello hello", "hello", "goodbye", true);
    expect(result).toBe("goodbye goodbye");
  });

  it("handles fuzzy matching via line trimming", () => {
    const content = "  hello  \n  world  ";
    const result = replace(content, "hello\nworld", "replaced");
    expect(result).toBe("replaced");
  });

  it("handles whitespace-normalized matching", () => {
    const content = "hello   world";
    const result = replace(content, "hello world", "goodbye world");
    expect(result).toBe("goodbye world");
  });

  it("handles indentation-flexible matching", () => {
    const content = "    return 1;";
    // The indentation-flexible replacer finds "    return 1;" and replaces it
    const result = replace(content, "return 1;", "return 2;");
    expect(result).toBe("    return 2;");
  });

  it("handles escape-normalized matching", () => {
    const content = "line1\nline2";
    const result = replace(content, "line1\\nline2", "replaced");
    expect(result).toBe("replaced");
  });

  it("preserves content around the replacement", () => {
    const content = "before\ntarget\nafter";
    const result = replace(content, "target", "replaced");
    expect(result).toBe("before\nreplaced\nafter");
  });

  it("handles multiline replacement", () => {
    const content = "line1\nline2\nline3\nline4";
    const result = replace(content, "line2\nline3", "replaced2\nreplaced3");
    expect(result).toBe("line1\nreplaced2\nreplaced3\nline4");
  });
});
