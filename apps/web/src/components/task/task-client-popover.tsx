import { Building2, Check, Handshake, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useUpdateTaskClient } from "@/hooks/mutations/task/use-update-task-client";
import { useCrmCompanies } from "@/hooks/queries/crm/use-crm-companies";
import { useCrmDeals } from "@/hooks/queries/crm/use-crm-deals";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskClientPopoverProps = {
  task: Task;
  workspaceId: string;
  children: React.ReactNode;
};

/**
 * Projects here are organised by discipline, so the client lives on the task.
 * The deal is a second, optional step: it only makes sense once a client is
 * chosen, and it is what lets effort be read per contract rather than only per
 * client.
 */
export default function TaskClientPopover({
  task,
  workspaceId,
  children,
}: TaskClientPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { mutateAsync: updateClient, isPending } = useUpdateTaskClient();
  const { canManageTasks, canViewCrm } = useWorkspacePermission();

  const canEdit = canManageTasks() && canViewCrm();

  const { data: companies } = useCrmCompanies(
    open
      ? { workspaceId, limit: "100", ...(search ? { search } : {}) }
      : undefined,
  );

  const { data: deals } = useCrmDeals(
    open && task.crmCompanyId
      ? { workspaceId, companyId: task.crmCompanyId, limit: "50" }
      : undefined,
  );

  async function apply(crmCompanyId: string | null, crmDealId?: string | null) {
    try {
      await updateClient({ taskId: task.id, crmCompanyId, crmDealId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:task.linkError"),
      );
    }
  }

  if (!canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("crm:company.searchPlaceholder")}
            className="h-8"
          />
        </div>

        <div className="max-h-56 overflow-y-auto px-1 pb-1">
          {task.crmCompanyId ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2 text-muted-foreground"
              disabled={isPending}
              onClick={async () => {
                // Clearing the client clears the deal with it: a deal on a task
                // with no client would be incoherent.
                await apply(null, null);
                setOpen(false);
              }}
            >
              <X className="size-3.5" />
              {t("crm:task.clearClient")}
            </Button>
          ) : null}

          {(companies?.items ?? []).map((company) => (
            <Button
              key={company.id}
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2"
              disabled={isPending}
              onClick={async () => {
                // Changing client drops a deal that belonged to the old one.
                await apply(
                  company.id,
                  company.id === task.crmCompanyId ? task.crmDealId : null,
                );
                setOpen(false);
              }}
            >
              <Building2 className="size-3.5 shrink-0" />
              <span className="truncate text-sm">{company.name}</span>
              {task.crmCompanyId === company.id ? (
                <Check className="ml-auto size-4 shrink-0" />
              ) : null}
            </Button>
          ))}

          {companies && companies.items.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("crm:company.empty")}
            </p>
          ) : null}
        </div>

        {task.crmCompanyId ? (
          <>
            <Separator />
            <div className="max-h-40 overflow-y-auto p-1">
              <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("crm:task.dealOptional")}
              </p>

              {task.crmDealId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start gap-2 px-2 text-muted-foreground"
                  disabled={isPending}
                  onClick={() => apply(task.crmCompanyId ?? null, null)}
                >
                  <X className="size-3.5" />
                  {t("crm:task.clearDeal")}
                </Button>
              ) : null}

              {(deals?.items ?? []).map((deal) => (
                <Button
                  key={deal.id}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start gap-2 px-2"
                  disabled={isPending}
                  onClick={() => apply(task.crmCompanyId ?? null, deal.id)}
                >
                  <Handshake className="size-3.5 shrink-0" />
                  <span className="truncate text-sm">
                    #{deal.number} {deal.title}
                  </span>
                  {task.crmDealId === deal.id ? (
                    <Check className="ml-auto size-4 shrink-0" />
                  ) : null}
                </Button>
              ))}

              {deals && deals.items.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t("crm:contact.noDeals")}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
