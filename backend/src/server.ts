import "dotenv/config";
import cors from "cors";
import express from "express";
import adminRoutes from "./routes/admin.js";
import dashboardRoutes from "./routes/dashboard.js";
import jobsRoutes from "./routes/jobs.js";

const app = express();
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  ...(process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN] : [])
]);

const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow non-browser tools and common local dev origins.
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
});

app.use(corsMiddleware);
app.options("*", corsMiddleware);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "job-ia-hunter-backend" });
});

app.use("/api", adminRoutes);
app.use("/api", jobsRoutes);
app.use("/api", dashboardRoutes);

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`job-ia-hunter backend listening on http://localhost:${port}`);
});
