const WebSocket = require("ws");
require("dotenv").config();

const token = process.env.OPENCLAW_GATEWAY_TOKEN;
console.log("Token:", token?.slice(0, 10) + "...");

const ws = new WebSocket("ws://127.0.0.1:18789");

ws.on("open", () => {
  console.log("Connected to gateway");
  const connectMsg = {
    type: "req",
    id: "1",
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "gateway-client",
        version: "1.0.0",
        platform: "node",
        mode: "backend",
      },
      role: "operator",
      scopes: ["operator.read"],
      auth: { token },
    },
  };
  console.log("Sending connect message...");
  ws.send(JSON.stringify(connectMsg));
});

ws.on("message", (data) => {
  console.log("Response:", data.toString());
  ws.close();
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log("Timeout");
  process.exit(1);
}, 5000);
