/** One line a page can show beside figures: how old the uploads behind them are. */
export function dataAgeLabel(dataAsOf: string | null | undefined): string {
  if (!dataAsOf || !Number.isFinite(Date.parse(dataAsOf))) return "Data age unrecorded";
  const iso = new Date(dataAsOf).toISOString();
  return `Data as of ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
