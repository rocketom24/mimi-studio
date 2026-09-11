import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tasmim Portfolio",
  description: "Interactive portfolio of Tasmim Shajahan, Welcome to her world.",
  openGraph: {
    title: "Tasmim Portfolio",
    description: "Interactive portfolio of Tasmim Shajahan, Welcome to her world.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tasmim Portfolio",
    description: "Interactive portfolio of Tasmim Shajahan, Welcome to her world.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden overscroll-none">{children}</body>
    </html>
  );
}
