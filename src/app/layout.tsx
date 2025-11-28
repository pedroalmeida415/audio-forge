import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { GlobalNav } from "~/components/nav/global-nav";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Voice Dataset Builder",
  description: "Build voice datasets for TTS training",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  return (
    <html className={`${geist.variable}`} lang="en">
      <body>
        <TRPCReactProvider>
          <GlobalNav />
          <main>{children}</main>
          {modal}
        </TRPCReactProvider>
      </body>
    </html>
  );
}
