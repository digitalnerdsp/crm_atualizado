import { createFileRoute } from "@tanstack/react-router";
import { Package, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BILLING_LABEL_KEY,
  type BillingType,
} from "@/components/crm/deal-services-editor";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateCrmService,
  useCreateCrmServiceCategory,
  useUpdateCrmService,
  useUpdateCrmServiceCategory,
} from "@/hooks/mutations/crm/use-crm-service-mutations";
import {
  useCrmServiceCategories,
  useCrmServices,
} from "@/hooks/queries/crm/use-crm-services";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/crm-services",
)({
  component: RouteComponent,
});

const BILLING_TYPES: BillingType[] = [
  "one_time",
  "monthly",
  "quarterly",
  "yearly",
];

const NO_CATEGORY = "__none__";

type ServiceRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  defaultPriceCents: number;
  billingType: BillingType;
  archivedAt: string | Date | null;
};

type ServiceForm = {
  id: string | null;
  name: string;
  code: string;
  categoryId: string;
  price: string;
  billingType: BillingType;
  description: string;
};

const emptyForm: ServiceForm = {
  id: null,
  name: "",
  code: "",
  categoryId: "",
  price: "",
  billingType: "one_time",
  description: "",
};

function centsToInput(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspace, canManageCrmFields } = useWorkspacePermission();
  const workspaceId = workspace?.id ?? "";
  const canEdit = canManageCrmFields();

  const [showArchived, setShowArchived] = useState(false);
  const { data: services = [] } = useCrmServices(workspaceId, showArchived);
  const { data: categories = [] } = useCrmServiceCategories(workspaceId);

  const createService = useCreateCrmService();
  const updateService = useUpdateCrmService();
  const createCategory = useCreateCrmServiceCategory();
  const updateCategory = useUpdateCrmServiceCategory();

  const [form, setForm] = useState<ServiceForm | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{
    id: string | null;
    name: string;
  } | null>(null);

  // Agrupa na ordem que a API devolve (categoria, depois posição), para a
  // tela ler como uma tabela de preços, não como uma lista solta.
  const groups: Array<{ label: string; rows: ServiceRow[] }> = [];
  for (const service of services as ServiceRow[]) {
    const label = service.categoryName ?? t("crm:services.noCategory");
    const current = groups[groups.length - 1];
    if (current && current.label === label) current.rows.push(service);
    else groups.push({ label, rows: [service] });
  }

  async function saveService() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      toast.error(t("crm:services.nameRequired"));
      return;
    }

    const payload = {
      workspaceId,
      name,
      code: form.code.trim() || null,
      categoryId: form.categoryId || null,
      defaultPriceCents: parseMoneyToCents(form.price),
      billingType: form.billingType,
      description: form.description.trim() || null,
    };

    try {
      if (form.id) {
        await updateService.mutateAsync({ serviceId: form.id, payload });
      } else {
        await createService.mutateAsync(payload);
      }
      toast.success(t("crm:services.created"));
      setForm(null);
    } catch (error) {
      toast.error(errorMessage(error, t("crm:services.createError")));
    }
  }

  async function toggleArchived(service: ServiceRow) {
    try {
      await updateService.mutateAsync({
        serviceId: service.id,
        payload: { workspaceId, archived: !service.archivedAt },
      });
    } catch (error) {
      toast.error(errorMessage(error, t("crm:services.createError")));
    }
  }

  async function saveCategory() {
    if (!categoryDialog) return;
    const name = categoryDialog.name.trim();
    if (!name) {
      toast.error(t("crm:services.nameRequired"));
      return;
    }
    try {
      if (categoryDialog.id) {
        await updateCategory.mutateAsync({
          categoryId: categoryDialog.id,
          payload: { workspaceId, name },
        });
      } else {
        await createCategory.mutateAsync({ workspaceId, name });
      }
      setCategoryDialog(null);
    } catch (error) {
      toast.error(errorMessage(error, t("crm:services.createError")));
    }
  }

  const selectedCategory = categories.find(
    (category) => category.id === form?.categoryId,
  );
  const isSaving =
    createService.isPending ||
    updateService.isPending ||
    createCategory.isPending ||
    updateCategory.isPending;

  return (
    <div className="space-y-4 p-2">
      <PageTitle title={t("crm:services.catalogTitle")} />

      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-base font-medium">
          <Package className="size-4" />
          {t("crm:services.catalogTitle")}
        </h1>
        <p className="max-w-prose text-xs text-muted-foreground">
          {t("crm:services.catalogDescription")}
        </p>
      </header>

      <Card className="p-0">
        <CardHeader className="flex-row items-start justify-between gap-3 p-4">
          <div className="space-y-1">
            <CardTitle className="text-sm">
              {t("crm:services.catalogTitle")}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 text-xs">
              <Switch
                checked={showArchived}
                onCheckedChange={(checked) => setShowArchived(Boolean(checked))}
                aria-label={t("crm:services.showArchived")}
              />
              {t("crm:services.showArchived")}
            </CardDescription>
          </div>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setForm(emptyForm)}
            >
              <Plus className="size-3.5" />
              {t("crm:services.newService")}
            </Button>
          ) : null}
        </CardHeader>

        {groups.length === 0 ? (
          <p className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {t("crm:services.emptyCatalog")}
          </p>
        ) : (
          <div className="border-t border-border">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <ul>
                  {group.rows.map((service) => (
                    <li
                      key={service.id}
                      className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span
                          className={
                            service.archivedAt
                              ? "text-sm text-muted-foreground line-through"
                              : "text-sm"
                          }
                        >
                          {service.name}
                        </span>
                        {service.code ? (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {service.code}
                          </span>
                        ) : null}
                        <Badge variant="outline" size="sm">
                          {t(
                            `crm:services.${BILLING_LABEL_KEY[service.billingType]}`,
                          )}
                        </Badge>
                        {service.archivedAt ? (
                          <Badge variant="secondary" size="sm">
                            {t("crm:services.archived")}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="mr-2 text-sm tabular-nums">
                          {formatMoney(service.defaultPriceCents)}
                        </span>
                        {canEdit ? (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("crm:services.editService")}
                              onClick={() =>
                                setForm({
                                  id: service.id,
                                  name: service.name,
                                  code: service.code ?? "",
                                  categoryId: service.categoryId ?? "",
                                  price: centsToInput(
                                    service.defaultPriceCents,
                                  ),
                                  billingType: service.billingType,
                                  description: service.description ?? "",
                                })
                              }
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => toggleArchived(service)}
                            >
                              {t(
                                service.archivedAt
                                  ? "crm:services.unarchive"
                                  : "crm:services.archive",
                              )}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-0">
        <CardHeader className="flex-row items-start justify-between gap-3 p-4">
          <CardTitle className="text-sm">
            {t("crm:services.categories")}
          </CardTitle>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setCategoryDialog({ id: null, name: "" })}
            >
              <Plus className="size-3.5" />
              {t("crm:services.newCategory")}
            </Button>
          ) : null}
        </CardHeader>
        {categories.length === 0 ? (
          <p className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {t("crm:services.emptyCategories")}
          </p>
        ) : (
          <ul className="border-t border-border">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
              >
                <span className="text-sm">{category.name}</span>
                {canEdit ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("crm:taxonomy.edit")}
                    onClick={() =>
                      setCategoryDialog({
                        id: category.id,
                        name: category.name,
                      })
                    }
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("crm:services.archiveHint")}
      </p>

      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t(
                form?.id
                  ? "crm:services.editService"
                  : "crm:services.newService",
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("crm:services.catalogTitle")}
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="space-y-4 px-6 pb-2">
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-2">
                  <Label htmlFor="crm-service-name">
                    {t("crm:services.serviceName")}
                  </Label>
                  <Input
                    id="crm-service-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crm-service-code">
                    {t("crm:services.code")}
                  </Label>
                  <Input
                    id="crm-service-code"
                    value={form.code}
                    onChange={(event) =>
                      setForm({ ...form, code: event.target.value })
                    }
                    placeholder="IDV"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="crm-service-category">
                    {t("crm:services.category")}
                  </Label>
                  <Select
                    value={form.categoryId || NO_CATEGORY}
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        setForm({
                          ...form,
                          categoryId: value === NO_CATEGORY ? "" : value,
                        });
                      }
                    }}
                  >
                    <SelectTrigger id="crm-service-category">
                      <SelectValue>
                        {selectedCategory?.name ?? t("crm:services.noCategory")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>
                        {t("crm:services.noCategory")}
                      </SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="crm-service-price">
                    {t("crm:services.defaultPrice")}
                  </Label>
                  <Input
                    id="crm-service-price"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.price}
                    onChange={(event) =>
                      setForm({ ...form, price: event.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="crm-service-billing">
                    {t("crm:services.billingType")}
                  </Label>
                  <Select
                    value={form.billingType}
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        setForm({ ...form, billingType: value as BillingType });
                      }
                    }}
                  >
                    <SelectTrigger id="crm-service-billing">
                      <SelectValue>
                        {t(
                          `crm:services.${BILLING_LABEL_KEY[form.billingType]}`,
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`crm:services.${BILLING_LABEL_KEY[type]}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="crm-service-description">
                  {t("crm:services.description")}
                </Label>
                <Textarea
                  id="crm-service-description"
                  rows={2}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForm(null)}
              disabled={isSaving}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={saveService}
              disabled={isSaving || !form?.name.trim()}
            >
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryDialog !== null}
        onOpenChange={(open) => {
          if (!open) setCategoryDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t(
                categoryDialog?.id
                  ? "crm:taxonomy.edit"
                  : "crm:services.newCategory",
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("crm:services.categories")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6 pb-2">
            <Label htmlFor="crm-service-category-name">
              {t("crm:taxonomy.nameLabel")}
            </Label>
            <Input
              id="crm-service-category-name"
              value={categoryDialog?.name ?? ""}
              onChange={(event) =>
                setCategoryDialog((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryDialog(null)}
              disabled={isSaving}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={saveCategory}
              disabled={isSaving || !categoryDialog?.name.trim()}
            >
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
