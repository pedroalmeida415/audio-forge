"use client";

import {
  AudioWaveform,
  LifeBuoy,
  Scissors,
  Send,
  Settings2,
  Users,
} from "lucide-react";
import type * as React from "react";

import { NavMain } from "~/components/nav-main";
import { NavSecondary } from "~/components/nav-secondary";
import { NavUser } from "~/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

const data = {
  user: {
    name: "User",
    email: "user@example.com",
    avatar: "/avatars/default.jpg",
  },
  navMain: [
    {
      title: "Diarization",
      url: "/diarization",
      icon: Users,
      isActive: true,
      items: [
        {
          title: "Upload Audio",
          url: "/diarization",
        },
        {
          title: "Processing Jobs",
          url: "/diarization",
        },
      ],
    },
    {
      title: "Clipping",
      url: "/clipping",
      icon: Scissors,
      items: [
        {
          title: "Workspace",
          url: "/clipping",
        },
      ],
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
      items: [
        {
          title: "General",
          url: "/settings",
        },
        {
          title: "Storage",
          url: "/settings/storage",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Support",
      url: "#",
      icon: LifeBuoy,
    },
    {
      title: "Feedback",
      url: "#",
      icon: Send,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="group/logo" size="lg">
              <a className="relative" href="/">
                {/* Logo container with glow effect */}
                <div className="relative flex aspect-square size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_0_20px_rgba(245,166,35,0.3)] transition-all duration-300 group-hover/logo:shadow-[0_0_30px_rgba(245,166,35,0.5)]">
                  <AudioWaveform className="size-5" />
                  {/* Subtle pulse ring */}
                  <div
                    className="absolute inset-0 animate-ping rounded-lg bg-primary/20 opacity-0 group-hover/logo:opacity-100"
                    style={{ animationDuration: "2s" }}
                  />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-bold font-display text-base tracking-tight">
                    Voice Dataset
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    Builder
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <NavMain items={data.navMain} />
        <NavSecondary className="mt-auto" items={data.navSecondary} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
