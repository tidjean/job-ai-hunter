import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { compactText, normalizeWhitespace } from "../lib/utils.js";
import type { ProviderJob, ProviderResult } from "../types/models.js";

const rssParser = new Parser();

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

async function guardedIndeedProvider(
  providerId: "indeedCom" | "indeedFr",
  domain: string,
  query: string,
  limit: number
): Promise<ProviderResult> {
  try {
    const url = `https://${domain}/jobs?q=${encodeURIComponent(query)}&limit=${limit}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const jobs = $("a[data-jk], div.job_seen_beacon")
      .slice(0, limit)
      .map((_, element) => {
        const root = $(element);
        const title = root.find("h2 a span, .jobTitle span").first().text();
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

    return {
      providerId,
      jobs,
      success: jobs.length > 0,
      message: jobs.length > 0
        ? `Fetched ${jobs.length} jobs`
        : "No jobs parsed. The site may have changed its HTML or returned a challenge page."
    };
  } catch (error) {
    return {
      providerId,
      jobs: [],
      success: false,
      message: `Guarded provider: ${error instanceof Error ? error.message : "Unknown error"}`
    };
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
  try {
    const slug = query.trim().replace(/\s+/g, "-");
    const url = `https://${domain}/${encodeURIComponent(slug)}-jobs`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const jobs = $("article, [data-automation='normalJob']")
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

    return {
      providerId,
      jobs,
      success: jobs.length > 0,
      message: jobs.length > 0
        ? `Fetched ${jobs.length} jobs`
        : "No jobs parsed. JobsDB likely returned a challenge page."
    };
  } catch (error) {
    return {
      providerId,
      jobs: [],
      success: false,
      message: `Guarded provider: ${error instanceof Error ? error.message : "Unknown error"}`
    };
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
  indeedCom: indeedComProvider,
  indeedFr: indeedFrProvider,
  jobsdbTh: jobsdbThProvider,
  jobsdbHk: jobsdbHkProvider,
  demo: demoProvider
} as const;
