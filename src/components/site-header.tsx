"use client";

import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";

const routeLabels: Record<string, string> = {
  "": "Home",
  diarization: "Diarization",
  clipping: "Clipping Workspace",
  projects: "Projects",
  settings: "Settings",
};

export function SiteHeader() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const breadcrumbItems = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const label = routeLabels[segment] ?? segment;
    const isLast = index === segments.length - 1;

    return { href, label, isLast, segment };
  });

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-border/30 border-b bg-background/80 backdrop-blur-xl transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-3 px-4">
        <SidebarTrigger className="-ml-1 text-muted-foreground transition-colors hover:text-foreground" />
        <Separator className="mr-2 h-5 bg-border/50" orientation="vertical" />
        <Breadcrumb>
          <BreadcrumbList className="text-sm">
            {breadcrumbItems.length === 0 ? (
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium text-foreground">
                  Home
                </BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              breadcrumbItems.map((item, index) => (
                <BreadcrumbItem
                  className={
                    index < breadcrumbItems.length - 1 ? "hidden md:block" : ""
                  }
                  key={item.segment}
                >
                  {item.isLast ? (
                    <BreadcrumbPage className="font-medium text-foreground">
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <>
                      <BreadcrumbLink
                        className="text-muted-foreground transition-colors hover:text-primary"
                        href={item.href}
                      >
                        {item.label}
                      </BreadcrumbLink>
                      <BreadcrumbSeparator className="hidden text-border md:block" />
                    </>
                  )}
                </BreadcrumbItem>
              ))
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
