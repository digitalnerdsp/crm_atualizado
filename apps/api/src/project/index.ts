import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { recordAuditLog } from "../admin/audit-log";
import { projectSchema } from "../schemas";
import { instantiateTemplate } from "../task-template";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import archiveProjectCtrl from "./controllers/archive-project";
import createProjectCtrl from "./controllers/create-project";
import deleteProjectCtrl from "./controllers/delete-project";
import getProjectCtrl from "./controllers/get-project";
import getProjectsCtrl from "./controllers/get-projects";
import unarchiveProjectCtrl from "./controllers/unarchive-project";
import updateProjectCtrl from "./controllers/update-project";

const project = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listProjects",
      tags: ["Projects"],
      description: "Get all projects in a workspace",
      responses: {
        200: {
          description: "List of projects with statistics",
          content: {
            "application/json": { schema: resolver(v.array(projectSchema)) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        includeArchived: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ project: ["read"] }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { includeArchived } = c.req.valid("query");
      const projects = await getProjectsCtrl(
        workspaceId,
        includeArchived === "true",
      );
      return c.json(projects);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createProject",
      tags: ["Projects"],
      description: "Create a new project in a workspace",
      responses: {
        200: {
          description: "Project created successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        name: v.string(),
        workspaceId: v.string(),
        icon: v.string(),
        slug: v.string(),
        templateIds: v.optional(v.array(v.string()), []),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ project: ["create"] }),
    async (c) => {
      const { name, icon, slug, templateIds } = c.req.valid("json");
      const workspaceId = c.get("workspaceId");
      if (
        templateIds.length > 0 &&
        !(await hasWorkspacePermission(c, { template: ["use"] }))
      ) {
        throw new HTTPException(403, {
          message: "Insufficient template permissions",
        });
      }
      const newProject = await createProjectCtrl(workspaceId, name, icon, slug);
      if (newProject) {
        for (const templateId of templateIds) {
          await instantiateTemplate({
            templateId,
            projectId: newProject.id,
            currentUserId: c.get("userId"),
          });
        }
      }
      if (newProject) {
        await recordAuditLog(c, {
          action: "project.created",
          entityType: "project",
          entityId: newProject.id,
          entityName: newProject.name,
          workspaceId: newProject.workspaceId,
          projectId: newProject.id,
          summary: `Criou o projeto ${newProject.name}.`,
          after: newProject,
        });
      }
      return c.json(newProject);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getProject",
      tags: ["Projects"],
      description: "Get a specific project by ID",
      responses: {
        200: {
          description: "Project details",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["read"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const projectData = await getProjectCtrl(id, workspaceId);
      return c.json(projectData);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateProject",
      tags: ["Projects"],
      description: "Update an existing project",
      responses: {
        200: {
          description: "Project updated successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        icon: v.string(),
        slug: v.string(),
        description: v.string(),
        isPublic: v.boolean(),
      }),
    ),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name, icon, slug, description, isPublic } = c.req.valid("json");
      const workspaceId = c.get("workspaceId");
      const currentProject = await getProjectCtrl(id, workspaceId);
      const updatedProject = await updateProjectCtrl(
        id,
        name,
        icon,
        slug,
        description,
        isPublic,
        workspaceId,
      );
      await recordAuditLog(c, {
        action: "project.updated",
        entityType: "project",
        entityId: updatedProject.id,
        entityName: updatedProject.name,
        workspaceId: updatedProject.workspaceId,
        projectId: updatedProject.id,
        summary: `Alterou o projeto ${updatedProject.name}.`,
        before: currentProject,
        after: updatedProject,
      });
      return c.json(updatedProject);
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteProject",
      tags: ["Projects"],
      description: "Delete a project by ID",
      responses: {
        200: {
          description: "Project deleted successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const deletedProject = await deleteProjectCtrl(id, workspaceId);
      await recordAuditLog(c, {
        action: "project.deleted",
        entityType: "project",
        entityId: deletedProject.id,
        entityName: deletedProject.name,
        summary: `Apagou o projeto ${deletedProject.name}.`,
        before: deletedProject,
        metadata: {
          deletedWorkspaceId: deletedProject.workspaceId,
          deletedProjectId: deletedProject.id,
        },
      });
      return c.json(deletedProject);
    },
  )
  .put(
    "/:id/archive",
    describeRoute({
      operationId: "archiveProject",
      tags: ["Projects"],
      description: "Archive a project by ID",
      responses: {
        200: {
          description: "Project archived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const currentProject = await getProjectCtrl(id, workspaceId);
      const archivedProject = await archiveProjectCtrl(id, workspaceId);
      await recordAuditLog(c, {
        action: "project.archived",
        entityType: "project",
        entityId: archivedProject.id,
        entityName: archivedProject.name,
        workspaceId: archivedProject.workspaceId,
        projectId: archivedProject.id,
        summary: `Arquivou o projeto ${archivedProject.name}.`,
        before: currentProject,
        after: archivedProject,
      });
      return c.json(archivedProject);
    },
  )
  .put(
    "/:id/unarchive",
    describeRoute({
      operationId: "unarchiveProject",
      tags: ["Projects"],
      description: "Unarchive a project by ID",
      responses: {
        200: {
          description: "Project unarchived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const currentProject = await getProjectCtrl(id, workspaceId);
      const unarchivedProject = await unarchiveProjectCtrl(id, workspaceId);
      await recordAuditLog(c, {
        action: "project.restored",
        entityType: "project",
        entityId: unarchivedProject.id,
        entityName: unarchivedProject.name,
        workspaceId: unarchivedProject.workspaceId,
        projectId: unarchivedProject.id,
        summary: `Restaurou o projeto ${unarchivedProject.name}.`,
        before: currentProject,
        after: unarchivedProject,
      });
      return c.json(unarchivedProject);
    },
  );

export default project;
