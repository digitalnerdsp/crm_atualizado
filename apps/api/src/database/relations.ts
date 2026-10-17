import { relations } from "drizzle-orm";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  calendarEventAttendeeTable,
  calendarEventReminderTable,
  calendarEventTable,
  columnTable,
  commentTable,
  crmActivityTable,
  crmCompanyServiceFlagTable,
  crmCompanyTable,
  crmContactTable,
  crmContractEventTable,
  crmContractServiceTable,
  crmContractTable,
  crmDealContactTable,
  crmDealServiceTable,
  crmDealTable,
  crmEntityTagTable,
  crmFieldDefinitionTable,
  crmFieldValueTable,
  crmHostingNoticeTable,
  crmHostingRevisionTable,
  crmHostingTable,
  crmLostReasonTable,
  crmPipelineTable,
  crmSegmentTable,
  crmServiceCategoryTable,
  crmServiceTable,
  crmSourceTable,
  crmStageHistoryTable,
  crmStageTable,
  crmTagTable,
  externalLinkTable,
  financeCategoryTable,
  financeCommissionPayoutTable,
  financeCommissionRuleTable,
  financeEntryTable,
  financePartyTable,
  financeResultSettingsTable,
  financeSettlementTable,
  financeTaxProfileRevisionTable,
  financeTaxProfileTable,
  financeTaxSimulationTable,
  globalRoleTable,
  integrationTable,
  invitationTable,
  labelTable,
  notificationTable,
  projectTable,
  sessionTable,
  systemSettingTable,
  taskAssigneeTable,
  taskChecklistItemTable,
  taskCustomFieldTable,
  taskRecurrenceTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  taskTemplateTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  userTable,
  verificationTable,
  workflowRuleTable,
  workspaceRoleTable,
  workspaceTable,
  workspaceUserTable,
} from "./schema";

export const userTableRelations = relations(userTable, ({ many, one }) => ({
  sessions: many(sessionTable),
  accounts: many(accountTable),
  teamMembers: many(teamMemberTable),
  workspaces: many(workspaceTable),
  workspaceMemberships: many(workspaceUserTable),
  assignedTasks: many(taskTable),
  taskAssignments: many(taskAssigneeTable, {
    relationName: "taskAssigneeUser",
  }),
  assignedTaskChanges: many(taskAssigneeTable, {
    relationName: "taskAssigneeAssignedBy",
  }),
  createdTaskRecurrences: many(taskRecurrenceTable),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  notifications: many(notificationTable),
  notificationPreference: one(userNotificationPreferenceTable),
  notificationWorkspaceRules: many(userNotificationWorkspaceRuleTable),
  sentInvitations: many(invitationTable),
  apikeys: many(apikeyTable),
  systemSettings: many(systemSettingTable),
  createdCalendarEvents: many(calendarEventTable, {
    relationName: "calendarEventCreator",
  }),
  calendarAttendances: many(calendarEventAttendeeTable),
  calendarReminders: many(calendarEventReminderTable),
  ownedCrmDeals: many(crmDealTable, { relationName: "crmDealOwner" }),
  createdCrmDeals: many(crmDealTable, { relationName: "crmDealCreator" }),
  ownedCrmCompanies: many(crmCompanyTable),
  ownedCrmContacts: many(crmContactTable),
  ownedCrmActivities: many(crmActivityTable, {
    relationName: "crmActivityOwner",
  }),
}));

export const globalRoleTableRelations = relations(globalRoleTable, () => ({}));

export const sessionTableRelations = relations(sessionTable, ({ one }) => ({
  user: one(userTable, {
    fields: [sessionTable.userId],
    references: [userTable.id],
  }),
}));

export const accountTableRelations = relations(accountTable, ({ one }) => ({
  user: one(userTable, {
    fields: [accountTable.userId],
    references: [userTable.id],
  }),
}));

export const verificationTableRelations = relations(
  verificationTable,
  () => ({}),
);

export const systemSettingTableRelations = relations(
  systemSettingTable,
  ({ one }) => ({
    updatedBy: one(userTable, {
      fields: [systemSettingTable.updatedByUserId],
      references: [userTable.id],
    }),
  }),
);

export const workspaceTableRelations = relations(
  workspaceTable,
  ({ many }) => ({
    teams: many(teamTable),
    members: many(workspaceUserTable),
    projects: many(projectTable),
    assets: many(assetTable),
    invitations: many(invitationTable),
    calendarEvents: many(calendarEventTable),
    notificationWorkspaceRules: many(userNotificationWorkspaceRuleTable),
    taskTemplates: many(taskTemplateTable),
    crmPipelines: many(crmPipelineTable),
    crmCompanies: many(crmCompanyTable),
    crmContacts: many(crmContactTable),
    crmDeals: many(crmDealTable),
    crmActivities: many(crmActivityTable),
    crmLostReasons: many(crmLostReasonTable),
    crmFieldDefinitions: many(crmFieldDefinitionTable),
    crmTags: many(crmTagTable),
  }),
);

export const workspaceUserTableRelations = relations(
  workspaceUserTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [workspaceUserTable.workspaceId],
      references: [workspaceTable.id],
    }),
    user: one(userTable, {
      fields: [workspaceUserTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const projectTableRelations = relations(
  projectTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [projectTable.workspaceId],
      references: [workspaceTable.id],
    }),
    tasks: many(taskTable),
    taskRecurrences: many(taskRecurrenceTable),
    assets: many(assetTable),
    columns: many(columnTable),
    workflowRules: many(workflowRuleTable),
    integrations: many(integrationTable),
    calendarEvents: many(calendarEventTable),
    notificationWorkspaceProjects: many(userNotificationWorkspaceProjectTable),
  }),
);

export const columnTableRelations = relations(columnTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [columnTable.projectId],
    references: [projectTable.id],
  }),
  tasks: many(taskTable),
  workflowRules: many(workflowRuleTable),
}));

export const workflowRuleTableRelations = relations(
  workflowRuleTable,
  ({ one }) => ({
    project: one(projectTable, {
      fields: [workflowRuleTable.projectId],
      references: [projectTable.id],
    }),
    column: one(columnTable, {
      fields: [workflowRuleTable.columnId],
      references: [columnTable.id],
    }),
  }),
);

export const taskTableRelations = relations(taskTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [taskTable.projectId],
    references: [projectTable.id],
  }),
  assignee: one(userTable, {
    fields: [taskTable.userId],
    references: [userTable.id],
  }),
  assignees: many(taskAssigneeTable),
  recurrence: one(taskRecurrenceTable, {
    fields: [taskTable.recurrenceId],
    references: [taskRecurrenceTable.id],
  }),
  column: one(columnTable, {
    fields: [taskTable.columnId],
    references: [columnTable.id],
  }),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  labels: many(labelTable),
  externalLinks: many(externalLinkTable),
  calendarEvents: many(calendarEventTable),
  sourceRelations: many(taskRelationTable, { relationName: "sourceTask" }),
  targetRelations: many(taskRelationTable, { relationName: "targetTask" }),
  crmCompany: one(crmCompanyTable, {
    fields: [taskTable.crmCompanyId],
    references: [crmCompanyTable.id],
  }),
  crmDeal: one(crmDealTable, {
    fields: [taskTable.crmDealId],
    references: [crmDealTable.id],
  }),
  remindersSent: many(taskReminderSentTable),
  customFields: many(taskCustomFieldTable),
  checklistItems: many(taskChecklistItemTable),
}));

export const taskCustomFieldTableRelations = relations(
  taskCustomFieldTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskCustomFieldTable.taskId],
      references: [taskTable.id],
    }),
  }),
);

export const taskChecklistItemTableRelations = relations(
  taskChecklistItemTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskChecklistItemTable.taskId],
      references: [taskTable.id],
    }),
    requiredBeforeColumn: one(columnTable, {
      fields: [taskChecklistItemTable.requiredBeforeColumnId],
      references: [columnTable.id],
    }),
    completedBy: one(userTable, {
      fields: [taskChecklistItemTable.completedByUserId],
      references: [userTable.id],
    }),
  }),
);

export const taskTemplateTableRelations = relations(
  taskTemplateTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [taskTemplateTable.workspaceId],
      references: [workspaceTable.id],
    }),
    createdBy: one(userTable, {
      fields: [taskTemplateTable.createdByUserId],
      references: [userTable.id],
    }),
  }),
);

export const taskRecurrenceTableRelations = relations(
  taskRecurrenceTable,
  ({ one, many }) => ({
    project: one(projectTable, {
      fields: [taskRecurrenceTable.projectId],
      references: [projectTable.id],
    }),
    createdBy: one(userTable, {
      fields: [taskRecurrenceTable.createdByUserId],
      references: [userTable.id],
    }),
    tasks: many(taskTable),
  }),
);

export const taskAssigneeTableRelations = relations(
  taskAssigneeTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskAssigneeTable.taskId],
      references: [taskTable.id],
    }),
    user: one(userTable, {
      fields: [taskAssigneeTable.userId],
      references: [userTable.id],
      relationName: "taskAssigneeUser",
    }),
    assignedBy: one(userTable, {
      fields: [taskAssigneeTable.assignedByUserId],
      references: [userTable.id],
      relationName: "taskAssigneeAssignedBy",
    }),
  }),
);

export const timeEntryTableRelations = relations(timeEntryTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [timeEntryTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [timeEntryTable.userId],
    references: [userTable.id],
  }),
}));

export const activityTableRelations = relations(activityTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [activityTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [activityTable.userId],
    references: [userTable.id],
  }),
}));

export const assetTableRelations = relations(assetTable, ({ one }) => ({
  workspace: one(workspaceTable, {
    fields: [assetTable.workspaceId],
    references: [workspaceTable.id],
  }),
  project: one(projectTable, {
    fields: [assetTable.projectId],
    references: [projectTable.id],
  }),
  task: one(taskTable, {
    fields: [assetTable.taskId],
    references: [taskTable.id],
  }),
  activity: one(activityTable, {
    fields: [assetTable.activityId],
    references: [activityTable.id],
  }),
  creator: one(userTable, {
    fields: [assetTable.createdBy],
    references: [userTable.id],
  }),
}));

export const labelTableRelations = relations(labelTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [labelTable.taskId],
    references: [taskTable.id],
  }),
}));

export const notificationTableRelations = relations(
  notificationTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [notificationTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationPreferenceTableRelations = relations(
  userNotificationPreferenceTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [userNotificationPreferenceTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationWorkspaceRuleTableRelations = relations(
  userNotificationWorkspaceRuleTable,
  ({ one, many }) => ({
    user: one(userTable, {
      fields: [userNotificationWorkspaceRuleTable.userId],
      references: [userTable.id],
    }),
    workspace: one(workspaceTable, {
      fields: [userNotificationWorkspaceRuleTable.workspaceId],
      references: [workspaceTable.id],
    }),
    selectedProjects: many(userNotificationWorkspaceProjectTable),
  }),
);

export const userNotificationWorkspaceProjectTableRelations = relations(
  userNotificationWorkspaceProjectTable,
  ({ one }) => ({
    workspaceRule: one(userNotificationWorkspaceRuleTable, {
      fields: [
        userNotificationWorkspaceProjectTable.workspaceId,
        userNotificationWorkspaceProjectTable.workspaceRuleId,
      ],
      references: [
        userNotificationWorkspaceRuleTable.workspaceId,
        userNotificationWorkspaceRuleTable.id,
      ],
    }),
    project: one(projectTable, {
      fields: [
        userNotificationWorkspaceProjectTable.workspaceId,
        userNotificationWorkspaceProjectTable.projectId,
      ],
      references: [projectTable.workspaceId, projectTable.id],
    }),
  }),
);

export const teamTableRelations = relations(teamTable, ({ one, many }) => ({
  workspace: one(workspaceTable, {
    fields: [teamTable.workspaceId],
    references: [workspaceTable.id],
  }),
  teamMembers: many(teamMemberTable),
}));

export const teamMemberTableRelations = relations(
  teamMemberTable,
  ({ one }) => ({
    team: one(teamTable, {
      fields: [teamMemberTable.teamId],
      references: [teamTable.id],
    }),
    user: one(userTable, {
      fields: [teamMemberTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const invitationTableRelations = relations(
  invitationTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [invitationTable.workspaceId],
      references: [workspaceTable.id],
    }),
    inviter: one(userTable, {
      fields: [invitationTable.inviterId],
      references: [userTable.id],
    }),
  }),
);

export const workspaceRoleTableRelations = relations(
  workspaceRoleTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [workspaceRoleTable.workspaceId],
      references: [workspaceTable.id],
    }),
  }),
);

export const apikeyTableRelations = relations(apikeyTable, ({ one }) => ({
  user: one(userTable, {
    fields: [apikeyTable.referenceId],
    references: [userTable.id],
  }),
}));

export const integrationTableRelations = relations(
  integrationTable,
  ({ one, many }) => ({
    project: one(projectTable, {
      fields: [integrationTable.projectId],
      references: [projectTable.id],
    }),
    externalLinks: many(externalLinkTable),
  }),
);

export const taskRelationTableRelations = relations(
  taskRelationTable,
  ({ one }) => ({
    sourceTask: one(taskTable, {
      fields: [taskRelationTable.sourceTaskId],
      references: [taskTable.id],
      relationName: "sourceTask",
    }),
    targetTask: one(taskTable, {
      fields: [taskRelationTable.targetTaskId],
      references: [taskTable.id],
      relationName: "targetTask",
    }),
  }),
);

export const externalLinkTableRelations = relations(
  externalLinkTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [externalLinkTable.taskId],
      references: [taskTable.id],
    }),
    integration: one(integrationTable, {
      fields: [externalLinkTable.integrationId],
      references: [integrationTable.id],
    }),
  }),
);

export const taskReminderSentTableRelations = relations(
  taskReminderSentTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskReminderSentTable.taskId],
      references: [taskTable.id],
    }),
  }),
);

export const calendarEventTableRelations = relations(
  calendarEventTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [calendarEventTable.workspaceId],
      references: [workspaceTable.id],
    }),
    project: one(projectTable, {
      fields: [calendarEventTable.projectId],
      references: [projectTable.id],
    }),
    task: one(taskTable, {
      fields: [calendarEventTable.taskId],
      references: [taskTable.id],
    }),
    createdBy: one(userTable, {
      fields: [calendarEventTable.createdByUserId],
      references: [userTable.id],
      relationName: "calendarEventCreator",
    }),
    attendees: many(calendarEventAttendeeTable),
    reminders: many(calendarEventReminderTable),
  }),
);

export const calendarEventAttendeeTableRelations = relations(
  calendarEventAttendeeTable,
  ({ one }) => ({
    event: one(calendarEventTable, {
      fields: [calendarEventAttendeeTable.eventId],
      references: [calendarEventTable.id],
    }),
    user: one(userTable, {
      fields: [calendarEventAttendeeTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const calendarEventReminderTableRelations = relations(
  calendarEventReminderTable,
  ({ one }) => ({
    event: one(calendarEventTable, {
      fields: [calendarEventReminderTable.eventId],
      references: [calendarEventTable.id],
    }),
    user: one(userTable, {
      fields: [calendarEventReminderTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const commentTableRelations = relations(commentTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [commentTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [commentTable.userId],
    references: [userTable.id],
  }),
}));

/* -------------------------------------------------------------------------
 * CRM
 * ---------------------------------------------------------------------- */

export const crmPipelineTableRelations = relations(
  crmPipelineTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmPipelineTable.workspaceId],
      references: [workspaceTable.id],
    }),
    stages: many(crmStageTable),
    deals: many(crmDealTable),
  }),
);

export const crmStageTableRelations = relations(
  crmStageTable,
  ({ one, many }) => ({
    pipeline: one(crmPipelineTable, {
      fields: [crmStageTable.pipelineId],
      references: [crmPipelineTable.id],
    }),
    deals: many(crmDealTable),
    historyEntered: many(crmStageHistoryTable, {
      relationName: "crmStageHistoryTo",
    }),
    historyExited: many(crmStageHistoryTable, {
      relationName: "crmStageHistoryFrom",
    }),
  }),
);

export const crmLostReasonTableRelations = relations(
  crmLostReasonTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmLostReasonTable.workspaceId],
      references: [workspaceTable.id],
    }),
    deals: many(crmDealTable),
  }),
);

export const crmCompanyTableRelations = relations(
  crmCompanyTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmCompanyTable.workspaceId],
      references: [workspaceTable.id],
    }),
    owner: one(userTable, {
      fields: [crmCompanyTable.ownerUserId],
      references: [userTable.id],
    }),
    segment: one(crmSegmentTable, {
      fields: [crmCompanyTable.segmentId],
      references: [crmSegmentTable.id],
    }),
    source: one(crmSourceTable, {
      fields: [crmCompanyTable.sourceId],
      references: [crmSourceTable.id],
    }),
    contacts: many(crmContactTable),
    deals: many(crmDealTable),
    activities: many(crmActivityTable),
    tasks: many(taskTable),
  }),
);

export const crmSourceTableRelations = relations(
  crmSourceTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmSourceTable.workspaceId],
      references: [workspaceTable.id],
    }),
    companies: many(crmCompanyTable),
    deals: many(crmDealTable),
  }),
);

export const crmSegmentTableRelations = relations(
  crmSegmentTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmSegmentTable.workspaceId],
      references: [workspaceTable.id],
    }),
    companies: many(crmCompanyTable),
  }),
);

export const crmContactTableRelations = relations(
  crmContactTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmContactTable.workspaceId],
      references: [workspaceTable.id],
    }),
    company: one(crmCompanyTable, {
      fields: [crmContactTable.companyId],
      references: [crmCompanyTable.id],
    }),
    owner: one(userTable, {
      fields: [crmContactTable.ownerUserId],
      references: [userTable.id],
    }),
    dealLinks: many(crmDealContactTable),
    primaryOfDeals: many(crmDealTable),
    activities: many(crmActivityTable),
  }),
);

export const crmDealTableRelations = relations(
  crmDealTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmDealTable.workspaceId],
      references: [workspaceTable.id],
    }),
    pipeline: one(crmPipelineTable, {
      fields: [crmDealTable.pipelineId],
      references: [crmPipelineTable.id],
    }),
    stage: one(crmStageTable, {
      fields: [crmDealTable.stageId],
      references: [crmStageTable.id],
    }),
    company: one(crmCompanyTable, {
      fields: [crmDealTable.companyId],
      references: [crmCompanyTable.id],
    }),
    primaryContact: one(crmContactTable, {
      fields: [crmDealTable.primaryContactId],
      references: [crmContactTable.id],
    }),
    owner: one(userTable, {
      fields: [crmDealTable.ownerUserId],
      references: [userTable.id],
      relationName: "crmDealOwner",
    }),
    createdBy: one(userTable, {
      fields: [crmDealTable.createdByUserId],
      references: [userTable.id],
      relationName: "crmDealCreator",
    }),
    lostReason: one(crmLostReasonTable, {
      fields: [crmDealTable.lostReasonId],
      references: [crmLostReasonTable.id],
    }),
    source: one(crmSourceTable, {
      fields: [crmDealTable.sourceId],
      references: [crmSourceTable.id],
    }),
    contactLinks: many(crmDealContactTable),
    services: many(crmDealServiceTable),
    activities: many(crmActivityTable),
    stageHistory: many(crmStageHistoryTable),
    deliveryTasks: many(taskTable),
  }),
);

export const crmDealContactTableRelations = relations(
  crmDealContactTable,
  ({ one }) => ({
    deal: one(crmDealTable, {
      fields: [crmDealContactTable.dealId],
      references: [crmDealTable.id],
    }),
    contact: one(crmContactTable, {
      fields: [crmDealContactTable.contactId],
      references: [crmContactTable.id],
    }),
  }),
);

export const crmStageHistoryTableRelations = relations(
  crmStageHistoryTable,
  ({ one }) => ({
    deal: one(crmDealTable, {
      fields: [crmStageHistoryTable.dealId],
      references: [crmDealTable.id],
    }),
    fromStage: one(crmStageTable, {
      fields: [crmStageHistoryTable.fromStageId],
      references: [crmStageTable.id],
      relationName: "crmStageHistoryFrom",
    }),
    toStage: one(crmStageTable, {
      fields: [crmStageHistoryTable.toStageId],
      references: [crmStageTable.id],
      relationName: "crmStageHistoryTo",
    }),
    changedBy: one(userTable, {
      fields: [crmStageHistoryTable.changedByUserId],
      references: [userTable.id],
    }),
  }),
);

export const crmActivityTableRelations = relations(
  crmActivityTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [crmActivityTable.workspaceId],
      references: [workspaceTable.id],
    }),
    deal: one(crmDealTable, {
      fields: [crmActivityTable.dealId],
      references: [crmDealTable.id],
    }),
    contact: one(crmContactTable, {
      fields: [crmActivityTable.contactId],
      references: [crmContactTable.id],
    }),
    company: one(crmCompanyTable, {
      fields: [crmActivityTable.companyId],
      references: [crmCompanyTable.id],
    }),
    owner: one(userTable, {
      fields: [crmActivityTable.ownerUserId],
      references: [userTable.id],
      relationName: "crmActivityOwner",
    }),
    calendarEvent: one(calendarEventTable, {
      fields: [crmActivityTable.calendarEventId],
      references: [calendarEventTable.id],
    }),
  }),
);

export const crmFieldDefinitionTableRelations = relations(
  crmFieldDefinitionTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmFieldDefinitionTable.workspaceId],
      references: [workspaceTable.id],
    }),
    values: many(crmFieldValueTable),
  }),
);

export const crmFieldValueTableRelations = relations(
  crmFieldValueTable,
  ({ one }) => ({
    definition: one(crmFieldDefinitionTable, {
      fields: [crmFieldValueTable.definitionId],
      references: [crmFieldDefinitionTable.id],
    }),
  }),
);

export const crmTagTableRelations = relations(crmTagTable, ({ one, many }) => ({
  workspace: one(workspaceTable, {
    fields: [crmTagTable.workspaceId],
    references: [workspaceTable.id],
  }),
  assignments: many(crmEntityTagTable),
}));

export const crmEntityTagTableRelations = relations(
  crmEntityTagTable,
  ({ one }) => ({
    tag: one(crmTagTable, {
      fields: [crmEntityTagTable.tagId],
      references: [crmTagTable.id],
    }),
  }),
);

export const crmServiceCategoryTableRelations = relations(
  crmServiceCategoryTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmServiceCategoryTable.workspaceId],
      references: [workspaceTable.id],
    }),
    services: many(crmServiceTable),
  }),
);

export const crmServiceTableRelations = relations(
  crmServiceTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmServiceTable.workspaceId],
      references: [workspaceTable.id],
    }),
    category: one(crmServiceCategoryTable, {
      fields: [crmServiceTable.categoryId],
      references: [crmServiceCategoryTable.id],
    }),
    dealItems: many(crmDealServiceTable),
  }),
);

export const crmDealServiceTableRelations = relations(
  crmDealServiceTable,
  ({ one }) => ({
    deal: one(crmDealTable, {
      fields: [crmDealServiceTable.dealId],
      references: [crmDealTable.id],
    }),
    service: one(crmServiceTable, {
      fields: [crmDealServiceTable.serviceId],
      references: [crmServiceTable.id],
    }),
  }),
);

export const crmContractTableRelations = relations(
  crmContractTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [crmContractTable.workspaceId],
      references: [workspaceTable.id],
    }),
    company: one(crmCompanyTable, {
      fields: [crmContractTable.companyId],
      references: [crmCompanyTable.id],
    }),
    deal: one(crmDealTable, {
      fields: [crmContractTable.dealId],
      references: [crmDealTable.id],
    }),
    cancelReason: one(crmLostReasonTable, {
      fields: [crmContractTable.cancelReasonId],
      references: [crmLostReasonTable.id],
    }),
    owner: one(userTable, {
      fields: [crmContractTable.ownerUserId],
      references: [userTable.id],
    }),
    services: many(crmContractServiceTable),
    events: many(crmContractEventTable),
  }),
);

export const crmContractServiceTableRelations = relations(
  crmContractServiceTable,
  ({ one }) => ({
    contract: one(crmContractTable, {
      fields: [crmContractServiceTable.contractId],
      references: [crmContractTable.id],
    }),
    service: one(crmServiceTable, {
      fields: [crmContractServiceTable.serviceId],
      references: [crmServiceTable.id],
    }),
  }),
);

export const crmContractEventTableRelations = relations(
  crmContractEventTable,
  ({ one }) => ({
    contract: one(crmContractTable, {
      fields: [crmContractEventTable.contractId],
      references: [crmContractTable.id],
    }),
    changedBy: one(userTable, {
      fields: [crmContractEventTable.changedByUserId],
      references: [userTable.id],
    }),
  }),
);

export const financeCategoryRelations = relations(
  financeCategoryTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [financeCategoryTable.workspaceId],
      references: [workspaceTable.id],
    }),
    entries: many(financeEntryTable),
  }),
);
export const financePartyRelations = relations(
  financePartyTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [financePartyTable.workspaceId],
      references: [workspaceTable.id],
    }),
    entries: many(financeEntryTable),
  }),
);
export const financeEntryRelations = relations(
  financeEntryTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [financeEntryTable.workspaceId],
      references: [workspaceTable.id],
    }),
    category: one(financeCategoryTable, {
      fields: [financeEntryTable.categoryId],
      references: [financeCategoryTable.id],
    }),
    party: one(financePartyTable, {
      fields: [financeEntryTable.partyId],
      references: [financePartyTable.id],
    }),
    company: one(crmCompanyTable, {
      fields: [financeEntryTable.companyId],
      references: [crmCompanyTable.id],
    }),
    service: one(crmServiceTable, {
      fields: [financeEntryTable.serviceId],
      references: [crmServiceTable.id],
    }),
    settlements: many(financeSettlementTable),
    commissionRule: one(financeCommissionRuleTable, {
      fields: [financeEntryTable.commissionRuleId],
      references: [financeCommissionRuleTable.id],
    }),
    commissionPayouts: many(financeCommissionPayoutTable, {
      relationName: "commissionSource",
    }),
    commissionPayment: many(financeCommissionPayoutTable, {
      relationName: "commissionPayable",
    }),
  }),
);
export const financeSettlementRelations = relations(
  financeSettlementTable,
  ({ one }) => ({
    entry: one(financeEntryTable, {
      fields: [financeSettlementTable.entryId],
      references: [financeEntryTable.id],
    }),
  }),
);

export const financeCommissionRuleRelations = relations(
  financeCommissionRuleTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [financeCommissionRuleTable.workspaceId],
      references: [workspaceTable.id],
    }),
    service: one(crmServiceTable, {
      fields: [financeCommissionRuleTable.serviceId],
      references: [crmServiceTable.id],
    }),
    actor: one(userTable, {
      fields: [financeCommissionRuleTable.actorUserId],
      references: [userTable.id],
    }),
    entries: many(financeEntryTable),
  }),
);
export const financeCommissionPayoutRelations = relations(
  financeCommissionPayoutTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [financeCommissionPayoutTable.workspaceId],
      references: [workspaceTable.id],
    }),
    source: one(financeEntryTable, {
      relationName: "commissionSource",
      fields: [financeCommissionPayoutTable.sourceEntryId],
      references: [financeEntryTable.id],
    }),
    payable: one(financeEntryTable, {
      relationName: "commissionPayable",
      fields: [financeCommissionPayoutTable.payableEntryId],
      references: [financeEntryTable.id],
    }),
  }),
);
export const financeResultSettingsRelations = relations(
  financeResultSettingsTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [financeResultSettingsTable.workspaceId],
      references: [workspaceTable.id],
    }),
  }),
);

export const financeTaxProfileRelations = relations(
  financeTaxProfileTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [financeTaxProfileTable.workspaceId],
      references: [workspaceTable.id],
    }),
    revisions: many(financeTaxProfileRevisionTable),
    simulations: many(financeTaxSimulationTable),
  }),
);
export const financeTaxProfileRevisionRelations = relations(
  financeTaxProfileRevisionTable,
  ({ one, many }) => ({
    profile: one(financeTaxProfileTable, {
      fields: [financeTaxProfileRevisionTable.profileId],
      references: [financeTaxProfileTable.id],
    }),
    simulations: many(financeTaxSimulationTable),
  }),
);
export const financeTaxSimulationRelations = relations(
  financeTaxSimulationTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [financeTaxSimulationTable.workspaceId],
      references: [workspaceTable.id],
    }),
    profile: one(financeTaxProfileTable, {
      fields: [financeTaxSimulationTable.profileId],
      references: [financeTaxProfileTable.id],
    }),
    revision: one(financeTaxProfileRevisionTable, {
      fields: [financeTaxSimulationTable.revisionId],
      references: [financeTaxProfileRevisionTable.id],
    }),
  }),
);

export const crmHostingRelations = relations(crmHostingTable, ({ one }) => ({
  company: one(crmCompanyTable, {
    fields: [crmHostingTable.companyId],
    references: [crmCompanyTable.id],
  }),
  contact: one(crmContactTable, {
    fields: [crmHostingTable.contactId],
    references: [crmContactTable.id],
  }),
}));
export const crmHostingRevisionRelations = relations(
  crmHostingRevisionTable,
  ({ one }) => ({
    company: one(crmCompanyTable, {
      fields: [crmHostingRevisionTable.companyId],
      references: [crmCompanyTable.id],
    }),
  }),
);
export const crmHostingNoticeRelations = relations(
  crmHostingNoticeTable,
  ({ one }) => ({
    company: one(crmCompanyTable, {
      fields: [crmHostingNoticeTable.companyId],
      references: [crmCompanyTable.id],
    }),
    workspace: one(workspaceTable, {
      fields: [crmHostingNoticeTable.workspaceId],
      references: [workspaceTable.id],
    }),
  }),
);
export const crmCompanyServiceFlagRelations = relations(
  crmCompanyServiceFlagTable,
  ({ one }) => ({
    company: one(crmCompanyTable, {
      fields: [crmCompanyServiceFlagTable.companyId],
      references: [crmCompanyTable.id],
    }),
    service: one(crmServiceTable, {
      fields: [crmCompanyServiceFlagTable.serviceId],
      references: [crmServiceTable.id],
    }),
  }),
);
