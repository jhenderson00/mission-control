import { httpRouter } from "convex/server";
import { ingest } from "./events";
import {
  listWorkingMemoryHttp,
  syncAgentMetadataHttp,
  updateAgentStatusHttp,
  upsertWorkingMemoryHttp,
} from "./agents";
import {
  listPendingHttp,
  markDeliveredHttp,
  recordAttemptHttp,
} from "./notifications";

const http = httpRouter();

http.route({
  path: "/events/ingest",
  method: "POST",
  handler: ingest,
});

http.route({
  path: "/agents/update-status",
  method: "POST",
  handler: updateAgentStatusHttp,
});

http.route({
  path: "/agents/sync",
  method: "POST",
  handler: syncAgentMetadataHttp,
});

http.route({
  path: "/agents/working-memory",
  method: "POST",
  handler: upsertWorkingMemoryHttp,
});

http.route({
  path: "/agents/working-memory",
  method: "GET",
  handler: listWorkingMemoryHttp,
});

http.route({
  path: "/notifications/pending",
  method: "POST",
  handler: listPendingHttp,
});

http.route({
  path: "/notifications/mark-delivered",
  method: "POST",
  handler: markDeliveredHttp,
});

http.route({
  path: "/notifications/attempt",
  method: "POST",
  handler: recordAttemptHttp,
});

export default http;
