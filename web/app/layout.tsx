import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RANUS — Dollar & Asset Intelligence",
  description:
    "RANUS is an Alexa+-style agent that monitors, explains and prepares actions on real digital dollars, yields and tokenized assets on Solana — powered by Amazon Bedrock and an MCP server.",
};

export const viewport: Viewport = { themeColor: "#070b14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
