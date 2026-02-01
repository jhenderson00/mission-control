import { httpRouter } from "convex/server";
import { ingest } from "./events";
import { updateAgentStatusHttp } from "./agents";

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

export default http;
