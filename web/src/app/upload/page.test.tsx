import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("./UploadClient", () => ({ default: () => null }));

import UploadPage from "./page";

test("the upload page says how uploaded observations are licensed", () => {
  expect(renderToStaticMarkup(<UploadPage />)).toContain(
    "Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors.",
  );
});
