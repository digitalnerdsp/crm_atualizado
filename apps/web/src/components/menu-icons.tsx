import {
  BadgePercent,
  Building2,
  CalendarDays,
  ChartColumn,
  ChartNoAxesCombined,
  Contact,
  FileSignature,
  FolderKanban,
  Handshake,
  Landmark,
  type LucideIcon,
  PhoneCall,
  ReceiptText,
  Repeat,
  Server,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import admin from "@/assets/menu-icons/admin-lock.svg";
import bank from "@/assets/menu-icons/bank.svg";
import barChart from "@/assets/menu-icons/bar-chart-graph.svg";
import calendar from "@/assets/menu-icons/calendar.svg";
import cloudServer from "@/assets/menu-icons/cloud-server.svg";
import contactBook from "@/assets/menu-icons/contact-book.svg";
import contract from "@/assets/menu-icons/contract-paper.svg";
import deal from "@/assets/menu-icons/deal.svg";
import exchange from "@/assets/menu-icons/exchange-arrows.svg";
import folderChart from "@/assets/menu-icons/folder-chart.svg";
import lineChart from "@/assets/menu-icons/line-chart.svg";
import office from "@/assets/menu-icons/office-building.svg";
import growth from "@/assets/menu-icons/order-of-growth.svg";
import phone from "@/assets/menu-icons/phone-outgoing.svg";
import receipt from "@/assets/menu-icons/receipt.svg";
import tax from "@/assets/menu-icons/tax-left.svg";
import users from "@/assets/menu-icons/users.svg";
import { useThemeLayout } from "@/hooks/use-theme-layout";
import { cn } from "@/lib/cn";

// Ícones do menu lateral. No tema Qerza são os multicoloridos (imagens); no
// tema padrão, os ícones de traço em cor sólida, que herdam a cor do setor
// (text-primary, text-info, text-success...) passada no className.
function makeMenuIcon(src: string, Solid: LucideIcon) {
  return function MenuIcon({ className }: { className?: string }) {
    const layout = useThemeLayout();
    if (layout !== "qerza") {
      return (
        <Solid
          aria-hidden="true"
          className={cn("size-5 shrink-0", className)}
        />
      );
    }
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        data-menu-icon=""
        draggable={false}
        className={cn("size-5 shrink-0 rounded-sm object-contain", className)}
      />
    );
  };
}

export const MenuIcons = {
  admin: makeMenuIcon(admin, Shield),
  bank: makeMenuIcon(bank, BadgePercent),
  barChart: makeMenuIcon(barChart, ChartNoAxesCombined),
  calendar: makeMenuIcon(calendar, CalendarDays),
  cloudServer: makeMenuIcon(cloudServer, Server),
  contactBook: makeMenuIcon(contactBook, Contact),
  contract: makeMenuIcon(contract, FileSignature),
  deal: makeMenuIcon(deal, Handshake),
  exchange: makeMenuIcon(exchange, Repeat),
  folderChart: makeMenuIcon(folderChart, FolderKanban),
  lineChart: makeMenuIcon(lineChart, ChartColumn),
  office: makeMenuIcon(office, Building2),
  growth: makeMenuIcon(growth, TrendingUp),
  phone: makeMenuIcon(phone, PhoneCall),
  receipt: makeMenuIcon(receipt, ReceiptText),
  tax: makeMenuIcon(tax, Landmark),
  users: makeMenuIcon(users, Users),
};
