export interface TurnDiffFileSummary {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

/** Reads Git's NUL-delimited numstat output without decoding display paths. */
export function parseTurnDiffFilesFromNumstat(numstat: string): ReadonlyArray<TurnDiffFileSummary> {
  const records = numstat.split("\0");
  const files: TurnDiffFileSummary[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const counts = /^(\d+|-)\t(\d+|-)\t/.exec(record);
    if (!counts) continue;

    let path = record.slice(counts[0].length);
    if (path.length === 0) {
      // Renames and copies use two more records: the source and destination.
      path = records[index + 2] ?? "";
      index += 2;
    }
    if (path.length === 0) continue;

    files.push({
      path,
      additions: counts[1] === "-" ? 0 : Number(counts[1]),
      deletions: counts[2] === "-" ? 0 : Number(counts[2]),
    });
  }

  return files.toSorted((left, right) => left.path.localeCompare(right.path));
}

function stripGitPathQuoting(value: string): string {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2
    ? value.slice(1, -1)
    : value;
}

/**
 * Extract the post-image path of one `diff --git` section, preferring the
 * `+++ b/` line and falling back to `--- a/` for deletions. Returns null when
 * the section is unparseable; callers should keep such sections.
 */
function resolveDiffSectionPath(section: string): string | null {
  for (const line of section.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = stripGitPathQuoting(line.slice(4).trim());
      if (target !== "/dev/null") {
        return target.startsWith("b/") ? target.slice(2) : target;
      }
    } else if (line.startsWith("--- ")) {
      const source = stripGitPathQuoting(line.slice(4).trim());
      if (source !== "/dev/null" && source.startsWith("a/")) {
        return source.slice(2);
      }
    }
  }
  return null;
}

/**
 * Remove file sections from a unified diff by path.
 *
 * Sections whose path cannot be determined are kept (fail toward showing).
 */
export function filterUnifiedDiffFiles(
  diff: string,
  shouldKeepPath: (path: string) => boolean,
): string {
  const normalized = diff.replace(/\r\n/g, "\n");
  if (normalized.trim().length === 0) {
    return diff;
  }

  const sections: Array<string> = [];
  let currentStart = -1;
  const lines = normalized.split("\n");
  const flush = (endExclusive: number) => {
    if (currentStart >= 0) {
      sections.push(lines.slice(currentStart, endExclusive).join("\n"));
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]!.startsWith("diff --git ")) {
      flush(index);
      currentStart = index;
    }
  }
  flush(lines.length);
  if (sections.length === 0) {
    return diff;
  }

  const kept = sections.filter((section) => {
    const path = resolveDiffSectionPath(section);
    return path === null || shouldKeepPath(path);
  });
  if (kept.length === sections.length) {
    return diff;
  }
  return kept.join("\n");
}
