import type { WikiActionParams } from "@/app/wiki/actions";

type WikiToast =
  | {
      consumeKeys: string[];
      message: string;
      variant: "error" | "success";
    }
  | null;

export function getWikiToast(params: WikiActionParams | undefined): WikiToast {
  if (!params) {
    return null;
  }

  if (params.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error",
    };
  }

  if (params.created) {
    return {
      consumeKeys: ["created"],
      message: "صفحه دانشنامه ایجاد شد.",
      variant: "success",
    };
  }

  if (params.updated) {
    return {
      consumeKeys: ["updated"],
      message: "تغییرات صفحه ذخیره شد.",
      variant: "success",
    };
  }

  if (params.moved) {
    return {
      consumeKeys: ["moved"],
      message: "ترتیب صفحه در درخت به‌روزرسانی شد.",
      variant: "success",
    };
  }

  if (params.deleted) {
    return {
      consumeKeys: ["deleted"],
      message: "صفحه با حذف نرم از دانشنامه خارج شد.",
      variant: "success",
    };
  }

  return null;
}

