import { inArray } from "drizzle-orm";
import db, { schema } from "./database";

export const DEFAULT_APP_NAME = "Nortys";
export const DEFAULT_APP_DESCRIPTION =
  "Private workspace, project, and task management.";

export function getPublicBranding() {
  return {
    appName: process.env.APP_NAME?.trim() || DEFAULT_APP_NAME,
    appDescription:
      process.env.APP_DESCRIPTION?.trim() || DEFAULT_APP_DESCRIPTION,
  };
}

export async function getStoredPublicBranding() {
  const fallback = getPublicBranding();

  const rows = await db
    .select({
      key: schema.systemSettingTable.key,
      value: schema.systemSettingTable.value,
    })
    .from(schema.systemSettingTable)
    .where(
      inArray(schema.systemSettingTable.key, [
        "branding.appName",
        "branding.appDescription",
      ]),
    );

  const settings = new Map(rows.map((row) => [row.key, row.value]));

  return {
    appName: settings.get("branding.appName")?.trim() || fallback.appName,
    appDescription:
      settings.get("branding.appDescription")?.trim() ||
      fallback.appDescription,
  };
}
