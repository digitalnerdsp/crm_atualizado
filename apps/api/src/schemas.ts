import * as v from "valibot";

export const labelSchema = v.object({
  id: v.string(),
  name: v.string(),
  color: v.string(),
  createdAt: v.date(),
  taskId: v.nullable(v.string()),
  workspaceId: v.nullable(v.string()),
});

export const projectSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  slug: v.string(),
  icon: v.nullable(v.string()),
  name: v.string(),
  description: v.nullable(v.string()),
  createdAt: v.date(),
  isPublic: v.nullable(v.boolean()),
  archivedAt: v.nullable(v.date()),
});

export const taskSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  crmCompanyId: v.optional(v.nullable(v.string())),
  crmDealId: v.optional(v.nullable(v.string())),
  position: v.nullable(v.number()),
  number: v.nullable(v.number()),
  userId: v.nullable(v.string()),
  assignees: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        email: v.string(),
        image: v.nullable(v.string()),
      }),
    ),
  ),
  title: v.string(),
  description: v.nullable(v.string()),
  status: v.string(),
  priority: v.picklist([
    "no-priority",
    "low",
    "medium",
    "high",
    "urgent",
  ] as const),
  startDate: v.optional(v.date()),
  dueDate: v.optional(v.date()),
  recurrenceId: v.optional(v.nullable(v.string())),
  recurrence: v.optional(
    v.nullable(
      v.object({
        id: v.string(),
        sourceTaskId: v.nullable(v.string()),
        frequency: v.picklist(["daily", "weekly", "monthly"] as const),
        interval: v.number(),
        weekdays: v.array(v.number()),
        startsAt: v.date(),
        endsAt: v.nullable(v.date()),
        maxOccurrences: v.nullable(v.number()),
        generatedOccurrences: v.number(),
        nextOccurrenceAt: v.nullable(v.date()),
        timezone: v.string(),
        isActive: v.boolean(),
      }),
    ),
  ),
  createdAt: v.date(),
});

export const activitySchema = v.object({
  id: v.string(),
  taskId: v.string(),
  type: v.picklist([
    "comment",
    "task",
    "status_changed",
    "priority_changed",
    "unassigned",
    "assignee_changed",
    "due_date_changed",
    "title_changed",
    "description_changed",
    "create",
  ] as const),
  createdAt: v.date(),
  userId: v.nullable(v.string()),
  content: v.nullable(v.string()),
  eventData: v.nullable(v.record(v.string(), v.unknown())),
  externalUserName: v.nullable(v.string()),
  externalUserAvatar: v.nullable(v.string()),
  externalSource: v.nullable(v.string()),
  externalUrl: v.nullable(v.string()),
});

export const timeEntrySchema = v.object({
  id: v.string(),
  taskId: v.string(),
  userId: v.nullable(v.string()),
  description: v.nullable(v.string()),
  startTime: v.date(),
  endTime: v.optional(v.date()),
  duration: v.nullable(v.number()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const notificationSchema = v.object({
  id: v.string(),
  userId: v.string(),
  title: v.nullable(v.string()),
  content: v.nullable(v.string()),
  type: v.picklist([
    "info",
    "task_created",
    "workspace_created",
    "task_status_changed",
    "task_assignee_changed",
    "time_entry_created",
    "due_date_reminder",
    "task_overdue",
    "task_mention",
    "task_comment",
  ] as const),
  eventData: v.nullable(v.record(v.string(), v.unknown())),
  isRead: v.optional(v.boolean()),
  resourceId: v.optional(v.string()),
  resourceType: v.optional(v.picklist(["task", "workspace"] as const)),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const notificationPreferenceWorkspaceRuleSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  workspaceName: v.string(),
  isActive: v.boolean(),
  emailEnabled: v.boolean(),
  ntfyEnabled: v.boolean(),
  gotifyEnabled: v.boolean(),
  webhookEnabled: v.boolean(),
  projectMode: v.picklist(["all", "selected"] as const),
  selectedProjectIds: v.array(v.string()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const notificationPreferenceSchema = v.object({
  emailAddress: v.nullable(v.string()),
  emailEnabled: v.boolean(),
  ntfyEnabled: v.boolean(),
  ntfyConfigured: v.boolean(),
  ntfyServerUrl: v.nullable(v.string()),
  ntfyTopic: v.nullable(v.string()),
  ntfyTokenConfigured: v.boolean(),
  maskedNtfyToken: v.nullable(v.string()),
  gotifyEnabled: v.boolean(),
  gotifyConfigured: v.boolean(),
  gotifyServerUrl: v.nullable(v.string()),
  gotifyTokenConfigured: v.boolean(),
  maskedGotifyToken: v.nullable(v.string()),
  webhookEnabled: v.boolean(),
  webhookConfigured: v.boolean(),
  webhookUrl: v.nullable(v.string()),
  webhookSecretConfigured: v.boolean(),
  maskedWebhookSecret: v.nullable(v.string()),
  taskAssignmentEnabled: v.boolean(),
  taskCommentEnabled: v.boolean(),
  taskStatusChangeEnabled: v.boolean(),
  dueDateReminderEnabled: v.boolean(),
  dueDateReminderLeadTimeMinutes: v.number(),
  workspaces: v.array(notificationPreferenceWorkspaceRuleSchema),
  createdAt: v.nullable(v.date()),
  updatedAt: v.nullable(v.date()),
});

export const githubIntegrationSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  repositoryOwner: v.string(),
  repositoryName: v.string(),
  installationId: v.nullable(v.number()),
  branchPattern: v.optional(v.string()),
  commentTaskLinkOnGitHubIssue: v.optional(v.boolean()),
  isActive: v.nullable(v.boolean()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const integrationEventsSchema = v.object({
  taskCreated: v.boolean(),
  taskStatusChanged: v.boolean(),
  taskPriorityChanged: v.boolean(),
  taskTitleChanged: v.boolean(),
  taskDescriptionChanged: v.boolean(),
  taskCommentCreated: v.boolean(),
});

export const genericWebhookIntegrationSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  webhookConfigured: v.boolean(),
  maskedWebhookUrl: v.nullable(v.string()),
  secretConfigured: v.boolean(),
  maskedSecret: v.nullable(v.string()),
  events: v.object({
    ...integrationEventsSchema.entries,
    taskDeleted: v.boolean(),
    taskMoved: v.boolean(),
    taskDueDateChanged: v.boolean(),
    taskAssigneeChanged: v.boolean(),
    taskUnassigned: v.boolean(),
    dueDateReminder: v.boolean(),
  }),
  dueDateReminderLeadTimeMinutes: v.number(),
  isActive: v.nullable(v.boolean()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const telegramIntegrationSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  chatId: v.string(),
  threadId: v.nullable(v.number()),
  chatLabel: v.nullable(v.string()),
  botTokenConfigured: v.boolean(),
  maskedBotToken: v.string(),
  events: integrationEventsSchema,
  isActive: v.nullable(v.boolean()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const commentSchema = v.object({
  id: v.string(),
  taskId: v.string(),
  userId: v.string(),
  content: v.string(),
  createdAt: v.date(),
  updatedAt: v.date(),
  user: v.optional(
    v.object({
      name: v.string(),
      image: v.nullable(v.string()),
    }),
  ),
});

export const configSchema = v.object({
  appName: v.string(),
  appDescription: v.string(),
  disableRegistration: v.nullable(v.boolean()),
  disablePasswordRegistration: v.nullable(v.boolean()),
  disableEmailOtpSignIn: v.nullable(v.boolean()),
  isDemoMode: v.boolean(),
  hasSmtp: v.boolean(),
  hasGithubSignIn: v.nullable(v.boolean()),
  hasGoogleSignIn: v.nullable(v.boolean()),
  hasCustomOAuth: v.nullable(v.boolean()),
  hasGuestAccess: v.nullable(v.boolean()),
  disableLoginForm: v.nullable(v.boolean()),
  customOAuthAutoLogin: v.nullable(v.boolean()),
  customOAuthLogoutUrl: v.nullable(v.string()),
  workspaceCreationPolicy: v.picklist(["superadmin", "admin", "any_user"]),
});

/* -------------------------------------------------------------------------
 * CRM
 * ---------------------------------------------------------------------- */

export const crmStageOutcomeSchema = v.picklist(["open", "won", "lost"]);

export const crmDealStatusSchema = v.picklist(["open", "won", "lost"]);

export const crmActivityTypeSchema = v.picklist([
  "call",
  "meeting",
  "email",
  "note",
  "task",
  "whatsapp",
]);

export const crmFieldEntitySchema = v.picklist(["deal", "contact", "company"]);

export const crmFieldTypeSchema = v.picklist([
  "text",
  "number",
  "date",
  "select",
  "multiselect",
  "checkbox",
  "url",
  "currency",
]);

export const crmPipelineSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  slug: v.string(),
  description: v.nullable(v.string()),
  isDefault: v.boolean(),
  position: v.number(),
  archivedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmStageSchema = v.object({
  id: v.string(),
  pipelineId: v.string(),
  name: v.string(),
  slug: v.string(),
  position: v.number(),
  probability: v.number(),
  outcome: crmStageOutcomeSchema,
  color: v.nullable(v.string()),
  rottingDays: v.nullable(v.number()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmLostReasonSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  position: v.number(),
  isActive: v.boolean(),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmSourceChannelSchema = v.picklist([
  "referral",
  "paid",
  "organic",
  "outbound",
  "event",
  "other",
]);

export const crmSourceSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  channel: crmSourceChannelSchema,
  position: v.number(),
  isActive: v.boolean(),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmSegmentSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  position: v.number(),
  isActive: v.boolean(),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmPersonTypeSchema = v.picklist(["pj", "pf"]);

export const crmCompanyStatusSchema = v.picklist([
  "prospect",
  "active",
  "inactive",
  "churned",
]);

export const crmCompanySizeSchema = v.picklist([
  "mei",
  "me",
  "epp",
  "medium",
  "large",
]);

export const crmPaymentTermSchema = v.picklist([
  "cash",
  "15",
  "30",
  "30_60",
  "custom",
]);

export const crmPaymentMethodSchema = v.picklist([
  "pix",
  "boleto",
  "card",
  "transfer",
]);

export const crmCompanySchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  legalName: v.nullable(v.string()),
  taxId: v.nullable(v.string()),
  domain: v.nullable(v.string()),
  website: v.nullable(v.string()),
  phone: v.nullable(v.string()),
  personType: crmPersonTypeSchema,
  stateRegistration: v.nullable(v.string()),
  municipalRegistration: v.nullable(v.string()),
  segmentId: v.nullable(v.string()),
  sourceId: v.nullable(v.string()),
  companySize: v.nullable(crmCompanySizeSchema),
  status: crmCompanyStatusSchema,
  clientSince: v.nullable(v.date()),
  churnedAt: v.nullable(v.date()),
  churnReason: v.nullable(v.string()),
  billingEmail: v.nullable(v.string()),
  paymentTerms: v.nullable(crmPaymentTermSchema),
  billingDay: v.nullable(v.number()),
  paymentMethod: v.nullable(crmPaymentMethodSchema),
  employeeCount: v.nullable(v.number()),
  ownerUserId: v.nullable(v.string()),
  addressLine: v.nullable(v.string()),
  addressNumber: v.nullable(v.string()),
  addressComplement: v.nullable(v.string()),
  district: v.nullable(v.string()),
  city: v.nullable(v.string()),
  state: v.nullable(v.string()),
  postalCode: v.nullable(v.string()),
  country: v.nullable(v.string()),
  description: v.nullable(v.string()),
  archivedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmContactSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  companyId: v.nullable(v.string()),
  firstName: v.string(),
  lastName: v.nullable(v.string()),
  email: v.nullable(v.string()),
  phone: v.nullable(v.string()),
  mobile: v.nullable(v.string()),
  jobTitle: v.nullable(v.string()),
  department: v.nullable(v.string()),
  linkedinUrl: v.nullable(v.string()),
  ownerUserId: v.nullable(v.string()),
  isPrimary: v.boolean(),
  emailOptOut: v.boolean(),
  consentSource: v.nullable(v.string()),
  consentAt: v.nullable(v.date()),
  notes: v.nullable(v.string()),
  archivedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmBillingTypeSchema = v.picklist([
  "one_time",
  "monthly",
  "quarterly",
  "yearly",
]);

export const crmServiceCategorySchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  position: v.number(),
  isActive: v.boolean(),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmServiceSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  categoryId: v.nullable(v.string()),
  name: v.string(),
  code: v.nullable(v.string()),
  description: v.nullable(v.string()),
  defaultPriceCents: v.number(),
  currency: v.string(),
  billingType: crmBillingTypeSchema,
  position: v.number(),
  archivedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmDealServiceSchema = v.object({
  id: v.string(),
  dealId: v.string(),
  serviceId: v.nullable(v.string()),
  name: v.string(),
  billingType: crmBillingTypeSchema,
  quantity: v.number(),
  unitPriceCents: v.number(),
  discountPercent: v.number(),
  totalCents: v.number(),
  position: v.number(),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmContractStatusSchema = v.picklist([
  "active",
  "paused",
  "cancelled",
  "finished",
]);

export const crmContractSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  number: v.number(),
  companyId: v.string(),
  dealId: v.nullable(v.string()),
  title: v.string(),
  startsAt: v.date(),
  endsAt: v.nullable(v.date()),
  monthlyValueCents: v.number(),
  currency: v.string(),
  billingDay: v.nullable(v.number()),
  status: crmContractStatusSchema,
  endedAt: v.nullable(v.date()),
  cancelReasonId: v.nullable(v.string()),
  cancelNote: v.nullable(v.string()),
  ownerUserId: v.nullable(v.string()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmDealSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  number: v.number(),
  pipelineId: v.string(),
  stageId: v.string(),
  title: v.string(),
  companyId: v.nullable(v.string()),
  primaryContactId: v.nullable(v.string()),
  ownerUserId: v.nullable(v.string()),
  createdByUserId: v.nullable(v.string()),
  valueCents: v.number(),
  valueIsManual: v.boolean(),
  currency: v.string(),
  probability: v.nullable(v.number()),
  expectedCloseDate: v.nullable(v.date()),
  status: crmDealStatusSchema,
  wonAt: v.nullable(v.date()),
  lostAt: v.nullable(v.date()),
  lostReasonId: v.nullable(v.string()),
  lostReasonNote: v.nullable(v.string()),
  sourceId: v.nullable(v.string()),
  position: v.number(),
  stageEnteredAt: v.date(),
  lastActivityAt: v.nullable(v.date()),
  nextActivityAt: v.nullable(v.date()),
  archivedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmActivitySchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  type: crmActivityTypeSchema,
  subject: v.string(),
  body: v.nullable(v.string()),
  dealId: v.nullable(v.string()),
  contactId: v.nullable(v.string()),
  companyId: v.nullable(v.string()),
  ownerUserId: v.nullable(v.string()),
  dueAt: v.nullable(v.date()),
  completedAt: v.nullable(v.date()),
  durationMinutes: v.nullable(v.number()),
  outcome: v.nullable(v.string()),
  calendarEventId: v.nullable(v.string()),
  createdByUserId: v.nullable(v.string()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmStageHistorySchema = v.object({
  id: v.string(),
  dealId: v.string(),
  fromStageId: v.nullable(v.string()),
  toStageId: v.nullable(v.string()),
  changedByUserId: v.nullable(v.string()),
  enteredAt: v.date(),
  exitedAt: v.nullable(v.date()),
  durationSeconds: v.nullable(v.number()),
});

export const crmFieldDefinitionSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  entity: crmFieldEntitySchema,
  key: v.string(),
  label: v.string(),
  type: crmFieldTypeSchema,
  options: v.nullable(v.array(v.string())),
  isRequired: v.boolean(),
  showOnCard: v.boolean(),
  position: v.number(),
  createdAt: v.date(),
  updatedAt: v.date(),
});

export const crmTagSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  name: v.string(),
  color: v.string(),
  createdAt: v.date(),
  updatedAt: v.date(),
});
