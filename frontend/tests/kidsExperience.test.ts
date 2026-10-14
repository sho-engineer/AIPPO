import { describe, expect, it } from "vitest";
import { experienceForPath } from "../src/app/experience";

describe("Kids entry preserves the existing app routes", () => {
  it.each(["/kids", "/kids/"])("opens the preview at %s", (pathname) => {
    expect(experienceForPath(pathname)).toBe("kids");
  });
  it.each(["/", "/settings", "/lessons", "/kids-other", "/kids/not-a-route"])(
    "keeps the standard app at %s",
    (pathname) => expect(experienceForPath(pathname)).toBe("standard"),
  );
});
