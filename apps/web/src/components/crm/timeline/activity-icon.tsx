import {
  FileText,
  Mail,
  MessageCircle,
  Phone,
  SquareCheck,
  Users,
} from "lucide-react";

const ICONS = {
  call: Phone,
  meeting: Users,
  email: Mail,
  note: FileText,
  task: SquareCheck,
  whatsapp: MessageCircle,
} as const;

export type CrmActivityType = keyof typeof ICONS;

export function ActivityIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = ICONS[type as CrmActivityType] ?? FileText;
  return <Icon className={className} />;
}

export const ACTIVITY_TYPES = Object.keys(ICONS) as CrmActivityType[];
