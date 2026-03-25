import express from "express";
import { getDashboardPayload, getRecentProviderRuns } from "../lib/db.js";

const router = express.Router();

router.get("/dashboard", (_request, response) => {
  response.json(getDashboardPayload());
});

router.get("/providers/runs", (request, response) => {
  const limit = Number(request.query.limit ?? 100);
  response.json(getRecentProviderRuns(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100));
});

export default router;
