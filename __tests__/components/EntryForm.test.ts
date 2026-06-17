import { describe, expect, it } from "vitest";

import { shouldSkipAutosaveTransition } from "@/components/EntryForm";

describe("shouldSkipAutosaveTransition", () => {
  it("skips autosave when content has not changed", () => {
    expect(shouldSkipAutosaveTransition("apples", "apples")).toBe(true);
  });

  it("skips autosave when both the saved content and current content are empty", () => {
    expect(shouldSkipAutosaveTransition("", "")).toBe(true);
    expect(shouldSkipAutosaveTransition("   ", "")).toBe(true);
  });

  it("does not skip autosave when clearing previously saved content to empty", () => {
    expect(shouldSkipAutosaveTransition("", "a")).toBe(false);
    expect(shouldSkipAutosaveTransition("", "apples apples apples")).toBe(false);
  });
});
