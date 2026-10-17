import db from "../../database";
import { columnTable, projectTable } from "../../database/schema";

export const DEFAULT_PROJECT_COLUMNS = [
  {
    name: "To Do",
    slug: "to-do",
    position: 0,
    color: "#64748B",
    isFinal: false,
  },
  {
    name: "In Progress",
    slug: "in-progress",
    position: 1,
    color: "#3B82F6",
    isFinal: false,
  },
  {
    name: "In Review",
    slug: "in-review",
    position: 2,
    color: "#EAB308",
    isFinal: false,
  },
  {
    name: "Done",
    slug: "done",
    position: 3,
    color: "#22C55E",
    isFinal: true,
  },
] as const;

async function createProject(
  workspaceId: string,
  name: string,
  icon: string,
  slug: string,
) {
  return db.transaction(async (tx) => {
    const [createdProject] = await tx
      .insert(projectTable)
      .values({
        workspaceId,
        name,
        icon,
        slug,
      })
      .returning();

    if (createdProject) {
      for (const col of DEFAULT_PROJECT_COLUMNS) {
        await tx.insert(columnTable).values({
          projectId: createdProject.id,
          name: col.name,
          slug: col.slug,
          position: col.position,
          color: col.color,
          isFinal: col.isFinal,
        });
      }
    }

    return createdProject;
  });
}

export default createProject;
