import { Suspense } from "react";
import { LiveAppLoader } from "@/components/LiveAppLoader";

export default function AppPage() {
  return <Suspense fallback={<main className="center-page">Loading…</main>}><LiveAppLoader /></Suspense>;
}
