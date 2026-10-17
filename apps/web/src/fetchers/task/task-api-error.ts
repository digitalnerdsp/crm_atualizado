import i18n from "i18next";

export function getTaskApiErrorMessage(raw: string) {
  try {
    const details = JSON.parse(raw) as {
      code?: string;
      column?: string;
      pending?: string[];
    };
    if (details.code === "CHECKLIST_REQUIRED") {
      return i18n.t("tasks:quality.blocked", {
        column: details.column,
        items: details.pending?.join(", "),
      });
    }
  } catch {}
  return raw;
}
