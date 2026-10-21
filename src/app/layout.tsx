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
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Planlegger", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3FA34D",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={htmlLang} className={`${nunito.variable} ${baloo.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col font-sans">{children}
        <SwRegister />
      </body>
    </html>
  );
}
