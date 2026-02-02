"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ConnectionBadge,
  ConnectionBanner,
} from "@/components/dashboard/connection-badge";

type PageHeaderProps = {
  title: string;
  description: string;
  badge?: string;
  titleAccessory?: ReactNode;
};

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function LiveClock() {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setTime(timeFormatter.format(new Date()));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!time) return null;

  return (
    <span className="text-xs text-muted-foreground tabular-nums">{time}</span>
  );
}

export function PageHeader({
  title,
  description,
  badge,
  titleAccessory,
}: PageHeaderProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight font-display">
              {title}
            </h1>
            {badge && (
              <Badge
                variant={badge === "Live" || badge === "Active" ? "default" : "secondary"}
                className={
                  badge === "Live"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : ""
                }
              >
                {badge === "Live" && (
                  <span className="relative flex h-2 w-2 mr-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                )}
                {badge}
              </Badge>
            )}
            {titleAccessory}
          </div>
          <p className="text-sm text-muted-foreground break-words">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBadge className="shrink-0" />
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Systems nominal</span>
          </div>
          <Separator orientation="vertical" className="h-4 hidden sm:block" />
          <LiveClock />
        </div>
      </div>
      <ConnectionBanner />
      <Separator />
    </div>
  );
}
