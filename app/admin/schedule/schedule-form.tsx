"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const ScheduleFormChangesContext = createContext(false);

type ScheduleFormProps = Omit<
  ComponentPropsWithoutRef<"form">,
  "action" | "children"
> & {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
};

export function ScheduleForm({
  action,
  children,
  ...props
}: ScheduleFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const form = formRef.current;

    if (!form) {
      return;
    }

    const markChanged = () => setHasChanges(true);
    form.addEventListener("change", markChanged);
    form.addEventListener("input", markChanged);

    return () => {
      form.removeEventListener("change", markChanged);
      form.removeEventListener("input", markChanged);
    };
  }, []);

  useEffect(() => {
    if (!hasChanges) {
      return;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasChanges]);

  return (
    <ScheduleFormChangesContext.Provider value={hasChanges}>
      <form {...props} action={action} ref={formRef}>
        {children}
      </form>
    </ScheduleFormChangesContext.Provider>
  );
}

export function ScheduleFormStatus() {
  const hasChanges = useContext(ScheduleFormChangesContext);

  return (
    <p
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 text-xs font-medium",
        hasChanges ? "text-amber-700" : "text-slate-500",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          hasChanges ? "animate-pulse bg-amber-500" : "bg-emerald-500",
        )}
      />
      {hasChanges
        ? "تغییرات ذخیره‌نشده دارید."
        : "همه تغییرات ذخیره شده‌اند."}
    </p>
  );
}

export function ScheduleSubmitButton({
  disabled,
  ...props
}: ComponentPropsWithoutRef<typeof SubmitButton>) {
  const hasChanges = useContext(ScheduleFormChangesContext);

  return <SubmitButton {...props} disabled={disabled || !hasChanges} />;
}
