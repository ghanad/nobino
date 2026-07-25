"use client";

import { useRouter } from "next/navigation";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useActionState,
  useEffect,
  useRef,
} from "react";

import type { AdminDeskActionState } from "@/app/admin/desks/actions";
import { UrlToast } from "@/components/ui/url-toast";

const initialState: AdminDeskActionState = {};
const noConsumedQueryKeys: string[] = [];

type Props = Omit<ComponentPropsWithoutRef<"form">, "action"> & {
  action: (
    state: AdminDeskActionState,
    formData: FormData,
  ) => Promise<AdminDeskActionState>;
  children: ReactNode;
  resetOnSuccess?: boolean;
};

export function AdminDeskForm({
  action,
  children,
  resetOnSuccess = false,
  ...props
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    if (state.redirectTo) router.replace(state.redirectTo, { scroll: false });
  }, [resetOnSuccess, router, state]);

  return (
    <>
      <form {...props} action={formAction} ref={formRef}>
        {children}
      </form>
      {state.message ? (
        <UrlToast
          consumeKeys={noConsumedQueryKeys}
          key={state.id}
          message={state.message}
          variant={state.ok ? "success" : "error"}
        />
      ) : null}
    </>
  );
}
