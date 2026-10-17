import type { Context } from "hono";
import { hasWorkspacePermission } from "../../utils/require-workspace-permission";

/**
 * `own` restricts a listing to the records the caller owns, `all` returns the
 * whole workspace. The distinction cannot live in middleware: middleware can
 * only reject a route, not filter rows, so every listing controller takes this
 * and applies it to its `where`.
 */
export type CrmVisibility = "own" | "all";

export type CrmScopedResource =
  | "crmDeal"
  | "crmContact"
  | "crmCompany"
  | "crmReport";

export async function resolveVisibility(
  c: Context,
  resource: CrmScopedResource,
): Promise<CrmVisibility> {
  const canReadAll = await hasWorkspacePermission(c, {
    [resource]: ["read_all"],
  });
  return canReadAll ? "all" : "own";
}
