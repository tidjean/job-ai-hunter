import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { compactText, normalizeWhitespace } from "../lib/utils.js";
import type { ProviderJob, ProviderResult } from "../types/models.js";

const rssParser = new Parser();
const engineeringRolePattern =
  /(full.?stack|full stack|software|web|application|frontend|front-end|backend|back-end|node|typescript|javascript|react|vue|angular|php|python|api|platform|engineer|developer)/i;
const seniorRolePattern = /(senior|staff|lead|principal|architect)/i;
function matchesEngineeringQuery(job: Pick<ProviderJob, "title" | "description" | "company" | "location" | "remoteType">, queryTokens: string[]) {
  const haystack = compactText(job.title, job.description, job.company, job.location, job.remoteType).toLowerCase();
  const hasEngineeringSignal = engineeringRolePattern.test(haystack);
  const hasRemoteSignal = /remote|distributed|anywhere|global|work from home/i.test(haystack);
  const queryMatch = !queryTokens.length || queryTokens.some((token) => haystack.includes(token));
  const wantsSeniority = queryTokens.includes("senior");
  const seniorityMatch = !wantsSeniority || seniorRolePattern.test(haystack);

  return hasEngineeringSignal && hasRemoteSignal && queryMatch && seniorityMatch;
}

async function fetchHtmlWithPlaywright(url: string): Promise<string> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36"
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_000);
    return await page.content();
  } finally {
    await browser.close();
  }
}

async function parseIndeedJobsWithPlaywright(
  providerId: "indeedCom" | "indeedFr",
  domain: string,
  query: string,
  limit: number,
  url: string
): Promise<ProviderJob[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36"
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_500);

    const cards = await page
      .locator("a[data-jk], div.job_seen_beacon, li div[data-testid='slider_item']")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const root = node as HTMLElement;
          const anchor = root.querySelector("a");
          const text = root.textContent ?? "";
          return {
            sourceJobId: root.getAttribute("data-jk") ?? anchor?.getAttribute("href") ?? text,
            title:
              root.querySelector("h2 a span, .jobTitle span, [data-testid='job-title']")?.textContent ?? "",
            company:
              root.querySelector("[data-testid='company-name'], .companyName")?.textContent ?? "",
            location:
              root.querySelector("[data-testid='text-location'], .companyLocation")?.textContent ?? "",
            salaryText: root.querySelector(".salary-snippet-container")?.textContent ?? null,
            url: anchor?.getAttribute("href") ?? "",
            description: text
          };
        })
      );

    return cards
      .map((card) =>
        normalizeJob(providerId, {
          sourceJobId: card.sourceJobId,
          title: card.title,
          company: card.company,
          location: card.location,
          remoteType: pickRemoteType(card.description),
          employmentType: null,
          salaryText: card.salaryText,
          url: card.url.startsWith("http") ? card.url : `https://${domain}${card.url}`,
          description: card.description,
          postedAt: null,
          queryText: query,
          rawPayload: card
        })
      )
      .filter((job) => job.title && job.url)
      .slice(0, limit);
  } finally {
    await browser.close();
  }
}

async function parseJobsDbWithPlaywright(
  providerId: "jobsdbTh" | "jobsdbHk",
  domain: string,
  query: string,
  limit: number,
  url: string
): Promise<ProviderJob[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36"
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_500);

    const cards = await page
      .locator("article, [data-automation='normalJob']")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const root = node as HTMLElement;
          const anchor = root.querySelector("a[data-automation='jobTitle'], a");
          return {
            sourceJobId: anchor?.getAttribute("href") ?? root.textContent ?? "",
            title: anchor?.textContent ?? "",
            company: root.querySelector("[data-automation='jobCompany']")?.textContent ?? "",
            location: root.querySelector("[data-automation='jobLocation']")?.textContent ?? "",
            salaryText: root.querySelector("[data-automation='jobSalary']")?.textContent ?? null,
            url: anchor?.getAttribute("href") ?? "",
            description: root.textContent ?? ""
          };
        })
      );

    return cards
      .map((card) =>
        normalizeJob(providerId, {
          sourceJobId: card.sourceJobId,
          title: card.title,
          company: card.company,
          location: card.location,
          employmentType: null,
          remoteType: pickRemoteType(card.description),
          salaryText: card.salaryText,
          url: card.url.startsWith("http") ? card.url : `https://${domain}${card.url}`,
          description: card.description,
          postedAt: null,
          queryText: query,
          rawPayload: card
        })
      )
      .filter((job) => job.title && job.url)
      .slice(0, limit);
  } finally {
    await browser.close();
  }
}

function pickRemoteType(text: string): string | null {
  const value = text.toLowerCase();

  if (/(hybrid)/.test(value)) {
    return "Hybrid";
  }

  if (/(remote|teletravail|télétravail|distributed|work from home)/.test(value)) {
    return "Remote";
  }

  if (/(on[- ]?site|office)/.test(value)) {
    return "On-site";
  }

  return null;
}

function extractSalaryInfo(text: string): { salaryText?: string; salaryMinUsd?: number; salaryMaxUsd?: number } {
  const cleaned = normalizeWhitespace(text);
  const rangeMatch =
    cleaned.match(/(USD|US\$|\$|€|EUR|£|HK\$|THB|฿)\s?([\d,.]+)\s?(?:-|to)\s?(?:USD|US\$|\$|€|EUR|£|HK\$|THB|฿)?\s?([\d,.]+)/i) ??
    cleaned.match(/([\d,.]+)\s?(?:-|to)\s?([\d,.]+)\s?(USD|US\$|\$|€|EUR|£|HK\$|THB|฿)/i);

  const singleMatch =
    cleaned.match(/(USD|US\$|\$|€|EUR|£|HK\$|THB|฿)\s?([\d,.]+)/i) ??
    cleaned.match(/([\d,.]+)\s?(USD|US\$|\$|€|EUR|£|HK\$|THB|฿)/i);

  const convert = (currency: string, amount: number): number => {
    const symbol = currency.toUpperCase();
    if (symbol.includes("€") || symbol.includes("EUR")) return amount * 1.08;
    if (symbol.includes("£")) return amount * 1.28;
    if (symbol.includes("HK")) return amount * 0.128;
    if (symbol.includes("THB") || symbol.includes("฿")) return amount * 0.029;
    return amount;
  };

  const annualFactor = /year|annual|annum/i.test(cleaned) ? 1 / 12 : 1;

  if (rangeMatch) {
    const currency = rangeMatch[1] && isNaN(Number(rangeMatch[1].replace(/,/g, ""))) ? rangeMatch[1] : rangeMatch[3];
    const first = Number((rangeMatch[2] || rangeMatch[1]).replace(/,/g, ""));
    const second = Number(rangeMatch[3].replace(/,/g, ""));
    if (!Number.isNaN(first) && !Number.isNaN(second) && currency) {
      return {
        salaryText: cleaned,
        salaryMinUsd: Math.round(convert(currency, Math.min(first, second)) * annualFactor),
        salaryMaxUsd: Math.round(convert(currency, Math.max(first, second)) * annualFactor)
      };
    }
  }

  if (singleMatch) {
    const currency = singleMatch[1] && isNaN(Number(singleMatch[1].replace(/,/g, ""))) ? singleMatch[1] : singleMatch[2];
    const amount = Number((singleMatch[2] || singleMatch[1]).replace(/,/g, ""));
    if (!Number.isNaN(amount) && currency) {
      const monthly = Math.round(convert(currency, amount) * annualFactor);
      return {
        salaryText: cleaned,
        salaryMinUsd: monthly,
        salaryMaxUsd: monthly
      };
    }
  }

  return {};
}

function normalizeJob(source: string, input: Omit<ProviderJob, "source">): ProviderJob {
  const description = compactText(input.description);
  const salaryText = input.salaryText || description;
  const salaryInfo = extractSalaryInfo(salaryText);

  return {
    ...input,
    source,
    description,
    location: input.location || "Unknown",
    company: input.company || "Unknown company",
    remoteType: input.remoteType ?? pickRemoteType(compactText(input.location, description, input.title)),
    salaryText: input.salaryText ?? salaryInfo.salaryText ?? null,
    salaryMinUsd: input.salaryMinUsd ?? salaryInfo.salaryMinUsd ?? null,
    salaryMaxUsd: input.salaryMaxUsd ?? salaryInfo.salaryMaxUsd ?? null
  };
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36",
      accept: "application/json, text/plain, */*",
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

function stripHtml(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function getSerpApiKey(): string | null {
  const apiKey = process.env.SERPAPI_API_KEY?.trim() ?? "";

  if (!apiKey) {
    return null;
  }

  return apiKey;
}

type SerpApiGoogleJobsResponse = {
  jobs_results?: Array<{
    title?: string;
    company_name?: string;
    location?: string;
    description?: string;
    related_links?: Array<{
      link?: string;
    }>;
    thumbnail?: string;
    detected_extensions?: Record<string, string>;
  }>;
};

function toSerpApiGoogleJob(
  item: NonNullable<SerpApiGoogleJobsResponse["jobs_results"]>[number],
  query: string
): ProviderJob | null {
  const link = item.related_links?.find((candidate) => candidate.link)?.link?.trim();
  if (!link) {
    return null;
  }

  const title = normalizeWhitespace(item.title ?? "");
  const description = stripHtml(item.description ?? "");
  const company = normalizeWhitespace(item.company_name ?? "") || "Google Jobs";
  const location = normalizeWhitespace(item.location ?? "") || "Unknown";

  return normalizeJob("googleJobs", {
    sourceJobId: link,
    title: title || "Untitled role",
    company,
    location,
    employmentType: null,
    remoteType: pickRemoteType(compactText(title, description, location)),
    salaryText: null,
    url: link,
    description,
    postedAt: null,
    queryText: query,
    rawPayload: item
  });
}

export async function googleJobsProvider(query: string, limit: number): Promise<ProviderResult> {
  const apiKey = getSerpApiKey();
  if (!apiKey) {
    return {
      providerId: "googleJobs",
      jobs: [],
      success: false,
      message: "Google provider requires SERPAPI_API_KEY"
    };
  }

  try {
    const cappedLimit = Math.max(1, Math.min(limit, 10));
    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const requests = Array.from({ length: Math.ceil(cappedLimit / 10) }, (_, index) => {
      const start = index * 10;
      const params = new URLSearchParams({
        engine: "google_jobs",
        q: query,
        hl: "en",
        api_key: apiKey,
        start: String(start)
      });

      return fetchJson<SerpApiGoogleJobsResponse>(
        `https://serpapi.com/search.json?${params.toString()}`
      );
    });

    const payloads = await Promise.all(requests);
    const jobs = payloads
      .flatMap((payload) => payload.jobs_results ?? [])
      .map((item) => toSerpApiGoogleJob(item, query))
      .filter((job): job is ProviderJob => Boolean(job))
      .filter((job) => matchesEngineeringQuery(job, queryTokens))
      .slice(0, limit);

    return {
      providerId: "googleJobs",
      jobs,
      success: jobs.length > 0,
      message: jobs.length > 0
        ? `Fetched ${jobs.length} jobs from SerpAPI Google Jobs`
        : "SerpAPI search succeeded but returned no matching Google Jobs entries"
    };
  } catch (error) {
    return {
      providerId: "googleJobs",
      jobs: [],
      success: false,
      message: error instanceof Error ? error.message : "Unknown Google search error"
    };
  }
}

export async function remotiveProvider(query: string, limit: number): Promise<ProviderResult> {
  try {
    const payload = await fetchJson<{
      jobs: Array<{
        id: number;
        title: string;
        company_name: string;
        candidate_required_location?: string;
        category?: string;
        salary?: string;
        url: string;
        description: string;
        publication_date: string;
        job_type?: string;
      }>;
    }>(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`);

    const jobs = payload.jobs.slice(0, limit).map((job) =>
      normalizeJob("remotive", {
        sourceJobId: String(job.id),
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location || "Remote",
        employmentType: job.job_type || job.category || null,
        salaryText: job.salary || null,
        url: job.url,
        description: job.description,
        postedAt: job.publication_date,
        queryText: query,
        rawPayload: job
      })
    );

    return {
      providerId: "remotive",
      jobs,
      success: true,
      message: `Fetched ${jobs.length} jobs`
    };
  } catch (error) {
    return {
      providerId: "remotive",
      jobs: [],
      success: false,
      message: error instanceof Error ? error.message : "Unknown Remotive error"
    };
  }
}

export async function remoteOkProvider(query: string, limit: number): Promise<ProviderResult> {
  try {
    const payload = await fetchJson<Array<Record<string, unknown>>>("https://remoteok.com/api");
    const jobs = payload
      .filter((item) => item.position || item.tags)
      .map((item) => {
        const tags = Array.isArray(item.tags) ? item.tags.join(", ") : "";
        return normalizeJob("remoteok", {
          sourceJobId: String(item.id ?? item.slug ?? item.url ?? Math.random()),
          title: String(item.position ?? "Untitled role"),
          company: String(item.company ?? "Unknown company"),
          location: String(item.location ?? "Remote"),
          employmentType: "Remote",
          remoteType: "Remote",
          salaryText: typeof item.salary_min === "number" && typeof item.salary_max === "number"
            ? `$${item.salary_min} - $${item.salary_max}`
            : null,
          salaryMinUsd: typeof item.salary_min === "number" ? Number(item.salary_min) / 12 : null,
          salaryMaxUsd: typeof item.salary_max === "number" ? Number(item.salary_max) / 12 : null,
          url: String(item.url ?? item.apply_url ?? "https://remoteok.com"),
          description: compactText(
            String(item.description ?? ""),
            String(item.description_text ?? ""),
            String(item.tags ?? tags)
          ),
          postedAt: typeof item.date === "string" ? item.date : null,
          queryText: query,
          rawPayload: item
        });
      })
      .filter((job) => compactText(job.title, job.description).toLowerCase().includes(query.split(" ")[0].toLowerCase()) || query.length < 3)
      .slice(0, limit);

    return {
      providerId: "remoteok",
      jobs,
      success: true,
      message: `Fetched ${jobs.length} jobs`
    };
  } catch (error) {
    return {
      providerId: "remoteok",
      jobs: [],
      success: false,
      message: error instanceof Error ? error.message : "Unknown RemoteOK error"
    };
  }
}

export async function weWorkRemotelyProvider(_query: string, limit: number): Promise<ProviderResult> {
  try {
    const feed = await rssParser.parseURL("https://weworkremotely.com/categories/remote-programming-jobs.rss");
    const jobs = (feed.items ?? []).slice(0, limit).map((item, index) =>
      normalizeJob("wwr", {
        sourceJobId: item.guid ?? String(index),
        title: item.title ?? "Untitled role",
        company: item.creator ?? "We Work Remotely",
        location: "Remote",
        employmentType: "Programming",
        remoteType: "Remote",
        url: item.link ?? "https://weworkremotely.com",
        description: item.contentSnippet ?? item.content ?? "",
        postedAt: item.isoDate ?? item.pubDate ?? null,
        rawPayload: item
      })
    );

    return {
      providerId: "wwr",
      jobs,
      success: true,
      message: `Fetched ${jobs.length} jobs`
    };
  } catch (error) {
    return {
      providerId: "wwr",
      jobs: [],
      success: false,
      message: error instanceof Error ? error.message : "Unknown WWR error"
    };
  }
}

export async function himalayasProvider(query: string, limit: number): Promise<ProviderResult> {
  try {
    const pagesToFetch = Math.max(1, Math.ceil(Math.min(limit, 60) / 20));
    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const payloads = await Promise.all(
      Array.from({ length: pagesToFetch }, (_, index) =>
        fetchJson<{
          jobs: Array<{
            guid: string;
            title: string;
            excerpt?: string;
            companyName?: string;
            employmentType?: string;
            locationRestrictions?: Array<{ name: string }>;
            description?: string;
            pubDate?: number;
            applicationLink?: string;
            minSalary?: number | null;
            maxSalary?: number | null;
            currency?: string | null;
          }>;
        }>(`https://himalayas.app/jobs/api?limit=20&offset=${index * 20}`)
      )
    );

    const jobs = payloads
      .flatMap((payload) => payload.jobs)
      .map((item) =>
        normalizeJob("himalayas", {
          sourceJobId: item.guid,
          title: item.title ?? "Untitled role",
          company: item.companyName ?? "Himalayas",
          location: item.locationRestrictions?.map((entry) => entry.name).join(", ") || "Remote",
          employmentType: item.employmentType ?? null,
          remoteType: "Remote",
          url: item.applicationLink ?? "https://himalayas.app/jobs",
          description: item.description ?? item.excerpt ?? "",
          postedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          queryText: query,
          salaryMinUsd: item.currency === "USD" ? item.minSalary ?? null : null,
          salaryMaxUsd: item.currency === "USD" ? item.maxSalary ?? null : null,
          rawPayload: item
        })
      )
      .filter((job) => {
        return matchesEngineeringQuery(job, queryTokens);
      })
      .slice(0, limit);

    return {
      providerId: "himalayas",
      jobs,
      success: true,
      message: `Fetched ${jobs.length} jobs`
    };
  } catch (error) {
    return {
      providerId: "himalayas",
      jobs: [],
      success: false,
      message: error instanceof Error ? error.message : "Unknown Himalayas error"
    };
  }
}

export async function arbeitnowProvider(query: string, limit: number): Promise<ProviderResult> {
  try {
    const payload = await fetchJson<{
      data: Array<{
        slug: string;
        company_name?: string;
        title?: string;
        description?: string;
        remote?: boolean;
        location?: string;
        tags?: string[];
        job_types?: string[];
        created_at?: string;
        url?: string;
      }>;
    }>("https://www.arbeitnow.com/api/job-board-api");
    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const jobs = payload.data
      .map((item) =>
        normalizeJob("arbeitnow", {
          sourceJobId: item.slug,
          title: item.title ?? "Untitled role",
          company: item.company_name ?? "Arbeitnow",
          location: item.location || "Remote",
          employmentType: item.job_types?.join(", ") || null,
          remoteType: item.remote ? "Remote" : null,
          url: item.url ?? `https://www.arbeitnow.com/jobs/${item.slug}`,
          description: item.description ?? "",
          postedAt: item.created_at ?? null,
          queryText: query,
          rawPayload: item
        })
      )
      .filter((job) => {
        return matchesEngineeringQuery(job, queryTokens);
      })
      .slice(0, limit);

    return {
      providerId: "arbeitnow",
      jobs,
      success: true,
      message: `Fetched ${jobs.length} jobs`
    };
  } catch (error) {
    return {
      providerId: "arbeitnow",
      jobs: [],
      success: false,
      message: error instanceof Error ? error.message : "Unknown Arbeitnow error"
    };
  }
}

function parseIndeedJobs(
  providerId: "indeedCom" | "indeedFr",
  domain: string,
  query: string,
  limit: number,
  html: string
): ProviderJob[] {
  const $ = cheerio.load(html);
  return $("a[data-jk], div.job_seen_beacon, li div[data-testid='slider_item']")
    .slice(0, limit)
    .map((_, element) => {
      const root = $(element);
      const title = root.find("h2 a span, .jobTitle span, [data-testid='job-title']").first().text();
      const company = root.find("[data-testid='company-name'], .companyName").first().text();
      const location = root.find("[data-testid='text-location'], .companyLocation").first().text();
      const link = root.find("a").first().attr("href");
      const description = root.text();
      return normalizeJob(providerId, {
        sourceJobId: root.attr("data-jk") ?? link ?? title,
        title,
        company,
        location,
        remoteType: pickRemoteType(description),
        employmentType: null,
        salaryText: root.find(".salary-snippet-container").first().text() || null,
        url: link?.startsWith("http") ? link : `https://${domain}${link ?? ""}`,
        description,
        postedAt: null,
        queryText: query,
        rawPayload: { html: $.html(element) }
      });
    })
    .get()
    .filter((job) => job.title && job.url);
}

function parseJobsDbJobs(
  providerId: "jobsdbTh" | "jobsdbHk",
  domain: string,
  query: string,
  limit: number,
  html: string
): ProviderJob[] {
  const $ = cheerio.load(html);
  return $("article, [data-automation='normalJob']")
    .slice(0, limit)
    .map((_, element) => {
      const root = $(element);
      const title = root.find("a[data-automation='jobTitle'], a").first().text();
      const company = root.find("[data-automation='jobCompany']").first().text();
      const location = root.find("[data-automation='jobLocation']").first().text();
      const description = root.text();
      const link = root.find("a").first().attr("href");
      return normalizeJob(providerId, {
        sourceJobId: link ?? title,
        title,
        company,
        location,
        employmentType: null,
        remoteType: pickRemoteType(description),
        salaryText: root.find("[data-automation='jobSalary']").first().text() || null,
        url: link?.startsWith("http") ? link : `https://${domain}${link ?? ""}`,
        description,
        postedAt: null,
        queryText: query,
        rawPayload: { html: $.html(element) }
      });
    })
    .get()
    .filter((job) => job.title && job.url);
}

async function guardedIndeedProvider(
  providerId: "indeedCom" | "indeedFr",
  domain: string,
  query: string,
  limit: number
): Promise<ProviderResult> {
  const url = `https://${domain}/jobs?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const html = await fetchHtml(url);
    const jobs = parseIndeedJobs(providerId, domain, query, limit, html);

    return {
      providerId,
      jobs,
      success: jobs.length > 0,
      message: jobs.length > 0
        ? `Fetched ${jobs.length} jobs`
        : "No jobs parsed. The site may have changed its HTML or returned a challenge page."
    };
  } catch (error) {
    try {
      let jobs = await parseIndeedJobsWithPlaywright(providerId, domain, query, limit, url);
      if (!jobs.length) {
        const html = await fetchHtmlWithPlaywright(url);
        jobs = parseIndeedJobs(providerId, domain, query, limit, html);
      }
      return {
        providerId,
        jobs,
        success: jobs.length > 0,
        message: jobs.length > 0
          ? `Fetched ${jobs.length} jobs via Playwright fallback`
          : "Playwright fallback loaded the page but no jobs were parsed."
      };
    } catch (fallbackError) {
      return {
        providerId,
        jobs: [],
        success: false,
        message:
          `Guarded provider: ${error instanceof Error ? error.message : "Unknown error"} | ` +
          `Playwright fallback: ${fallbackError instanceof Error ? fallbackError.message : "Unknown error"}`
      };
    }
  }
}

export async function indeedComProvider(query: string, limit: number): Promise<ProviderResult> {
  return guardedIndeedProvider("indeedCom", "www.indeed.com", query, limit);
}

export async function indeedFrProvider(query: string, limit: number): Promise<ProviderResult> {
  return guardedIndeedProvider("indeedFr", "fr.indeed.com", query, limit);
}

async function guardedJobsDbProvider(
  providerId: "jobsdbTh" | "jobsdbHk",
  domain: string,
  query: string,
  limit: number
): Promise<ProviderResult> {
  const slug = query.trim().replace(/\s+/g, "-");
  const url = `https://${domain}/${encodeURIComponent(slug)}-jobs`;
  try {
    const html = await fetchHtml(url);
    const jobs = parseJobsDbJobs(providerId, domain, query, limit, html);

    return {
      providerId,
      jobs,
      success: jobs.length > 0,
      message: jobs.length > 0
        ? `Fetched ${jobs.length} jobs`
        : "No jobs parsed. JobsDB likely returned a challenge page."
    };
  } catch (error) {
    try {
      let jobs = await parseJobsDbWithPlaywright(providerId, domain, query, limit, url);
      if (!jobs.length) {
        const html = await fetchHtmlWithPlaywright(url);
        jobs = parseJobsDbJobs(providerId, domain, query, limit, html);
      }
      return {
        providerId,
        jobs,
        success: jobs.length > 0,
        message: jobs.length > 0
          ? `Fetched ${jobs.length} jobs via Playwright fallback`
          : "Playwright fallback loaded the page but no jobs were parsed."
      };
    } catch (fallbackError) {
      return {
        providerId,
        jobs: [],
        success: false,
        message:
          `Guarded provider: ${error instanceof Error ? error.message : "Unknown error"} | ` +
          `Playwright fallback: ${fallbackError instanceof Error ? fallbackError.message : "Unknown error"}`
      };
    }
  }
}

export async function jobsdbThProvider(query: string, limit: number): Promise<ProviderResult> {
  return guardedJobsDbProvider("jobsdbTh", "th.jobsdb.com", query, limit);
}

export async function jobsdbHkProvider(query: string, limit: number): Promise<ProviderResult> {
  return guardedJobsDbProvider("jobsdbHk", "hk.jobsdb.com", query, limit);
}

export async function demoProvider(query: string, limit: number): Promise<ProviderResult> {
  const jobs = [
    {
      sourceJobId: "demo-1",
      title: "Senior Fullstack Engineer",
      company: "Signal Stack",
      location: "Remote - APAC",
      employmentType: "Full-time",
      remoteType: "Remote",
      salaryText: "$4,500 - $6,200 / month",
      salaryMinUsd: 4500,
      salaryMaxUsd: 6200,
      url: "https://example.com/jobs/demo-1",
      description:
        "Remote-first SaaS team looking for a senior fullstack engineer with React, Node.js, APIs, product ownership and light AI automation integration.",
      postedAt: new Date().toISOString(),
      queryText: query,
      rawPayload: { demo: true }
    },
    {
      sourceJobId: "demo-2",
      title: "Contract Fullstack Developer",
      company: "Ocean Systems",
      location: "Remote - Global",
      employmentType: "Contract",
      remoteType: "Remote",
      salaryText: "$3,500 / month",
      salaryMinUsd: 3500,
      salaryMaxUsd: 3500,
      url: "https://example.com/jobs/demo-2",
      description:
        "6-month contract for a fullstack developer comfortable with Vue, PHP, APIs, SQL and internal AI workflow integrations.",
      postedAt: new Date().toISOString(),
      queryText: query,
      rawPayload: { demo: true }
    },
    {
      sourceJobId: "demo-3",
      title: "Engineering Manager",
      company: "Mismatch Corp",
      location: "Bangkok - Hybrid",
      employmentType: "Full-time",
      remoteType: "Hybrid",
      salaryText: "$2,000 / month",
      salaryMinUsd: 2000,
      salaryMaxUsd: 2000,
      url: "https://example.com/jobs/demo-3",
      description:
        "Hybrid engineering manager position with onsite expectations and team leadership only.",
      postedAt: new Date().toISOString(),
      queryText: query,
      rawPayload: { demo: true }
    }
  ]
    .slice(0, limit)
    .map((job) => normalizeJob("demo", job));

  return {
    providerId: "demo",
    jobs,
    success: true,
    message: `Loaded ${jobs.length} demo jobs`
  };
}

export const providerRegistry = {
  remotive: remotiveProvider,
  remoteok: remoteOkProvider,
  wwr: weWorkRemotelyProvider,
  himalayas: himalayasProvider,
  arbeitnow: arbeitnowProvider,
  indeedCom: indeedComProvider,
  indeedFr: indeedFrProvider,
  jobsdbTh: jobsdbThProvider,
  jobsdbHk: jobsdbHkProvider,
  googleJobs: googleJobsProvider,
  demo: demoProvider
} as const;
