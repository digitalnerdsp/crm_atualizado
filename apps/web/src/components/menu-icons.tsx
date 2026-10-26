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
import { cn } from "@/lib/cn";

// Ícones multicoloridos do menu lateral. Cada um aceita className como os
// ícones do lucide, então entram nos itens do menu sem outra mudança.
function makeMenuIcon(src: string) {
  return function MenuIcon({ className }: { className?: string }) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        data-menu-icon=""
        draggable={false}
        className={cn(
          "size-5 shrink-0 rounded-sm object-contain dark:bg-white/90 dark:p-px",
          className,
        )}
      />
    );
  };
}

export const MenuIcons = {
  admin: makeMenuIcon(admin),
  bank: makeMenuIcon(bank),
  barChart: makeMenuIcon(barChart),
  calendar: makeMenuIcon(calendar),
  cloudServer: makeMenuIcon(cloudServer),
  contactBook: makeMenuIcon(contactBook),
  contract: makeMenuIcon(contract),
  deal: makeMenuIcon(deal),
  exchange: makeMenuIcon(exchange),
  folderChart: makeMenuIcon(folderChart),
  lineChart: makeMenuIcon(lineChart),
  office: makeMenuIcon(office),
  growth: makeMenuIcon(growth),
  phone: makeMenuIcon(phone),
  receipt: makeMenuIcon(receipt),
  tax: makeMenuIcon(tax),
  users: makeMenuIcon(users),
};
