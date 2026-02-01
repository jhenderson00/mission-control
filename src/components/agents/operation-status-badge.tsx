import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  operationStatusMeta,
  type OperationStatus,
} from "@/lib/controls/operation-status";

type OperationStatusBadgeProps = {
  status: OperationStatus;
  className?: string;
};

export function OperationStatusBadge({
  status,
  className,
}: OperationStatusBadgeProps): React.ReactElement {
  const meta = operationStatusMeta[status];
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] uppercase", meta.className, className)}
      data-status={status}
    >
      {meta.label}
    </Badge>
  );
}
