import type { Metadata } from "next";
import { RanusApp } from "@/components/RanusApp";
import "./chat.css";

export const metadata: Metadata = { title: "RANUS — Ask about your money" };

export default function AppPage() {
  return <RanusApp />;
}
