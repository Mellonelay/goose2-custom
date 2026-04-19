import type {
  SessionNotification,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import { useChatStore } from "@/features/chat/stores/chatStore";
import { useChatSessionStore } from "@/features/chat/stores/chatSessionStore";
import {
  ensureReplayBuffer,
  getBufferedMessage,
  findLatestUnpairedToolRequest,
} from "@/features/chat/hooks/replayBuffer";
import type {
  MessageState,
  ToolRequestContent,
  ToolResponseContent,
} from "@/shared/types/messages";
import type { AcpNotificationHandler } from "./acpConnection";
import { getLocalSessionId } from "./acpSessionTracker";
import { perfLog } from "@/shared/lib/perfLog";

// Pre-set message ID for the next live stream per goose session
const presetMessageIds = new Map<string, string>();
const lastLiveTextChunkByMessage = new Map<string, string>();

// Per-session perf counters for replay/live streaming.
interface ReplayPerf {
  firstAt: number;
  lastAt: number;
  count: number;
}
const replayPerf = new Map<string, ReplayPerf>();
interface LivePerf {
  sendStartedAt: number;
  firstChunkAt: number | null;
  chunkCount: number;
}
const livePerf = new Map<string, LivePerf>();

type ConfigSelectValue = { value: string; name: string };
type AcpModelOption = { id: string; name: string; displayName?: string };
type ConfigSelectOption = {
  id?: string;
  category?: string;
  type?: string;
  currentValue?: string;
  options?:
    | { type: "ungrouped"; values: ConfigSelectValue[] }
    | {
        type: "grouped";
        groups: Array<{ options: ConfigSelectValue[] }>;
      };
  kind?: {
    type?: string;
    currentValue?: string;
    options?:
      | { type: "ungrouped"; values: ConfigSelectValue[] }
      | {
          type: "grouped";
          groups: Array<{ options: ConfigSelectValue[] }>;
        };
  };
};

/**
 * Registers a preset streaming message ID for a live (goose) session and initializes live-stream performance tracking.
 *
 * @param gooseSessionId - The identifier for the goose/live session
 * @param messageId - The message ID to mark as the active streaming message for the session
 */
export function setActiveMessageId(
  gooseSessionId: string,
  messageId: string,
): void {
  presetMessageIds.set(gooseSessionId, messageId);
  livePerf.set(gooseSessionId, {
    sendStartedAt: performance.now(),
    firstChunkAt: null,
    chunkCount: 0,
  });
}

/**
 * Clears the active streaming message for a goose session and finalizes related tracking.
 *
 * Removes the preset message ID and its per-session duplicate-chunk tracking entry (if any),
 * marks the active message as partial, and clears the preset from session state.
 * If live performance data exists for the session, logs stream performance (first-byte latency, total duration, and chunk count)
 * and removes that performance entry.
 *
 * @param gooseSessionId - The goose session identifier whose active message and tracking should be cleared
 */
export function clearActiveMessageId(gooseSessionId: string): void {
  const messageId = presetMessageIds.get(gooseSessionId);
  if (messageId) {
    const sessionId = getLocalSessionId(gooseSessionId) ?? gooseSessionId;
    lastLiveTextChunkByMessage.delete(`${sessionId}:${messageId}`);
  }
  markActiveMessagePartial(gooseSessionId);
  presetMessageIds.delete(gooseSessionId);
  const perf = livePerf.get(gooseSessionId);
  if (perf) {
    const sid = gooseSessionId.slice(0, 8);
    const total = performance.now() - perf.sendStartedAt;
    const ttft =
      perf.firstChunkAt !== null
        ? (perf.firstChunkAt - perf.sendStartedAt).toFixed(1)
        : "n/a";
    perfLog(
      `[perf:stream] ${sid} stream ended — ttft=${ttft}ms total=${total.toFixed(1)}ms chunks=${perf.chunkCount}`,
    );
    livePerf.delete(gooseSessionId);
  }
}

export function completeActiveMessage(gooseSessionId: string): void {
  updateActiveMessageState(gooseSessionId, "completed");
}

function markActiveMessagePartial(gooseSessionId: string): void {
  updateActiveMessageState(gooseSessionId, "partial");
}

/**
 * Update the active streaming message's state for the given goose session.
 *
 * Sets the message's `metadata.messageState` to `messageState`. If `messageState`
 * is `"completed"`, also sets `metadata.completionStatus` to `"completed"`.
 * This is a no-op if there is no preset active message for the goose session,
 * if the message cannot be found, if the message is already in a terminal
 * state, or if the message is not currently marked as `"streaming"`.
 *
 * @param gooseSessionId - The external goose session identifier used to locate the preset message
 * @param messageState - The new message state to apply (e.g., `"completed"`, `"partial"`)
 */
function updateActiveMessageState(
  gooseSessionId: string,
  messageState: MessageState,
): void {
  const messageId = presetMessageIds.get(gooseSessionId);
  if (!messageId) return;

  const sessionId = getLocalSessionId(gooseSessionId) ?? gooseSessionId;
  const store = useChatStore.getState();
  const message = store.messagesBySession[sessionId]?.find(
    (m) => m.id === messageId,
  );
  if (
    !message ||
    isTerminalMessageState(message.metadata) ||
    message.metadata?.messageState !== "streaming"
  ) {
    return;
  }

  store.updateMessage(sessionId, messageId, (msg) => ({
    ...msg,
    metadata: {
      ...msg.metadata,
      messageState,
      completionStatus:
        messageState === "completed"
          ? "completed"
          : msg.metadata?.completionStatus,
    },
  }));
}

/**
 * Determine whether the provided message metadata represents a terminal state.
 *
 * @param metadata - Message metadata object that may include `messageState` and/or `completionStatus`; may be `undefined`.
 * @returns `true` if `messageState` is `"completed"` or `"failed"`, or if `completionStatus` is `"completed"`, `"error"`, or `"stopped"`, `false` otherwise.
 */
function isTerminalMessageState(
  metadata:
    | { messageState?: MessageState; completionStatus?: string }
    | undefined,
) {
  if (!metadata) return false;
  const terminalMessageStates =
    metadata.messageState === "completed" || metadata.messageState === "failed";
  const terminalCompletionStatus =
    metadata.completionStatus === "completed" ||
    metadata.completionStatus === "error" ||
    metadata.completionStatus === "stopped";
  return terminalMessageStates || terminalCompletionStatus;
}

export async function handleSessionNotification(
  notification: SessionNotification,
): Promise<void> {
  const gooseSessionId = notification.sessionId;
  const sessionId = getLocalSessionId(gooseSessionId) ?? gooseSessionId;
  const { update } = notification;
  const isReplay = useChatStore.getState().loadingSessionIds.has(sessionId);

  if (isReplay) {
    const sid = sessionId.slice(0, 8);
    let perf = replayPerf.get(sessionId);
    const now = performance.now();
    if (!perf) {
      perf = { firstAt: now, lastAt: now, count: 0 };
      replayPerf.set(sessionId, perf);
      perfLog(`[perf:replay] ${sid} first notification received`);
    }
    perf.lastAt = now;
    perf.count += 1;
    handleReplay(sessionId, update);
  } else {
    const perf = livePerf.get(gooseSessionId);
    if (perf && update.sessionUpdate === "agent_message_chunk") {
      perf.chunkCount += 1;
      if (perf.firstChunkAt === null) {
        perf.firstChunkAt = performance.now();
        const sid = gooseSessionId.slice(0, 8);
        perfLog(
          `[perf:stream] ${sid} first agent_message_chunk at ttft=${(perf.firstChunkAt - perf.sendStartedAt).toFixed(1)}ms`,
        );
      }
    }
    handleLive(sessionId, gooseSessionId, update);
  }
}

export function getReplayPerf(
  sessionId: string,
): { count: number; spanMs: number } | null {
  const perf = replayPerf.get(sessionId);
  if (!perf) return null;
  return { count: perf.count, spanMs: perf.lastAt - perf.firstAt };
}

export function clearReplayPerf(sessionId: string): void {
  replayPerf.delete(sessionId);
}

function handleReplay(sessionId: string, update: SessionUpdate): void {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const messageId = update.messageId ?? crypto.randomUUID();
      const buffer = ensureReplayBuffer(sessionId);
      if (!getBufferedMessage(sessionId, messageId)) {
        buffer.push({
          id: messageId,
          role: "assistant",
          created: Date.now(),
          content: [],
          metadata: {
            userVisible: true,
            agentVisible: true,
            completionStatus: "inProgress",
          },
        });
      }
      const msg = getBufferedMessage(sessionId, messageId);
      if (msg && update.content.type === "text" && "text" in update.content) {
        const last = msg.content[msg.content.length - 1];
        if (last?.type === "text") {
          (last as { type: "text"; text: string }).text += update.content.text;
        } else {
          msg.content.push({ type: "text", text: update.content.text });
        }
      }
      break;
    }

    case "user_message_chunk": {
      const messageId = update.messageId ?? crypto.randomUUID();
      const buffer = ensureReplayBuffer(sessionId);
      const existing = getBufferedMessage(sessionId, messageId);
      if (
        !existing &&
        update.content.type === "text" &&
        "text" in update.content
      ) {
        buffer.push({
          id: messageId,
          role: "user",
          created: Date.now(),
          content: [{ type: "text", text: update.content.text }],
          metadata: { userVisible: true, agentVisible: true },
        });
      } else if (
        existing &&
        update.content.type === "text" &&
        "text" in update.content
      ) {
        const last = existing.content[existing.content.length - 1];
        if (last?.type === "text") {
          (last as { type: "text"; text: string }).text += update.content.text;
        } else {
          existing.content.push({ type: "text", text: update.content.text });
        }
      }
      break;
    }

    case "tool_call": {
      const msg = findMessageInBuffer(sessionId, update.toolCallId);
      if (msg) {
        msg.content.push({
          type: "toolRequest",
          id: update.toolCallId,
          name: update.title,
          arguments: {},
          status: "executing",
          startedAt: Date.now(),
        });
      }
      break;
    }

    case "tool_call_update": {
      const msg = findMessageWithToolCall(sessionId, update.toolCallId);
      if (msg) {
        if (update.title) {
          const tc = msg.content.find(
            (c) => c.type === "toolRequest" && c.id === update.toolCallId,
          );
          if (tc && tc.type === "toolRequest") {
            (tc as ToolRequestContent).name = update.title;
          }
        }
        if (update.status === "completed" || update.status === "failed") {
          const tc = msg.content.find(
            (c) => c.type === "toolRequest" && c.id === update.toolCallId,
          );
          if (tc && tc.type === "toolRequest") {
            const idx = msg.content.indexOf(tc);
            if (idx >= 0) {
              msg.content[idx] = {
                ...tc,
                status: "completed",
              } as ToolRequestContent;
            }
          }
          const resultText = extractToolResultText(update);
          msg.content.push({
            type: "toolResponse",
            id: update.toolCallId,
            name: (tc as ToolRequestContent)?.name ?? "",
            result: resultText,
            isError: update.status === "failed",
          });
        }
      }
      break;
    }

    case "session_info_update":
    case "config_option_update":
    case "usage_update":
      handleShared(sessionId, update);
      break;

    default:
      break;
  }
}

/**
 * Process a live session update and apply it to the chat store (create or update the streaming message, append text/tool blocks, and update streaming state).
 *
 * Handles these update kinds:
 * - `agent_message_chunk`: ensures a streaming assistant message exists (using `update.messageId`, a preset id for the goose session, or a new id), deduplicates identical consecutive text chunks for the same session/message, and appends or concatenates text into the trailing text block of the streaming message. If the message is in a terminal state, the update is ignored.
 * - `tool_call`: appends a `toolRequest` block with `status: "executing"` to the current streaming message.
 * - `tool_call_update`: updates the matching `toolRequest` name (if provided), marks it completed on finished/failed updates, extracts tool output as a `toolResponse` block, and appends that response.
 * - `session_info_update` / `config_option_update` / `usage_update`: delegated to shared handlers.
 *
 * Side effects: may add or modify messages in the store, set the session's streaming message id, update pending assistant provider, and record last-seen live text chunks to prevent duplicate processing.
 *
 * @param sessionId - The local session id used by the chat store.
 * @param gooseSessionId - The external/goose session id used to look up any preset message id for live streaming.
 * @param update - The incoming session update to process.
 */
function handleLive(
  sessionId: string,
  gooseSessionId: string,
  update: SessionUpdate,
): void {
  const store = useChatStore.getState();

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const messageId =
        update.messageId ??
        presetMessageIds.get(gooseSessionId) ??
        crypto.randomUUID();
      const existing = store.messagesBySession[sessionId]?.find(
        (m) => m.id === messageId,
      );

      if (isTerminalMessageState(existing?.metadata)) {
        break;
      }

      if (!existing) {
        store.addMessage(sessionId, {
          id: messageId,
          role: "assistant",
          created: Date.now(),
          content: [],
          metadata: {
            userVisible: true,
            agentVisible: true,
            messageState: "streaming",
            completionStatus: "inProgress",
          },
        });
        store.setPendingAssistantProvider(sessionId, null);
        store.setStreamingMessageId(sessionId, messageId);
      }

      if (update.content.type === "text" && "text" in update.content) {
        const text = update.content.text;
        const chunkKey = `${sessionId}:${messageId}`;
        if (lastLiveTextChunkByMessage.get(chunkKey) === text) {
          break;
        }
        lastLiveTextChunkByMessage.set(chunkKey, text);
        store.setStreamingMessageId(sessionId, messageId);
        store.updateMessage(sessionId, messageId, (msg) => {
          if (isTerminalMessageState(msg.metadata)) {
            return msg;
          }
          const lastContent = msg.content[msg.content.length - 1];
          if (lastContent?.type !== "text") {
            return {
              ...msg,
              content: [...msg.content, { type: "text" as const, text }],
            };
          }
          const content = [...msg.content];
          content[content.length - 1] = {
            type: "text" as const,
            text: lastContent.text + text,
          };
          return { ...msg, content };
        });
      }
      break;
    }

    case "tool_call": {
      const messageId = findStreamingMessageId(sessionId);
      if (!messageId) break;

      const toolRequest: ToolRequestContent = {
        type: "toolRequest",
        id: update.toolCallId,
        name: update.title,
        arguments: {},
        status: "executing",
        startedAt: Date.now(),
      };
      store.setStreamingMessageId(sessionId, messageId);
      store.appendToStreamingMessage(sessionId, toolRequest);
      break;
    }

    case "tool_call_update": {
      const messageId = findStreamingMessageId(sessionId);
      if (!messageId) break;

      if (update.title) {
        store.updateMessage(sessionId, messageId, (msg) => ({
          ...msg,
          content: msg.content.map((c) =>
            c.type === "toolRequest" && c.id === update.toolCallId
              ? { ...c, name: update.title ?? "" }
              : c,
          ),
        }));
      }

      if (update.status === "completed" || update.status === "failed") {
        const streamingMessage = store.messagesBySession[sessionId]?.find(
          (m) => m.id === messageId,
        );
        const toolRequest = streamingMessage
          ? findLatestUnpairedToolRequest(streamingMessage.content)
          : null;

        store.updateMessage(sessionId, messageId, (msg) => ({
          ...msg,
          content: msg.content.map((block) =>
            block.type === "toolRequest" && block.id === update.toolCallId
              ? { ...block, status: "completed" }
              : block,
          ),
        }));

        const resultText = extractToolResultText(update);
        const toolResponse: ToolResponseContent = {
          type: "toolResponse",
          id: update.toolCallId,
          name: toolRequest?.name ?? "",
          result: resultText,
          isError: update.status === "failed",
        };
        store.setStreamingMessageId(sessionId, messageId);
        store.appendToStreamingMessage(sessionId, toolResponse);
      }
      break;
    }

    case "session_info_update":
    case "config_option_update":
    case "usage_update":
      handleShared(sessionId, update);
      break;

    default:
      break;
  }
}

function handleShared(sessionId: string, update: SessionUpdate): void {
  switch (update.sessionUpdate) {
    case "session_info_update": {
      const info = update as SessionUpdate & {
        sessionUpdate: "session_info_update";
      };
      if ("title" in info && info.title) {
        const session = useChatSessionStore.getState().getSession(sessionId);
        if (session && !session.userSetName) {
          useChatSessionStore
            .getState()
            .updateSession(
              sessionId,
              { title: info.title as string },
              { persistOverlay: false },
            );
        }
      }
      break;
    }

    case "config_option_update": {
      const configUpdate = update as SessionUpdate & {
        sessionUpdate: "config_option_update";
        configOptions?: unknown[];
        options?: unknown[];
      };
      const options =
        Array.isArray(configUpdate.configOptions) &&
        configUpdate.configOptions.length > 0
          ? configUpdate.configOptions
          : configUpdate.options;
      if (Array.isArray(options)) {
        applySessionConfigOptions(sessionId, options);
      }
      break;
    }

    case "usage_update": {
      const usage = update as SessionUpdate & { sessionUpdate: "usage_update" };
      useChatStore.getState().updateTokenState(sessionId, {
        accumulatedTotal: usage.used,
        contextLimit: usage.size,
      });
      break;
    }

    default:
      break;
  }
}

// Helpers

function findStreamingMessageId(sessionId: string): string | null {
  return useChatStore.getState().getSessionRuntime(sessionId)
    .streamingMessageId;
}

function findMessageInBuffer(
  sessionId: string,
  _toolCallId: string,
): ReturnType<typeof getBufferedMessage> {
  const buffer = ensureReplayBuffer(sessionId);
  return buffer[buffer.length - 1];
}

function findMessageWithToolCall(
  sessionId: string,
  toolCallId: string,
): ReturnType<typeof getBufferedMessage> {
  const buffer = ensureReplayBuffer(sessionId);
  for (let i = buffer.length - 1; i >= 0; i--) {
    const msg = buffer[i];
    if (
      msg.content.some((c) => c.type === "toolRequest" && c.id === toolCallId)
    ) {
      return msg;
    }
  }
  return buffer[buffer.length - 1];
}

function currentSelectValue(option: ConfigSelectOption | undefined) {
  if (option?.kind?.type === "select") return option.kind.currentValue;
  if (option?.type === "select") return option.currentValue;
  return undefined;
}

function selectOptionsToModels(
  option: ConfigSelectOption | undefined,
): AcpModelOption[] {
  const select =
    option?.kind?.type === "select"
      ? option.kind
      : option?.type === "select"
        ? option
        : undefined;
  if (!select) return [];
  const availableModels: AcpModelOption[] = [];

  if (select.options?.type === "ungrouped") {
    for (const v of select.options.values) {
      availableModels.push({ id: v.value, name: v.name });
    }
  } else if (select.options?.type === "grouped") {
    for (const group of select.options.groups) {
      for (const v of group.options) {
        availableModels.push({ id: v.value, name: v.name });
      }
    }
  }

  return availableModels;
}

export function applySessionConfigOptions(
  sessionId: string,
  rawOptions: unknown[],
  providerIdOverride?: string,
): void {
  const options = rawOptions as ConfigSelectOption[];
  const providerOption = options.find(
    (opt) => opt.id === "provider" || opt.category === "provider",
  );
  const modelOption = options.find(
    (opt) => opt.id === "model" || opt.category === "model",
  );
  const providerId = currentSelectValue(providerOption) ?? providerIdOverride;
  const currentModelId = currentSelectValue(modelOption);
  const availableModels = selectOptionsToModels(modelOption);
  const patch: {
    providerId?: string;
    modelId?: string;
    modelName?: string;
  } = {};

  if (providerId) {
    patch.providerId = providerId;
  }

  const effectiveModelName = currentModelId
    ? (availableModels.find((m) => m.id === currentModelId)?.name ??
      currentModelId)
    : undefined;
  if (currentModelId) {
    patch.modelId = currentModelId;
    patch.modelName = effectiveModelName;
  }

  const sessionStore = useChatSessionStore.getState();
  if (availableModels.length > 0) {
    sessionStore.setSessionModels(sessionId, availableModels);
    if (providerId) {
      sessionStore.cacheModelsForProvider(providerId, availableModels);
    }
  }

  if (Object.keys(patch).length > 0) {
    sessionStore.updateSession(sessionId, patch, {
      persistOverlay: false,
    });
  }
}

function extractToolResultText(update: {
  // biome-ignore lint/suspicious/noExplicitAny: ACP SDK ToolCallContent type is complex
  content?: Array<any> | null;
  rawOutput?: unknown;
}): string {
  if (update.content && update.content.length > 0) {
    for (const item of update.content) {
      if (item.type === "content" && item.content?.type === "text") {
        return item.content.text;
      }
    }
  }
  if (update.rawOutput !== undefined && update.rawOutput !== null) {
    return typeof update.rawOutput === "string"
      ? update.rawOutput
      : JSON.stringify(update.rawOutput);
  }
  return "";
}

/**
 * Resets in-memory tracking for active live/replay messages.
 *
 * Clears the stored preset message IDs for goose sessions and the last-seen live text chunk cache used to deduplicate streaming chunks.
 */
export function clearMessageTracking(): void {
  presetMessageIds.clear();
  lastLiveTextChunkByMessage.clear();
}

const handler: AcpNotificationHandler = {
  handleSessionNotification,
};

export default handler;
