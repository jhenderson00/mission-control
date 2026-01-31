"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  ListChecks,
  Share2,
  Users,
  Rocket,
} from "lucide-react";

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    description: "Fleet status & mission pulse",
    icon: LayoutDashboard,
  },
  {
    href: "/agents",
    label: "Agents",
    description: "Operators, roles, availability",
    icon: Users,
    badge: "12",
  },
  {
    href: "/tasks",
    label: "Tasks",
    description: "Queued missions & blockers",
    icon: ListChecks,
    badge: "27",
  },
  {
    href: "/graph",
    label: "Context Graph",
    description: "Decisions & reasoning chains",
    icon: Share2,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full flex-col border-r border-border/60 bg-card/20 px-6 py-8 backdrop-blur lg:flex">
      {/* Logo & brand */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 via-primary/10 to-transparent ring-1 ring-border/70 shadow-[0_0_24px_rgba(255,120,90,0.25)]">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold font-display">Clawdbot Mission Control</p>
          <p className="text-xs text-muted-foreground">AI org command center</p>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                isActive
                  ? "border-border/70 bg-card/60"
                  : "border-transparent hover:border-border/60 hover:bg-muted/40"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-medium truncate",
                      isActive ? "text-foreground" : "text-foreground/80"
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <Badge
                      variant={isActive ? "secondary" : "outline"}
                      className="ml-2 text-xs"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {item.description}
                </p>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Status card */}
      <div className="rounded-2xl border border-border/50 bg-background/50 p-4 text-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <p className="text-sm font-medium text-foreground">Live telemetry</p>
        </div>
        <p className="text-muted-foreground">
          Real-time updates from active missions
        </p>
        <Separator className="my-3" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Signal integrity</span>
            <span className="text-emerald-400 font-medium">98.4%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active agents</span>
            <span className="text-foreground font-medium">3</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
