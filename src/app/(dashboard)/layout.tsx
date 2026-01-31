import type { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <Sidebar />
        <main className="min-h-screen px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
