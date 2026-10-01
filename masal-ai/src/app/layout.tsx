import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { NewLeadButton } from "@/components/intake-dialog";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: `${APP_TAGLINE}: see which leads matter, what they want and what to do next.`,
};

export const viewport: Viewport = {
  themeColor: "#14213D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable}>
      <body className={`${plex.className} min-h-dvh bg-[#F3F5F8] text-[#14213D] antialiased`}>
        <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md text-[17px] font-bold tracking-tight text-[#14213D] outline-none focus-visible:ring-2 focus-visible:ring-[#14213D]"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="9" fill="none" stroke="#E3E8EF" strokeWidth="3" />
                <circle cx="12" cy="12" r="9" fill="none" stroke="#C8233C" strokeWidth="3" strokeLinecap="round" strokeDasharray="56.5" strokeDashoffset="14" transform="rotate(-90 12 12)" />
              </svg>
              {APP_NAME}
            </Link>
            <NewLeadButton size="sm" />
          </div>
        </header>
        <main>{children}</main>
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
