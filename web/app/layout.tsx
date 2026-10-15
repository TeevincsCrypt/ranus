import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter_Tight } from "next/font/google";
import "./globals.css";

const display = Inter_Tight({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "RANUS — Dollar & Asset Intelligence",
  description:
    "RANUS is an Alexa+-style agent that monitors, explains and prepares actions on real digital dollars, yields and tokenized assets on Solana — powered by Amazon Bedrock and an MCP server.",
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
