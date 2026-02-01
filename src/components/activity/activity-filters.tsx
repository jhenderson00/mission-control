"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActivityFiltersProps = {
  agentIds: string[];
  eventTypes: string[];
  selectedAgentId: string;
  selectedType: string;
  onAgentChange: (agentId: string) => void;
  onTypeChange: (eventType: string) => void;
  isLoading?: boolean;
};

function formatEventType(eventType: string): string {
  return eventType
    .replace(/[_\.]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAgentLabel(agentId: string): string {
  if (agentId.length <= 12) return agentId;
  return `${agentId.slice(0, 6)}…${agentId.slice(-4)}`;
}

function FilterButton({
  label,
  isActive,
  onClick,
  disabled,
  title,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={isActive ? "secondary" : "outline"}
      aria-pressed={isActive}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 px-3 text-xs font-semibold uppercase tracking-wide",
        isActive ? "border-transparent" : "border-border/60"
      )}
    >
      <span className="max-w-[160px] truncate">{label}</span>
    </Button>
  );
}

export function ActivityFilters({
  agentIds,
  eventTypes,
  selectedAgentId,
  selectedType,
  onAgentChange,
  onTypeChange,
  isLoading,
}: ActivityFiltersProps): React.ReactElement {
  const sortedAgents = [...agentIds].sort((a, b) => a.localeCompare(b));
  const sortedTypes = [...eventTypes].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Filter by agent
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterButton
            label="All agents"
            isActive={selectedAgentId === "all"}
            onClick={() => onAgentChange("all")}
            disabled={isLoading}
          />
          {sortedAgents.map((agentId) => (
            <FilterButton
              key={agentId}
              label={formatAgentLabel(agentId)}
              title={agentId}
              isActive={selectedAgentId === agentId}
              onClick={() => onAgentChange(agentId)}
              disabled={isLoading}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Filter by event type
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterButton
            label="All types"
            isActive={selectedType === "all"}
            onClick={() => onTypeChange("all")}
            disabled={isLoading}
          />
          {sortedTypes.map((type) => (
            <FilterButton
              key={type}
              label={formatEventType(type)}
              isActive={selectedType === type}
              onClick={() => onTypeChange(type)}
              disabled={isLoading}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
