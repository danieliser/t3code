import { expect, it } from "vite-plus/test";
import { desktopUpdateChannelOf } from "./cliRelease.ts";

it.each([
  "0.0.45-alpha.patched.20261102.69",
  "0.0.45-alpha.patched-qualified.20261102.69",
  "0.0.45-alpha.patched-qualified.20261102.69.123456",
])("keeps custom Alpha on the nightly desktop track: %s", (version) => {
  expect(desktopUpdateChannelOf(version)).toBe("nightly");
});

it("keeps stable and preview track behavior", () => {
  expect(desktopUpdateChannelOf("0.0.45")).toBe("latest");
  expect(desktopUpdateChannelOf("0.0.45-preview.20261102.1")).toBe("latest");
  expect(desktopUpdateChannelOf("0.0.45-nightly.20261102.1")).toBe("nightly");
});
