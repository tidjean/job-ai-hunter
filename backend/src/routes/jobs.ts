import express from "express";
import { z } from "zod";
import { deleteJobById, getJobById, listJobs, updateJobMeta } from "../lib/db.js";
import { createCoverLetterForJob, refreshJobs, scoreSingleJob } from "../services/jobs.js";

const router = express.Router();

router.get("/jobs", (request, response) => {
  response.json(
    listJobs({
      status: request.query.status as string | undefined,
      decision: request.query.decision as string | undefined,
      source: request.query.source as string | undefined,
      search: request.query.search as string | undefined
    })
  );
});

router.post("/jobs/refresh", async (request, response) => {
  const result = await refreshJobs({
    forceRescore: Boolean(request.body?.forceRescore)
  });
  response.json(result);
});

router.post("/jobs/:id/score", async (request, response) => {
  const job = await scoreSingleJob(request.params.id);
  if (!job) {
    return response.status(404).json({ error: "Job not found" });
  }

  response.json(job);
});

router.post("/jobs/:id/cover-letter", async (request, response) => {
  const job = await createCoverLetterForJob(request.params.id);
  if (!job) {
    return response.status(404).json({ error: "Job not found" });
  }

  response.json(job);
});

router.patch("/jobs/:id", (request, response) => {
  const schema = z.object({
    applicationStatus: z.string().optional(),
    notes: z.string().optional()
  });
  const parsed = schema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }

  const job = updateJobMeta(request.params.id, parsed.data);
  if (!job) {
    return response.status(404).json({ error: "Job not found" });
  }

  response.json(job);
});

router.get("/jobs/:id", (request, response) => {
  const job = getJobById(request.params.id);
  if (!job) {
    return response.status(404).json({ error: "Job not found" });
  }

  response.json(job);
});

router.delete("/jobs/:id", (request, response) => {
  const deleted = deleteJobById(request.params.id);
  if (!deleted) {
    return response.status(404).json({ error: "Job not found" });
  }

  response.status(204).send();
});

export default router;
