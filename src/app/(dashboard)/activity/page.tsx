import { PageHeader } from "@/components/dashboard/page-header";
import { ActivityFeed } from "@/components/activity/activity-feed";

export default function ActivityPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity Feed"
        description="Real-time telemetry from agent actions and system events."
        badge="Live"
      />
      <ActivityFeed />
    </div>
  );
}
