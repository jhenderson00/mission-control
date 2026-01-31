/**
 * Mock data for development
 * This will be replaced with real Convex data when the backend is connected
 */

// Types matching our Convex schema
export type AgentType = "coordinator" | "planner" | "executor" | "critic" | "specialist";
export type AgentStatus = "idle" | "active" | "blocked" | "failed";

export interface MockAgent {
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

// Mock agents data
export const mockAgents: MockAgent[] = [
  {
    _id: "agent_1",
    name: "Claude Code #47",
    type: "executor",
    model: "claude-sonnet-4",
    status: "active",
    currentTask: { title: "PR review for tezadmin.web" },
    startedAt: Date.now() - 12 * 60 * 1000,
    host: "tank",
  },
  {
    _id: "agent_2",
    name: "Analyst #12",
    type: "planner",
    model: "claude-sonnet-4",
    status: "active",
    currentTask: { title: "CTO briefing synthesis" },
    startedAt: Date.now() - 3 * 60 * 1000,
    host: "local",
  },
  {
    _id: "agent_3",
    name: "Critic #12",
    type: "critic",
    model: "claude-sonnet-4",
    status: "active",
    currentTask: { title: "Review PR #47 output" },
    startedAt: Date.now() - 1 * 60 * 1000,
    host: "local",
  },
  {
    _id: "agent_4",
    name: "Cydni",
    type: "coordinator",
    model: "claude-opus-4",
    status: "idle",
    host: "local",
  },
  {
    _id: "agent_5",
    name: "Writer #3",
    type: "specialist",
    model: "claude-sonnet-4",
    status: "blocked",
    currentTask: { title: "Draft response to Gartner inquiry" },
    startedAt: Date.now() - 8 * 60 * 1000,
    host: "local",
  },
];

// Extended mock for agents page
export const allMockAgents: MockAgent[] = [
  ...mockAgents,
  {
    _id: "agent_6",
    name: "Researcher #8",
    type: "specialist",
    model: "claude-sonnet-4",
    status: "idle",
    host: "local",
  },
  {
    _id: "agent_7",
    name: "Code Review #2",
    type: "critic",
    model: "claude-sonnet-4",
    status: "idle",
    host: "tank",
  },
];
