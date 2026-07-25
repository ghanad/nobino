"use client";

import { useRouter } from "next/navigation";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { AdminDeskActionState } from "@/app/admin/desks/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";

const initialState: AdminDeskActionState = {};
const noConsumedQueryKeys: string[] = [];
const FormChangesContext = createContext<boolean | null>(null);

type Props = Omit<ComponentPropsWithoutRef<"form">, "action"> & {
  action: (
    state: AdminDeskActionState,
    formData: FormData,
  ) => Promise<AdminDeskActionState>;
  children: ReactNode;
  resetOnSuccess?: boolean;
  trackChanges?: boolean;
};

export function AdminDeskTrackedSubmitButton({
  disabled,
  ...props
}: ComponentPropsWithoutRef<typeof SubmitButton>) {
  const hasChanges = useContext(FormChangesContext);

  return (
    <SubmitButton
      {...props}
      disabled={disabled || hasChanges === false}
    />
  );
}

export function AdminDeskForm({
  action,
  children,
  resetOnSuccess = false,
  trackChanges = false,
  ...props
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    if (trackChanges) setHasChanges(false);
    if (state.redirectTo) router.replace(state.redirectTo, { scroll: false });
  }, [resetOnSuccess, router, state, trackChanges]);

  useEffect(() => {
    const form = formRef.current;
    if (!trackChanges || !form) return;
    const markChanged = () => setHasChanges(true);
    form.addEventListener("change", markChanged);
    form.addEventListener("input", markChanged);
    return () => {
      form.removeEventListener("change", markChanged);
      form.removeEventListener("input", markChanged);
    };
  }, [trackChanges]);

  useEffect(() => {
    if (!trackChanges || !hasChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasChanges, trackChanges]);

  return (
    <>
      <form
        {...props}
        action={formAction}
        data-has-changes={trackChanges ? hasChanges : undefined}
        ref={formRef}
      >
        {trackChanges ? (
          <FormChangesContext.Provider value={hasChanges}>
            {children}
          </FormChangesContext.Provider>
        ) : (
          children
        )}
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
