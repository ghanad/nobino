"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { getWikiPagePath } from "@/lib/wiki-route";
import {
  createWikiPage,
  deleteWikiPage,
  moveWikiPageSibling,
  updateWikiPage,
} from "@/lib/wiki-service";

const wikiContentSchema = z.string().min(1);

const createWikiPageSchema = z.object({
  contentJson: wikiContentSchema,
  parentId: z.string().optional(),
  slug: z.string().optional(),
  title: z.string().trim().min(1).max(150),
  isHidden: z.boolean(),
});

const updateWikiPageSchema = createWikiPageSchema.extend({
  pageId: z.string().min(1),
});

const moveWikiPageSchema = z.object({
  direction: z.enum(["down", "up"]),
  pageId: z.string().min(1),
  slug: z.string().min(1),
});

const deleteWikiPageSchema = z.object({
  pageId: z.string().min(1),
  slug: z.string().min(1),
});

export type WikiActionParams = Record<string, string | undefined>;

function buildSearchParams(params: WikiActionParams): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  return searchParams.toString();
}

function redirectToWiki(path: string, params: WikiActionParams = {}): never {
  const search = buildSearchParams(params);
  // Server Action redirects are sent in an HTTP header, which cannot contain
  // raw Persian characters from a wiki slug.
  redirect(encodeURI(search ? `${path}?${search}` : path));
}

function getWikiActionErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    (error.name === "WikiPermissionError" || error.name === "WikiValidationError")
  ) {
    return error.message;
  }

  throw error;
}

function parseWikiContent(rawContent: string): unknown {
  try {
    return JSON.parse(rawContent);
  } catch {
    const error = new Error("محتوای ویکی معتبر نیست.");
    error.name = "WikiValidationError";
    throw error;
  }
}

export async function createWikiPageAction(formData: FormData): Promise<never> {
  const user = await requireCurrentUser();
  const parsed = createWikiPageSchema.safeParse({
    contentJson: formData.get("contentJson"),
    isHidden: formData.get("isHidden") === "on",
    parentId: formData.get("parentId") || undefined,
    slug: formData.get("slug") || undefined,
    title: formData.get("title"),
  });

  if (!parsed.success) {
    redirectToWiki("/wiki/new", { error: "لطفاً عنوان و محتوای معتبر وارد کنید." });
  }

  try {
    const page = await createWikiPage(
      {
        contentJson: parseWikiContent(parsed.data.contentJson),
        isHidden: parsed.data.isHidden,
        parentId: parsed.data.parentId || null,
        slug: parsed.data.slug,
        title: parsed.data.title,
      },
      user,
    );

    revalidatePath("/wiki");
    revalidatePath(getWikiPagePath(page.slug));

    redirectToWiki(`/wiki/${page.slug}`, { created: "1" });
  } catch (error) {
    redirectToWiki("/wiki/new", {
      error: getWikiActionErrorMessage(error),
    });
  }
}

export async function updateWikiPageAction(formData: FormData): Promise<never> {
  const user = await requireCurrentUser();
  const parsed = updateWikiPageSchema.safeParse({
    contentJson: formData.get("contentJson"),
    isHidden: formData.get("isHidden") === "on",
    pageId: formData.get("pageId"),
    parentId: formData.get("parentId") || undefined,
    slug: formData.get("slug") || undefined,
    title: formData.get("title"),
  });

  if (!parsed.success || !parsed.data.slug) {
    redirectToWiki("/wiki", { error: "لطفاً صفحه و محتوای معتبر را ذخیره کنید." });
  }

  try {
    await updateWikiPage(
      {
        contentJson: parseWikiContent(parsed.data.contentJson),
        isHidden: parsed.data.isHidden,
        pageId: parsed.data.pageId,
        parentId: parsed.data.parentId || null,
        title: parsed.data.title,
      },
      user,
    );

    revalidatePath("/wiki");
    revalidatePath(getWikiPagePath(parsed.data.slug));

    redirectToWiki(`/wiki/${parsed.data.slug}`, { updated: "1" });
  } catch (error) {
    redirectToWiki(`/wiki/${parsed.data.slug}/edit`, {
      error: getWikiActionErrorMessage(error),
    });
  }
}

export async function moveWikiPageAction(formData: FormData): Promise<never> {
  const user = await requireCurrentUser();
  const parsed = moveWikiPageSchema.safeParse({
    direction: formData.get("direction"),
    pageId: formData.get("pageId"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    redirectToWiki("/wiki", { error: "جابه‌جایی صفحه معتبر نیست." });
  }

  try {
    await moveWikiPageSibling(
      {
        direction: parsed.data.direction,
        pageId: parsed.data.pageId,
      },
      user,
    );

    revalidatePath("/wiki");
    revalidatePath(getWikiPagePath(parsed.data.slug));

    redirectToWiki(`/wiki/${parsed.data.slug}/edit`, { moved: "1" });
  } catch (error) {
    redirectToWiki(`/wiki/${parsed.data.slug}/edit`, {
      error: getWikiActionErrorMessage(error),
    });
  }
}

export async function deleteWikiPageAction(formData: FormData): Promise<never> {
  const user = await requireCurrentUser();
  const parsed = deleteWikiPageSchema.safeParse({
    pageId: formData.get("pageId"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    redirectToWiki("/wiki", { error: "حذف صفحه معتبر نیست." });
  }

  try {
    const result = await deleteWikiPage(
      {
        pageId: parsed.data.pageId,
      },
      user,
    );

    revalidatePath("/wiki");
    revalidatePath(getWikiPagePath(parsed.data.slug));
    if (result.parentSlug) {
      revalidatePath(getWikiPagePath(result.parentSlug));
    }

    redirectToWiki(result.parentSlug ? `/wiki/${result.parentSlug}` : "/wiki", {
      deleted: "1",
    });
  } catch (error) {
    redirectToWiki(`/wiki/${parsed.data.slug}/edit`, {
      error: getWikiActionErrorMessage(error),
    });
  }
}
