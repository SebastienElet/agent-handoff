import { expect, test } from "bun:test";
import { nativeVariant } from "./platform.ts";

test("macOS ARM64 and Linux x64 with identified glibc select their own variant", () => {
  expect(nativeVariant("darwin", "arm64", () => null)).toBe("darwin-arm64");
  expect(
    nativeVariant("linux", "x64", () => ({
      header: { glibcVersionRuntime: "2.39" },
    })),
  ).toBe("linux-x64-gnu");
});

test.each([null, {}, { header: {} }, { header: { glibcVersionRuntime: "" } }])(
  "unknown or musl libc does not select a glibc binary: %j",
  (report) => {
    expect(() => nativeVariant("linux", "x64", () => report)).toThrow("glibc");
  },
);

test.each([
  ["darwin", "x64"],
  ["linux", "arm64"],
  ["win32", "x64"],
  ["freebsd", "x64"],
])("unsupported platform %s/%s never falls back", (platform, architecture) => {
  expect(() => nativeVariant(platform!, architecture!, () => null)).toThrow(
    "Unsupported platform",
  );
});

test("a failed libc probe does not silently select a binary", () => {
  expect(() =>
    nativeVariant("linux", "x64", () => {
      throw new Error("probe unavailable");
    }),
  ).toThrow("probe unavailable");
});
