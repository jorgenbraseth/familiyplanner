import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fraunces, Fredoka, Lexend, Nunito, Work_Sans } from "next/font/google";
import { SwRegister } from "@/components/sw-register";
import { htmlLang, t } from "@/lib/i18n";
import { THEME_COOKIE, fallbackCss, getTheme, parseThemeId, themeCss } from "@/lib/themes";
import "./globals.css";

// One font per family a theme uses (src/lib/themes.ts maps them to --font-sans / --font-display). Only the weights
// the UI uses are loaded; the default theme's fonts are preloaded, the others load when a theme needs them.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap" });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["700", "800"], display: "swap" });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: ["600", "700"], display: "swap", preload: false });
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap", preload: false });
const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap", preload: false });

const fontVariables = [nunito, fraunces, fredoka, lexend, workSans].map((f) => f.variable).join(" ");

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

export async function generateViewport(): Promise<Viewport> {
  const theme = getTheme(parseThemeId((await cookies()).get(THEME_COOKIE)?.value));
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: theme.tokens.brand,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme cookie is set when the theme is saved (and by ThemeSync on a new device); no cookie means the default.
  const theme = parseThemeId((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={htmlLang} data-theme-name={theme} className={`${fontVariables} antialiased`}>
      <head>
        {/* Our own constants only (src/lib/themes.ts), nothing user-provided. */}
        <style dangerouslySetInnerHTML={{ __html: `${fallbackCss()}\n${themeCss()}` }} />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-clip font-sans">{children}
        <SwRegister />
      </body>
    </html>
  );
}
