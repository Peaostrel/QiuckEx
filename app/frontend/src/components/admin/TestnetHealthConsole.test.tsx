// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TestnetHealthConsole } from "@/components/admin/TestnetHealthConsole";

vi.mock("@/lib/api", () => ({
  getQuickexApiBase: () => "https://api.test",
}));

vi.mock("@/lib/deployment-info", () => ({
  getDeploymentInfo: () => ({
    branch: "feat/testnet-health-console",
    commitSha: "abcdef1234567890",
    commitShort: "abcdef1",
    deployedAt: "2026-09-27T12:00:00.000Z",
    apiUrl: "https://api.test",
    network: "testnet",
    vercelEnv: "preview",
    vercelUrl: null,
    contractRegistryVersion: "12",
    appVersion: "1.0.0",
  }),
}));

const readyReport = {
  reportId: "report-ready",
  generatedAt: "2026-09-27T12:00:00.000Z",
  network: "testnet",
  environment: "staging",
  releaseReady: true,
  overallStatus: "ready",
  sections: {
    smoke: {
      status: "pass",
      ready: true,
      checks: [{ name: "horizon", status: "up" }],
      passed: 1,
      failed: 0,
    },
    registry: {
      status: "pass",
      network: "testnet",
      authoritative: true,
      version: 12,
      activeContracts: 2,
      expectedContracts: ["quickex", "escrow"],
      missingContracts: [],
    },
    lag: {
      status: "pass",
      currentNetworkLedger: 1000,
      lastIndexedLedger: 998,
      lagLedgers: 2,
      isLagging: false,
      isBlocking: false,
      thresholdLedgers: 100,
    },
    environment: {
      status: "pass",
      checks: [{ check: "network_configuration", status: "pass", details: "testnet" }],
      passed: 1,
      failed: 0,
      warnings: 0,
    },
  },
  blockers: [],
  summary: { critical: 0, warning: 0, info: 0 },
};

const blockedReport = {
  ...readyReport,
  reportId: "report-blocked",
  releaseReady: false,
  overallStatus: "blocked",
  sections: {
    ...readyReport.sections,
    lag: {
      ...readyReport.sections.lag,
      status: "fail",
      lagLedgers: 240,
      isLagging: true,
      isBlocking: true,
    },
  },
  blockers: [
    {
      id: "lag.blocking",
      severity: "critical",
      category: "lag",
      message: "Indexer is 240 ledgers behind",
      remediation: "Restart ingestion and verify catch-up",
      detectedAt: "2026-09-27T12:00:00.000Z",
    },
    {
      id: "environment.warning",
      severity: "warning",
      category: "environment",
      message: "Deployment metadata is incomplete",
      detectedAt: "2026-09-27T12:00:00.000Z",
    },
  ],
  summary: { critical: 1, warning: 1, info: 0 },
};

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TestnetHealthConsole", () => {
  it("renders release readiness from the RC validation API", async () => {
    fetchMock.mockReturnValue(response(readyReport));

    render(<TestnetHealthConsole />);

    expect(await screen.findByText("Testnet release health")).toBeDefined();
    expect(screen.getByText(/release candidate is ready/i)).toBeDefined();
    expect(screen.getByText("Contract registry")).toBeDefined();
    expect(screen.getByText("Indexer lag")).toBeDefined();
    expect(screen.getByText("Smoke run")).toBeDefined();
    expect(screen.getByText("Deployment")).toBeDefined();
    expect(screen.getByText("abcdef1")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/admin/rc-validation/report",
      { cache: "no-store" },
    );
  });

  it("makes critical blockers and remediation actionable", async () => {
    fetchMock.mockReturnValue(response(blockedReport));

    render(<TestnetHealthConsole />);

    expect(await screen.findByText(/critical blockers must be resolved/i)).toBeDefined();
    expect(screen.getByText("Indexer is 240 ledgers behind")).toBeDefined();
    expect(screen.getByText(/restart ingestion and verify catch-up/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /warning \(1\)/i }));
    expect(screen.queryByText("Indexer is 240 ledgers behind")).toBeNull();
    expect(screen.getByText("Deployment metadata is incomplete")).toBeDefined();
  });

  it("refreshes the report on demand", async () => {
    fetchMock
      .mockReturnValueOnce(response(readyReport))
      .mockReturnValueOnce(response(blockedReport));

    render(<TestnetHealthConsole />);
    await screen.findByText(/release candidate is ready/i);

    fireEvent.click(screen.getByRole("button", { name: /refresh testnet health/i }));

    await waitFor(() => {
      expect(screen.getByText(/critical blockers must be resolved/i)).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows an actionable retry state when the backend is unavailable", async () => {
    fetchMock.mockReturnValue(response({}, false, 503));

    render(<TestnetHealthConsole />);

    expect(await screen.findByText("Testnet health unavailable")).toBeDefined();
    expect(screen.getByText(/request failed \(503\)/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });
});
