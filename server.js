// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var app = express();
app.use(express.json({ limit: "50mb" }));
var PORT = Number(process.env.PORT) || 3e3;
var server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`CT HUB server listening on port ${PORT}`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`Port ${PORT} is already in use.`);
  } else {
    console.error("Server error:", err);
  }
});
var distDir = path.join(__dirname, "dist");
var distIndex = path.join(distDir, "index.html");
var isDev = process.env.NODE_ENV !== "production";
if (isDev) {
  try {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } catch (e) {
    console.warn("Vite dev server failed to start in middleware mode:", e);
  }
} else {
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (req, res) => {
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else {
        res.status(404).send("App built files missing");
      }
    });
  }
}
