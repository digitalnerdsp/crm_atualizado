import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Mesma API do `Layout` do app (Header e Content), mas sem a barra lateral:
 * as páginas de administração agora vivem dentro das configurações.
 */
function Header({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 gap-2 rounded-t-md border-b border-border bg-card p-2",
        className,
      )}
    >
      {children}
    </header>
  );
}

function Content({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1", className)}>
      <div className="h-full">{children}</div>
    </div>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border">
      {children}
    </div>
  );
}

Layout.Header = Header;
Layout.Content = Content;

export default Layout;
