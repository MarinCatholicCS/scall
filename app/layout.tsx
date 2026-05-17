import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scall: Stalling Scam Calls",
  description: "Forward a scam email to scall@agentmail.to and we waste the scammer's time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
