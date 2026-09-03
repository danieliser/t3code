import { describe, expect, it } from "@effect/vitest";
import type { SidebarThreadAddonContribution } from "./sidebar";
import { groupThreadsWithAddonContributions } from "./sidebar";

const contribution = (
  threadId: string,
  parentThreadId: string | null,
): SidebarThreadAddonContribution => ({
  addonId: "test",
  threadId,
  parentThreadId,
  kind: parentThreadId === null ? "parent" : "child",
  childCount: parentThreadId === null ? 1 : 0,
  compact: null,
  card: null,
});

describe("groupThreadsWithAddonContributions", () => {
  it("attaches explicit children and preserves unrelated thread order", () => {
    const parent = { id: "parent" };
    const child = { id: "child" };
    const normal = { id: "normal" };
    expect(
      groupThreadsWithAddonContributions(
        [normal, parent, child],
        [contribution("parent", null), contribution("child", "parent")],
      ),
    ).toEqual([
      { thread: normal, contribution: null, children: [] },
      {
        thread: parent,
        contribution: expect.objectContaining({ threadId: "parent" }),
        children: [
          {
            thread: child,
            contribution: expect.objectContaining({
              threadId: "child",
              parentThreadId: "parent",
            }),
          },
        ],
      },
    ]);
  });

  it("leaves a child top-level when its parent thread is missing", () => {
    const child = { id: "child" };
    const childContribution = contribution("child", "missing");
    expect(groupThreadsWithAddonContributions([child], [childContribution])).toEqual([
      { thread: child, contribution: childContribution, children: [] },
    ]);
  });
});
