import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "drizzle");
const journal = JSON.parse(
  readFileSync(resolve(migrationsDirectory, "meta/_journal.json"), "utf8"),
) as {
  entries: Array<{ idx: number; tag: string }>;
};
const baselineSql = readFileSync(
  resolve(migrationsDirectory, "0000_nortys_baseline.sql"),
  "utf8",
);

describe("clean database baseline", () => {
  it("starts with one clean baseline followed by sequential migrations", () => {
    expect(journal.entries[0]).toEqual(
      expect.objectContaining({
        idx: 0,
        tag: "0000_nortys_baseline",
      }),
    );
    expect(
      journal.entries.filter((entry) => entry.tag.includes("baseline")),
    ).toHaveLength(1);
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
  });

  it("creates the current product tables", () => {
    for (const table of [
      "audit_log",
      "calendar_event",
      "global_role",
      "integration",
      "project",
      "task",
      "task_recurrence",
      "workspace",
    ]) {
      expect(baselineSql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("does not recreate removed compatibility structures", () => {
    expect(baselineSql).not.toContain('CREATE TABLE "github_integration"');
    expect(baselineSql).not.toContain('"active_workspace_id"');
    expect(baselineSql).not.toContain('"user_email"');
  });
});
