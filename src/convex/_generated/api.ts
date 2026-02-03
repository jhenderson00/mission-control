/**
 * Stub file for Convex API types
 *
 * This will be replaced when you run `npx convex dev` with a configured project.
 */

import { makeFunctionReference } from "convex/server";

export const api = {
  agents: {
    list: makeFunctionReference<"query">("agents:list"),
    get: makeFunctionReference<"query">("agents:get"),
    listWithTasks: makeFunctionReference<"query">("agents:listWithTasks"),
    statusCounts: makeFunctionReference<"query">("agents:statusCounts"),
    presenceCounts: makeFunctionReference<"query">("agents:presenceCounts"),
    listStatus: makeFunctionReference<"query">("agents:listStatus"),
    create: makeFunctionReference<"mutation">("agents:create"),
    updateStatus: makeFunctionReference<"mutation">("agents:updateStatus"),
    remove: makeFunctionReference<"mutation">("agents:remove"),
  },
  notifications: {
    listPending: makeFunctionReference<"query">("notifications:listPending"),
    markDelivered: makeFunctionReference<"mutation">("notifications:markDelivered"),
    recordAttempt: makeFunctionReference<"mutation">("notifications:recordAttempt"),
  },
  tasks: {
    list: makeFunctionReference<"query">("tasks:list"),
    get: makeFunctionReference<"query">("tasks:get"),
    statusCounts: makeFunctionReference<"query">("tasks:statusCounts"),
    listWithAgents: makeFunctionReference<"query">("tasks:listWithAgents"),
    create: makeFunctionReference<"mutation">("tasks:create"),
    updateStatus: makeFunctionReference<"mutation">("tasks:updateStatus"),
    assignAgents: makeFunctionReference<"mutation">("tasks:assignAgents"),
  },
  events: {
    listByAgent: makeFunctionReference<"query">("events:listByAgent"),
    listRecent: makeFunctionReference<"query">("events:listRecent"),
    listDiagnostics: makeFunctionReference<"query">("events:listDiagnostics"),
    countsByType: makeFunctionReference<"query">("events:countsByType"),
  },
  audit: {
    listByAgent: makeFunctionReference<"query">("audit:listByAgent"),
    listRecent: makeFunctionReference<"query">("audit:listRecent"),
  },
  conversations: {
    listBySession: makeFunctionReference<"query">("conversations:listBySession"),
  },
  decisions: {
    listByAgent: makeFunctionReference<"query">("decisions:listByAgent"),
    listByTask: makeFunctionReference<"query">("decisions:listByTask"),
    listRecent: makeFunctionReference<"query">("decisions:listRecent"),
    getWithChain: makeFunctionReference<"query">("decisions:getWithChain"),
    pendingCount: makeFunctionReference<"query">("decisions:pendingCount"),
    record: makeFunctionReference<"mutation">("decisions:record"),
    resolve: makeFunctionReference<"mutation">("decisions:resolve"),
  },
  controls: {
    dispatch: makeFunctionReference<"action">("controls:dispatch"),
    bulkDispatch: makeFunctionReference<"action">("controls:bulkDispatch"),
    activeByAgent: makeFunctionReference<"query">("controls:activeByAgent"),
    operationsByAgent: makeFunctionReference<"query">("controls:operationsByAgent"),
    listRecentByOperator: makeFunctionReference<"query">("controls:listRecentByOperator"),
    recentByOperator: makeFunctionReference<"query">("controls:recentByOperator"),
    listByBulkId: makeFunctionReference<"query">("controls:listByBulkId"),
    bulkById: makeFunctionReference<"query">("controls:bulkById"),
    auditByAgent: makeFunctionReference<"query">("controls:auditByAgent"),
    auditByOperator: makeFunctionReference<"query">("controls:auditByOperator"),
  },
  contextGraph: {
    getGraph: makeFunctionReference<"query">("contextGraph:getGraph"),
  },
};

export const internal = {};
