import { cn } from "@/lib/utils";

type ProductSignatureProps = {
  className?: string;
};

export function ProductSignature({ className }: ProductSignatureProps) {
  return (
    <p
      className={cn(
        "text-center text-[13px] font-medium leading-6 text-slate-500",
        className,
      )}
    >
      توسعه داده‌شده در هلدینگ آقاجانی
    </p>
  );
}
