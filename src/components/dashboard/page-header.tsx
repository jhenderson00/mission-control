import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type PageHeaderProps = {
  title: string;
  description: string;
  badge?: string;
};

export function PageHeader({ title, description, badge }: PageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badge ? <Badge variant="secondary">{badge}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>Systems nominal</span>
        </div>
      </div>
      <Separator />
    </div>
  );
}
