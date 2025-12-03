"use client";

import { Home, Scissors, Users } from "lucide-react";
import { FloatingDock } from "~/components/ui/floating-dock";

const navItems = [
  {
    title: "Home",
    icon: <Home className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
    href: "/",
  },
  {
    title: "Diarization",
    icon: <Users className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
    href: "/diarization",
  },
  {
    title: "Clipping",
    icon: <Scissors className="h-full w-full text-neutral-500 dark:text-neutral-300" />,
    href: "/clipping",
  },
];

export function FloatingNav() {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <FloatingDock items={navItems} />
    </div>
  );
}
