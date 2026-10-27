import { defaultRolePayloads } from "@kaneo/permissions";
import { describe, expect, it } from "vitest";
import {
  allBackfillTokens,
  BACKFILL_RESOURCES,
  BACKFILL_ROLE_NAMES,
  parseAppliedTokens,
  planWorkspaceRoleBackfill,
  type WorkspaceRoleRow,
} from "../../../apps/api/src/database/backfill-workspace-roles";

function row(
  id: string,
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
): WorkspaceRoleRow {
  return { id, workspaceId, role, permission: JSON.stringify(permission) };
}

/** A workspace seeded before the CRM existed: no crm* keys, no sales roles. */
function legacyRows(workspaceId: string): WorkspaceRoleRow[] {
  return [
    row(`${workspaceId}-viewer`, workspaceId, "viewer", {
      project: ["read"],
      task: ["read"],
    }),
    row(`${workspaceId}-member`, workspaceId, "member", {
      project: ["create", "read"],
      task: ["create", "read", "update"],
    }),
    row(`${workspaceId}-admin`, workspaceId, "admin", {
      project: ["create", "read", "update", "delete", "share"],
      task: ["create", "read", "update", "delete", "assign"],
    }),
  ];
}

describe("parseAppliedTokens", () => {
  it("treats absent, malformed and non-string content as nothing applied", () => {
    expect(parseAppliedTokens(null)).toEqual([]);
    expect(parseAppliedTokens(undefined)).toEqual([]);
    expect(parseAppliedTokens("")).toEqual([]);
    expect(parseAppliedTokens("not json")).toEqual([]);
    expect(parseAppliedTokens('{"a":1}')).toEqual([]);
    expect(parseAppliedTokens('["role:sales", 42, null]')).toEqual([
      "role:sales",
    ]);
  });
});

describe("planWorkspaceRoleBackfill", () => {
  it("adds the new sales roles and the CRM resources to a legacy workspace", () => {
    const plan = planWorkspaceRoleBackfill({
      workspaceIds: ["w1"],
      existingRows: legacyRows("w1"),
      appliedTokens: [],
    });

    expect(plan.inserts.map((insert) => insert.role).sort()).toEqual([
      "finance_legal",
      "sales",
      "sales_manager",
    ]);
    for (const insert of plan.inserts) {
      expect(insert.workspaceId).toBe("w1");
      expect(JSON.parse(insert.permission)).toEqual(
        defaultRolePayloads[insert.role as "sales" | "sales_manager"],
      );
    }

    // admin and member gain CRM keys; viewer has no CRM in the defaults so it
    // must not gain any.
    const updated = Object.fromEntries(
      plan.updates.map((update) => [
        update.id,
        JSON.parse(update.permission) as Record<string, string[]>,
      ]),
    );
    expect(Object.keys(updated).sort()).toEqual(["w1-admin", "w1-member"]);
    expect(updated["w1-admin"].crmDeal).toContain("read_all");
    expect(updated["w1-admin"].crmPipeline).toEqual(["read", "manage"]);
    expect(updated["w1-member"].crmDeal).toEqual(["read"]);
    expect(updated["w1-member"].crmPipeline).toBeUndefined();

    expect(plan.tokens.sort()).toEqual(allBackfillTokens().sort());
  });

  it("preserves permissions an admin already edited", () => {
    const edited = row("w1-admin", "w1", "admin", {
      // Workspace admin deliberately stripped task deletion.
      project: ["read"],
      task: ["read"],
    });

    const plan = planWorkspaceRoleBackfill({
      workspaceIds: ["w1"],
      existingRows: [edited],
      appliedTokens: [],
    });

    const permission = JSON.parse(plan.updates[0].permission);
    expect(permission.project).toEqual(["read"]);
    expect(permission.task).toEqual(["read"]);
    expect(permission.crmDeal).toBeDefined();
  });

  it("does nothing once every item has been applied", () => {
    const plan = planWorkspaceRoleBackfill({
      workspaceIds: ["w1", "w2"],
      existingRows: legacyRows("w1"),
      appliedTokens: allBackfillTokens(),
    });

    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.tokens).toEqual([]);
  });

  it("is idempotent: re-running with its own tokens produces no writes", () => {
    const first = planWorkspaceRoleBackfill({
      workspaceIds: ["w1"],
      existingRows: legacyRows("w1"),
      appliedTokens: [],
    });

    const rowsAfterFirstRun: WorkspaceRoleRow[] = [
      ...legacyRows("w1").map((existing) => {
        const update = first.updates.find((u) => u.id === existing.id);
        return update
          ? { ...existing, permission: update.permission }
          : existing;
      }),
      ...first.inserts.map((insert, index) =>
        row(
          `w1-new-${index}`,
          insert.workspaceId,
          insert.role,
          JSON.parse(insert.permission),
        ),
      ),
    ];

    const second = planWorkspaceRoleBackfill({
      workspaceIds: ["w1"],
      existingRows: rowsAfterFirstRun,
      appliedTokens: first.tokens,
    });

    expect(second.inserts).toEqual([]);
    expect(second.updates).toEqual([]);
  });

  it("does not re-add a resource an admin removed after it was backfilled", () => {
    // The CRM tokens are already recorded, so a role that no longer carries
    // crmDeal keeps it removed.
    const stripped = row("w1-admin", "w1", "admin", {
      project: ["read"],
      crmContact: ["read"],
    });

    const plan = planWorkspaceRoleBackfill({
      workspaceIds: ["w1"],
      existingRows: [stripped],
      appliedTokens: allBackfillTokens(),
    });

    expect(plan.updates).toEqual([]);
  });

  it("leaves an unparseable permission payload untouched", () => {
    const broken: WorkspaceRoleRow = {
      id: "w1-admin",
      workspaceId: "w1",
      role: "admin",
      permission: "{not json",
    };

    const plan = planWorkspaceRoleBackfill({
      workspaceIds: ["w1"],
      existingRows: [broken],
      appliedTokens: [],
    });

    expect(plan.updates).toEqual([]);
  });

  it("skips role rows a workspace already has", () => {
    const rows = [
      ...legacyRows("w1"),
      row("w1-sales", "w1", "sales", defaultRolePayloads.sales),
    ];

    const plan = planWorkspaceRoleBackfill({
      workspaceIds: ["w1"],
      existingRows: rows,
      appliedTokens: [],
    });

    expect(plan.inserts.map((insert) => insert.role)).toEqual([
      "sales_manager",
      "finance_legal",
    ]);
  });

  it("covers every seeded role and CRM resource introduced by this release", () => {
    expect([...BACKFILL_ROLE_NAMES]).toEqual([
      "sales",
      "sales_manager",
      "finance_legal",
    ]);
    expect([...BACKFILL_RESOURCES]).toEqual([
      "finance",
      "portfolio",
      "crmDeal",
      "crmContact",
      "crmCompany",
      "crmPipeline",
      "crmField",
      "crmReport",
      "hosting",
    ]);
  });
});
