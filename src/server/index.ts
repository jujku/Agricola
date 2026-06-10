import { createServer } from "node:http";
import { createApp } from "./app";
import { attachSocketServer } from "./network/socketServer";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
const httpServer = createServer(app);

attachSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`Agricola-lite server listening on http://localhost:${port}`);
});
