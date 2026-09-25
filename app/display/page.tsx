import type { Metadata } from "next";
import { getSnapshot } from "@/lib/catalog/cache";
import DisplayClient from "./DisplayClient";
import "./display.css";

export const metadata: Metadata = {
  title: "CozyBerries Display",
  robots: { index: false, follow: false },
  manifest: "/display.webmanifest",
};

// Static like `/`: the catalog snapshot comes from the `catalog`-tagged Data Cache; no request APIs here.
export default async function DisplayPage() {
  const { snapshot } = await getSnapshot();
  return <DisplayClient snapshot={snapshot} />;
}
