import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCrmDeals } from "@/hooks/queries/crm/use-crm-deals";
import { formatDateMedium } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/deals/",
)({
  component: RouteComponent,
});

type StatusFilter = "all" | "open" | "won" | "lost";

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("open");

  const { data, isLoading } = useCrmDeals({
    workspaceId,
    ...(status === "all" ? {} : { status }),
    sortBy: "expectedCloseDate",
    sortDirection: "asc",
  });

  const statusLabels: Record<StatusFilter, string> = {
    all: t("crm:list.allStatuses"),
    open: t("crm:deal.open"),
    won: t("crm:deal.won"),
    lost: t("crm:deal.lost"),
  };

  const headerActions = (
    <Select
      value={status}
      onValueChange={(value) => {
        if (typeof value === "string") setStatus(value as StatusFilter);
      }}
    >
      <SelectTrigger size="sm" className="h-8 w-36">
        <SelectValue>{statusLabels[status]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(["all", "open", "won", "lost"] as const).map((value) => (
          <SelectItem key={value} value={value}>
            {statusLabels[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <WorkspaceLayout title={t("crm:list.title")} headerActions={headerActions}>
      <PageTitle title={t("crm:list.title")} />

      <div className="mx-auto w-full max-w-6xl px-5 py-6">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={`crm-deal-row-${index}`} className="h-11 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Handshake className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{t("crm:list.empty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("crm:list.columnTitle")}</TableHead>
                  <TableHead>{t("crm:list.columnCompany")}</TableHead>
                  <TableHead>{t("crm:list.columnStage")}</TableHead>
                  <TableHead className="text-right">
                    {t("crm:list.columnValue")}
                  </TableHead>
                  <TableHead>{t("crm:list.columnCloseDate")}</TableHead>
                  <TableHead>{t("crm:list.columnOwner")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((deal) => (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/workspace/$workspaceId/crm/deals/$dealId",
                        params: { workspaceId, dealId: deal.id },
                      })
                    }
                  >
                    <TableCell>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        #{deal.number}
                      </span>{" "}
                      {deal.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deal.company?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{deal.stage.name}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(deal.valueCents, deal.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deal.expectedCloseDate
                        ? formatDateMedium(new Date(deal.expectedCloseDate))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {deal.owner?.name ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="size-5">
                            <AvatarImage src={deal.owner.image ?? undefined} />
                            <AvatarFallback className="text-[9px]">
                              {getInitials(deal.owner.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">
                            {deal.owner.name}
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
