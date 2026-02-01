import type { Doc } from "@/convex/_generated/dataModel";

export type OperationStatus = Doc<"agentControlOperations">["status"];

export type OperationStatusMeta = {
  label: string;
  className: string;
};

export const operationStatusMeta: Record<OperationStatus, OperationStatusMeta> = {
  queued: {
    label: "Queued",
    className: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  },
  sent: {
    label: "Sent",
    className: "text-blue-300 bg-blue-400/10 border-blue-400/20",
  },
  acked: {
    label: "Acked",
    className: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  },
  failed: {
    label: "Failed",
    className: "text-red-300 bg-red-400/10 border-red-400/20",
  },
  "timed-out": {
    label: "Timed out",
    className: "text-red-300 bg-red-400/10 border-red-400/20",
  },
};
