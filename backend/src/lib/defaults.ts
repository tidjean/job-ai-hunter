import type { AppConfig, CandidateProfile } from "../types/models.js";

export const defaultProfile: CandidateProfile = {
  fullName: "Tidjean",
  headline: "Senior Fullstack Developer",
  email: "",
  location: "Thailand",
  timezone: "Asia/Bangkok",
  yearsExperience: 15,
  remoteOnly: true,
  minMonthlySalaryUsd: 2500,
  preferredEmployment: ["employee", "contract"],
  summary:
    "Senior fullstack developer with 15 years of experience, remote-first, based in Thailand, with strong product delivery experience and AI integration work.",
  skills: [
    "React",
    "Vue",
    "Angular",
    "TypeScript",
    "Node.js",
    "PHP",
    "Python",
    ".NET",
    "REST APIs",
    "SQL",
    "AI integration",
    "Automation"
  ],
  desiredKeywords: [
    "fullstack",
    "senior",
    "remote",
    "saas",
    "ai",
    "llm",
    "automation",
    "typescript",
    "node",
    "react"
  ],
  excludedKeywords: [
    "onsite",
    "on-site",
    "hybrid",
    "relocation",
    "junior",
    "helpdesk",
    "support only",
    "sales"
  ],
  preferredIndustries: ["SaaS", "AI", "Automation", "B2B", "Developer tools"],
  languages: ["French", "English"]
};

export const defaultConfig: AppConfig = {
  aiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  maxDailyAiBudgetUsd: 3,
  autoScore: true,
  autoCompareCv: true,
  autoGenerateCoverLetters: false,
  coverLetterThreshold: 82,
  applyThreshold: 80,
  reviewThreshold: 60,
  searchPlanQueriesPerRefresh: 3,
  sources: {
    remotive: {
      enabled: true,
      label: "Remotive",
      query: "senior fullstack remote react node ai",
      limit: 20
    },
    remoteok: {
      enabled: true,
      label: "RemoteOK",
      query: "full stack react node remote",
      limit: 20
    },
    wwr: {
      enabled: true,
      label: "We Work Remotely",
      query: "programming",
      limit: 15
    },
    indeedCom: {
      enabled: true,
      label: "Indeed.com",
      query: "senior fullstack developer remote",
      limit: 10
    },
    indeedFr: {
      enabled: true,
      label: "Indeed France",
      query: "developpeur fullstack teletravail",
      limit: 10
    },
    jobsdbTh: {
      enabled: true,
      label: "JobsDB Thailand",
      query: "full stack developer",
      limit: 10
    },
    jobsdbHk: {
      enabled: true,
      label: "JobsDB Hong Kong",
      query: "full stack developer",
      limit: 10
    },
    demo: {
      enabled: true,
      label: "Demo fallback",
      query: "remote fullstack ai",
      limit: 3
    }
  }
};
