import { httpRouter } from "convex/server";
import { ingest } from "./events";
import {
  listWorkingMemoryHttp,
  updateAgentStatusHttp,
  upsertWorkingMemoryHttp,
} from "./agents";

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
  path: "/agents/working-memory",
  method: "POST",
  handler: upsertWorkingMemoryHttp,
});

http.route({
  path: "/agents/working-memory",
  method: "GET",
  handler: listWorkingMemoryHttp,
});

export default http;
