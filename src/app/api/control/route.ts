import { z } from "zod";
import {
  buildGatewayActions,
  ControlValidationError,
  executeGatewayActions,
  parseControlPayload,
  resolveSessionKeyForAgent,
  type ControlCommand,
  type ParsedControlPayload,
} from "../../../../bridge/src/control-commands";
import { GatewayClient } from "../../../../bridge/src/gateway-client";
import type { BridgeConfig } from "../../../../bridge/src/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ControlAck = {
  requestId: string;
  status: "accepted" | "rejected" | "error";
  error?: string;
};

const DEFAULTS = {
  gatewayUrl: "ws://127.0.0.1:18789",
  requestTimeoutMs: 10000,
};

const payloadSchema = z.record(z.unknown());

const createRequestId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
};

const resolveControlSecret = (): string | null =>
  process.env.BRIDGE_CONTROL_SECRET ?? process.env.BRIDGE_SECRET ?? null;

const resolveHeaderValue = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveControlHeader = (headers: Headers): string | null => {
  const authorization = resolveHeaderValue(headers.get("authorization"));
  if (authorization && authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return (
    resolveHeaderValue(headers.get("bridge_control_secret")) ??
    resolveHeaderValue(headers.get("bridge-control-secret"))
  );
};

const parseNumber = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const loadGatewayConfig = (): BridgeConfig => {
  const gatewayToken =
    process.env.OPENCLAW_GATEWAY_TOKEN ?? process.env.GATEWAY_TOKEN;
  if (!gatewayToken) {
    throw new Error(
      "Missing OPENCLAW_GATEWAY_TOKEN (or legacy GATEWAY_TOKEN)"
    );
  }

  return {
    gatewayUrl:
      process.env.OPENCLAW_GATEWAY_URL ??
      process.env.GATEWAY_URL ??
      DEFAULTS.gatewayUrl,
    gatewayToken,
    convexUrl: "unused",
    convexSecret: "unused",
    reconnectIntervalMs: 0,
    maxReconnectAttempts: 0,
    batchSize: 0,
    batchIntervalMs: 0,
    requestTimeoutMs: parseNumber(
      process.env.REQUEST_TIMEOUT_MS ?? null,
      DEFAULTS.requestTimeoutMs
    ),
    agentIdAliases: {},
  };
};

const createGatewayClient = async (): Promise<GatewayClient> => {
  const gateway = new GatewayClient(loadGatewayConfig());
  await gateway.connect();
  return gateway;
};

const executeForAgent = async (
  gateway: GatewayClient,
  agentId: string,
  command: ControlCommand,
  params: Record<string, unknown>
): Promise<void> => {
  const sessionKey = resolveSessionKeyForAgent(agentId, params);
  const actions = buildGatewayActions(command, params, sessionKey);
  await executeGatewayActions(gateway, actions);
};

const executePayload = async (
  gateway: GatewayClient,
  payload: ParsedControlPayload,
  requestId: string
): Promise<ControlAck> => {
  try {
    if (payload.agentIds) {
      await Promise.all(
        payload.agentIds.map((agentId) =>
          executeForAgent(gateway, agentId, payload.command, payload.params)
        )
      );
      return { requestId, status: "accepted" };
    }

    if (payload.agentId) {
      await executeForAgent(
        gateway,
        payload.agentId,
        payload.command,
        payload.params
      );
      return { requestId, status: "accepted" };
    }

    throw new ControlValidationError("Missing agentId");
  } catch (error) {
    if (error instanceof ControlValidationError) {
      return { requestId, status: "rejected", error: error.message };
    }

    const message = error instanceof Error ? error.message : "Gateway error";
    return { requestId, status: "error", error: message };
  }
};

export async function POST(req: Request): Promise<Response> {
  const secret = resolveControlSecret();
  if (!secret) {
    return new Response("Control endpoint disabled", { status: 503 });
  }

  const providedSecret = resolveControlHeader(req.headers);
  if (!providedSecret || providedSecret !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let parsedBody: z.infer<typeof payloadSchema>;
  try {
    const body = await req.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return new Response("Invalid control payload", { status: 400 });
    }
    parsedBody = parsed.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON payload";
    return new Response(message, { status: 400 });
  }

  let payload: ParsedControlPayload;
  try {
    payload = parseControlPayload(parsedBody);
  } catch (error) {
    if (error instanceof ControlValidationError) {
      return new Response(error.message, { status: 400 });
    }
    return new Response("Invalid control payload", { status: 400 });
  }

  const requestId = payload.requestId ?? createRequestId();

  let gateway: GatewayClient | null = null;
  try {
    gateway = await createGatewayClient();
    const ack = await executePayload(gateway, payload, requestId);
    return Response.json(ack, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway error";
    const ack: ControlAck = { requestId, status: "error", error: message };
    return Response.json(ack, { status: 200 });
  } finally {
    gateway?.close();
  }
}
