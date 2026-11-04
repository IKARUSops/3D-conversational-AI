import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import "./globals.css";

// FR-A9: proper Bengali web font. Self-hosted by next/font at build time.
const hind = Hind_Siliguri({
  weight: ["400", "500", "600", "700"],
  subsets: ["bengali", "latin"],
  display: "swap",
  variable: "--font-hind",
});
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ByteVoice Bangla: AI receptionist for dental clinics",
  description:
    "A voice-first AI receptionist that speaks natural Bangladeshi Bangla, 24/7. Demo with fake data.",
};

export const viewport: Viewport = {
  themeColor: "#0b1b3f",
};

/**
 * Applies the saved portal theme before paint (no flash). Only "light" or "dark" are accepted.
 * The landing page sets data-theme="dark" on its own wrapper, so this only matters in the portal.
 */
const themeScript = `try{var t=localStorage.getItem('bv-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="bn"
      className={`${hind.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
