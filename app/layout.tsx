import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Tribunal",
  description: "LLM courtroom deliberation console",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
