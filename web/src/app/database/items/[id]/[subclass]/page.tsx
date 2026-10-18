import type { Metadata } from "next";
import { CategoryPage, categoryMetadata } from "../../category-page";

/** /database/items/<class slug>/<subclass slug or number>, such as /database/items/weapon/one-handed-swords. */
type Props = { params: Promise<{ id: string; subclass: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id, subclass } = await props.params;
  return categoryMetadata(id, subclass, (await props.searchParams) ?? {});
}

export default async function SubclassPage(props: Props) {
  const { id, subclass } = await props.params;
  return CategoryPage({ classSlug: id, subclassKey: subclass, search: (await props.searchParams) ?? {} });
}
