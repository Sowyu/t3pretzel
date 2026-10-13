import { describe, expect, it } from "vite-plus/test";
import { menuSections } from "./menuSections";

describe("menuSections", () => {
  it("groups loose actions between inline sections and drops hidden or empty ones", () => {
    const sections = menuSections([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "s", title: "Size", displayInline: true, subactions: [{ id: "c", title: "C" }] },
      {
        id: "empty",
        title: "",
        displayInline: true,
        subactions: [{ id: "h", title: "H", attributes: { hidden: true } }],
      },
      { id: "d", title: "D" },
      { id: "sub", title: "More", subactions: [{ id: "e", title: "E" }] },
    ]);
    expect(sections.map((section) => [section.title, section.actions.map(({ id }) => id)])).toEqual(
      [
        [undefined, ["a", "b"]],
        ["Size", ["c"]],
        [undefined, ["d", "sub"]],
      ],
    );
  });
});
