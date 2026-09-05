import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findLatestDialpadUserStatisticsCsv, readDialpadCsvFile } from "../dialpad-csv-source";

describe("Dialpad CSV file locator", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "dialpad-csv-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(fileName: string, contents = "date,name\n2026-01-01,Someone\n") {
    writeFileSync(path.join(dir, fileName), contents);
  }

  it("picks the User Statistics file with the latest period, ignoring Group/Daily Statistics", () => {
    write("Group_Statistics(2026-08-21-2026-08-28)-20260828 (2).csv");
    write("Daily_Statistics(2026-08-29-2026-09-05)-20260905.csv");
    write("User_Statistics(2026-08-21-2026-08-28)-20260828 (1).csv");

    const found = findLatestDialpadUserStatisticsCsv(dir);
    expect(found?.fileName).toBe("User_Statistics(2026-08-21-2026-08-28)-20260828 (1).csv");
    expect(found?.periodStart).toBe("2026-08-21");
    expect(found?.periodEnd).toBe("2026-08-28");
  });

  it("prefers a newer User Statistics file over an older one", () => {
    write("User_Statistics(2026-08-14-2026-08-21)-20260821.csv");
    write("User_Statistics(2026-08-21-2026-08-28)-20260828.csv");

    const found = findLatestDialpadUserStatisticsCsv(dir);
    expect(found?.periodStart).toBe("2026-08-21");
    expect(found?.periodEnd).toBe("2026-08-28");
  });

  it("tolerates a space instead of an underscore in the prefix", () => {
    write("User Statistics(2026-08-21-2026-08-28)-20260828.csv");
    const found = findLatestDialpadUserStatisticsCsv(dir);
    expect(found?.periodEnd).toBe("2026-08-28");
  });

  it("breaks a tie between duplicate uploads by the higher duplicate suffix", () => {
    write("User_Statistics(2026-08-21-2026-08-28)-20260828.csv");
    write("User_Statistics(2026-08-21-2026-08-28)-20260828 (1).csv");
    write("User_Statistics(2026-08-21-2026-08-28)-20260828 (3).csv");
    write("User_Statistics(2026-08-21-2026-08-28)-20260828 (2).csv");

    const found = findLatestDialpadUserStatisticsCsv(dir);
    expect(found?.fileName).toBe("User_Statistics(2026-08-21-2026-08-28)-20260828 (3).csv");
  });

  it("skips a User Statistics file whose name carries no parseable date", () => {
    write("User_Statistics-export-final.csv");
    write("User_Statistics(2026-08-21-2026-08-28)-20260828.csv");

    const found = findLatestDialpadUserStatisticsCsv(dir);
    expect(found?.fileName).toBe("User_Statistics(2026-08-21-2026-08-28)-20260828.csv");
  });

  it("returns null when no User Statistics file exists", () => {
    write("Group_Statistics(2026-08-21-2026-08-28)-20260828.csv");
    write("Daily_Statistics(2026-08-29-2026-09-05)-20260905.csv");
    expect(findLatestDialpadUserStatisticsCsv(dir)).toBeNull();
  });

  it("returns null for a directory that doesn't exist", () => {
    expect(findLatestDialpadUserStatisticsCsv(path.join(dir, "does-not-exist"))).toBeNull();
  });

  it("reads the selected file's contents back", () => {
    write("User_Statistics(2026-08-21-2026-08-28)-20260828.csv", "date,name\n2026-08-21,Test Agent\n");
    const found = findLatestDialpadUserStatisticsCsv(dir);
    expect(found).not.toBeNull();
    const contents = readDialpadCsvFile(found!.filePath);
    expect(contents).toContain("Test Agent");
  });
});
