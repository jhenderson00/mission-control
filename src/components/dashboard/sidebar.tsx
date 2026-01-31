import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  ListChecks,
  Share2,
  Users,
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
    description: "Signals, links, dependencies",
    icon: Share2,
  },
];

export function Sidebar() {
  return (
    <aside className="flex h-full flex-col border-r border-border/60 bg-card/30 px-6 py-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-sm font-semibold text-primary">
          MC
        </div>
        <div>
          <p className="text-sm font-semibold">Mission Control</p>
          <p className="text-xs text-muted-foreground">AI Org Command Center</p>
        </div>
      </div>
      <Separator className="my-6" />
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-border/70 hover:bg-muted/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground transition group-hover:bg-primary/15 group-hover:text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  {item.badge ? <Badge variant="outline">{item.badge}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="rounded-2xl border border-border/60 bg-background/60 p-4 text-xs text-muted-foreground">
        <p className="text-sm font-medium text-foreground">Live telemetry</p>
        <p className="mt-1">Streaming updates from active missions.</p>
        <div className="mt-4 flex items-center justify-between text-[11px]">
          <span>Signal integrity</span>
          <span className="text-emerald-300">98.4%</span>
        </div>
      </div>
    </aside>
  );
}
