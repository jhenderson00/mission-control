import { httpRouter } from "convex/server";
import { ingest } from "./events";

const http = httpRouter();

http.route({
  path: "/events/ingest",
  method: "POST",
  handler: ingest,
});

export default http;
