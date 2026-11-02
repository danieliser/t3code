import { expect, it } from "vite-plus/test";
import { filterArchivedThreadGroups } from "./SettingsPanels.logic";

it("finds archived threads by project or thread title without dropping all siblings on project matches", () => {
  const groups = [
    {
      project: { title: "Alpha", cwd: "/projects/t3code" },
      threads: [{ title: "Fix renderer" }, { title: "Fix sidebar" }],
    },
  ];
  expect(filterArchivedThreadGroups(groups, " ALPHA ")[0]?.threads).toHaveLength(2);
  expect(filterArchivedThreadGroups(groups, "renderer")[0]?.threads).toEqual([
    { title: "Fix renderer" },
  ]);
  expect(filterArchivedThreadGroups(groups, "unknown")).toEqual([]);
});
