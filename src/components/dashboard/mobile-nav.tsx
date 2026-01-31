"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ListChecks,
  Share2,
  Users,
  Menu,
  X,
  Rocket,
  Activity,
} from "lucide-react";

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/agents",
    label: "Agents",
    icon: Users,
    badge: "12",
  },
  {
    href: "/activity",
    label: "Activity",
    icon: Activity,
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: ListChecks,
    badge: "27",
  },
  {
    href: "/graph",
    label: "Graph",
    icon: Share2,
  },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile header */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-border/60">
            <Rocket className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold font-display">Cydni - Mission Control</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen((open) => !open)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile menu overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile menu */}
      <nav
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 transform border-r border-border/60 bg-background/95 p-6 backdrop-blur transition-transform duration-200 ease-in-out lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-border/60">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold font-display">Cydni - Mission Control</p>
            <p className="text-xs text-muted-foreground">AI command center</p>
          </div>
        </div>

        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.badge && (
                  <Badge variant="outline" className="text-xs">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="rounded-xl border border-border/50 bg-card/40 p-4 text-xs">
            <p className="font-medium text-foreground">Telemetry uplink</p>
            <p className="mt-1 text-muted-foreground">
              Streaming updates active
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-muted-foreground">Signal</span>
              <span className="text-emerald-400">98.4%</span>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
