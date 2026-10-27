import { createId } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userTable = pgTable("user", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  avatarColor: text("avatar_color"),
  avatarObjectKey: text("avatar_object_key"),
  locale: text("locale"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  isAnonymous: boolean("is_anonymous").default(false),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { mode: "date" }),
});

export const sessionTable = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const accountTable = pgTable(
  "account",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verificationTable = pgTable(
  "verification",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const systemSettingTable = pgTable("system_setting", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  valueType: text("value_type").notNull(),
  category: text("category").notNull(),
  isSecret: boolean("is_secret").default(false).notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => userTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const globalRoleTable = pgTable("global_role", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  role: text("role").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  isSystem: boolean("is_system").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const workspaceTable = pgTable("workspace", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
  archivedAt: timestamp("archived_at", { mode: "date" }),
});

export const workspaceUserTable = pgTable(
  "workspace_member",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { mode: "date" }).notNull(),
  },
  (table) => [
    index("workspace_member_workspaceId_idx").on(table.workspaceId),
    index("workspace_member_userId_idx").on(table.userId),
  ],
);

export const teamTable = pgTable(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("team_workspaceId_idx").on(table.workspaceId)],
);

export const teamMemberTable = pgTable(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teamTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("teamMember_teamId_idx").on(table.teamId),
    index("teamMember_userId_idx").on(table.userId),
  ],
);

export const invitationTable = pgTable(
  "invitation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    teamId: text("team_id"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_workspaceId_idx").on(table.workspaceId),
    index("invitation_email_idx").on(table.email),
    index("invitation_inviterId_idx").on(table.inviterId),
  ],
);

export const workspaceRoleTable = pgTable(
  "workspace_role",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workspace_role_workspaceId_idx").on(table.workspaceId),
    index("workspace_role_role_idx").on(table.role),
  ],
);

export const projectTable = pgTable(
  "project",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    slug: text("slug").notNull(),
    icon: text("icon").default("Layout"),
    name: text("name").notNull(),
    description: text("description"),
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    isPublic: boolean("is_public").default(false),
    archivedAt: timestamp("archived_at", { mode: "date" }),
  },
  (table) => [
    index("project_ownerUserId_idx").on(table.ownerUserId),
    unique("project_workspace_id_id_unique").on(table.workspaceId, table.id),
  ],
);

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    entityName: text("entity_name"),
    workspaceId: text("workspace_id").references(() => workspaceTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_actorUserId_idx").on(table.actorUserId),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_workspaceId_idx").on(table.workspaceId),
    index("audit_log_projectId_idx").on(table.projectId),
    index("audit_log_createdAt_idx").on(table.createdAt),
  ],
);

export const columnTable = pgTable(
  "column",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull().default(0),
    icon: text("icon"),
    color: text("color"),
    isFinal: boolean("is_final").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("column_projectId_idx").on(table.projectId)],
);

export const workflowRuleTable = pgTable(
  "workflow_rule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationType: text("integration_type").notNull(),
    eventType: text("event_type").notNull(),
    columnId: text("column_id")
      .notNull()
      .references(() => columnTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workflow_rule_projectId_idx").on(table.projectId),
    index("workflow_rule_columnId_idx").on(table.columnId),
  ],
);

export const taskRecurrenceTable = pgTable(
  "task_recurrence",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceTaskId: text("source_task_id"),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    frequency: text("frequency").notNull(),
    interval: integer("interval").default(1).notNull(),
    weekdays: jsonb("weekdays").$type<number[]>().default([]).notNull(),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { mode: "date" }),
    maxOccurrences: integer("max_occurrences"),
    generatedOccurrences: integer("generated_occurrences").default(0).notNull(),
    nextOccurrenceAt: timestamp("next_occurrence_at", { mode: "date" }),
    timezone: text("timezone").default("UTC").notNull(),
    initialStatus: text("initial_status").default("to-do").notNull(),
    startOffsetMinutes: integer("start_offset_minutes"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_recurrence_projectId_idx").on(table.projectId),
    index("task_recurrence_nextOccurrenceAt_idx").on(table.nextOccurrenceAt),
    uniqueIndex("task_recurrence_sourceTaskId_unique").on(table.sourceTaskId),
  ],
);

export const taskTable = pgTable(
  "task",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer("position").default(0),
    number: integer("number").default(1),
    userId: text("assignee_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("to-do"),
    columnId: text("column_id").references(() => columnTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    priority: text("priority").default("low"),
    startDate: timestamp("start_date", { mode: "date" }),
    dueDate: timestamp("due_date", { mode: "date" }),
    recurrenceId: text("recurrence_id").references(
      () => taskRecurrenceTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    // Projects here are per discipline ("Design" holds the design work of every
    // client), so the unit of work that belongs to a client is the task, not
    // the project. The deal is optional: support, rework and retainer work is
    // client work with no opportunity in the funnel.
    crmCompanyId: text("crm_company_id"),
    crmDealId: text("crm_deal_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_projectId_idx").on(table.projectId),
    index("task_dueDate_idx").on(table.dueDate),
    index("task_calendar_start_idx").on(
      sql`COALESCE(${table.startDate}, ${table.dueDate})`,
    ),
    index("task_calendar_end_idx").on(
      sql`COALESCE(${table.dueDate}, ${table.startDate})`,
    ),
    index("task_assigneeId_idx").on(table.userId),
    index("task_columnId_idx").on(table.columnId),
    index("task_recurrenceId_idx").on(table.recurrenceId),
    index("task_crmCompanyId_idx").on(table.crmCompanyId),
    index("task_crmDealId_idx").on(table.crmDealId),
    // Table-level foreign keys because `crm_company` and `crm_deal` are defined
    // further down this file; a column-level `references()` would be a forward
    // reference.
    foreignKey({
      columns: [table.crmCompanyId],
      foreignColumns: [crmCompanyTable.id],
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.crmDealId],
      foreignColumns: [crmDealTable.id],
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    unique("task_project_number_unique").on(table.projectId, table.number),
    unique("task_recurrence_occurrence_unique").on(
      table.recurrenceId,
      table.dueDate,
    ),
  ],
);

export type TaskCustomFieldType =
  | "text"
  | "number"
  | "date"
  | "url"
  | "checkbox";

export const taskCustomFieldTable = pgTable(
  "task_custom_field",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    type: text("type").$type<TaskCustomFieldType>().default("text").notNull(),
    value: text("value").default("").notNull(),
    showOnCard: boolean("show_on_card").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_custom_field_taskId_idx").on(table.taskId),
    unique("task_custom_field_task_name_unique").on(table.taskId, table.name),
  ],
);

export const taskChecklistItemTable = pgTable(
  "task_checklist_item",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title").notNull(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    requiredBeforeColumnId: text("required_before_column_id").references(
      () => columnTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    position: integer("position").default(0).notNull(),
    completedByUserId: text("completed_by_user_id").references(
      () => userTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_checklist_item_taskId_idx").on(table.taskId),
    index("task_checklist_item_requiredColumn_idx").on(
      table.requiredBeforeColumnId,
    ),
  ],
);

export type TaskTemplateCustomField = {
  name: string;
  type: TaskCustomFieldType;
  value: string;
  showOnCard: boolean;
};

export type TaskTemplateChecklistItem = {
  title: string;
  isRequired: boolean;
  requiredBeforeColumnSlug?: string;
};

export type TaskTemplateSubtask = {
  title: string;
  description: string;
  priority: string;
};

export const taskTemplateTable = pgTable(
  "task_template",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    priority: text("priority").default("no-priority").notNull(),
    initialStatus: text("initial_status").default("to-do").notNull(),
    customFields: jsonb("custom_fields")
      .$type<TaskTemplateCustomField[]>()
      .default([])
      .notNull(),
    checklistItems: jsonb("checklist_items")
      .$type<TaskTemplateChecklistItem[]>()
      .default([])
      .notNull(),
    subtasks: jsonb("subtasks")
      .$type<TaskTemplateSubtask[]>()
      .default([])
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_template_workspaceId_idx").on(table.workspaceId),
    unique("task_template_workspace_name_unique").on(
      table.workspaceId,
      table.name,
    ),
  ],
);

export const taskAssigneeTable = pgTable(
  "task_assignee",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    assignedByUserId: text("assigned_by_user_id").references(
      () => userTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    assignedAt: timestamp("assigned_at", { mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("task_assignee_taskId_idx").on(table.taskId),
    index("task_assignee_userId_idx").on(table.userId),
    index("task_assignee_assignedAt_idx").on(table.assignedAt),
    unique("task_assignee_task_user_unique").on(table.taskId, table.userId),
  ],
);

export const taskReminderSentTable = pgTable(
  "task_reminder_sent",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    reminderType: text("reminder_type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("task_reminder_sent_taskId_idx").on(table.taskId),
    unique("task_reminder_sent_task_type_unique").on(
      table.taskId,
      table.reminderType,
    ),
  ],
);

export const calendarEventTable = pgTable(
  "calendar_event",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id").references(() => projectTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    startAt: timestamp("start_at", { mode: "date" }).notNull(),
    endAt: timestamp("end_at", { mode: "date" }).notNull(),
    allDay: boolean("all_day").default(false).notNull(),
    location: text("location"),
    meetingType: text("meeting_type").default("online").notNull(),
    visibility: text("visibility").default("workspace").notNull(),
    status: text("status").default("confirmed").notNull(),
    recurrenceFrequency: text("recurrence_frequency").default("none").notNull(),
    recurrenceUntil: timestamp("recurrence_until", { mode: "date" }),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("calendar_event_workspaceId_idx").on(table.workspaceId),
    index("calendar_event_workspace_startAt_idx").on(
      table.workspaceId,
      table.startAt,
    ),
    index("calendar_event_workspace_endAt_idx").on(
      table.workspaceId,
      table.endAt,
    ),
    index("calendar_event_projectId_idx").on(table.projectId),
    index("calendar_event_taskId_idx").on(table.taskId),
    index("calendar_event_startAt_idx").on(table.startAt),
    index("calendar_event_endAt_idx").on(table.endAt),
    index("calendar_event_status_idx").on(table.status),
    index("calendar_event_meetingType_idx").on(table.meetingType),
    index("calendar_event_recurrenceFrequency_idx").on(
      table.recurrenceFrequency,
    ),
    index("calendar_event_recurrenceUntil_idx").on(table.recurrenceUntil),
  ],
);

export const calendarEventAttendeeTable = pgTable(
  "calendar_event_attendee",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => calendarEventTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    responseStatus: text("response_status").default("needs_action").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("calendar_event_attendee_eventId_idx").on(table.eventId),
    index("calendar_event_attendee_userId_idx").on(table.userId),
    unique("calendar_event_attendee_event_user_unique").on(
      table.eventId,
      table.userId,
    ),
  ],
);

export const calendarEventReminderTable = pgTable(
  "calendar_event_reminder",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => calendarEventTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    channel: text("channel").notNull(),
    remindAt: timestamp("remind_at", { mode: "date" }).notNull(),
    minutesBefore: integer("minutes_before").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    sentAt: timestamp("sent_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("calendar_event_reminder_eventId_idx").on(table.eventId),
    index("calendar_event_reminder_userId_idx").on(table.userId),
    index("calendar_event_reminder_remindAt_idx").on(table.remindAt),
  ],
);

export const timeEntryTable = pgTable(
  "time_entry",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    description: text("description"),
    startTime: timestamp("start_time", { mode: "date" }).notNull(),
    endTime: timestamp("end_time", { mode: "date" }),
    duration: integer("duration").default(0),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("time_entry_taskId_idx").on(table.taskId),
    index("time_entry_userId_idx").on(table.userId),
  ],
);

export const activityTable = pgTable(
  "activity",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    content: text("content"),
    eventData: jsonb("event_data"),
    externalUserName: text("external_user_name"),
    externalUserAvatar: text("external_user_avatar"),
    externalSource: text("external_source"),
    externalUrl: text("external_url"),
  },
  (table) => [
    index("activity_task_id_idx").on(table.taskId),
    index("activity_userId_idx").on(table.userId),
    unique("activity_task_external_source_external_url_unique").on(
      table.taskId,
      table.externalSource,
      table.externalUrl,
    ),
  ],
);

export const assetTable = pgTable(
  "asset",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    activityId: text("activity_id").references(() => activityTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    kind: text("kind").notNull().default("image"),
    surface: text("surface").notNull().default("description"),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("asset_workspaceId_idx").on(table.workspaceId),
    index("asset_projectId_idx").on(table.projectId),
    index("asset_taskId_idx").on(table.taskId),
    index("asset_activityId_idx").on(table.activityId),
    index("asset_createdBy_idx").on(table.createdBy),
  ],
);

export const labelTable = pgTable(
  "label",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    taskId: text("task_id").references(() => taskTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    workspaceId: text("workspace_id").references(() => workspaceTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("label_task_id_idx").on(table.taskId),
    index("label_workspace_id_idx").on(table.workspaceId),
    unique("label_task_name_unique").on(table.taskId, table.name),
    uniqueIndex("label_workspace_name_unique")
      .on(table.workspaceId, table.name)
      .where(sql`${table.taskId} is null`),
  ],
);

export const notificationTable = pgTable(
  "notification",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title"),
    content: text("content"),
    type: text("type").notNull().default("info"),
    eventData: jsonb("event_data"),
    isRead: boolean("is_read").default(false),
    resourceId: text("resource_id"),
    resourceType: text("resource_type"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("notification_userId_idx").on(table.userId)],
);

export const userNotificationPreferenceTable = pgTable(
  "user_notification_preference",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    ntfyEnabled: boolean("ntfy_enabled").default(false).notNull(),
    ntfyServerUrl: text("ntfy_server_url"),
    ntfyTopic: text("ntfy_topic"),
    ntfyToken: text("ntfy_token"),
    gotifyEnabled: boolean("gotify_enabled").default(false).notNull(),
    gotifyServerUrl: text("gotify_server_url"),
    gotifyToken: text("gotify_token"),
    webhookEnabled: boolean("webhook_enabled").default(false).notNull(),
    webhookUrl: text("webhook_url"),
    webhookSecret: text("webhook_secret"),
    taskAssignmentEnabled: boolean("task_assignment_enabled")
      .default(true)
      .notNull(),
    taskCommentEnabled: boolean("task_comment_enabled").default(true).notNull(),
    taskStatusChangeEnabled: boolean("task_status_change_enabled")
      .default(true)
      .notNull(),
    dueDateReminderEnabled: boolean("due_date_reminder_enabled")
      .default(true)
      .notNull(),
    dueDateReminderLeadTimeMinutes: integer(
      "due_date_reminder_lead_time_minutes",
    )
      .default(1440)
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const userNotificationWorkspaceRuleTable = pgTable(
  "user_notification_workspace_rule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isActive: boolean("is_active").default(true).notNull(),
    emailEnabled: boolean("email_enabled").default(false).notNull(),
    ntfyEnabled: boolean("ntfy_enabled").default(false).notNull(),
    gotifyEnabled: boolean("gotify_enabled").default(false).notNull(),
    webhookEnabled: boolean("webhook_enabled").default(false).notNull(),
    projectMode: text("project_mode").default("all").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("user_notification_workspace_rule_userId_idx").on(table.userId),
    index("user_notification_workspace_rule_workspaceId_idx").on(
      table.workspaceId,
    ),
    unique("user_notification_workspace_rule_user_workspace_unique").on(
      table.userId,
      table.workspaceId,
    ),
    unique("user_notification_workspace_rule_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
  ],
);

export const userNotificationWorkspaceProjectTable = pgTable(
  "user_notification_workspace_project",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceRuleId: text("workspace_rule_id").notNull(),
    projectId: text("project_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.workspaceRuleId],
      foreignColumns: [
        userNotificationWorkspaceRuleTable.workspaceId,
        userNotificationWorkspaceRuleTable.id,
      ],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projectTable.workspaceId, projectTable.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("user_notification_workspace_project_ruleId_idx").on(
      table.workspaceRuleId,
    ),
    index("user_notification_workspace_project_projectId_idx").on(
      table.projectId,
    ),
    index("user_notification_workspace_project_workspaceId_projectId_idx").on(
      table.workspaceId,
      table.projectId,
    ),
    index("unwp_workspaceId_workspaceRuleId_idx").on(
      table.workspaceId,
      table.workspaceRuleId,
    ),
    unique("user_notification_workspace_project_rule_project_unique").on(
      table.workspaceRuleId,
      table.projectId,
    ),
  ],
);

export const integrationTable = pgTable(
  "integration",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projectTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").notNull(),
    config: text("config").notNull(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("integration_projectId_idx").on(table.projectId),
    index("integration_type_idx").on(table.type),
    unique("integration_project_type_unique").on(table.projectId, table.type),
  ],
);

export const externalLinkTable = pgTable(
  "external_link",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrationTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    resourceType: text("resource_type").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("external_link_taskId_idx").on(table.taskId),
    index("external_link_integrationId_idx").on(table.integrationId),
    index("external_link_externalId_idx").on(table.externalId),
    index("external_link_resourceType_idx").on(table.resourceType),
  ],
);

export const commentTable = pgTable(
  "comment",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("comment_task_idx").on(table.taskId),
    index("comment_user_idx").on(table.userId),
  ],
);

export const taskRelationTable = pgTable(
  "task_relation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    sourceTaskId: text("source_task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    targetTaskId: text("target_task_id")
      .notNull()
      .references(() => taskTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    relationType: text("relation_type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("task_relation_source_idx").on(table.sourceTaskId),
    index("task_relation_target_idx").on(table.targetTaskId),
  ],
);

export const apikeyTable = pgTable(
  "apikey",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    configId: text("config_id").default("default").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
    }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { mode: "date" }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_configId_idx").on(table.configId),
    index("apikey_key_idx").on(table.key),
    index("apikey_referenceId_idx").on(table.referenceId),
    index("apikey_userId_idx").on(table.userId),
  ],
);

export const deviceCodeTable = pgTable(
  "device_code",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    userId: text("user_id").references(() => userTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at", { mode: "date" }),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (table) => [
    uniqueIndex("device_code_device_code_uidx").on(table.deviceCode),
    uniqueIndex("device_code_user_code_uidx").on(table.userCode),
    index("device_code_user_id_idx").on(table.userId),
  ],
);

/* -------------------------------------------------------------------------
 * CRM — funil comercial
 *
 * Entidades próprias, não reuso de project/column/task: um negócio precisa de
 * valor, moeda, probabilidade, previsão de fechamento, ganho/perda e histórico
 * de tempo por etapa, e uma etapa precisa de probabilidade e semântica de
 * ganho/perda. Ver plans/crm/001-modelo-de-dados.md.
 * ---------------------------------------------------------------------- */

export const crmPipelineTable = pgTable(
  "crm_pipeline",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_pipeline_workspaceId_idx").on(table.workspaceId),
    unique("crm_pipeline_workspace_slug_unique").on(
      table.workspaceId,
      table.slug,
    ),
  ],
);

export type CrmStageOutcome = "open" | "won" | "lost";

export const crmStageTable = pgTable(
  "crm_stage",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => crmPipelineTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").default(0).notNull(),
    // 0..100, alimenta o forecast ponderado
    probability: integer("probability").default(0).notNull(),
    outcome: text("outcome").$type<CrmStageOutcome>().default("open").notNull(),
    color: text("color"),
    // null = negócios nesta etapa nunca são marcados como parados
    rottingDays: integer("rotting_days"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_stage_pipelineId_idx").on(table.pipelineId),
    unique("crm_stage_pipeline_slug_unique").on(table.pipelineId, table.slug),
  ],
);

export const crmLostReasonTable = pgTable(
  "crm_lost_reason",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    position: integer("position").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_lost_reason_workspaceId_idx").on(table.workspaceId),
    unique("crm_lost_reason_workspace_name_unique").on(
      table.workspaceId,
      table.name,
    ),
  ],
);

/** Listas fechadas do cadastro de cliente. Os arrays em tempo de execução
 * ficam em `crm/shared/client-profile.ts`. */
export type CrmPersonType = "pj" | "pf";
export type CrmSourceChannel =
  | "referral"
  | "paid"
  | "organic"
  | "outbound"
  | "event"
  | "other";
export type CrmCompanyStatus = "prospect" | "active" | "inactive" | "churned";
export type CrmCompanySize = "mei" | "me" | "epp" | "medium" | "large";
export type CrmPaymentTerm = "cash" | "15" | "30" | "30_60" | "custom";
export type CrmPaymentMethod = "pix" | "boleto" | "card" | "transfer";

/**
 * Origem e segmento como listas editáveis, não texto livre. Duas tabelas quase
 * idênticas em vez de uma genérica `crm_taxonomy(kind, name)`: a genérica
 * economiza uma tabela e custa a chave estrangeira — com tabelas próprias,
 * apagar um segmento em uso é o banco que impede.
 */
export const crmSourceTable = pgTable(
  "crm_source",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    // agrupa origens no relatório de aquisição
    channel: text("channel")
      .$type<CrmSourceChannel>()
      .default("other")
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_source_workspaceId_idx").on(table.workspaceId),
    unique("crm_source_workspace_name_unique").on(
      table.workspaceId,
      table.name,
    ),
  ],
);

export const crmSegmentTable = pgTable(
  "crm_segment",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_segment_workspaceId_idx").on(table.workspaceId),
    unique("crm_segment_workspace_name_unique").on(
      table.workspaceId,
      table.name,
    ),
  ],
);

export const crmCompanyTable = pgTable(
  "crm_company",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    // CNPJ/CPF sem máscara
    taxId: text("tax_id"),
    domain: text("domain"),
    website: text("website"),
    phone: text("phone"),
    // pj/pf decide qual documento validar e quais campos a tela mostra
    personType: text("person_type")
      .$type<CrmPersonType>()
      .default("pj")
      .notNull(),
    stateRegistration: text("state_registration"),
    municipalRegistration: text("municipal_registration"),
    segmentId: text("segment_id").references(() => crmSegmentTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // como o cliente chegou à empresa, uma vez só
    sourceId: text("source_id").references(() => crmSourceTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    companySize: text("company_size").$type<CrmCompanySize>(),
    /* O campo que separa carteira de lista de contatos: sem ele não existe
     * "quantos clientes ativos eu tenho", nem taxa de retenção. */
    status: text("status")
      .$type<CrmCompanyStatus>()
      .default("prospect")
      .notNull(),
    clientSince: timestamp("client_since", { mode: "date" }),
    churnedAt: timestamp("churned_at", { mode: "date" }),
    churnReason: text("churn_reason"),
    // nota fiscal não vai para o contato comercial
    billingEmail: text("billing_email"),
    paymentTerms: text("payment_terms").$type<CrmPaymentTerm>(),
    billingDay: integer("billing_day"),
    paymentMethod: text("payment_method").$type<CrmPaymentMethod>(),
    employeeCount: integer("employee_count"),
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    addressLine: text("address_line"),
    addressNumber: text("address_number"),
    addressComplement: text("address_complement"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    country: text("country").default("BR"),
    description: text("description"),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_company_workspaceId_idx").on(table.workspaceId),
    index("crm_company_ownerUserId_idx").on(table.ownerUserId),
    index("crm_company_workspaceId_domain_idx").on(
      table.workspaceId,
      table.domain,
    ),
    index("crm_company_segmentId_idx").on(table.segmentId),
    index("crm_company_sourceId_idx").on(table.sourceId),
    index("crm_company_workspaceId_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    uniqueIndex("crm_company_workspace_taxId_unique")
      .on(table.workspaceId, table.taxId)
      .where(sql`${table.taxId} is not null`),
  ],
);

export const crmContactTable = pgTable(
  "crm_contact",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    companyId: text("company_id").references(() => crmCompanyTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    mobile: text("mobile"),
    jobTitle: text("job_title"),
    department: text("department"),
    linkedinUrl: text("linkedin_url"),
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    // LGPD
    emailOptOut: boolean("email_opt_out").default(false).notNull(),
    consentSource: text("consent_source"),
    consentAt: timestamp("consent_at", { mode: "date" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_contact_workspaceId_idx").on(table.workspaceId),
    index("crm_contact_companyId_idx").on(table.companyId),
    index("crm_contact_ownerUserId_idx").on(table.ownerUserId),
    index("crm_contact_workspaceId_email_idx").on(
      table.workspaceId,
      table.email,
    ),
  ],
);

/** Como o serviço é cobrado. É o que permite ao contrato (plano 011) saber,
 * sozinho, o que entra na receita recorrente quando um negócio é ganho. */
export type CrmBillingType = "one_time" | "monthly" | "quarterly" | "yearly";

export const crmServiceCategoryTable = pgTable(
  "crm_service_category",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_service_category_workspaceId_idx").on(table.workspaceId),
    unique("crm_service_category_workspace_name_unique").on(
      table.workspaceId,
      table.name,
    ),
  ],
);

/**
 * Serviço é arquivado, nunca excluído: apagar um serviço vendido apagaria a
 * possibilidade de relatar o que já foi vendido.
 */
export const crmServiceTable = pgTable(
  "crm_service",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    categoryId: text("category_id").references(
      () => crmServiceCategoryTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    name: text("name").notNull(),
    // código curto para proposta e planilha
    code: text("code"),
    description: text("description"),
    defaultPriceCents: bigint("default_price_cents", { mode: "number" })
      .default(0)
      .notNull(),
    currency: text("currency").default("BRL").notNull(),
    billingType: text("billing_type")
      .$type<CrmBillingType>()
      .default("one_time")
      .notNull(),
    position: integer("position").default(0).notNull(),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_service_workspaceId_idx").on(table.workspaceId),
    index("crm_service_categoryId_idx").on(table.categoryId),
    uniqueIndex("crm_service_workspace_code_unique")
      .on(table.workspaceId, table.code)
      .where(sql`${table.code} is not null`),
  ],
);

export type CrmDealStatus = "open" | "won" | "lost";

export type CrmPaymentForm =
  | "cash"
  | "pix"
  | "boleto"
  | "card"
  | "installments"
  | "custom";

export const crmDealTable = pgTable(
  "crm_deal",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // sequencial legível por workspace, como task.number é por projeto
    number: integer("number").notNull(),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => crmPipelineTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    stageId: text("stage_id")
      .notNull()
      .references(() => crmStageTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    title: text("title").notNull(),
    companyId: text("company_id").references(() => crmCompanyTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    primaryContactId: text("primary_contact_id").references(
      () => crmContactTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // dinheiro em centavos: integer estoura em R$ 21 mi, float não é exato
    valueCents: bigint("value_cents", { mode: "number" }).default(0).notNull(),
    /* false: valueCents é a soma dos itens (crm_deal_service), recalculada
     * em toda escrita de item. true: travado à mão — os itens seguem contando
     * no relatório por serviço, mas não mandam mais no total. */
    valueIsManual: boolean("value_is_manual").default(false).notNull(),
    currency: text("currency").default("BRL").notNull(),
    // null = herda a probabilidade da etapa
    probability: integer("probability"),
    expectedCloseDate: timestamp("expected_close_date", { mode: "date" }),
    status: text("status").$type<CrmDealStatus>().default("open").notNull(),
    wonAt: timestamp("won_at", { mode: "date" }),
    lostAt: timestamp("lost_at", { mode: "date" }),
    lostReasonId: text("lost_reason_id").references(
      () => crmLostReasonTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    lostReasonNote: text("lost_reason_note"),
    // de onde veio ESTA oportunidade: o cliente veio de Meta Ads uma vez, o
    // terceiro projeto dele veio de indicação
    sourceId: text("source_id").references(() => crmSourceTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    position: integer("position").default(0).notNull(),
    // Observação da venda (dados do site, da hospedagem etc.).
    notes: text("notes"),
    /* Só informação de como foi pago: não gera cobrança por parcela. "custom"
     * usa o texto livre de paymentFormNote. */
    paymentForm: text("payment_form").$type<CrmPaymentForm>(),
    paymentFormNote: text("payment_form_note"),
    // base do cálculo de negócio parado (rotting)
    stageEnteredAt: timestamp("stage_entered_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    // desnormalizações mantidas pelo controller de atividade: sem elas o board
    // faz uma subquery por card
    lastActivityAt: timestamp("last_activity_at", { mode: "date" }),
    nextActivityAt: timestamp("next_activity_at", { mode: "date" }),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_deal_workspaceId_idx").on(table.workspaceId),
    index("crm_deal_pipelineId_idx").on(table.pipelineId),
    index("crm_deal_stageId_idx").on(table.stageId),
    index("crm_deal_ownerUserId_idx").on(table.ownerUserId),
    index("crm_deal_companyId_idx").on(table.companyId),
    index("crm_deal_stageId_position_idx").on(table.stageId, table.position),
    index("crm_deal_expectedCloseDate_idx").on(table.expectedCloseDate),
    index("crm_deal_status_idx").on(table.status),
    index("crm_deal_sourceId_idx").on(table.sourceId),
    unique("crm_deal_workspace_number_unique").on(
      table.workspaceId,
      table.number,
    ),
  ],
);

/**
 * O que foi vendido num negócio.
 *
 * `name`, `billingType` e `unitPriceCents` são COPIADOS do catálogo no
 * momento da venda, não lidos dele: o preço de tabela sobe, o serviço é
 * renomeado — e nada disso pode reescrever o que foi vendido no ano passado.
 * Relatório que muda sozinho quando alguém edita o catálogo é relatório em
 * que ninguém confia. `serviceId` fica só para agrupar, e o item sobrevive
 * ao serviço.
 */
export const crmDealServiceTable = pgTable(
  "crm_deal_service",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => crmDealTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serviceId: text("service_id").references(() => crmServiceTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    name: text("name").notNull(),
    billingType: text("billing_type").$type<CrmBillingType>().notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    discountPercent: integer("discount_percent").default(0).notNull(),
    // gravado, não derivado na leitura: é somado em todo relatório, e
    // recalcular em cada query repetiria a regra em cada lugar que a lê
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    // Observação do item (ex.: domínio do site, plano de hospedagem).
    notes: text("notes"),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_deal_service_dealId_idx").on(table.dealId),
    index("crm_deal_service_serviceId_idx").on(table.serviceId),
  ],
);

export const crmDealContactTable = pgTable(
  "crm_deal_contact",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => crmDealTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: text("contact_id")
      .notNull()
      .references(() => crmContactTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    // 'decisor' | 'influenciador' | 'tecnico' | 'financeiro'
    role: text("role"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("crm_deal_contact_dealId_idx").on(table.dealId),
    index("crm_deal_contact_contactId_idx").on(table.contactId),
    unique("crm_deal_contact_deal_contact_unique").on(
      table.dealId,
      table.contactId,
    ),
  ],
);

/**
 * Escrito em toda transição de etapa. É a única fonte de conversão por etapa e
 * tempo de ciclo — não dá para reconstruir depois a partir de log.
 */
/* ------------------------------------------------------------------------
 * Contratos e receita recorrente (plano 011).
 *
 * Um negócio ganho é um evento; uma assinatura é um estado — ativa hoje,
 * pausada em março, maior em junho, cancelada amanhã. Somar serviços mensais
 * de negócios ganhos daria um MRR que só cresce. O contrato guarda o estado e
 * `crm_contract_event` guarda a história, pelo mesmo motivo de
 * `crm_stage_history`: o estado atual não carrega a história, e a história
 * não se reconstrói depois.
 * ---------------------------------------------------------------------- */

export type CrmContractStatus = "active" | "paused" | "cancelled" | "finished";

export type CrmContractEventType =
  | "created"
  | "paused"
  | "resumed"
  | "upgraded"
  | "downgraded"
  | "cancelled"
  | "finished";

export const crmContractTable = pgTable(
  "crm_contract",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    number: integer("number").notNull(),
    /* restrict, não cascade: excluir o cliente apagaria o histórico de
     * receita dele. Cliente com contrato se arquiva. */
    companyId: text("company_id")
      .notNull()
      .references(() => crmCompanyTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    // o negócio que originou o contrato
    dealId: text("deal_id").references(() => crmDealTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    // null = prazo indeterminado
    endsAt: timestamp("ends_at", { mode: "date" }),
    // equivalente mensal: trimestral ÷ 3, anual ÷ 12
    monthlyValueCents: bigint("monthly_value_cents", { mode: "number" })
      .default(0)
      .notNull(),
    currency: text("currency").default("BRL").notNull(),
    billingDay: integer("billing_day"),
    status: text("status")
      .$type<CrmContractStatus>()
      .default("active")
      .notNull(),
    endedAt: timestamp("ended_at", { mode: "date" }),
    // o motivo de um cliente cancelar é da mesma natureza do motivo de um
    // negócio ser perdido; uma segunda lista só faria a equipe manter as duas
    cancelReasonId: text("cancel_reason_id").references(
      () => crmLostReasonTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    cancelNote: text("cancel_note"),
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_contract_workspaceId_idx").on(table.workspaceId),
    index("crm_contract_companyId_idx").on(table.companyId),
    index("crm_contract_dealId_idx").on(table.dealId),
    index("crm_contract_workspaceId_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    unique("crm_contract_workspace_number_unique").on(
      table.workspaceId,
      table.number,
    ),
  ],
);

/** O que está incluso no contrato. Cópia, como os itens do negócio. */
export const crmContractServiceTable = pgTable(
  "crm_contract_service",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => crmContractTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serviceId: text("service_id").references(() => crmServiceTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    name: text("name").notNull(),
    billingType: text("billing_type").$type<CrmBillingType>().notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    discountPercent: integer("discount_percent").default(0).notNull(),
    // total por ciclo de cobrança (mês, trimestre ou ano)
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_contract_service_contractId_idx").on(table.contractId),
    index("crm_contract_service_serviceId_idx").on(table.serviceId),
  ],
);

/**
 * Toda mudança de valor ou de situação, escrita na mesma transação.
 *
 * `from`/`to` guardam o MRR EFETIVO — quanto o contrato contava na receita
 * recorrente antes e depois —, não o valor de tabela: pausado e cancelado
 * contam zero. Com isso o MRR de qualquer data é a soma do `to` do último
 * evento de cada contrato até ela, e o movimento do mês se decompõe em novo,
 * expansão, contração e churn somando `to - from` por tipo.
 */
export const crmContractEventTable = pgTable(
  "crm_contract_event",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => crmContractTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").$type<CrmContractEventType>().notNull(),
    fromMonthlyValueCents: bigint("from_monthly_value_cents", {
      mode: "number",
    }).notNull(),
    toMonthlyValueCents: bigint("to_monthly_value_cents", {
      mode: "number",
    }).notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull(),
    changedByUserId: text("changed_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("crm_contract_event_contractId_idx").on(table.contractId),
    index("crm_contract_event_occurredAt_idx").on(table.occurredAt),
    index("crm_contract_event_type_idx").on(table.type),
  ],
);

export const crmStageHistoryTable = pgTable(
  "crm_stage_history",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => crmDealTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    fromStageId: text("from_stage_id").references(() => crmStageTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    toStageId: text("to_stage_id").references(() => crmStageTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    changedByUserId: text("changed_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    enteredAt: timestamp("entered_at", { mode: "date" }).notNull(),
    // null = etapa atual
    exitedAt: timestamp("exited_at", { mode: "date" }),
    durationSeconds: integer("duration_seconds"),
  },
  (table) => [
    index("crm_stage_history_dealId_idx").on(table.dealId),
    index("crm_stage_history_toStageId_idx").on(table.toStageId),
    index("crm_stage_history_enteredAt_idx").on(table.enteredAt),
  ],
);

export type CrmActivityType =
  | "call"
  | "meeting"
  | "email"
  | "note"
  | "task"
  | "whatsapp";

export const crmActivityTable = pgTable(
  "crm_activity",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: text("type").$type<CrmActivityType>().notNull(),
    subject: text("subject").notNull(),
    body: text("body"),
    dealId: text("deal_id").references(() => crmDealTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    contactId: text("contact_id").references(() => crmContactTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    companyId: text("company_id").references(() => crmCompanyTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    dueAt: timestamp("due_at", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    durationMinutes: integer("duration_minutes"),
    // 'connected' | 'no_answer' | 'rescheduled' | ...
    outcome: text("outcome"),
    // reunião espelhada na agenda que a equipe já usa
    calendarEventId: text("calendar_event_id").references(
      () => calendarEventTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    createdByUserId: text("created_by_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_activity_workspaceId_idx").on(table.workspaceId),
    index("crm_activity_dealId_idx").on(table.dealId),
    index("crm_activity_contactId_idx").on(table.contactId),
    index("crm_activity_companyId_idx").on(table.companyId),
    index("crm_activity_ownerUserId_idx").on(table.ownerUserId),
    // o que faz "minhas atividades pendentes" ser barato
    index("crm_activity_owner_due_pending_idx")
      .on(table.ownerUserId, table.dueAt)
      .where(sql`${table.completedAt} is null`),
  ],
);

export type CrmFieldEntity = "deal" | "contact" | "company";

export type CrmFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "url"
  | "currency";

/**
 * Definição no workspace, não no registro: "Origem do lead" precisa ser o mesmo
 * campo em todos os negócios para ser filtrável e agrupável — diferente de
 * task_custom_field, que é ad hoc por tarefa.
 */
export const crmFieldDefinitionTable = pgTable(
  "crm_field_definition",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    entity: text("entity").$type<CrmFieldEntity>().notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").$type<CrmFieldType>().default("text").notNull(),
    options: jsonb("options").$type<string[]>(),
    isRequired: boolean("is_required").default(false).notNull(),
    showOnCard: boolean("show_on_card").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_field_definition_workspaceId_entity_idx").on(
      table.workspaceId,
      table.entity,
    ),
    unique("crm_field_definition_workspace_entity_key_unique").on(
      table.workspaceId,
      table.entity,
      table.key,
    ),
  ],
);

/**
 * `entityId` é uma referência polimórfica sem FK de propósito: uma FK por
 * entidade exigiria três tabelas de valor. A limpeza é feita no delete de cada
 * entidade.
 */
export const crmFieldValueTable = pgTable(
  "crm_field_value",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    definitionId: text("definition_id")
      .notNull()
      .references(() => crmFieldDefinitionTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    entityId: text("entity_id").notNull(),
    value: text("value").default("").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_field_value_entityId_idx").on(table.entityId),
    unique("crm_field_value_definition_entity_unique").on(
      table.definitionId,
      table.entityId,
    ),
  ],
);

export const crmTagTable = pgTable(
  "crm_tag",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("crm_tag_workspaceId_idx").on(table.workspaceId),
    unique("crm_tag_workspace_name_unique").on(table.workspaceId, table.name),
  ],
);

export const crmEntityTagTable = pgTable(
  "crm_entity_tag",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    tagId: text("tag_id")
      .notNull()
      .references(() => crmTagTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    entity: text("entity").$type<CrmFieldEntity>().notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("crm_entity_tag_entity_entityId_idx").on(
      table.entity,
      table.entityId,
    ),
    unique("crm_entity_tag_tag_entity_unique").on(
      table.tagId,
      table.entity,
      table.entityId,
    ),
  ],
);

// Auth-schema compatible aliases in schema.ts
export const user = userTable;
export const session = sessionTable;
export const account = accountTable;
export const verification = verificationTable;
export const workspace = workspaceTable;
export const team = teamTable;
export const teamMember = teamMemberTable;
export const workspace_member = workspaceUserTable;
export const invitation = invitationTable;
export const organizationRole = workspaceRoleTable;
export const apikey = apikeyTable;
export const deviceCode = deviceCodeTable;

// Auth-schema compatible relation exports in schema.ts
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  teamMembers: many(teamMember),
  workspace_members: many(workspace_member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const workspaceRelations = relations(workspace, ({ many }) => ({
  teams: many(team),
  workspace_members: many(workspace_member),
  invitations: many(invitation),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [team.workspaceId],
    references: [workspace.id],
  }),
  teamMembers: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
}));

export const workspace_memberRelations = relations(
  workspace_member,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [workspace_member.workspaceId],
      references: [workspace.id],
    }),
    user: one(user, {
      fields: [workspace_member.userId],
      references: [user.id],
    }),
  }),
);

export const invitationRelations = relations(invitation, ({ one }) => ({
  workspace: one(workspace, {
    fields: [invitation.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const organizationRoleRelations = relations(
  organizationRole,
  ({ one }) => ({
    workspace: one(workspace, {
      fields: [organizationRole.workspaceId],
      references: [workspace.id],
    }),
  }),
);

// Finance phase 1. Money is stored in integer cents, dates are civil dates.
export const financeCategoryTable = pgTable(
  "finance_category",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    direction: text("direction").$type<"payable" | "receivable">().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_category_workspace_idx").on(t.workspaceId),
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check(
      "finance_category_direction_check",
      sql`${t.direction} in ('payable', 'receivable')`,
    ),
  ],
);

export const financePartyTable = pgTable(
  "finance_party",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    laborType: text("labor_type").$type<"pj" | "freelance" | "clt" | null>(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_party_workspace_idx").on(t.workspaceId),
    check(
      "finance_party_labor_check",
      sql`${t.laborType} is null or ${t.laborType} in ('pj', 'freelance', 'clt')`,
    ),
  ],
);

export const financeCommissionRuleTable = pgTable(
  "finance_commission_rule",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serviceId: text("service_id")
      .notNull()
      .references(() => crmServiceTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    effectiveDate: date("effective_date").notNull(),
    // Percentual "na venda": incide sobre a primeira cobrança do contrato (ou
    // sobre o valor total, na venda de pagamento único).
    rateBps: integer("rate_bps").notNull(),
    // A base é sempre o valor recebido; a coluna fica só pelo histórico das
    // regras antigas em "faturado".
    basis: text("basis").$type<"billed" | "received">().notNull(),
    // Percentual das cobranças seguintes, válido por recurringMonths meses
    // depois da primeira. recurringMonths nulo = sem limite.
    recurringRateBps: integer("recurring_rate_bps").default(0).notNull(),
    recurringMonths: integer("recurring_months"),
    sequence: integer("sequence").notNull(),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("finance_commission_rule_version_unique").on(
      t.serviceId,
      t.sequence,
    ),
    index("finance_commission_rule_workspace_idx").on(t.workspaceId),
    check(
      "finance_commission_rate_check",
      sql`${t.rateBps} between 0 and 10000`,
    ),
    check(
      "finance_commission_basis_check",
      sql`${t.basis} in ('billed','received')`,
    ),
  ],
);

export const financeResultSettingsTable = pgTable(
  "finance_result_settings",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    presumptionBps: integer("presumption_bps"),
    version: integer("version").default(1).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    check(
      "finance_presumption_rate_check",
      sql`${t.presumptionBps} is null or ${t.presumptionBps} between 0 and 10000`,
    ),
  ],
);

export const financeEntryTable = pgTable(
  "finance_entry",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    description: text("description").notNull(),
    direction: text("direction").$type<"payable" | "receivable">().notNull(),
    kind: text("kind")
      .$type<"operating" | "opening" | "transfer">()
      .default("operating")
      .notNull(),
    resultClass: text("result_class")
      .$type<
        | "unclassified"
        | "direct"
        | "operating"
        | "tax"
        | "financial"
        | "commission"
      >()
      .default("unclassified")
      .notNull(),
    commissionRateBps: integer("commission_rate_bps").default(0).notNull(),
    commissionBasis: text("commission_basis")
      .$type<"billed" | "received">()
      .default("received")
      .notNull(),
    commissionRuleId: text("commission_rule_id").references(
      () => financeCommissionRuleTable.id,
      { onDelete: "restrict", onUpdate: "cascade" },
    ),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    competenceDate: date("competence_date").notNull(),
    dueDate: date("due_date").notNull(),
    categoryId: text("category_id").references(() => financeCategoryTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    partyId: text("party_id").references(() => financePartyTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    partyName: text("party_name").notNull(),
    laborType: text("labor_type").$type<"pj" | "freelance" | "clt" | null>(),
    companyId: text("company_id").references(() => crmCompanyTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    serviceId: text("service_id").references(() => crmServiceTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    sellerId: text("seller_id").references(() => userTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    paymentMethod: text("payment_method").notNull(),
    notes: text("notes").default("").notNull(),
    contractId: text("contract_id").references(() => crmContractTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    contractLineKey: text("contract_line_key"),
    cycleStart: date("cycle_start"),
    cycleEnd: date("cycle_end"),
    billingRevisionId: text("billing_revision_id").references(
      () => financeContractRevisionTable.id,
      { onDelete: "restrict", onUpdate: "cascade" },
    ),
    serviceNameSnapshot: text("service_name_snapshot"),
    sellerNameSnapshot: text("seller_name_snapshot"),
    seriesId: text("series_id").notNull(),
    requestSignature: text("request_signature").notNull(),
    installment: integer("installment").default(1).notNull(),
    installmentCount: integer("installment_count").default(1).notNull(),
    cancelledAt: timestamp("cancelled_at", { mode: "date" }),
    cancelReason: text("cancel_reason"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_entry_workspace_due_idx").on(t.workspaceId, t.dueDate),
    uniqueIndex("finance_entry_contract_cycle_unique").on(
      t.contractId,
      t.contractLineKey,
      t.cycleStart,
    ),

    index("finance_entry_workspace_competence_idx").on(
      t.workspaceId,
      t.competenceDate,
    ),
    index("finance_entry_category_idx").on(t.categoryId),
    index("finance_entry_party_idx").on(t.partyId),
    index("finance_entry_company_idx").on(t.companyId),
    index("finance_entry_service_idx").on(t.serviceId),
    index("finance_entry_seller_idx").on(t.sellerId),
    uniqueIndex("finance_entry_series_unique").on(
      t.workspaceId,
      t.seriesId,
      t.installment,
    ),
    check(
      "finance_entry_result_class_check",
      sql`${t.resultClass} in ('unclassified','direct','operating','tax','financial','commission')`,
    ),
    check(
      "finance_entry_commission_rate_check",
      sql`${t.commissionRateBps} between 0 and 10000`,
    ),
    check(
      "finance_entry_commission_basis_check",
      sql`${t.commissionBasis} in ('billed','received')`,
    ),
    check(
      "finance_entry_amount_check",
      sql`${t.amountCents} > 0 and ${t.amountCents} <= 1000000000000`,
    ),
    check(
      "finance_entry_direction_check",
      sql`${t.direction} in ('payable','receivable')`,
    ),
    check(
      "finance_entry_kind_check",
      sql`${t.kind} in ('operating','opening','transfer')`,
    ),
  ],
);

export const financeSettlementTable = pgTable(
  "finance_settlement",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    entryId: text("entry_id")
      .notNull()
      .references(() => financeEntryTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    requestId: text("request_id").notNull(),
    date: date("date").notNull(),
    principalCents: bigint("principal_cents", { mode: "number" }).notNull(),
    discountCents: bigint("discount_cents", { mode: "number" })
      .default(0)
      .notNull(),
    interestCents: bigint("interest_cents", { mode: "number" })
      .default(0)
      .notNull(),
    fineCents: bigint("fine_cents", { mode: "number" }).default(0).notNull(),
    notes: text("notes").default("").notNull(),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    reversedAt: timestamp("reversed_at", { mode: "date" }),
    reverseReason: text("reverse_reason"),
    reversedBy: text("reversed_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_settlement_entry_idx").on(t.entryId),
    index("finance_settlement_date_idx").on(t.date),
    uniqueIndex("finance_settlement_request_unique").on(t.entryId, t.requestId),
    check(
      "finance_settlement_amount_check",
      sql`${t.principalCents} > 0 and ${t.discountCents} >= 0 and ${t.discountCents} <= ${t.principalCents} and ${t.interestCents} >= 0 and ${t.fineCents} >= 0`,
    ),
  ],
);

export const financeAttachmentTable = pgTable(
  "finance_attachment",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    entryId: text("entry_id")
      .notNull()
      .references(() => financeEntryTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    // Comprovante da baixa específica; nulo quando é anexo do lançamento.
    settlementId: text("settlement_id").references(
      () => financeSettlementTable.id,
      { onDelete: "set null", onUpdate: "cascade" },
    ),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: text("uploaded_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_attachment_entry_idx").on(t.entryId),
    index("finance_attachment_workspace_idx").on(t.workspaceId),
  ],
);

export type FinanceBillingItem = {
  key: string;
  serviceId: string | null;
  name: string;
  billingType: "monthly" | "quarterly" | "yearly";
  amountCents: number;
  anchor: string;
};
export const financeContractBillingTable = pgTable(
  "finance_contract_billing",
  {
    contractId: text("contract_id")
      .primaryKey()
      .references(() => crmContractTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    enabled: boolean("enabled").default(false).notNull(),
    startsOn: date("starts_on").notNull(),
    horizonMonths: integer("horizon_months").default(3).notNull(),
    prorateFinal: boolean("prorate_final").default(false).notNull(),
    categoryId: text("category_id").references(() => financeCategoryTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    version: integer("version").default(1).notNull(),
    lastGeneratedAt: timestamp("last_generated_at", { mode: "date" }),
    lastWarning: text("last_warning"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_contract_billing_workspace_idx").on(t.workspaceId),
    check(
      "finance_contract_horizon_check",
      sql`${t.horizonMonths} between 1 and 24`,
    ),
  ],
);

export const financeContractRevisionTable = pgTable(
  "finance_contract_revision",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => crmContractTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    effectiveDate: date("effective_date").notNull(),
    prorateFinal: boolean("prorate_final").default(false).notNull(),
    sequence: integer("sequence").notNull(),
    status: text("status").$type<CrmContractStatus>().notNull(),
    endsOn: date("ends_on"),
    billingDay: integer("billing_day"),
    items: jsonb("items").$type<FinanceBillingItem[]>().notNull(),
    sellerId: text("seller_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    sellerName: text("seller_name"),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("finance_contract_revision_sequence_unique").on(
      t.contractId,
      t.sequence,
    ),
    index("finance_contract_revision_date_idx").on(
      t.contractId,
      t.effectiveDate,
    ),
  ],
);

export const financeCommissionPayoutTable = pgTable(
  "finance_commission_payout",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceEntryId: text("source_entry_id")
      .notNull()
      .references(() => financeEntryTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    payableEntryId: text("payable_entry_id")
      .notNull()
      .references(() => financeEntryTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("finance_commission_payout_entry_unique").on(t.payableEntryId),
    uniqueIndex("finance_commission_payout_request_unique").on(
      t.workspaceId,
      t.requestId,
    ),
    index("finance_commission_payout_source_idx").on(t.sourceEntryId),
  ],
);

export const financeTaxProfileTable = pgTable(
  "finance_tax_profile",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("finance_tax_profile_workspace_idx").on(t.workspaceId)],
);

export const financeTaxProfileRevisionTable = pgTable(
  "finance_tax_profile_revision",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => financeTaxProfileTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    notes: text("notes").default("").notNull(),
    items: jsonb("items")
      .$type<import("../finance/taxes/model").TaxItem[]>()
      .notNull(),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("finance_tax_profile_revision_unique").on(
      t.profileId,
      t.sequence,
    ),
  ],
);

export const financeTaxSimulationTable = pgTable(
  "finance_tax_simulation",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    profileId: text("profile_id")
      .notNull()
      .references(() => financeTaxProfileTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => financeTaxProfileRevisionTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    requestId: text("request_id").notNull(),
    requestSignature: text("request_signature").notNull(),
    title: text("title").notNull(),
    date: date("date").notNull(),
    serviceId: text("service_id").references(() => crmServiceTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    sellerId: text("seller_id").references(() => userTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    snapshot: jsonb("snapshot")
      .$type<{
        profileName: string;
        profileVersion: number;
        notes: string;
        serviceName: string | null;
        sellerName: string | null;
        input: import("../finance/taxes/model").SaleInput;
        result: import("../finance/taxes/model").SaleResult;
        commissionSource: string;
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("finance_tax_simulation_request_unique").on(
      t.workspaceId,
      t.requestId,
    ),
    index("finance_tax_simulation_date_idx").on(t.workspaceId, t.date),
    index("finance_tax_simulation_profile_idx").on(t.profileId),
    index("finance_tax_simulation_revision_idx").on(t.revisionId),
    index("finance_tax_simulation_service_idx").on(t.serviceId),
    index("finance_tax_simulation_seller_idx").on(t.sellerId),
  ],
);

export type HostingMode = "unknown" | "own" | "third_party" | "none";
export type HostingSnapshot = {
  mode: HostingMode;
  provider: string;
  domain: string;
  renewsOn: string | null;
  leadDays: number;
  contactId: string | null;
  emailAllowed: boolean;
  whatsappAllowed: boolean;
  notes: string;
  services: { id: string; name: string; fromContract?: boolean }[];
};
export const crmHostingTable = pgTable(
  "crm_hosting",
  {
    companyId: text("company_id")
      .primaryKey()
      .references(() => crmCompanyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    mode: text("mode").$type<HostingMode>().default("unknown").notNull(),
    provider: text("provider").default("").notNull(),
    domain: text("domain").default("").notNull(),
    renewsOn: date("renews_on"),
    leadDays: integer("lead_days").default(30).notNull(),
    contactId: text("contact_id").references(() => crmContactTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    emailAllowed: boolean("email_allowed").default(false).notNull(),
    whatsappAllowed: boolean("whatsapp_allowed").default(false).notNull(),
    notes: text("notes").default("").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("crm_hosting_mode_idx").on(t.mode),
    check(
      "crm_hosting_mode_check",
      sql`${t.mode} in ('unknown','own','third_party','none')`,
    ),
    check("crm_hosting_lead_days_check", sql`${t.leadDays} between 0 and 365`),
  ],
);
export const crmCompanyServiceFlagTable = pgTable(
  "crm_company_service_flag",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => crmCompanyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serviceId: text("service_id")
      .notNull()
      .references(() => crmServiceTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("crm_company_service_flag_unique").on(t.companyId, t.serviceId),
    index("crm_company_service_flag_service_idx").on(t.serviceId),
  ],
);
export const crmHostingRevisionTable = pgTable(
  "crm_hosting_revision",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => crmCompanyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sequence: integer("sequence").notNull(),
    snapshot: jsonb("snapshot").$type<HostingSnapshot>().notNull(),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("crm_hosting_revision_unique").on(t.companyId, t.sequence),
    index("crm_hosting_revision_date_idx").on(t.createdAt),
  ],
);
export const crmHostingNoticeTable = pgTable(
  "crm_hosting_notice",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    companyId: text("company_id")
      .notNull()
      .references(() => crmCompanyTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    requestId: text("request_id").notNull(),
    signature: text("signature").notNull(),
    channel: text("channel").$type<"email" | "whatsapp">().notNull(),
    status: text("status")
      .$type<
        | "sending"
        | "accepted"
        | "failed"
        | "uncertain"
        | "prepared"
        | "confirmed"
      >()
      .notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    error: text("error"),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    confirmedBy: text("confirmed_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    confirmedAt: timestamp("confirmed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("crm_hosting_notice_request_unique").on(
      t.workspaceId,
      t.requestId,
    ),
    index("crm_hosting_notice_company_idx").on(t.companyId),
    index("crm_hosting_notice_date_idx").on(t.workspaceId, t.createdAt),
    check(
      "crm_hosting_notice_channel_check",
      sql`${t.channel} in ('email','whatsapp')`,
    ),
    check(
      "crm_hosting_notice_status_check",
      sql`${t.status} in ('sending','accepted','failed','uncertain','prepared','confirmed')`,
    ),
  ],
);

export type HostingDigestItemSnapshot = {
  companyName: string;
  provider: string;
  domain: string;
  ownerUserId: string | null;
  ownerName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};
export type HostingDigestDelivery = {
  userId: string;
  email: string;
  name: string;
  companyIds: string[];
  status: "pending" | "accepted" | "failed";
  error: string | null;
};
// Aviso interno de renovação de hospedagem de terceiros. Nunca é enviado ao
// cliente: os destinatários são usuários do workspace escolhidos manualmente.
export const crmHostingDigestSettingTable = pgTable(
  "crm_hosting_digest_setting",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    enabled: boolean("enabled").default(false).notNull(),
    marks: jsonb("marks")
      .$type<number[]>()
      .default(sql`'[30,15]'::jsonb`)
      .notNull(),
    includeOwner: boolean("include_owner").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
);
export const crmHostingDigestRecipientTable = pgTable(
  "crm_hosting_digest_recipient",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("crm_hosting_digest_recipient_unique").on(
      t.workspaceId,
      t.userId,
    ),
  ],
);
export const crmHostingDigestRunTable = pgTable(
  "crm_hosting_digest_run",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    status: text("status")
      .$type<"pending" | "sent" | "failed">()
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    deliveries: jsonb("deliveries")
      .$type<HostingDigestDelivery[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("crm_hosting_digest_run_workspace_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
    index("crm_hosting_digest_run_due_idx").on(t.status, t.nextAttemptAt),
    check(
      "crm_hosting_digest_run_status_check",
      sql`${t.status} in ('pending','sent','failed')`,
    ),
  ],
);
export const crmHostingDigestItemTable = pgTable(
  "crm_hosting_digest_item",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    runId: text("run_id")
      .notNull()
      .references(() => crmHostingDigestRunTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    companyId: text("company_id")
      .notNull()
      .references(() => crmCompanyTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    renewsOn: date("renews_on").notNull(),
    markDays: integer("mark_days").notNull(),
    // false: a marca já tinha passado quando foi registrada e outra, mais
    // próxima, foi listada no lugar. Fica gravada para não reaparecer.
    listed: boolean("listed").default(true).notNull(),
    snapshot: jsonb("snapshot").$type<HostingDigestItemSnapshot>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("crm_hosting_digest_item_unique").on(
      t.companyId,
      t.renewsOn,
      t.markDays,
    ),
    index("crm_hosting_digest_item_run_idx").on(t.runId),
    index("crm_hosting_digest_item_workspace_idx").on(t.workspaceId),
    check(
      "crm_hosting_digest_item_mark_check",
      sql`${t.markDays} between 1 and 365`,
    ),
  ],
);

/** Valores de cor aceitos em um tema, por modo (claro/escuro). */
export type ThemeColors = Partial<Record<string, string>>;
export type ThemeLayout = "default" | "qerza";
export type ThemeTokens = {
  /** Ausente em temas antigos = layout padrão. */
  layout?: ThemeLayout;
  radius: string | null;
  fontSans: string | null;
  fontHeading: string | null;
  light: ThemeColors;
  dark: ThemeColors;
};
export const workspaceThemeTable = pgTable(
  "workspace_theme",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tokens: jsonb("tokens").$type<ThemeTokens>().notNull(),
    // Sem tema ativo = aparência padrão do sistema.
    isActive: boolean("is_active").notNull().default(false),
    createdBy: text("created_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("workspace_theme_workspace_idx").on(t.workspaceId),
    uniqueIndex("workspace_theme_name_unique").on(t.workspaceId, t.name),
    // No máximo um tema ativo por workspace.
    uniqueIndex("workspace_theme_active_unique")
      .on(t.workspaceId)
      .where(sql`${t.isActive}`),
  ],
);

export const portfolioCaseTable = pgTable(
  "portfolio_case",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceKind: text("source_kind")
      .$type<"receivable" | "contract" | "hosting">()
      .notNull(),
    sourceId: text("source_id").notNull(),
    sourceDate: date("source_date").notNull(),
    companyId: text("company_id").references(() => crmCompanyTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    status: text("status")
      .$type<
        "open" | "waiting" | "promised" | "negotiating" | "done" | "snoozed"
      >()
      .default("open")
      .notNull(),
    ownerUserId: text("owner_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    nextOn: date("next_on"),
    nextAction: text("next_action").default("").notNull(),
    promiseOn: date("promise_on"),
    promiseCents: bigint("promise_cents", { mode: "number" }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("portfolio_case_source_unique").on(
      t.workspaceId,
      t.sourceKind,
      t.sourceId,
      t.sourceDate,
    ),
    index("portfolio_case_workspace_idx").on(t.workspaceId),
  ],
);

export const portfolioEventTable = pgTable(
  "portfolio_event",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => portfolioCaseTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    note: text("note").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("portfolio_event_case_idx").on(t.caseId)],
);

export const portfolioNoticeTable = pgTable(
  "portfolio_notice",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    caseId: text("case_id")
      .notNull()
      .references(() => portfolioCaseTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    requestId: text("request_id").notNull(),
    signature: text("signature").notNull(),
    channel: text("channel").$type<"email" | "whatsapp">().notNull(),
    status: text("status")
      .$type<
        | "sending"
        | "accepted"
        | "failed"
        | "uncertain"
        | "prepared"
        | "confirmed"
      >()
      .notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    error: text("error"),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    confirmedBy: text("confirmed_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("portfolio_notice_request_unique").on(
      t.workspaceId,
      t.requestId,
    ),
    index("portfolio_notice_case_idx").on(t.caseId),
  ],
);

export const financeSiteTable = pgTable(
  "finance_site",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    companyId: text("company_id")
      .notNull()
      .references(() => crmCompanyTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    contractId: text("contract_id").references(() => crmContractTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    name: text("name").notNull(),
    status: text("status")
      .$type<"active" | "completed">()
      .default("active")
      .notNull(),
    includeScenario: boolean("include_scenario").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_site_workspace_idx").on(t.workspaceId),
    index("finance_site_company_idx").on(t.companyId),
  ],
);

export const financeSiteTaskTable = pgTable(
  "finance_site_task",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => taskTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    siteId: text("site_id")
      .notNull()
      .references(() => financeSiteTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    estimateMinutes: integer("estimate_minutes").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("finance_site_task_site_idx").on(t.siteId),
    check("finance_site_task_estimate_check", sql`${t.estimateMinutes} >= 0`),
  ],
);

export const financeLaborRateTable = pgTable(
  "finance_labor_rate",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    effectiveOn: date("effective_on").notNull(),
    hourlyCents: bigint("hourly_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("finance_labor_rate_date_unique").on(
      t.workspaceId,
      t.userId,
      t.effectiveOn,
    ),
    check("finance_labor_rate_positive", sql`${t.hourlyCents} >= 0`),
  ],
);

export const financeSiteWorkerTable = pgTable(
  "finance_site_worker",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => financeSiteTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    mode: text("mode")
      .$type<"internal" | "hourly" | "fixed" | "ledger">()
      .notNull(),
    fixedCents: bigint("fixed_cents", { mode: "number" }).default(0).notNull(),
    chargedOn: date("charged_on").notNull(),
    sourceEntryId: text("source_entry_id").references(
      () => financeEntryTable.id,
      { onDelete: "restrict", onUpdate: "cascade" },
    ),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("finance_site_worker_unique").on(t.siteId, t.userId),
    uniqueIndex("finance_site_worker_source_unique").on(t.sourceEntryId),
  ],
);

export const financeSiteEntryTable = pgTable(
  "finance_site_entry",
  {
    entryId: text("entry_id")
      .primaryKey()
      .references(() => financeEntryTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    siteId: text("site_id")
      .notNull()
      .references(() => financeSiteTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("finance_site_entry_site_idx").on(t.siteId)],
);

export const portfolioDraftTable = pgTable(
  "portfolio_draft",
  {
    id: text("id")
      .$defaultFn(() => createId())
      .primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaceTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    companyId: text("company_id")
      .notNull()
      .references(() => crmCompanyTable.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    contractId: text("contract_id").references(() => crmContractTable.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    proposedCents: bigint("proposed_cents", { mode: "number" }).notNull(),
    status: text("status")
      .$type<"draft" | "submitted" | "approved" | "rejected">()
      .default("draft")
      .notNull(),
    decision: text("decision").default("").notNull(),
    approvedBy: text("approved_by").references(() => userTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("portfolio_draft_workspace_idx").on(t.workspaceId)],
);
