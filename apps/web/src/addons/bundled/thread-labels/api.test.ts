import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useUiStateStore } from "../../../uiStateStore";
import { threadLabelApi } from "./api";

describe("threadLabelApi", () => {
  beforeEach(() => {
    useUiStateStore.setState({ threadLabels: [], threadLabelIdsByThreadKey: {} });
  });

  it("creates reusable labels and assigns them to explicit thread keys", () => {
    const labelId = threadLabelApi.ensure("Needs review", "#ff2bd6");
    expect(labelId).not.toBeNull();
    expect(threadLabelApi.ensure(" needs   review ", "#2563eb")).toBe(labelId);
    expect(threadLabelApi.setAssigned("environment:thread", labelId!, true)).toBe(true);
    expect(threadLabelApi.snapshot()).toMatchObject({
      labels: [{ id: labelId, name: "Needs review", color: "#ff2bd6" }],
      labelIdsByThreadKey: { "environment:thread": [labelId] },
    });
  });

  it("updates, removes, and publishes mutations through one supported surface", () => {
    const listener = vi.fn();
    const unsubscribe = threadLabelApi.subscribe(listener);
    const labelId = threadLabelApi.ensure("Queued", "#2563eb")!;
    expect(threadLabelApi.update(labelId, "Ready", "#16a34a")).toBe(true);
    expect(threadLabelApi.remove(labelId)).toBe(true);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(threadLabelApi.snapshot().labels).toEqual([]);
  });
});
