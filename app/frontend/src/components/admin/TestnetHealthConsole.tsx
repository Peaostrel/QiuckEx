"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  GitCommit,
  Info,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { getQuickexApiBase } from "@/lib/api";
import { getDeploymentInfo } from "@/lib/deployment-info";

type Severity = "critical" | "warning" | "info";
type SectionStatus = "pass" | "warning" | "fail" | "unknown";
type OverallStatus = "ready" | "degraded" | "blocked";
type Filter = "all" | Severity;

type Blocker = {
  id: string;
  severity: Severity;
  category: "smoke" | "registry" | "lag" | "environment";
  message: string;
  remediation?: string;
  detectedAt: string;
};

type RcReport = {
  reportId: string;
  generatedAt: string;
  network: string;
  environment: string;
  releaseReady: boolean;
  overallStatus: OverallStatus;
  sections: {
    smoke: {
      status: SectionStatus;
      ready: boolean;
      checks: Array<{
        name: string;
        status: "up" | "degraded" | "down";
        error?: string;
      }>;
      passed: number;
      failed: number;
    };
    registry: {
      status: SectionStatus;
      network: string;
      authoritative: boolean;
      version: number;
      activeContracts: number;
      expectedContracts: string[];
      missingContracts: string[];
    };
    lag: {
      status: SectionStatus;
      currentNetworkLedger: number | null;
      lastIndexedLedger: number | null;
      lagLedgers: number | null;
      isLagging: boolean;
      isBlocking: boolean;
      thresholdLedgers: number;
    };
    environment: {
      status: SectionStatus;
      checks: Array<{
        check: string;
        status: "pass" | "fail" | "warning";
        details?: string;
      }>;
      passed: number;
      failed: number;
      warnings: number;
    };
  };
  blockers: Blocker[];
  summary: { critical: number; warning: number; info: number };
};

const REFRESH_MS = 30_000;

const statusClasses: Record<SectionStatus | OverallStatus, string> = {
  pass: "border-emerald-300/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300",
  ready:
    "border-emerald-300/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-300/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  degraded:
    "border-amber-300/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  fail: "border-red-300/40 bg-red-400/10 text-red-700 dark:text-red-300",
  blocked: "border-red-300/40 bg-red-400/10 text-red-700 dark:text-red-300",
  unknown: "border-slate-300/40 bg-slate-400/10 text-muted-foreground",
};

const severityClasses: Record<Severity, string> = {
  critical:
    "border-red-300/50 bg-red-400/10 text-red-700 dark:text-red-300",
  warning:
    "border-amber-300/50 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  info: "border-sky-300/50 bg-sky-400/10 text-sky-700 dark:text-sky-300",
};

function StatusBadge({ value }: { value: SectionStatus | OverallStatus }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses[value]}`}
    >
      {value}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-foreground">{value}</dd>
    </div>
  );
}

export function TestnetHealthConsole() {
  const apiBase = useMemo(() => getQuickexApiBase(), []);
  const deployment = useMemo(() => getDeploymentInfo(), []);
  const requestSerial = useRef(0);
  const [report, setReport] = useState<RcReport | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (manual = false) => {
      const requestId = ++requestSerial.current;
      if (manual) setRefreshing(true);
      setError(null);

      try {
        const response = await fetch(`${apiBase}/admin/rc-validation/report`, {
          cache: "no-store",
          headers: {
            "x-api-key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "",
          },
        });
        if (!response.ok) {
          throw new Error(`Health report request failed (${response.status})`);
        }

        const payload = (await response.json()) as RcReport;
        if (requestId === requestSerial.current) {
          setReport(payload);
        }
      } catch (err) {
        if (requestId === requestSerial.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load testnet health report",
          );
        }
      } finally {
        if (requestId === requestSerial.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [apiBase],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);

    return () => {
      requestSerial.current += 1;
      window.clearInterval(timer);
    };
  }, [load]);

  const visibleBlockers = useMemo(
    () =>
      report?.blockers.filter(
        (item) => filter === "all" || item.severity === filter,
      ) ?? [],
    [report, filter],
  );

  if (loading && !report) {
    return (
      <section
        className="rounded-lg border border-border bg-card p-6"
        aria-label="Testnet health console"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading testnet
          readiness…
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section
        className="rounded-lg border border-red-300/40 bg-card p-6"
        aria-label="Testnet health console"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-red-500" />
          <div className="flex-1">
            <h2 className="font-semibold">Testnet health unavailable</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const registryUrl = `${apiBase}/contracts/registry/deployments`;
  const generated = new Date(report.generatedAt).toLocaleString();

  return (
    <section className="space-y-5" aria-label="Testnet health console">
      <div
        className={`rounded-lg border p-5 ${statusClasses[report.overallStatus]}`}
        role="status"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {report.releaseReady ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6" />
            ) : (
              <ShieldAlert className="mt-0.5 h-6 w-6" />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">
                  Testnet release health
                </h1>
                <StatusBadge value={report.overallStatus} />
              </div>
              <p className="mt-1 text-sm">
                {report.releaseReady
                  ? "No critical blockers. Release candidate is ready."
                  : "Critical blockers must be resolved before release."}
              </p>
              <p className="mt-1 text-xs opacity-80">
                Report {report.reportId} · generated {generated}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-current/25 bg-background/70 px-3 py-2 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-60"
            aria-label="Refresh testnet health"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-300/50 bg-amber-400/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          Latest refresh failed: {error}. Showing the last successful report.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-brand" />
              <h2 className="font-semibold">Contract registry</h2>
            </div>
            <StatusBadge value={report.sections.registry.status} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Metric label="Active" value={report.sections.registry.activeContracts} />
            <Metric label="Version" value={report.sections.registry.version} />
            <Metric
              label="Authority"
              value={
                report.sections.registry.authoritative
                  ? "Authoritative"
                  : "Fallback"
              }
            />
            <Metric
              label="Missing"
              value={report.sections.registry.missingContracts.length}
            />
          </dl>
          {report.sections.registry.missingContracts.length > 0 && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-300">
              Missing: {report.sections.registry.missingContracts.join(", ")}
            </p>
          )}
          <a
            href={registryUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Registry entries <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </article>

        <article className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-brand" />
              <h2 className="font-semibold">Indexer lag</h2>
            </div>
            <StatusBadge value={report.sections.lag.status} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Metric
              label="Lag"
              value={report.sections.lag.lagLedgers ?? "Unknown"}
            />
            <Metric
              label="Threshold"
              value={report.sections.lag.thresholdLedgers}
            />
            <Metric
              label="Network ledger"
              value={report.sections.lag.currentNetworkLedger ?? "Unknown"}
            />
            <Metric
              label="Indexed ledger"
              value={report.sections.lag.lastIndexedLedger ?? "Unknown"}
            />
          </dl>
          <Link
            href="/dashboard?panel=activity"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Transactions <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </article>

        <article className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-brand" />
              <h2 className="font-semibold">Smoke run</h2>
            </div>
            <StatusBadge value={report.sections.smoke.status} />
          </div>
          <dl className="mb-3 grid grid-cols-2 gap-4 text-sm">
            <Metric label="Passed" value={report.sections.smoke.passed} />
            <Metric label="Failed" value={report.sections.smoke.failed} />
          </dl>
          <div className="space-y-1.5">
            {report.sections.smoke.checks.map((check) => (
              <div
                key={check.name}
                className="flex items-center justify-between gap-2 text-xs"
                title={check.error}
              >
                <span className="truncate text-muted-foreground">
                  {check.name}
                </span>
                <span
                  className={`font-semibold ${
                    check.status === "up"
                      ? "text-emerald-600"
                      : check.status === "down"
                        ? "text-red-600"
                        : "text-amber-600"
                  }`}
                >
                  {check.status}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/webhooks"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Webhook logs <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </article>

        <article className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCommit className="h-5 w-5 text-brand" />
              <h2 className="font-semibold">Deployment</h2>
            </div>
            <StatusBadge value={report.sections.environment.status} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Metric label="Network" value={report.network} />
            <Metric label="Environment" value={report.environment} />
            <Metric
              label="Commit"
              value={deployment.commitShort ?? "not set"}
            />
            <Metric label="Branch" value={deployment.branch ?? "not set"} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Environment checks: {report.sections.environment.passed} passed ·{" "}
            {report.sections.environment.warnings} warnings ·{" "}
            {report.sections.environment.failed} failed
          </p>
          <Link
            href="/settings/developer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Deployment details <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </article>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Release blockers</h2>
            <p className="text-sm text-muted-foreground">
              Actionable findings from the latest validation report.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2"
            aria-label="Blocker severity filter"
          >
            {(["all", "critical", "warning", "info"] as Filter[]).map(
              (value) => {
                const count =
                  value === "all"
                    ? report.blockers.length
                    : report.summary[value];
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${
                      filter === value
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {value} ({count})
                  </button>
                );
              },
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {visibleBlockers.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> No findings for this severity.
            </div>
          ) : (
            visibleBlockers.map((blocker) => (
              <article
                key={blocker.id}
                className={`rounded-md border p-4 ${severityClasses[blocker.severity]}`}
              >
                <div className="flex items-start gap-3">
                  {blocker.severity === "critical" ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : blocker.severity === "warning" ? (
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : (
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase">
                        {blocker.severity}
                      </span>
                      <span className="rounded bg-background/50 px-2 py-0.5 text-xs">
                        {blocker.category}
                      </span>
                    </div>
                    <p className="mt-1 font-medium text-foreground">
                      {blocker.message}
                    </p>
                    {blocker.remediation && (
                      <p className="mt-1 text-sm">
                        Next: {blocker.remediation}
                      </p>
                    )}
                    <p className="mt-2 flex items-center gap-1 text-xs opacity-75">
                      <Clock3 className="h-3 w-3" />{" "}
                      {new Date(blocker.detectedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <p className="text-right text-xs text-muted-foreground">
        Auto-refreshes every 30 seconds · backend {apiBase}
      </p>
    </section>
  );
}
