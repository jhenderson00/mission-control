export type AgentType = "coordinator" | "planner" | "executor" | "critic" | "specialist";
export type AgentStatus = "idle" | "active" | "blocked" | "failed";

export interface AgentSummary {
  _id: string;
  name: string;
  type: AgentType;
  model: string;
  status: AgentStatus;
  currentTask?: {
    title: string;
  } | null;
  startedAt?: number;
  host: string;
}
