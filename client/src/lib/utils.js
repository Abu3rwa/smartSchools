import { clsx } from "clsx";

/** Combine class names. Use with shadcn/ui or any Tailwind components. */
export function cn(...inputs) {
  return clsx(inputs);
}
