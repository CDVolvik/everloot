import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Bracket from "./Bracket";

test("wraps a label in muted square brackets, like an item link in chat", () => {
  expect(renderToStaticMarkup(<Bracket>Database</Bracket>)).toBe(
    '<span class="font-mono"><span aria-hidden="true" class="text-muted">[</span>Database<span aria-hidden="true" class="text-muted">]</span></span>',
  );
});
