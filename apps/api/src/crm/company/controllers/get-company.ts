import { and, count, desc, eq, sum } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  columnTable,
  crmCompanyTable,
  crmContactTable,
  crmContractTable,
  crmDealTable,
  crmSegmentTable,
  crmSourceTable,
  projectTable,
  taskTable,
  userTable,
} from "../../../database/schema";

async function getCompany({
  workspaceId,
  companyId,
}: {
  workspaceId: string;
  companyId: string;
}) {
  const [row] = await db
    .select({
      company: crmCompanyTable,
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
      segment: { id: crmSegmentTable.id, name: crmSegmentTable.name },
      source: {
        id: crmSourceTable.id,
        name: crmSourceTable.name,
        channel: crmSourceTable.channel,
      },
    })
    .from(crmCompanyTable)
    .leftJoin(userTable, eq(crmCompanyTable.ownerUserId, userTable.id))
    .leftJoin(
      crmSegmentTable,
      eq(crmCompanyTable.segmentId, crmSegmentTable.id),
    )
    .leftJoin(crmSourceTable, eq(crmCompanyTable.sourceId, crmSourceTable.id))
    .where(
      and(
        eq(crmCompanyTable.id, companyId),
        eq(crmCompanyTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Company not found" });
  }

  const contacts = await db
    .select()
    .from(crmContactTable)
    .where(eq(crmContactTable.companyId, companyId))
    .orderBy(desc(crmContactTable.isPrimary), crmContactTable.firstName);

  // Aggregated in SQL rather than by summing a fetched list: a long-standing
  // account can carry hundreds of deals.
  const dealStats = await db
    .select({
      status: crmDealTable.status,
      total: count(),
      valueCents: sum(crmDealTable.valueCents),
    })
    .from(crmDealTable)
    .where(eq(crmDealTable.companyId, companyId))
    .groupBy(crmDealTable.status);

  // Projects here are per discipline, so "what is running for this client" is a
  // question about tasks spread across every project — grouped by project only
  // so the answer is readable.
  const taskRows = await db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      priority: taskTable.priority,
      dueDate: taskTable.dueDate,
      crmDealId: taskTable.crmDealId,
      projectId: projectTable.id,
      projectName: projectTable.name,
      projectSlug: projectTable.slug,
      projectIcon: projectTable.icon,
      isDone: columnTable.isFinal,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(columnTable, eq(taskTable.columnId, columnTable.id))
    .where(eq(taskTable.crmCompanyId, companyId))
    .orderBy(desc(taskTable.createdAt))
    .limit(200);

  const byProject = new Map<
    string,
    {
      projectId: string;
      projectName: string;
      projectSlug: string;
      projectIcon: string | null;
      openCount: number;
      tasks: Array<{
        id: string;
        number: number | null;
        title: string;
        status: string;
        priority: string | null;
        dueDate: Date | null;
        crmDealId: string | null;
        isDone: boolean;
      }>;
    }
  >();

  for (const row of taskRows) {
    const isDone = row.isDone === true;
    const bucket = byProject.get(row.projectId) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      projectSlug: row.projectSlug,
      projectIcon: row.projectIcon,
      openCount: 0,
      tasks: [],
    };
    bucket.tasks.push({
      id: row.id,
      number: row.number,
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      crmDealId: row.crmDealId,
      isDone,
    });
    if (!isDone) bucket.openCount += 1;
    byProject.set(row.projectId, bucket);
  }

  const tasksByProject = [...byProject.values()];

  const contracts = await db
    .select({
      id: crmContractTable.id,
      number: crmContractTable.number,
      title: crmContractTable.title,
      status: crmContractTable.status,
      monthlyValueCents: crmContractTable.monthlyValueCents,
      startsAt: crmContractTable.startsAt,
      endedAt: crmContractTable.endedAt,
    })
    .from(crmContractTable)
    .where(eq(crmContractTable.companyId, companyId))
    .orderBy(desc(crmContractTable.startsAt));

  return {
    ...row.company,
    owner: row.owner,
    segment: row.segment,
    source: row.source,
    contacts,
    contracts,
    activeMrrCents: contracts
      .filter((contract) => contract.status === "active")
      .reduce((total, contract) => total + contract.monthlyValueCents, 0),
    deals: dealStats.map((stat) => ({
      status: stat.status,
      count: stat.total,
      // `sum()` comes back as a string from pg for bigint columns.
      valueCents: Number(stat.valueCents ?? 0),
    })),
    tasksByProject,
    openTaskCount: tasksByProject.reduce(
      (total, group) => total + group.openCount,
      0,
    ),
  };
}

export default getCompany;
