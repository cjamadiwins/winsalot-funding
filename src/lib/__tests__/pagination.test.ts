import { describe, expect, it } from "vitest";
import { clampPage, getPageRange, getPageWindow, getTotalPages } from "@/lib/pagination";

describe("pagination helpers", () => {
  it("computes total pages and ranges", () => {
    expect(getTotalPages(0, 25)).toBe(1);
    expect(getTotalPages(25, 25)).toBe(1);
    expect(getTotalPages(26, 25)).toBe(2);
    expect(getTotalPages(101, 50)).toBe(3);
    expect(getPageRange(1, 25, 60)).toEqual([1, 25]);
    expect(getPageRange(3, 25, 60)).toEqual([51, 60]);
    expect(getPageRange(1, 25, 0)).toEqual([0, 0]);
  });
  it("clamps out-of-range pages", () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(NaN, 3)).toBe(1);
  });
  it("builds a page window with gaps", () => {
    expect(getPageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageWindow(1, 20)).toEqual([1, 2, 3, 4, "…", 20]);
    expect(getPageWindow(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(getPageWindow(20, 20)).toEqual([1, "…", 17, 18, 19, 20]);
  });
});
