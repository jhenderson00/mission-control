import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import { ClerkClientProvider } from "@/components/providers/clerk-provider";
import { ConvexClientProvider } from "@/components/providers/convex-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cydni - Mission Control",
  description: "AI Organization Command Center — See everything your AI organization is doing, why it's doing it, and step in when needed.",
  keywords: ["AI", "agents", "orchestration", "monitoring", "dashboard"],
  authors: [{ name: "Cydni" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${unbounded.variable} bg-background text-foreground antialiased`}
      >
        <ClerkClientProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkClientProvider>
      </body>
    </html>
  );
}
