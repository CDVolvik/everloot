import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { continentFromSlug, continentPath } from "@/lib/map-view";
import { renderMapScreen, mapMetadata, queryString, resolveMap, type MapQuery } from "../map-screen";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ continent: string }>; searchParams: Promise<MapQuery> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const id = continentFromSlug((await props.params).continent);
  if (id === null) return {};
  return mapMetadata(await props.searchParams, id);
}

/**
 * One continent's map: `/map/eastern-kingdoms` and `/map/kalimdor`. The page itself lists the continent's zones,
 * entrances and flight masters (the List tab), so it reads without JavaScript. A zone link for the other
 * continent is sent to that one's page.
 */
export default async function ContinentMapPage(props: Props) {
  const id = continentFromSlug((await props.params).continent);
  if (id === null) notFound();
  const query = await props.searchParams;
  const { continentId } = resolveMap(query, id);
  if (query.continent !== undefined || continentId !== id) redirect(`${continentPath(continentId)}${queryString(query, ["continent"])}`);
  return renderMapScreen(query, id);
}
