import { createAppServer } from "../src/server.js";

const server = createAppServer();

export default function handler(req, res) {
  return server.emit("request", req, res);
}
