import { cn } from "@/lib/utils";

type ProductSignatureProps = {
  className?: string;
};

export function ProductSignature({ className }: ProductSignatureProps) {
  return (
    <p
      className={cn(
        "text-center text-xs font-medium leading-6 text-muted-foreground",
        className,
      )}
    >
      توسعه داده‌شده در هلدینگ آقاجانی
    </p>
  );
}
