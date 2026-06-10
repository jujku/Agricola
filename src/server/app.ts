import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "agricola-lite",
    });
  });

  const distPath = resolve(process.cwd(), "dist");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method === "GET" && req.accepts("html")) {
        res.sendFile(resolve(distPath, "index.html"));
        return;
      }
      next();
    });
  }

  return app;
}
