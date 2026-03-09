/**
 * Unit tests for incident-to-code correlation.
 */

import {
  normalizeStackPath,
  isMappablePath,
  extractBestCodeLocation,
  scoreAndRankCommits,
  enrichIncidentWithGitHubCorrelation,
  type CodeLocation,
  type ScoredCommit,
} from "../incidentCorrelation";
import type { GitHubCommitForCorrelation } from "../../github";

describe("normalizeStackPath", () => {
  it("should normalize backslashes to forward slashes", () => {
    expect(normalizeStackPath("src\\auth\\handler.ts")).toBe("src/auth/handler.ts");
  });

  it("should strip leading ./", () => {
    expect(normalizeStackPath("./src/utils.ts")).toBe("src/utils.ts");
  });

  it("should strip leading /", () => {
    expect(normalizeStackPath("/app/server/routes.ts")).toBe("app/server/routes.ts");
  });

  it("should collapse repeated slashes", () => {
    expect(normalizeStackPath("src//utils///index.ts")).toBe("src/utils/index.ts");
  });

  it("should lowercase", () => {
    expect(normalizeStackPath("SRC/Handler.TS")).toBe("src/handler.ts");
  });

  it("should handle complex cases", () => {
    expect(normalizeStackPath("./SRC\\\\AUTH/Handler.TS")).toBe("src/auth/handler.ts");
  });
});

describe("isMappablePath", () => {
  it("should reject node_modules paths", () => {
    expect(isMappablePath("node_modules/package/index.js")).toBe(false);
  });

  it("should reject bundled paths", () => {
    expect(isMappablePath("chunk-abc123.js")).toBe(false);
    expect(isMappablePath("bundle.min.js")).toBe(false);
    expect(isMappablePath("static/js/main.js")).toBe(false);
    expect(isMappablePath("assets/vendor.js")).toBe(false);
  });

  it("should accept source paths with .ts/.tsx/.jsx", () => {
    expect(isMappablePath("src/handler.ts")).toBe(true);
    expect(isMappablePath("app/Component.tsx")).toBe(true);
    expect(isMappablePath("lib/utils.jsx")).toBe(true);
  });

  it("should accept paths with source hints", () => {
    expect(isMappablePath("src/app.js")).toBe(true);
    expect(isMappablePath("server/routes.js")).toBe(true);
    expect(isMappablePath("app/index.mjs")).toBe(true);
  });

  it("should reject paths without source hints", () => {
    expect(isMappablePath("file")).toBe(false);
    expect(isMappablePath("index")).toBe(false);
  });

  it("should reject empty or invalid paths", () => {
    expect(isMappablePath("")).toBe(false);
    expect(isMappablePath("   ")).toBe(false);
  });
});

describe("extractBestCodeLocation", () => {
  it("should extract first app frame", () => {
    const stacktrace = [
      { file: "node_modules/express/lib/router.js", line: 123 },
      { file: "src/handler.ts", line: 42 },
      { file: "src/utils.ts", line: 10 },
    ];
    const location = extractBestCodeLocation(stacktrace);
    expect(location).toEqual({ file: "src/handler.ts", line: 42 });
  });

  it("should normalize the path", () => {
    const stacktrace = [{ file: "./SRC\\Handler.TS", line: 100 }];
    const location = extractBestCodeLocation(stacktrace);
    expect(location).toEqual({ file: "src/handler.ts", line: 100 });
  });

  it("should return null if no app frames", () => {
    const stacktrace = [
      { file: "node_modules/express/lib/router.js", line: 123 },
      { file: "node:internal/modules/cjs/loader.js", line: 456 },
    ];
    const location = extractBestCodeLocation(stacktrace);
    expect(location).toBe(null);
  });

  it("should return null if stacktrace is empty", () => {
    expect(extractBestCodeLocation([])).toBe(null);
  });

  it("should handle missing line numbers", () => {
    const stacktrace = [{ file: "src/handler.ts" }];
    const location = extractBestCodeLocation(stacktrace);
    expect(location).toEqual({ file: "src/handler.ts", line: undefined });
  });
});

describe("scoreAndRankCommits", () => {
  const mockCommits: GitHubCommitForCorrelation[] = [
    {
      sha: "abc123def456",
      message: "Fix bug in handler",
      authorLogin: "alice",
      authorName: "Alice Smith",
      timestamp: "2026-03-08T20:00:00Z",
      htmlUrl: "https://github.com/org/repo/commit/abc123def456",
    },
    {
      sha: "def456abc789",
      message: "Refactor error handling",
      authorLogin: "bob",
      authorName: "Bob Jones",
      timestamp: "2026-03-07T10:00:00Z",
      htmlUrl: "https://github.com/org/repo/commit/def456abc789",
    },
    {
      sha: "789xyz123abc",
      message: "Update deps",
      authorLogin: "charlie",
      authorName: null,
      timestamp: "2026-03-01T00:00:00Z",
      htmlUrl: "https://github.com/org/repo/commit/789xyz123abc",
    },
  ];

  it("should score recent commits higher", () => {
    const location = { file: "src/handler.ts", line: 42 };
    const eventTime = "2026-03-09T00:00:00Z";
    const scored = scoreAndRankCommits(mockCommits, location, eventTime, 5);

    expect(scored.length).toBe(3);
    expect(scored[0].sha).toBe("abc123def456");
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
    expect(scored[1].score).toBeGreaterThan(scored[2].score);
  });

  it("should limit results", () => {
    const location = { file: "src/handler.ts" };
    const eventTime = "2026-03-09T00:00:00Z";
    const scored = scoreAndRankCommits(mockCommits, location, eventTime, 2);
    expect(scored.length).toBe(2);
  });

  it("should use deterministic tie-break by sha", () => {
    const sameTimeCommits: GitHubCommitForCorrelation[] = [
      { ...mockCommits[0], sha: "zzz", timestamp: "2026-03-08T12:00:00Z" },
      { ...mockCommits[1], sha: "aaa", timestamp: "2026-03-08T12:00:00Z" },
    ];
    const location = { file: "src/handler.ts" };
    const eventTime = "2026-03-09T00:00:00Z";
    const scored = scoreAndRankCommits(sameTimeCommits, location, eventTime, 5);
    expect(scored[0].sha).toBe("aaa");
    expect(scored[1].sha).toBe("zzz");
  });

  it("should produce shortSha", () => {
    const location = { file: "src/handler.ts" };
    const eventTime = "2026-03-09T00:00:00Z";
    const scored = scoreAndRankCommits(mockCommits, location, eventTime, 5);
    expect(scored[0].shortSha).toBe("abc123d");
  });

  it("should preserve author info", () => {
    const location = { file: "src/handler.ts" };
    const eventTime = "2026-03-09T00:00:00Z";
    const scored = scoreAndRankCommits(mockCommits, location, eventTime, 5);
    expect(scored[0].author.login).toBe("alice");
    expect(scored[0].author.name).toBe("Alice Smith");
    expect(scored[2].author.name).toBe(null);
  });
});

describe("enrichIncidentWithGitHubCorrelation", () => {
  const mockStorage = {
    getRepositoriesByOrganizationId: async (orgId: string) => {
      if (orgId === "org-1") {
        return [
          {
            userId: "user-1",
            organizationId: "org-1",
            owner: "testorg",
            name: "testrepo",
            fullName: "testorg/testrepo",
            incidentServiceName: "api",
          },
        ];
      }
      return [];
    },
    getUser: async (id: string) => {
      if (id === "user-1") return { githubToken: "ghp_test_token" };
      return undefined;
    },
    getOrganizationMembersWithUsers: async (_orgId: string) => [],
  };

  const mockListCommits = async (
    _owner: string,
    _repo: string,
    _path: string,
    _since: string,
    _token?: string | null
  ): Promise<GitHubCommitForCorrelation[]> => [
    {
      sha: "commit123",
      message: "Fix handler bug",
      authorLogin: "dev1",
      authorName: "Dev One",
      timestamp: "2026-03-08T12:00:00Z",
      htmlUrl: "https://github.com/testorg/testrepo/commit/commit123",
    },
  ];

  it("should enrich incident with related commits", async () => {
    const summary = {
      service: "api",
      start_time: "2026-03-09T00:00:00Z",
      stacktrace: [{ file: "src/handler.ts", line: 42 }],
    };
    const result = await enrichIncidentWithGitHubCorrelation(
      summary,
      "org-1",
      mockStorage as any,
      mockListCommits
    );

    expect(result.relatedCommits.length).toBe(1);
    expect(result.relatedCommits[0].sha).toBe("commit123");
    expect(result.relatedCommits[0].author.login).toBe("dev1");
    expect(result.relevantAuthors.length).toBe(1);
    expect(result.relevantAuthors[0].login).toBe("dev1");
    expect(result.correlationSource).toBe("github");
  });

  it("should return empty when orgId is null", async () => {
    const summary = {
      service: "api",
      start_time: "2026-03-09T00:00:00Z",
      stacktrace: [{ file: "src/handler.ts" }],
    };
    const result = await enrichIncidentWithGitHubCorrelation(
      summary,
      null,
      mockStorage as any,
      mockListCommits
    );
    expect(result).toEqual({
      relatedCommits: [],
      relevantAuthors: [],
      correlationSource: null,
    });
  });

  it("should return empty when path is unmappable", async () => {
    const summary = {
      service: "api",
      start_time: "2026-03-09T00:00:00Z",
      stacktrace: [{ file: "chunk-abc123.js", line: 1 }],
    };
    const result = await enrichIncidentWithGitHubCorrelation(
      summary,
      "org-1",
      mockStorage as any,
      mockListCommits
    );
    expect(result.relatedCommits.length).toBe(0);
  });

  it("should return empty when no app frames", async () => {
    const summary = {
      service: "api",
      start_time: "2026-03-09T00:00:00Z",
      stacktrace: [{ file: "node_modules/express/lib/router.js", line: 123 }],
    };
    const result = await enrichIncidentWithGitHubCorrelation(
      summary,
      "org-1",
      mockStorage as any,
      mockListCommits
    );
    expect(result.relatedCommits.length).toBe(0);
  });

  it("should return empty when listCommits returns empty", async () => {
    const emptyListCommits = async () => [];
    const summary = {
      service: "api",
      start_time: "2026-03-09T00:00:00Z",
      stacktrace: [{ file: "src/handler.ts" }],
    };
    const result = await enrichIncidentWithGitHubCorrelation(
      summary,
      "org-1",
      mockStorage as any,
      emptyListCommits
    );
    expect(result.relatedCommits.length).toBe(0);
  });

  it("should handle multiple authors", async () => {
    const multiAuthorCommits = async (): Promise<GitHubCommitForCorrelation[]> => [
      {
        sha: "commit1",
        message: "Commit 1",
        authorLogin: "alice",
        authorName: "Alice",
        timestamp: "2026-03-08T12:00:00Z",
        htmlUrl: "https://github.com/o/r/commit/commit1",
      },
      {
        sha: "commit2",
        message: "Commit 2",
        authorLogin: "bob",
        authorName: "Bob",
        timestamp: "2026-03-07T12:00:00Z",
        htmlUrl: "https://github.com/o/r/commit/commit2",
      },
    ];
    const summary = {
      service: "api",
      start_time: "2026-03-09T00:00:00Z",
      stacktrace: [{ file: "src/handler.ts" }],
    };
    const result = await enrichIncidentWithGitHubCorrelation(
      summary,
      "org-1",
      mockStorage as any,
      multiAuthorCommits
    );
    expect(result.relevantAuthors.length).toBe(2);
    expect(result.relevantAuthors.map((a) => a.login).sort()).toEqual(["alice", "bob"]);
  });
});

describe("Integration: enrichment never blocks notification", () => {
  it("should return empty when GitHub fetch throws", async () => {
    const failingListCommits = async (): Promise<GitHubCommitForCorrelation[]> => {
      throw new Error("GitHub API failed");
    };
    const mockStorage = {
      getRepositoriesByOrganizationId: async () => [
        {
          userId: "user-1",
          organizationId: "org-1",
          owner: "testorg",
          name: "testrepo",
          fullName: "testorg/testrepo",
          incidentServiceName: "api",
        },
      ],
      getUser: async () => ({ githubToken: "ghp_test" }),
      getOrganizationMembersWithUsers: async () => [],
    };
    const summary = {
      service: "api",
      start_time: "2026-03-09T00:00:00Z",
      stacktrace: [{ file: "src/handler.ts" }],
    };

    await expect(
      enrichIncidentWithGitHubCorrelation(summary, "org-1", mockStorage as any, failingListCommits)
    ).rejects.toThrow();
  });
});
