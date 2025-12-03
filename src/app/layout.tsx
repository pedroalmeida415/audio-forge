import "~/styles/globals.css";

import type { Metadata } from "next";
import { IBM_Plex_Sans, Syne } from "next/font/google";

import { AppSidebar } from "~/components/app-sidebar";
import { SiteHeader } from "~/components/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
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

export default function RootLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  return (
    <html className={`${syne.variable} ${ibmPlexSans.variable}`} lang="en">
      <body className="bg-gradient-mesh bg-studio-grid">
        <TRPCReactProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <SiteHeader />
              <main className="flex flex-1 flex-col">{children}</main>
            </SidebarInset>
            {modal}
          </SidebarProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
