import express from "express";
import { getDashboardPayload } from "../lib/db.js";

const router = express.Router();

router.get("/dashboard", (_request, response) => {
  response.json(getDashboardPayload());
});

export default router;
