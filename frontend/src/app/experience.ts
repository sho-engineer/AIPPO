/** Keep the Kids preview separate from the existing account/lesson routes. */
export function experienceForPath(pathname: string): "kids" | "standard" {
  return pathname.replace(/\/+$/, "") === "/kids" ? "kids" : "standard";
}
