import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatSessionStore } from "@/features/chat/stores/chatSessionStore";
import { handleSessionNotification } from "../acpNotificationHandler";
import * as acpApi from "../acpApi";
import { getLocalSessionId, prepareSession } from "../acpSessionTracker";

vi.mock("../acpApi", () => ({
  loadSession: vi.fn(),
  newSession: vi.fn(),
  setProvider: vi.fn(),
  updateWorkingDir: vi.fn(),
}));

const mockedAcpApi = vi.mocked(acpApi);

function resetSessionStore() {
  useChatSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    isLoading: false,
    contextPanelOpenBySession: {},
    activeWorkspaceBySession: {},
    modelsBySession: {},
    modelCacheByProvider: {},
  });
}

describe("prepareSession notification mapping", () => {
  beforeEach(() => {
    resetSessionStore();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("maps config notifications onto the local session before setProvider resolves", async () => {
    const session = useChatSessionStore.getState().createDraftSession();
    const gooseSessionId = "goose-session-prepare";
    const configOptions = [
      {
        id: "provider",
        name: "Provider",
        type: "select",
        currentValue: "google_gemini",
        options: {
          type: "ungrouped",
          values: [{ value: "google_gemini", name: "Google Gemini" }],
        },
      },
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "gemini-2.5-pro",
        options: {
          type: "ungrouped",
          values: [{ value: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }],
        },
      },
    ];

    mockedAcpApi.loadSession.mockRejectedValueOnce(new Error("missing"));
    mockedAcpApi.newSession.mockResolvedValueOnce({
      sessionId: gooseSessionId,
    } as Awaited<ReturnType<typeof acpApi.newSession>>);
    mockedAcpApi.setProvider.mockImplementationOnce(async () => {
      await handleSessionNotification({
        sessionId: gooseSessionId,
        update: {
          sessionUpdate: "config_option_update",
          options: configOptions,
        },
      } as unknown as Parameters<typeof handleSessionNotification>[0]);

      return {
        configOptions,
      } as unknown as Awaited<ReturnType<typeof acpApi.setProvider>>;
    });

    const result = await prepareSession(
      session.id,
      "google_gemini",
      "C:\\src\\goose",
    );

    expect(result.gooseSessionId).toBe(gooseSessionId);
    expect(getLocalSessionId(gooseSessionId)).toBe(session.id);

    const updated = useChatSessionStore.getState().getSession(session.id);
    expect(updated?.providerId).toBe("google_gemini");
    expect(updated?.modelId).toBe("gemini-2.5-pro");
    expect(updated?.modelName).toBe("Gemini 2.5 Pro");
    expect(useChatSessionStore.getState().getSessionModels(session.id)).toEqual(
      [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }],
    );
    expect(
      useChatSessionStore.getState().getSessionModels(gooseSessionId),
    ).toEqual([]);
  });
});
