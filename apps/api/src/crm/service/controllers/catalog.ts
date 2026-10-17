import { and, asc, eq, isNull, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  type CrmBillingType,
  crmServiceCategoryTable,
  crmServiceTable,
} from "../../../database/schema";
import { isUniqueViolation } from "../../shared/unique-violation";

export type ServiceInput = {
  name?: string;
  categoryId?: string | null;
  code?: string | null;
  description?: string | null;
  defaultPriceCents?: number;
  billingType?: CrmBillingType;
  position?: number;
  archived?: boolean;
};

/** Código vazio vira null: o índice único é parcial em `code is not null`,
 * e duas strings vazias colidiriam. */
function normalizeCode(code: string | null | undefined) {
  if (code === undefined) return undefined;
  if (code === null) return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

async function assertCategoryInWorkspace(
  workspaceId: string,
  categoryId: string | null | undefined,
) {
  if (!categoryId) return;
  const [category] = await db
    .select({ id: crmServiceCategoryTable.id })
    .from(crmServiceCategoryTable)
    .where(
      and(
        eq(crmServiceCategoryTable.id, categoryId),
        eq(crmServiceCategoryTable.workspaceId, workspaceId),
      ),
    );
  if (!category) {
    throw new HTTPException(404, { message: "Service category not found" });
  }
}

export async function getServices({
  workspaceId,
  includeArchived = false,
}: {
  workspaceId: string;
  includeArchived?: boolean;
}) {
  return db
    .select({
      id: crmServiceTable.id,
      workspaceId: crmServiceTable.workspaceId,
      categoryId: crmServiceTable.categoryId,
      categoryName: crmServiceCategoryTable.name,
      name: crmServiceTable.name,
      code: crmServiceTable.code,
      description: crmServiceTable.description,
      defaultPriceCents: crmServiceTable.defaultPriceCents,
      currency: crmServiceTable.currency,
      billingType: crmServiceTable.billingType,
      position: crmServiceTable.position,
      archivedAt: crmServiceTable.archivedAt,
    })
    .from(crmServiceTable)
    .leftJoin(
      crmServiceCategoryTable,
      eq(crmServiceTable.categoryId, crmServiceCategoryTable.id),
    )
    .where(
      and(
        eq(crmServiceTable.workspaceId, workspaceId),
        includeArchived ? undefined : isNull(crmServiceTable.archivedAt),
      ),
    )
    .orderBy(
      asc(crmServiceCategoryTable.position),
      asc(crmServiceTable.position),
      asc(crmServiceTable.name),
    );
}

export async function createService({
  workspaceId,
  input,
}: {
  workspaceId: string;
  input: ServiceInput & { name: string };
}) {
  await assertCategoryInWorkspace(workspaceId, input.categoryId);

  const [current] = await db
    .select({ maxPosition: max(crmServiceTable.position) })
    .from(crmServiceTable)
    .where(eq(crmServiceTable.workspaceId, workspaceId));

  try {
    const [created] = await db
      .insert(crmServiceTable)
      .values({
        workspaceId,
        name: input.name,
        categoryId: input.categoryId ?? null,
        code: normalizeCode(input.code) ?? null,
        description: input.description ?? null,
        defaultPriceCents: input.defaultPriceCents ?? 0,
        billingType: input.billingType ?? "one_time",
        position: input.position ?? (current?.maxPosition ?? -1) + 1,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, { message: "Failed to create service" });
    }
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A service with this code already exists",
      });
    }
    throw error;
  }
}

/**
 * Editar o catálogo não toca em nenhum negócio: os itens já vendidos
 * guardam cópia do nome e do preço. É o que deixa o preço de tabela subir
 * sem reescrever o faturamento do ano passado.
 */
export async function updateService({
  workspaceId,
  serviceId,
  input,
}: {
  workspaceId: string;
  serviceId: string;
  input: ServiceInput;
}) {
  await assertCategoryInWorkspace(workspaceId, input.categoryId);
  const code = normalizeCode(input.code);

  try {
    const [updated] = await db
      .update(crmServiceTable)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.categoryId === undefined
          ? {}
          : { categoryId: input.categoryId }),
        ...(code === undefined ? {} : { code }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.defaultPriceCents === undefined
          ? {}
          : { defaultPriceCents: input.defaultPriceCents }),
        ...(input.billingType === undefined
          ? {}
          : { billingType: input.billingType }),
        ...(input.position === undefined ? {} : { position: input.position }),
        ...(input.archived === undefined
          ? {}
          : { archivedAt: input.archived ? new Date() : null }),
      })
      .where(
        and(
          eq(crmServiceTable.id, serviceId),
          eq(crmServiceTable.workspaceId, workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: "Service not found" });
    }
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A service with this code already exists",
      });
    }
    throw error;
  }
}

export async function getServiceCategories(
  workspaceId: string,
  includeInactive = false,
) {
  const rows = await db
    .select()
    .from(crmServiceCategoryTable)
    .where(eq(crmServiceCategoryTable.workspaceId, workspaceId))
    .orderBy(
      asc(crmServiceCategoryTable.position),
      asc(crmServiceCategoryTable.name),
    );

  return includeInactive ? rows : rows.filter((row) => row.isActive);
}

export async function createServiceCategory({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [current] = await db
    .select({ maxPosition: max(crmServiceCategoryTable.position) })
    .from(crmServiceCategoryTable)
    .where(eq(crmServiceCategoryTable.workspaceId, workspaceId));

  try {
    const [created] = await db
      .insert(crmServiceCategoryTable)
      .values({
        workspaceId,
        name,
        position: (current?.maxPosition ?? -1) + 1,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, { message: "Failed to create category" });
    }
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A category with this name already exists",
      });
    }
    throw error;
  }
}

export async function updateServiceCategory({
  workspaceId,
  categoryId,
  name,
  position,
  isActive,
}: {
  workspaceId: string;
  categoryId: string;
  name?: string;
  position?: number;
  isActive?: boolean;
}) {
  try {
    const [updated] = await db
      .update(crmServiceCategoryTable)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(position === undefined ? {} : { position }),
        ...(isActive === undefined ? {} : { isActive }),
      })
      .where(
        and(
          eq(crmServiceCategoryTable.id, categoryId),
          eq(crmServiceCategoryTable.workspaceId, workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: "Service category not found" });
    }
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A category with this name already exists",
      });
    }
    throw error;
  }
}
