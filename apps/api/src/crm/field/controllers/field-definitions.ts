import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import type { CrmFieldEntity, CrmFieldType } from "../../../database/schema";
import {
  crmFieldDefinitionTable,
  crmFieldValueTable,
} from "../../../database/schema";
import { slugify, uniqueSlug } from "../../shared/slug";

const CHOICE_TYPES: CrmFieldType[] = ["select", "multiselect"];

export async function getFieldDefinitions({
  workspaceId,
  entity,
}: {
  workspaceId: string;
  entity?: CrmFieldEntity;
}) {
  return db
    .select()
    .from(crmFieldDefinitionTable)
    .where(
      entity
        ? and(
            eq(crmFieldDefinitionTable.workspaceId, workspaceId),
            eq(crmFieldDefinitionTable.entity, entity),
          )
        : eq(crmFieldDefinitionTable.workspaceId, workspaceId),
    )
    .orderBy(
      asc(crmFieldDefinitionTable.entity),
      asc(crmFieldDefinitionTable.position),
    );
}

export async function createFieldDefinition({
  workspaceId,
  entity,
  label,
  type,
  options,
  isRequired,
  showOnCard,
}: {
  workspaceId: string;
  entity: CrmFieldEntity;
  label: string;
  type: CrmFieldType;
  options?: string[] | null;
  isRequired?: boolean;
  showOnCard?: boolean;
}) {
  if (CHOICE_TYPES.includes(type) && (!options || options.length === 0)) {
    throw new HTTPException(400, {
      message: "A select field needs at least one option",
    });
  }

  const siblings = await db
    .select({
      key: crmFieldDefinitionTable.key,
      position: crmFieldDefinitionTable.position,
    })
    .from(crmFieldDefinitionTable)
    .where(
      and(
        eq(crmFieldDefinitionTable.workspaceId, workspaceId),
        eq(crmFieldDefinitionTable.entity, entity),
      ),
    );

  const [created] = await db
    .insert(crmFieldDefinitionTable)
    .values({
      workspaceId,
      entity,
      // The key is what filters and the import mapping address, so it is
      // derived once and never changes when the label is renamed.
      key: uniqueSlug(
        slugify(label),
        siblings.map((row) => row.key),
      ),
      label,
      type,
      options: CHOICE_TYPES.includes(type) ? (options ?? []) : null,
      isRequired: isRequired ?? false,
      showOnCard: showOnCard ?? false,
      position: siblings.length,
    })
    .returning();

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create field" });
  }

  return created;
}

export async function updateFieldDefinition({
  workspaceId,
  definitionId,
  label,
  options,
  isRequired,
  showOnCard,
  position,
}: {
  workspaceId: string;
  definitionId: string;
  label?: string;
  options?: string[] | null;
  isRequired?: boolean;
  showOnCard?: boolean;
  position?: number;
}) {
  // `type` and `key` are immutable: changing either would orphan or
  // misinterpret every value already stored against this definition.
  const [updated] = await db
    .update(crmFieldDefinitionTable)
    .set({
      ...(label === undefined ? {} : { label }),
      ...(options === undefined ? {} : { options }),
      ...(isRequired === undefined ? {} : { isRequired }),
      ...(showOnCard === undefined ? {} : { showOnCard }),
      ...(position === undefined ? {} : { position }),
    })
    .where(
      and(
        eq(crmFieldDefinitionTable.id, definitionId),
        eq(crmFieldDefinitionTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "Field not found" });
  }

  return updated;
}

export async function deleteFieldDefinition({
  workspaceId,
  definitionId,
}: {
  workspaceId: string;
  definitionId: string;
}) {
  const [deleted] = await db
    .delete(crmFieldDefinitionTable)
    .where(
      and(
        eq(crmFieldDefinitionTable.id, definitionId),
        eq(crmFieldDefinitionTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Field not found" });
  }

  return deleted;
}

export async function getFieldValues({
  workspaceId,
  entity,
  entityId,
}: {
  workspaceId: string;
  entity: CrmFieldEntity;
  entityId: string;
}) {
  const definitions = await getFieldDefinitions({ workspaceId, entity });
  if (definitions.length === 0) return [];

  const values = await db
    .select()
    .from(crmFieldValueTable)
    .where(
      and(
        eq(crmFieldValueTable.entityId, entityId),
        inArray(
          crmFieldValueTable.definitionId,
          definitions.map((definition) => definition.id),
        ),
      ),
    );

  const byDefinition = new Map(
    values.map((value) => [value.definitionId, value.value]),
  );

  return definitions.map((definition) => ({
    ...definition,
    value: byDefinition.get(definition.id) ?? "",
  }));
}

export async function setFieldValues({
  workspaceId,
  entity,
  entityId,
  values,
}: {
  workspaceId: string;
  entity: CrmFieldEntity;
  entityId: string;
  values: Array<{ key: string; value: string }>;
}) {
  const definitions = await getFieldDefinitions({ workspaceId, entity });
  const byKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  );

  for (const entry of values) {
    const definition = byKey.get(entry.key);
    if (!definition) {
      throw new HTTPException(400, {
        message: `Unknown field "${entry.key}" for ${entity}`,
      });
    }
    if (
      definition.type === "select" &&
      entry.value !== "" &&
      !(definition.options ?? []).includes(entry.value)
    ) {
      throw new HTTPException(400, {
        message: `"${entry.value}" is not an option of ${definition.label}`,
      });
    }
  }

  await db.transaction(async (tx) => {
    for (const entry of values) {
      const definition = byKey.get(entry.key);
      if (!definition) continue;
      await tx
        .insert(crmFieldValueTable)
        .values({
          definitionId: definition.id,
          entityId,
          value: entry.value,
        })
        .onConflictDoUpdate({
          target: [
            crmFieldValueTable.definitionId,
            crmFieldValueTable.entityId,
          ],
          set: { value: entry.value, updatedAt: new Date() },
        });
    }
  });

  return getFieldValues({ workspaceId, entity, entityId });
}
