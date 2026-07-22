import { describe, expect, it } from "vite-plus/test";

import { filterUnifiedDiffFiles, parseTurnDiffFilesFromNumstat } from "./Diffs.ts";

describe("parseTurnDiffFilesFromNumstat", () => {
  it("returns an empty list when no files changed", () => {
    expect(parseTurnDiffFilesFromNumstat("")).toEqual([]);
  });

  it("sorts files and preserves addition and deletion counts", () => {
    const numstat = ["0\t2\tsrc/b.ts", "2\t1\ta.txt", ""].join("\0");
    expect(parseTurnDiffFilesFromNumstat(numstat)).toEqual([
      { path: "a.txt", additions: 2, deletions: 1 },
      { path: "src/b.ts", additions: 0, deletions: 2 },
    ]);
  });

  it("uses destination paths for renames and copies", () => {
    const numstat = [
      "0\t0\t",
      "src/old.ts",
      "src/new.ts",
      "2\t1\t",
      "src/source.ts",
      "src/copied.ts",
      "1\t0\tother.ts",
      "",
    ].join("\0");

    expect(parseTurnDiffFilesFromNumstat(numstat)).toEqual([
      { path: "other.ts", additions: 1, deletions: 0 },
      { path: "src/copied.ts", additions: 2, deletions: 1 },
      { path: "src/new.ts", additions: 0, deletions: 0 },
    ]);
  });

  it("keeps binary files and empty files with zero line changes", () => {
    const numstat = ["-\t-\timage.png", "0\t0\tempty.txt", ""].join("\0");
    expect(parseTurnDiffFilesFromNumstat(numstat)).toEqual([
      { path: "empty.txt", additions: 0, deletions: 0 },
      { path: "image.png", additions: 0, deletions: 0 },
    ]);
  });

  it("preserves Unicode, tabs, line endings, and spaces in paths", () => {
    const path = " café\tline\r\nname.txt ";
    const numstat = `3\t2\t\0old\tname\n.txt\0${path}\0`;

    expect(parseTurnDiffFilesFromNumstat(numstat)).toEqual([{ path, additions: 3, deletions: 2 }]);
    expect(parseTurnDiffFilesFromNumstat(`1\t0\t${path}\0`)).toEqual([
      { path, additions: 1, deletions: 0 },
    ]);
  });
});

describe("filterUnifiedDiffFiles", () => {
  it("filters deleted files via the --- a/ path", () => {
    const deletionDiff = [
      "diff --git a/removed.ts b/removed.ts",
      "deleted file mode 100644",
      "index 1111111..0000000",
      "--- a/removed.ts",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-gone",
      "",
    ].join("\n");
    expect(filterUnifiedDiffFiles(deletionDiff, (path) => path !== "removed.ts").trim()).toBe("");
  });

  it("filters simple header-only sections via the diff --git header", () => {
    const oddDiff = ["diff --git a/x b/x", "Binary files differ", ""].join("\n");
    expect(filterUnifiedDiffFiles(oddDiff, (path) => path !== "x").trim()).toBe("");
  });

  it("keeps unparseable sections", () => {
    const oddDiff = ["diff --git malformed-header", "Binary files differ", ""].join("\n");
    expect(filterUnifiedDiffFiles(oddDiff, () => false)).toBe(oddDiff);
  });

  it("returns empty diff unchanged", () => {
    expect(filterUnifiedDiffFiles("", () => false)).toBe("");
  });
});

describe("resolveDiffSectionPath via renames", () => {
  it("filters rename sections by the post-image path", () => {
    const renameDiff = [
      "diff --git a/old/name.ts b/new/name.ts",
      "similarity index 90%",
      "rename from old/name.ts",
      "rename to new/name.ts",
      "index 1111111..2222222 100644",
      "--- a/old/name.ts",
      "+++ b/new/name.ts",
      "@@ -1,1 +1,1 @@",
      "-before",
      "+after",
      "",
    ].join("\n");
    // The attribution map is keyed by post-image paths; a filter that only
    // knows the new path must still match this section.
    expect(filterUnifiedDiffFiles(renameDiff, (path) => path !== "new/name.ts").trim()).toBe("");
    expect(filterUnifiedDiffFiles(renameDiff, (path) => path !== "old/name.ts")).toBe(renameDiff);
  });
});

describe("filterUnifiedDiffFiles fallback paths", () => {
  it("filters binary sections via the diff --git header", () => {
    const binaryDiff = [
      "diff --git a/assets/logo.png b/assets/logo.png",
      "index 1111111..2222222 100644",
      "Binary files a/assets/logo.png and b/assets/logo.png differ",
      "",
    ].join("\n");
    expect(filterUnifiedDiffFiles(binaryDiff, (path) => path !== "assets/logo.png").trim()).toBe(
      "",
    );
    expect(filterUnifiedDiffFiles(binaryDiff, () => true)).toBe(binaryDiff);
  });

  it("filters mode-only sections via the diff --git header", () => {
    const modeDiff = [
      "diff --git a/scripts/run.sh b/scripts/run.sh",
      "old mode 100644",
      "new mode 100755",
      "",
    ].join("\n");
    expect(filterUnifiedDiffFiles(modeDiff, (path) => path !== "scripts/run.sh").trim()).toBe("");
  });

  it("filters binary sections with spaces in the path", () => {
    const binaryDiff = [
      "diff --git a/my assets/logo file.png b/my assets/logo file.png",
      "Binary files differ",
      "",
    ].join("\n");
    expect(
      filterUnifiedDiffFiles(binaryDiff, (path) => path !== "my assets/logo file.png").trim(),
    ).toBe("");
  });

  it("decodes git C-style quoted paths", () => {
    const quotedDiff = [
      'diff --git "a/sp\\303\\244ce.ts" "b/sp\\303\\244ce.ts"',
      "index 1111111..2222222 100644",
      '--- "a/sp\\303\\244ce.ts"',
      '+++ "b/sp\\303\\244ce.ts"',
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");
    // git octal-escapes the raw UTF-8 bytes (`ä` = \303\244); the decoder
    // must reassemble them into the real character, not per-byte mojibake.
    expect(filterUnifiedDiffFiles(quotedDiff, (path) => path !== "späce.ts").trim()).toBe("");
  });

  it("filters rename-only sections without hunks via rename metadata", () => {
    const renameOnlyDiff = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 100%",
      "rename from old.ts",
      "rename to new.ts",
      "",
    ].join("\n");
    expect(filterUnifiedDiffFiles(renameOnlyDiff, (path) => path !== "new.ts").trim()).toBe("");
    expect(filterUnifiedDiffFiles(renameOnlyDiff, (path) => path !== "old.ts")).toBe(
      renameOnlyDiff,
    );
  });

  it("keeps ambiguous unquoted rename headers", () => {
    // Rename of a space-containing path is ambiguous in the header when git
    // does not quote; with no other metadata the section must be kept.
    const ambiguous = ["diff --git a/x y b/y z", "Binary files differ", ""].join("\n");
    expect(filterUnifiedDiffFiles(ambiguous, () => false)).toBe(ambiguous);
  });
});
