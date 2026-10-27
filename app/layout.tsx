import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { PreferencesProvider } from "@/lib/i18n/preferences";
import { themeBootScript } from "@/lib/i18n/theme-boot";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORIVIO — Discover What's True",
  description: "An evidence-led research laboratory for investigating claims and following the sources.",
  applicationName: "ORIVIO",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "ORIVIO", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08101c" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Set per request by middleware.ts; reading it makes pages render per request.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="tr" data-theme="dark" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <PreferencesProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </PreferencesProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
