/**
 * Mock data for development
 * This will be replaced with real Convex data when the backend is connected
 */

import type { AgentSummary } from "@/lib/agent-types";

// Mock agents data
export const mockAgents: AgentSummary[] = [
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
export const allMockAgents: AgentSummary[] = [
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
