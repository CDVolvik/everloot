"use client";

import { useEffect, useState } from "react";
import { greeting } from "@/lib/profiles";

/** "Good evening, Thrall!" in the browser's own time. The server, which does not know it, says "Hello". */
export default function Greeting({ name }: { name: string }) {
  const [hello, setHello] = useState("Hello");
  useEffect(() => setHello(greeting(new Date().getHours())), []);
  return <h1 className="text-title-sm text-fg [overflow-wrap:anywhere] sm:text-title">{hello}, {name}!</h1>;
}
