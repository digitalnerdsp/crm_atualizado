import { type CSSProperties, useState } from "react";
import { getLaneColor } from "@/constants/lane-colors";
import type { ProjectWithTasks } from "@/types/project";
import { ColumnDropzone } from "./column-dropzone";
import { ColumnHeader } from "./column-header";

type ColumnProps = {
  column: ProjectWithTasks["columns"][number];
  disableDragDrop?: boolean;
};

function Column({ column, disableDragDrop = false }: ColumnProps) {
  const [isDropzoneOver, setIsDropzoneOver] = useState(false);
  const laneColor = getLaneColor(column.color, column.slug);
  const laneStyle = {
    "--lane-color": laneColor,
    borderColor: `color-mix(in srgb, ${laneColor} 24%, var(--border))`,
    background: `color-mix(in srgb, ${laneColor} 4%, var(--card))`,
  } as CSSProperties;

  return (
    <div
      style={laneStyle}
      className={`group relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border transition-colors duration-150 ${
        isDropzoneOver
          ? "shadow-md ring-2 ring-[color:var(--lane-color)]/30"
          : "shadow-xs/5 hover:shadow-sm"
      }`}
    >
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: laneColor }}
      />
      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <ColumnHeader column={column} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 [-webkit-overflow-scrolling:touch]">
        <ColumnDropzone
          column={column}
          disableDragDrop={disableDragDrop}
          onIsOverChange={setIsDropzoneOver}
        />
      </div>
    </div>
  );
}

export default Column;
