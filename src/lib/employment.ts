/** A contact is "uit dienst" only when every employer link has a departure date. */
export function isFullyDeparted(links: { departedAt?: string | null }[]): boolean {
  return links.length > 0 && links.every((l) => !!l.departedAt);
}
