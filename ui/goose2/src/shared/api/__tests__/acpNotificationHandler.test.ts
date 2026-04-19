import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "@/features/chat/stores/chatStore";
import { useChatSessionStore } from "@/features/chat/stores/chatSessionStore";
import {
  applySessionConfigOptions,
  clearActiveMessageId,
  clearMessageTracking,
  completeActiveMessage,
  handleSessionNotification,
  setActiveMessageId,
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

function resetChatStore() {
  useChatStore.setState({
    messagesBySession: {},
    sessionStateById: {},
    queuedMessageBySession: {},
    draftsBySession: {},
    activeSessionId: null,
    isConnected: false,
    loadingSessionIds: new Set(),
    scrollTargetMessageBySession: {},
  });
  clearMessageTracking();
}

describe("applySessionConfigOptions", () => {
  beforeEach(() => {
    resetChatStore();
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
    resetChatStore();
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

describe("handleSessionNotification message lifecycle", () => {
  beforeEach(() => {
    resetChatStore();
    resetSessionStore();
    window.localStorage.clear();
  });

  it("keeps a live assistant message streaming until ACP completion is confirmed", async () => {
    const sessionId = "local-message-lifecycle";
    const gooseSessionId = "goose-message-lifecycle";
    registerSession(sessionId, gooseSessionId, "goose", "C:\\src\\goose");
    setActiveMessageId(gooseSessionId, "assistant-message-1");

    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);

    let message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    expect(message?.metadata?.messageState).toBe("streaming");
    expect(message?.metadata?.completionStatus).toBe("inProgress");

    completeActiveMessage(gooseSessionId);

    message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    expect(message?.metadata?.messageState).toBe("completed");
    expect(message?.metadata?.completionStatus).toBe("completed");
  });

  it("marks a tracked live assistant message partial when ACP completion is absent", async () => {
    const sessionId = "local-message-partial";
    const gooseSessionId = "goose-message-partial";
    registerSession(sessionId, gooseSessionId, "goose", "C:\\src\\goose");
    setActiveMessageId(gooseSessionId, "assistant-message-2");

    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);

    clearActiveMessageId(gooseSessionId);

    const message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    expect(message?.metadata?.messageState).toBe("partial");
    expect(message?.metadata?.completionStatus).toBe("inProgress");
  });

  it("does not append a duplicate live text chunk for the same ACP message id", async () => {
    const sessionId = "local-message-duplicate-chunk";
    const gooseSessionId = "goose-message-duplicate-chunk";
    registerSession(sessionId, gooseSessionId, "goose", "C:\\src\\goose");
    setActiveMessageId(gooseSessionId, "assistant-message-duplicate");

    const notification = {
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "assistant-message-duplicate",
        content: { type: "text", text: "hello" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0];

    await handleSessionNotification(notification);
    await handleSessionNotification(notification);

    const message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    expect(message?.content).toEqual([{ type: "text", text: "hello" }]);
    expect(message?.metadata?.messageState).toBe("streaming");
  });

  it("keeps distinct live text chunks for the same ACP message id in order", async () => {
    const sessionId = "local-message-distinct-chunks";
    const gooseSessionId = "goose-message-distinct-chunks";
    registerSession(sessionId, gooseSessionId, "goose", "C:\\src\\goose");
    setActiveMessageId(gooseSessionId, "assistant-message-distinct");

    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "assistant-message-distinct",
        content: { type: "text", text: "hel" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);
    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "assistant-message-distinct",
        content: { type: "text", text: "lo" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);

    const message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    expect(message?.content).toEqual([{ type: "text", text: "hello" }]);
    expect(message?.metadata?.messageState).toBe("streaming");
  });

  it("does not transition a completed message back to streaming", async () => {
    const sessionId = "local-message-completed";
    const gooseSessionId = "goose-message-completed";
    registerSession(sessionId, gooseSessionId, "goose", "C:\\src\\goose");
    setActiveMessageId(gooseSessionId, "assistant-message-3");

    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);
    completeActiveMessage(gooseSessionId);
    clearActiveMessageId(gooseSessionId);
    useChatStore.getState().setStreamingMessageId(sessionId, null);

    setActiveMessageId(gooseSessionId, "assistant-message-3");
    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " late" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);
    clearActiveMessageId(gooseSessionId);

    const message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    const runtime = useChatStore.getState().getSessionRuntime(sessionId);
    expect(message?.metadata?.messageState).toBe("completed");
    expect(message?.metadata?.completionStatus).toBe("completed");
    expect(message?.content).toEqual([{ type: "text", text: "hello" }]);
    expect(runtime.streamingMessageId).toBeNull();
  });

  it("does not transition a failed message back to streaming or partial", async () => {
    const sessionId = "local-message-failed";
    const gooseSessionId = "goose-message-failed";
    registerSession(sessionId, gooseSessionId, "goose", "C:\\src\\goose");
    useChatStore.getState().addMessage(sessionId, {
      id: "assistant-message-4",
      role: "assistant",
      created: Date.now(),
      content: [{ type: "text", text: "failed" }],
      metadata: {
        userVisible: true,
        agentVisible: true,
        messageState: "failed",
        completionStatus: "error",
      },
    });
    setActiveMessageId(gooseSessionId, "assistant-message-4");

    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " late" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);
    clearActiveMessageId(gooseSessionId);

    const message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    const runtime = useChatStore.getState().getSessionRuntime(sessionId);
    expect(message?.metadata?.messageState).toBe("failed");
    expect(message?.metadata?.completionStatus).toBe("error");
    expect(message?.content).toEqual([{ type: "text", text: "failed" }]);
    expect(runtime.streamingMessageId).toBeNull();
  });

  it("does not mutate a message with terminal completionStatus", async () => {
    const sessionId = "local-message-terminal-completion";
    const gooseSessionId = "goose-message-terminal-completion";
    registerSession(sessionId, gooseSessionId, "goose", "C:\\src\\goose");
    useChatStore.getState().addMessage(sessionId, {
      id: "assistant-message-5",
      role: "assistant",
      created: Date.now(),
      content: [{ type: "text", text: "original content" }],
      metadata: {
        userVisible: true,
        agentVisible: true,
        messageState: "streaming",
        completionStatus: "completed",
      },
    });
    setActiveMessageId(gooseSessionId, "assistant-message-5");

    await handleSessionNotification({
      sessionId: gooseSessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " late chunk" },
      },
    } as unknown as Parameters<typeof handleSessionNotification>[0]);
    clearActiveMessageId(gooseSessionId);

    const message = useChatStore.getState().messagesBySession[sessionId]?.[0];
    const runtime = useChatStore.getState().getSessionRuntime(sessionId);
    expect(message?.metadata?.messageState).toBe("streaming");
    expect(message?.metadata?.completionStatus).toBe("completed");
    expect(message?.content).toEqual([
      { type: "text", text: "original content" },
    ]);
    expect(runtime.streamingMessageId).toBeNull();
  });
});
