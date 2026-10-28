import { type ReactNode, useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * Substitui window.confirm pelo diálogo do sistema.
 * `const [confirm, confirmDialog] = useConfirm()`; renderize `confirmDialog`
 * uma vez e use `if (!(await confirm("Texto"))) return;`.
 */
export function useConfirm() {
  const [state, setState] = useState<
    (ConfirmOptions & { message: string }) | null
  >(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (message: string, options: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState({ message, ...options });
      }),
    [],
  );

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  };

  const dialog: ReactNode = (
    <AlertDialog
      open={!!state}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {state?.title ?? "Confirmar ação"}
          </AlertDialogTitle>
          <AlertDialogDescription>{state?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose>
            <Button variant="outline" size="sm">
              {state?.cancelLabel ?? "Cancelar"}
            </Button>
          </AlertDialogClose>
          <AlertDialogClose onClick={() => settle(true)}>
            <Button
              size="sm"
              variant={state?.destructive === false ? "default" : "destructive"}
            >
              {state?.confirmLabel ?? "Confirmar"}
            </Button>
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog] as const;
}
