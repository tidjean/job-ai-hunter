import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import pdf from "pdf-parse";
import { UPLOADS_DIR } from "../lib/paths.js";
import { compactText, truncate } from "../lib/utils.js";

export async function extractCvText(filePath: string, mimeType: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();

  if (mimeType === "application/pdf" || extension === ".pdf") {
    const buffer = await fs.readFile(filePath);
    const result = await pdf(buffer);
    return truncate(compactText(result.text), 25000);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return truncate(compactText(result.value), 25000);
  }

  const text = await fs.readFile(filePath, "utf8");
  return truncate(compactText(text), 25000);
}

export function uploadsDestination(): string {
  return UPLOADS_DIR;
}
