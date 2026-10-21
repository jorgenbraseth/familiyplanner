import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { SwRegister } from "@/components/sw-register";
import { htmlLang, t } from "@/lib/i18n";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["600", "800"],
});

export const metadata: Metadata = {
  title: t.appName,
  description: t.appDescription,
  robots: { index: false, follow: false },
  // The .ico comes from src/app/favicon.ico (file convention); the PNG is declared here because Next did not emit a link for src/app/icon.png next to it.
  icons: {
    icon: [
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Planlegger", statusBarStyle: "default" },
  // Next emits only the unprefixed mobile-web-app-capable; older iOS versions look for the Apple one.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c24e49" },
    { media: "(prefers-color-scheme: dark)", color: "#121826" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={htmlLang} className={`${nunito.variable} ${baloo.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col overflow-x-clip font-sans">{children}
        <SwRegister />
      </body>
    </html>
  );
}
