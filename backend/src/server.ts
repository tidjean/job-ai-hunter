import "dotenv/config";
import cors from "cors";
import express from "express";
import adminRoutes from "./routes/admin.js";
import dashboardRoutes from "./routes/dashboard.js";
import jobsRoutes from "./routes/jobs.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173"
  })
);
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
