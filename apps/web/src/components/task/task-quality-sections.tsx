import {
  Check,
  Circle,
  Database,
  Eye,
  EyeOff,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import { useTaskQuality } from "@/hooks/mutations/task/use-task-quality";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type { TaskChecklistItem, TaskCustomField } from "@/types/task";

type Props = {
  taskId: string;
  projectId: string;
  customFields: TaskCustomField[];
  checklistItems: TaskChecklistItem[];
};

const FIELD_TYPES = ["text", "number", "date", "url", "checkbox"] as const;

export default function TaskQualitySections({
  taskId,
  projectId,
  customFields,
  checklistItems,
}: Props) {
  const { t } = useTranslation();
  const quality = useTaskQuality(taskId, projectId);
  const { data: columns = [] } = useGetColumns(projectId);
  const [addingField, setAddingField] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] =
    useState<(typeof FIELD_TYPES)[number]>("text");
  const [fieldValue, setFieldValue] = useState("");
  const [showOnCard, setShowOnCard] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [requiredColumnId, setRequiredColumnId] = useState("none");

  async function addField() {
    if (!fieldName.trim()) return;
    try {
      await quality.createField.mutateAsync({
        name: fieldName.trim(),
        type: fieldType,
        value: fieldType === "checkbox" ? "false" : fieldValue,
        showOnCard,
      });
      setFieldName("");
      setFieldValue("");
      setFieldType("text");
      setShowOnCard(false);
      setAddingField(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:quality.updateError"),
      );
    }
  }

  async function addChecklistItem() {
    if (!newItem.trim()) return;
    try {
      await quality.createItem.mutateAsync({
        title: newItem.trim(),
        isRequired: requiredColumnId !== "none",
        requiredBeforeColumnId:
          requiredColumnId === "none" ? null : requiredColumnId,
      });
      setNewItem("");
      setRequiredColumnId("none");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:quality.updateError"),
      );
    }
  }

  const completed = checklistItems.filter((item) => item.isCompleted).length;

  return (
    <div className="space-y-6 py-2">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">
              {t("tasks:quality.customFields")}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={t("tasks:quality.addField")}
            onClick={() => setAddingField((value) => !value)}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {customFields.length > 0 && (
          <div className="divide-y divide-border border-y border-border">
            {customFields.map((field) => (
              <div
                key={field.id}
                className="grid grid-cols-[minmax(90px,0.8fr)_minmax(120px,1.2fr)_auto] items-center gap-2 py-2"
              >
                <Input
                  defaultValue={field.name}
                  aria-label={t("tasks:quality.fieldName")}
                  className="h-8"
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== field.name) {
                      quality.updateField.mutate({
                        fieldId: field.id,
                        input: { name },
                      });
                    }
                  }}
                />
                {field.type === "checkbox" ? (
                  <Switch
                    checked={field.value === "true"}
                    onCheckedChange={(checked) =>
                      quality.updateField.mutate({
                        fieldId: field.id,
                        input: { value: String(checked) },
                      })
                    }
                  />
                ) : (
                  <Input
                    type={field.type === "url" ? "url" : field.type}
                    defaultValue={field.value}
                    aria-label={t("tasks:quality.fieldValue")}
                    className="h-8"
                    onBlur={(event) => {
                      if (event.target.value !== field.value) {
                        quality.updateField.mutate({
                          fieldId: field.id,
                          input: { value: event.target.value },
                        });
                      }
                    }}
                  />
                )}
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t("tasks:quality.showOnCard")}
                    onClick={() =>
                      quality.updateField.mutate({
                        fieldId: field.id,
                        input: { showOnCard: !field.showOnCard },
                      })
                    }
                  >
                    {field.showOnCard ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t("common:actions.delete")}
                    onClick={() => quality.deleteField.mutate(field.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {addingField && (
          <div className="space-y-3 border-y border-border py-3">
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <Input
                value={fieldName}
                onChange={(event) => setFieldName(event.target.value)}
                placeholder={t("tasks:quality.fieldName")}
              />
              <Select
                value={fieldType}
                onValueChange={(value) =>
                  setFieldType(value as (typeof FIELD_TYPES)[number])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`tasks:quality.fieldTypes.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldType !== "checkbox" && (
              <Input
                type={fieldType === "url" ? "url" : fieldType}
                value={fieldValue}
                onChange={(event) => setFieldValue(event.target.value)}
                placeholder={t("tasks:quality.fieldValue")}
              />
            )}
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2">
                <Switch checked={showOnCard} onCheckedChange={setShowOnCard} />
                {t("tasks:quality.showOnCard")}
              </Label>
              <Button
                type="button"
                size="sm"
                disabled={!fieldName.trim() || quality.createField.isPending}
                onClick={addField}
              >
                {t("common:actions.add")}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">
              {t("tasks:quality.checklist")}
            </h2>
          </div>
          {checklistItems.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {completed}/{checklistItems.length}
            </span>
          )}
        </div>

        {checklistItems.length > 0 && (
          <div className="divide-y divide-border border-y border-border">
            {checklistItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2 py-2">
                <button
                  type="button"
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border",
                    item.isCompleted
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-transparent",
                  )}
                  aria-label={t("tasks:quality.toggleItem")}
                  onClick={() =>
                    quality.updateItem.mutate({
                      itemId: item.id,
                      input: { isCompleted: !item.isCompleted },
                    })
                  }
                >
                  {item.isCompleted ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Circle className="size-3 opacity-0" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      item.isCompleted && "text-muted-foreground line-through",
                    )}
                  >
                    {item.title}
                  </p>
                  {item.isRequired && item.requiredBeforeColumnName && (
                    <p className="text-xs text-muted-foreground">
                      {t("tasks:quality.requiredBefore", {
                        column: item.requiredBeforeColumnName,
                      })}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={t("common:actions.delete")}
                  onClick={() => quality.deleteItem.mutate(item.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_150px_auto] gap-2">
          <Input
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            placeholder={t("tasks:quality.newChecklistItem")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addChecklistItem();
              }
            }}
          />
          <Select
            value={requiredColumnId}
            onValueChange={(value) => setRequiredColumnId(value ?? "none")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("tasks:quality.noBlocking")}
              </SelectItem>
              {columns.map((column) => (
                <SelectItem key={column.id} value={column.id}>
                  {column.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            title={t("tasks:quality.addChecklistItem")}
            disabled={!newItem.trim() || quality.createItem.isPending}
            onClick={addChecklistItem}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
