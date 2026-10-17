import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  columnTable,
  crmCompanyTable,
  crmContactTable,
  crmContractTable,
  crmDealContactTable,
  crmDealServiceTable,
  crmDealTable,
  crmLostReasonTable,
  crmPipelineTable,
  crmSourceTable,
  crmStageHistoryTable,
  crmStageTable,
  projectTable,
  taskTable,
  userTable,
} from "../../../database/schema";

async function getDeal({
  workspaceId,
  dealId,
}: {
  workspaceId: string;
  dealId: string;
}) {
  const [row] = await db
    .select({
      deal: crmDealTable,
      pipeline: { id: crmPipelineTable.id, name: crmPipelineTable.name },
      stage: {
        id: crmStageTable.id,
        name: crmStageTable.name,
        outcome: crmStageTable.outcome,
        probability: crmStageTable.probability,
        color: crmStageTable.color,
        rottingDays: crmStageTable.rottingDays,
      },
      company: {
        id: crmCompanyTable.id,
        name: crmCompanyTable.name,
        domain: crmCompanyTable.domain,
      },
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
      lostReason: {
        id: crmLostReasonTable.id,
        name: crmLostReasonTable.name,
      },
      source: {
        id: crmSourceTable.id,
        name: crmSourceTable.name,
        channel: crmSourceTable.channel,
      },
    })
    .from(crmDealTable)
    .innerJoin(
      crmPipelineTable,
      eq(crmDealTable.pipelineId, crmPipelineTable.id),
    )
    .innerJoin(crmStageTable, eq(crmDealTable.stageId, crmStageTable.id))
    .leftJoin(crmCompanyTable, eq(crmDealTable.companyId, crmCompanyTable.id))
    .leftJoin(userTable, eq(crmDealTable.ownerUserId, userTable.id))
    .leftJoin(
      crmLostReasonTable,
      eq(crmDealTable.lostReasonId, crmLostReasonTable.id),
    )
    .leftJoin(crmSourceTable, eq(crmDealTable.sourceId, crmSourceTable.id))
    .where(
      and(
        eq(crmDealTable.id, dealId),
        eq(crmDealTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Deal not found" });
  }

  const contacts = await db
    .select({
      id: crmContactTable.id,
      firstName: crmContactTable.firstName,
      lastName: crmContactTable.lastName,
      email: crmContactTable.email,
      phone: crmContactTable.phone,
      jobTitle: crmContactTable.jobTitle,
      role: crmDealContactTable.role,
    })
    .from(crmDealContactTable)
    .innerJoin(
      crmContactTable,
      eq(crmDealContactTable.contactId, crmContactTable.id),
    )
    .where(eq(crmDealContactTable.dealId, dealId));

  // Stage names travel with the history: without them the timeline is a list of
  // dates and durations that says nothing about where the deal actually was.
  const fromStage = alias(crmStageTable, "from_stage");
  const toStage = alias(crmStageTable, "to_stage");

  const stageHistory = await db
    .select({
      id: crmStageHistoryTable.id,
      fromStageId: crmStageHistoryTable.fromStageId,
      fromStageName: fromStage.name,
      toStageId: crmStageHistoryTable.toStageId,
      toStageName: toStage.name,
      toStageColor: toStage.color,
      enteredAt: crmStageHistoryTable.enteredAt,
      exitedAt: crmStageHistoryTable.exitedAt,
      durationSeconds: crmStageHistoryTable.durationSeconds,
      changedByUserId: crmStageHistoryTable.changedByUserId,
    })
    .from(crmStageHistoryTable)
    .leftJoin(fromStage, eq(crmStageHistoryTable.fromStageId, fromStage.id))
    .leftJoin(toStage, eq(crmStageHistoryTable.toStageId, toStage.id))
    .where(eq(crmStageHistoryTable.dealId, dealId))
    .orderBy(asc(crmStageHistoryTable.enteredAt));

  // The work this deal produced, wherever it lives: a rebranding lands tasks in
  // the Design project and the Dev project alike.
  const deliveryTasks = await db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      dueDate: taskTable.dueDate,
      projectId: projectTable.id,
      projectName: projectTable.name,
      isDone: columnTable.isFinal,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(columnTable, eq(taskTable.columnId, columnTable.id))
    .where(eq(taskTable.crmDealId, dealId))
    .orderBy(desc(taskTable.createdAt))
    .limit(200);

  const services = await db
    .select()
    .from(crmDealServiceTable)
    .where(eq(crmDealServiceTable.dealId, dealId))
    .orderBy(asc(crmDealServiceTable.position));

  const [contract] = await db
    .select({
      id: crmContractTable.id,
      number: crmContractTable.number,
      status: crmContractTable.status,
      monthlyValueCents: crmContractTable.monthlyValueCents,
    })
    .from(crmContractTable)
    .where(eq(crmContractTable.dealId, dealId))
    .orderBy(desc(crmContractTable.createdAt))
    .limit(1);

  return {
    ...row.deal,
    pipeline: row.pipeline,
    stage: row.stage,
    company: row.company,
    owner: row.owner,
    lostReason: row.lostReason,
    source: row.source,
    services,
    contract: contract ?? null,
    contacts,
    stageHistory,
    deliveryTasks: deliveryTasks.map((task) => ({
      ...task,
      isDone: task.isDone === true,
    })),
    completedTaskCount: deliveryTasks.filter((task) => task.isDone === true)
      .length,
  };
}

export default getDeal;
