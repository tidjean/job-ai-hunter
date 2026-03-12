import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { getConfig, getLatestCv, getProfile, saveConfig, saveCvDocument, saveProfile } from "../lib/db.js";
import { uploadsDestination, extractCvText } from "../services/cv.js";
import type { AppConfig, CandidateProfile } from "../types/models.js";

const router = express.Router();

const upload = multer({
  dest: uploadsDestination(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

const profileSchema: z.ZodType<CandidateProfile> = z.object({
  fullName: z.string(),
  headline: z.string(),
  email: z.string(),
  location: z.string(),
  timezone: z.string(),
  yearsExperience: z.number().min(0),
  remoteOnly: z.boolean(),
  minMonthlySalaryUsd: z.number().min(0),
  preferredEmployment: z.array(z.enum(["employee", "contract"])),
  summary: z.string(),
  skills: z.array(z.string()),
  desiredKeywords: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
  preferredIndustries: z.array(z.string()),
  languages: z.array(z.string())
});

const configSchema: z.ZodType<AppConfig> = z.object({
  aiModel: z.string(),
  maxDailyAiBudgetUsd: z.number().min(0),
  autoScore: z.boolean(),
  autoCompareCv: z.boolean(),
  autoGenerateCoverLetters: z.boolean(),
  coverLetterThreshold: z.number().min(0).max(100),
  applyThreshold: z.number().min(0).max(100),
  reviewThreshold: z.number().min(0).max(100),
  searchPlanQueriesPerRefresh: z.number().min(1).max(10),
  sources: z.record(
    z.object({
      enabled: z.boolean(),
      label: z.string(),
      query: z.string(),
      limit: z.number().min(1).max(100)
    })
  )
});

router.get("/admin/state", (_request, response) => {
  response.json({
    profile: getProfile(),
    config: getConfig(),
    cv: getLatestCv()
  });
});

router.put("/admin/profile", (request, response) => {
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }

  response.json(saveProfile(parsed.data));
});

router.put("/admin/config", (request, response) => {
  const parsed = configSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }

  response.json(saveConfig(parsed.data));
});

router.post("/admin/cv", upload.single("cv"), async (request, response) => {
  if (!request.file) {
    return response.status(400).json({ error: "CV file is required" });
  }

  const uploadedName = `${Date.now()}-${request.file.originalname.replace(/\s+/g, "-")}`;
  const destination = path.join(uploadsDestination(), uploadedName);
  await fs.rename(request.file.path, destination);

  const extractedText = await extractCvText(destination, request.file.mimetype);
  const document = saveCvDocument({
    filename: request.file.originalname,
    mimeType: request.file.mimetype,
    storagePath: destination,
    extractedText
  });

  response.json(document);
});

export default router;
