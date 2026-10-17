import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { type CrmBillingType, crmServiceTable } from "../../database/schema";
import { computeLineTotalCents } from "./deal-line";

export type ServiceLineInput = {
  serviceId?: string | null;
  name?: string;
  billingType?: CrmBillingType;
  quantity: number;
  unitPriceCents?: number;
  discountPercent?: number;
};

export type ResolvedServiceLine = {
  serviceId: string | null;
  name: string;
  billingType: CrmBillingType;
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
  totalCents: number;
  position: number;
};

/**
 * Transforma o que a tela mandou em linhas prontas para gravar, num negócio
 * ou num contrato.
 *
 * Nome, tipo de cobrança e preço são cópia: vêm do payload quando ele traz (é
 * o que preserva uma venda antiga ao salvar de novo) e só caem para o catálogo
 * quando faltam. Serviço arquivado continua aceito — reabrir um registro
 * antigo e salvar não pode falhar porque o serviço saiu do catálogo depois.
 */
export async function resolveServiceLines(
  workspaceId: string,
  lines: ReadonlyArray<ServiceLineInput>,
): Promise<ResolvedServiceLine[]> {
  const serviceIds = [
    ...new Set(
      lines
        .map((line) => line.serviceId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const catalog =
    serviceIds.length === 0
      ? []
      : await db
          .select()
          .from(crmServiceTable)
          .where(
            and(
              eq(crmServiceTable.workspaceId, workspaceId),
              inArray(crmServiceTable.id, serviceIds),
            ),
          );
  const byId = new Map(catalog.map((service) => [service.id, service]));

  return lines.map((line, position) => {
    const service = line.serviceId ? byId.get(line.serviceId) : undefined;
    if (line.serviceId && !service) {
      throw new HTTPException(404, { message: "Service not found" });
    }

    const name = line.name?.trim() || service?.name;
    if (!name) {
      throw new HTTPException(400, {
        message: "Item fora do catálogo precisa de um nome.",
      });
    }

    const unitPriceCents = line.unitPriceCents ?? service?.defaultPriceCents;
    if (unitPriceCents === undefined) {
      throw new HTTPException(400, {
        message: "Item fora do catálogo precisa de um preço.",
      });
    }

    const discountPercent = line.discountPercent ?? 0;

    return {
      serviceId: service?.id ?? null,
      name,
      billingType: line.billingType ?? service?.billingType ?? "one_time",
      quantity: line.quantity,
      unitPriceCents,
      discountPercent,
      totalCents: computeLineTotalCents({
        quantity: line.quantity,
        unitPriceCents,
        discountPercent,
      }),
      position,
    };
  });
}
