import "~/styles/globals.css";

import type { Metadata } from "next";
import { IBM_Plex_Sans, Syne } from "next/font/google";
import { redirect } from "next/navigation";
import { ReactScan } from "~/components/react-scan";
import { getSession } from "~/server/better-auth/server";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Voice Dataset Builder",
  description: "Build voice datasets for TTS training",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

// Syne - Bold, geometric display font for headings
const syne = Syne({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// IBM Plex Sans - Technical precision for body text
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/");
  }

  return (
    <html className={`${syne.variable} ${ibmPlexSans.variable}`} lang="en">
      <ReactScan />
      <body className="bg-background bg-studio-grid">
        <div className="pointer-events-none fixed inset-0 bg-gradient-mesh" />
        <TRPCReactProvider>
          <main className="flex min-h-screen flex-1 flex-col">{children}</main>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
