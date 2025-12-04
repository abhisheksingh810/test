import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function prependHttpToLinks(html: string): string {
  return html.replace(
    /href="(?!https?:\/\/)([^"]+)"/g,
    (_match: string, url: string): string => `href="http://${url}"`
  );
}

