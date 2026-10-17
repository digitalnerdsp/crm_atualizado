import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  CircleAlert,
  Minus,
} from "lucide-react";

export function getPriorityIcon(priority: string) {
  switch (priority) {
    case "urgent":
      return (
        <CircleAlert className="h-[12px] w-[12px] text-destructive-foreground" />
      );
    case "high":
      return (
        <ChevronsUp className="h-[12px] w-[12px] text-warning-foreground" />
      );
    case "medium":
      return (
        <ChevronUp className="h-[12px] w-[12px] text-warning-foreground/80" />
      );
    case "low":
      return (
        <ChevronDown className="h-[12px] w-[12px] text-info-foreground/85" />
      );
    case "no-priority":
      return <Minus className="h-[12px] w-[12px] text-muted-foreground" />;
    default:
      return <Minus className="h-[12px] w-[12px] text-muted-foreground" />;
  }
}

export function getPriorityBadgeClass(priority: string) {
  switch (priority) {
    case "urgent":
      return "border-destructive/20 bg-destructive/10 text-destructive-foreground";
    case "high":
      return "border-warning/25 bg-warning/10 text-warning-foreground";
    case "medium":
      return "border-info/20 bg-info/10 text-info-foreground";
    case "low":
      return "border-info/15 bg-info/5 text-info-foreground/85";
    default:
      return "border-border/70 bg-muted/55 text-muted-foreground";
  }
}
