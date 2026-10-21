import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { normalizePersonName, normalizeCompanyName } from './names';
export { normalizePersonName, normalizeCompanyName };

/** @deprecated use normalizePersonName / normalizeCompanyName */
export function capitalizeWords(str: string): string {
  return normalizePersonName(str);
}
