import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the portfolio panels only. Fraunces' soft, slightly wonky
// serif reads handmade rather than corporate, which is the same register as
// the pixel apartment it opens on top of.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const SITE_TITLE = "Mimi Studio — Tasmim Portfolio";
const SITE_DESCRIPTION =
  "Walk around Mimi Studio, a cozy apartment you explore to read the portfolio of Tasmim Shajahan, full stack developer.";

// Absolute base for the link-preview image. Vercel supplies the production
// host at build time; the env override is for a custom domain, and localhost
// only ever applies in development.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

// The icon and preview artwork are generated from Mimi's own sprite sheet —
// see app/icon.tsx, app/apple-icon.tsx and app/opengraph-image.tsx, which Next
// wires up as <link rel="icon"/apple-touch-icon> and og:image automatically.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Mimi Studio",
  authors: [{ name: "Tasmim Shajahan" }],
  openGraph: {
    type: "website",
    siteName: "Mimi Studio",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

// Without this, mobile browsers lay the page out in a ~980px virtual viewport
// and then scale it down — the canvas never matches the real screen and every
// HUD panel renders at a fraction of its intended size. `maximumScale`/
// `userScalable` stop a double-tap or stray two-finger gesture from zooming
// the PAGE (the game does its own pinch-zoom, see StudioScene), and
// `viewportFit: cover` is what makes the env(safe-area-inset-*) padding the
// touch overlay already asks for actually resolve to non-zero on notched
// phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2b1a12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden overscroll-none">{children}</body>
    </html>
  );
}
