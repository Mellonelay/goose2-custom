import { beforeEach, describe, expect, it } from "vitest";
import { useChatSessionStore } from "@/features/chat/stores/chatSessionStore";
import {
  applySessionConfigOptions,
  handleSessionNotification,
} from "../acpNotificationHandler";
import { registerSession } from "../acpSessionTracker";

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

describe("applySessionConfigOptions", () => {
  beforeEach(() => {
    resetSessionStore();
    window.localStorage.clear();
  });

  it("hydrates provider and model metadata from set_config_option response options", () => {
    const session = useChatSessionStore.getState().createDraftSession();

    applySessionConfigOptions(session.id, [
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
    ]);

    const updated = useChatSessionStore.getState().getSession(session.id);
    expect(updated?.providerId).toBe("google_gemini");
    expect(updated?.modelId).toBe("gemini-2.5-pro");
    expect(updated?.modelName).toBe("Gemini 2.5 Pro");
    expect(useChatSessionStore.getState().getSessionModels(session.id)).toEqual(
      [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }],
    );
  });

  it("does not invent an active model when currentValue is missing", () => {
    const session = useChatSessionStore.getState().createDraftSession();

    applySessionConfigOptions(session.id, [
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
        options: {
          type: "ungrouped",
          values: [{ value: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }],
        },
      },
    ]);

    const updated = useChatSessionStore.getState().getSession(session.id);
    expect(updated?.providerId).toBe("google_gemini");
    expect(updated?.modelId).toBeUndefined();
    expect(updated?.modelName).toBeUndefined();
    expect(useChatSessionStore.getState().getSessionModels(session.id)).toEqual(
      [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }],
    );
  });

  it("does not persist ACP runtime config into overlay storage", () => {
    const session = useChatSessionStore.getState().createDraftSession();
    useChatSessionStore.getState().promoteDraft(session.id);

    applySessionConfigOptions(session.id, [
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
    ]);

    expect(
      window.localStorage.getItem("goose:acp-session-metadata"),
    ).toBeNull();
  });
});

describe("handleSessionNotification config fallback", () => {
  beforeEach(() => {
    resetSessionStore();
    window.localStorage.clear();
  });

  it("falls back to legacy options when configOptions is present but empty", async () => {
    const session = useChatSessionStore.getState().createDraftSession();
    registerSession(
      session.id,
      "goose-session-legacy",
      "goose",
      "C:\\src\\goose",
    );

    await handleSessionNotification({
      sessionId: "goose-session-legacy",
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [],
        options: [
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
        ],
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);

    const updated = useChatSessionStore.getState().getSession(session.id);
    expect(updated?.providerId).toBe("google_gemini");
    expect(updated?.modelId).toBe("gemini-2.5-pro");
    expect(updated?.modelName).toBe("Gemini 2.5 Pro");
  });
});
