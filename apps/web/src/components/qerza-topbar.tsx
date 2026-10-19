import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import SearchCommandMenu from "@/components/search-command-menu";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { shortcuts } from "@/constants/shortcuts";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useAppBranding } from "@/lib/branding";

/** Barra superior do layout Qerza: marca, busca em pílula, workspace e usuário. */
export function QerzaTopbar() {
  const { t } = useTranslation();
  const { appName } = useAppBranding();
  const [open, setOpen] = useState(false);

  useRegisterShortcuts({
    shortcuts: { [shortcuts.search.prefix]: () => setOpen(true) },
  });

  return (
    <div data-slot="qerza-topbar">
      <div data-slot="qerza-brand">
        <span data-slot="qerza-brand-mark">{appName.charAt(0)}</span>
        <span data-slot="qerza-brand-name">{appName}</span>
      </div>
      <button
        type="button"
        data-slot="qerza-search"
        onClick={() => setOpen(true)}
      >
        <span>{t("navigation:commandPalette.search")}</span>
        <SearchIcon aria-hidden="true" size={18} />
      </button>
      <div data-slot="qerza-account">
        <WorkspaceSwitcher />
      </div>
      <SearchCommandMenu open={open} setOpen={setOpen} />
    </div>
  );
}
