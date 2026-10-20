import type { Metadata } from "next";
import { CategoryPage, categoryMetadata } from "./category-page";

/** Every item of the build in one list, with the class, type and other filters in the URL. */
type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export async function generateMetadata(props: Props): Promise<Metadata> {
  return categoryMetadata(undefined, undefined, (await props.searchParams) ?? {});
}

export default async function ItemsPage(props: Props) {
  return CategoryPage({ search: (await props.searchParams) ?? {} });
}
