import { Suspense } from "react";
import { FinanceApp } from "@/components/FinanceApp";
import { demoData } from "@/lib/demo-data";

export default function DemoPage() {
  return <Suspense fallback={null}><FinanceApp mode="demo" initialData={demoData} /></Suspense>;
}
