type ControlCommand =
  | "pause"
  | "resume"
  | "redirect"
  | "kill"
  | "restart"
  | "priority";

type ParsedControlPayload = {
  agentId?: string;
  agentIds?: string[];
  command: ControlCommand;
  params: Record<string, unknown>;
  requestId?: string;
  requestedBy?: string;
};

type GatewayAction =
  | { type: "send"; sessionKey: string; message: string }
  | { type: "call"; method: string; params: Record<string, unknown> };

type GatewayExecutor = {
  send: (sessionKey: string, message: string) => Promise<unknown>;
  call: (method: string, params?: unknown) => Promise<unknown>;
};

class ControlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlValidationError";
  }
}

function resolveString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolveTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCommand(command: string): ControlCommand | null {
  switch (command) {
    case "pause":
    case "resume":
    case "redirect":
    case "kill":
    case "restart":
    case "priority":
      return command;
    case "agent.pause":
      return "pause";
    case "agent.resume":
      return "resume";
    case "agent.redirect":
      return "redirect";
    case "agent.kill":
      return "kill";
    case "agent.restart":
      return "restart";
    case "agent.priority.override":
    case "agent.priority":
      return "priority";
    default:
      return null;
  }
}

function normalizeAgentIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const agentIds = value
    .map((id) => resolveTrimmedString(id))
    .filter((id): id is string => Boolean(id));
  return agentIds.length === value.length ? agentIds : null;
}

function parseControlPayload(payload: unknown): ParsedControlPayload {
  if (!isRecord(payload)) {
    throw new ControlValidationError("Invalid control payload");
  }

  const rawCommand = resolveString(payload.command) ?? resolveString(payload.method);
  const rawParams = payload.params;
  if (rawParams !== undefined && !isRecord(rawParams)) {
    throw new ControlValidationError("Invalid params");
  }
  const params = isRecord(rawParams) ? rawParams : {};
  const requestedBy = resolveString(payload.requestedBy);
  const requestId =
    resolveString(payload.requestId) ?? resolveString(params.requestId);

  if (!rawCommand) {
    throw new ControlValidationError("Invalid control command");
  }

  if (rawCommand === "agents.bulk") {
    const nestedCommandRaw = resolveString(params.command);
    const nestedCommand = nestedCommandRaw
      ? normalizeCommand(nestedCommandRaw)
      : null;
    const agentIds = normalizeAgentIds(params.agentIds);
    const nestedParams = isRecord(params.params) ? params.params : {};
    const nestedRequestId = resolveString(params.requestId) ?? requestId;

    if (!nestedCommand) {
      throw new ControlValidationError("Invalid bulk command");
    }
    if (!agentIds) {
      throw new ControlValidationError("Invalid bulk agentIds");
    }

    return {
      agentIds,
      command: nestedCommand,
      params: nestedParams,
      requestId: nestedRequestId ?? undefined,
      requestedBy: requestedBy ?? undefined,
    };
  }

  const command = normalizeCommand(rawCommand);
  if (!command) {
    throw new ControlValidationError("Unsupported control command");
  }

  const agentIds = normalizeAgentIds(payload.agentIds ?? params.agentIds);
  if (agentIds) {
    return {
      agentIds,
      command,
      params,
      requestId: requestId ?? undefined,
      requestedBy: requestedBy ?? undefined,
    };
  }

  const agentId =
    resolveTrimmedString(payload.agentId) ?? resolveTrimmedString(params.agentId);

  if (!agentId) {
    throw new ControlValidationError("Missing agentId");
  }

  return {
    agentId,
    command,
    params,
    requestId: requestId ?? undefined,
    requestedBy: requestedBy ?? undefined,
  };
}

function resolveSessionKeyForAgent(
  agentId: string,
  params: Record<string, unknown>
): string {
  return resolveString(params.sessionKey) ?? `agent:${agentId}:main`;
}

function buildGatewayActions(
  command: ControlCommand,
  params: Record<string, unknown>,
  sessionKey: string
): GatewayAction[] {
  switch (command) {
    case "pause":
      return [{ type: "send", sessionKey, message: "/stop" }];
    case "resume": {
      const text =
        resolveString(params.text) ??
        resolveString(params.message) ??
        "Resume work";
      return [{ type: "call", method: "cron.wake", params: { text, mode: "now" } }];
    }
    case "redirect": {
      const payload =
        params.taskPayload ?? params.text ?? params.message ?? params.task;
      if (payload !== undefined) {
        const message =
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload) ?? String(payload);
        return [{ type: "send", sessionKey, message }];
      }

      const taskId = resolveString(params.taskId);
      if (!taskId) {
        throw new ControlValidationError("Missing task payload");
      }
      const priority =
        resolveString(params.priority) ??
        (typeof params.priority === "number" ? String(params.priority) : null);
      const messagePayload = priority ? { taskId, priority } : { taskId };
      return [
        {
          type: "send",
          sessionKey,
          message: JSON.stringify(messagePayload),
        },
      ];
    }
    case "kill":
      return [
        { type: "send", sessionKey, message: "/stop" },
        { type: "send", sessionKey, message: "/reset" },
      ];
    case "restart":
      return [{ type: "send", sessionKey, message: "/new" }];
    case "priority": {
      const priority =
        resolveString(params.priority) ??
        (typeof params.priority === "number" ? String(params.priority) : null);
      if (!priority) {
        throw new ControlValidationError("Missing priority");
      }
      return [
        { type: "send", sessionKey, message: `/queue priority:${priority}` },
      ];
    }
  }
}

async function executeGatewayActions(
  gateway: GatewayExecutor,
  actions: GatewayAction[]
): Promise<void> {
  for (const action of actions) {
    if (action.type === "send") {
      await gateway.send(action.sessionKey, action.message);
    } else {
      await gateway.call(action.method, action.params);
    }
  }
}

export type {
  ControlCommand,
  ParsedControlPayload,
  GatewayAction,
  GatewayExecutor,
};
export {
  ControlValidationError,
  normalizeCommand,
  parseControlPayload,
  resolveSessionKeyForAgent,
  buildGatewayActions,
  executeGatewayActions,
};
