import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import Disclosure from "./Disclosure";
import Field, { Input } from "./Field";
import Segmented from "./Segmented";
import SourceLine from "./SourceLine";

describe("Disclosure", () => {
  test("is a closed native details whose summary is a heading", () => {
    const html = renderToStaticMarkup(<Disclosure summary="How is this made?"><p>From uploads.</p></Disclosure>);
    expect(html).toMatch(/^<details data-disclosure="true"/);
    expect(html).not.toContain(" open");
    expect(html).toMatch(/<summary[^>]*><h3[^>]*>How is this made\?<\/h3>/);
    expect(html).toContain("<p>From uploads.</p>");
  });
});

describe("Field", () => {
  test("labels its input, which has a 44 px target and 16 px text", () => {
    const html = renderToStaticMarkup(<Field label="Realm" name="realm" defaultValue="Forever" />);
    expect(html).toMatch(/^<label[^>]*><span[^>]*>Realm<\/span><input/);
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-base");
    expect(html).toContain('name="realm"');
  });

  test("mono sets ids and numbers in Geist Mono", () => {
    expect(renderToStaticMarkup(<Input mono />)).toContain("font-mono");
    expect(renderToStaticMarkup(<Input />)).not.toContain("font-mono");
  });
});

describe("Segmented", () => {
  test("is a named group of toggle buttons with the chosen one pressed", () => {
    const html = renderToStaticMarkup(
      <Segmented label="Auction house cut" value="on" onChange={() => {}} options={[{ value: "on", label: "Subtract 5%" }, { value: "off", label: "No cut" }]} />,
    );
    expect(html).toContain('role="group" aria-label="Auction house cut"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Subtract 5%/);
  });
});

describe("SourceLine from", () => {
  test("replaces the game-files clause when the values come from somewhere else", () => {
    const html = renderToStaticMarkup(<SourceLine from="Your own numbers" />);
    expect(html).toContain("Your own numbers");
    expect(html).not.toContain("From game files");
    expect(html).toContain("CC BY-SA 4.0");
  });
});
