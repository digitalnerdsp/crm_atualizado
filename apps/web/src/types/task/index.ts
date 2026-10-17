type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

type TaskExternalLink = {
  id: string;
  taskId: string;
  integrationId: string;
  resourceType: string;
  externalId: string;
  url: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

export type TaskAssignee = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  avatarColor?: string | null;
};

export type TaskRecurrence = {
  id: string;
  sourceTaskId: string | null;
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays: number[];
  startsAt: string;
  endsAt: string | null;
  maxOccurrences: number | null;
  generatedOccurrences: number;
  nextOccurrenceAt: string | null;
  timezone: string;
  isActive: boolean;
};

export type TaskCustomField = {
  id: string;
  taskId: string;
  name: string;
  type: "text" | "number" | "date" | "url" | "checkbox";
  value: string;
  showOnCard: boolean;
  position: number;
};

export type TaskChecklistItem = {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  isRequired: boolean;
  requiredBeforeColumnId: string | null;
  requiredBeforeColumnName?: string | null;
  requiredBeforeColumnSlug?: string | null;
  position: number;
  completedByUserId: string | null;
  completedAt: string | null;
};

type Task = {
  id: string;
  title: string;
  number: number | null;
  description: string | null;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  recurrenceId?: string | null;
  recurrence?: TaskRecurrence | null;
  position: number | null;
  createdAt: string;
  updatedAt?: string;
  userId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage?: string | null;
  assignees?: TaskAssignee[];
  projectId: string;
  columnId?: string | null;
  // Projects here are per discipline, so the client belongs to the task.
  crmCompanyId?: string | null;
  crmDealId?: string | null;
  crmCompanyName?: string | null;
  labels?: TaskLabel[];
  externalLinks?: TaskExternalLink[];
  customFields?: TaskCustomField[];
  checklistItems?: TaskChecklistItem[];
  checklistProgress?: { completed: number; total: number };
};

export default Task;
