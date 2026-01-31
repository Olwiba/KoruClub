// Health check HTTP server
import { createServer } from "http";

let isClientReady = false;

export const setClientReady = (ready: boolean) => {
  isClientReady = ready;
};

export const getClientReady = () => isClientReady;

export const startHealthServer = (port = 3000) => {
  const healthServer = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const status = isClientReady ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: isClientReady ? "ok" : "starting", ready: isClientReady }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  healthServer.listen(port, () => console.log(`Health server on :${port}`));
  return healthServer;
};
