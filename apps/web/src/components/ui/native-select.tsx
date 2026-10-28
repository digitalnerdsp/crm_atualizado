import type * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Seleção nativa estilizada como os demais campos. Funciona dentro de
 * formulários (FormData) e é a melhor opção no celular; use o `Select`
 * completo só quando precisar de busca ou itens ricos.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
