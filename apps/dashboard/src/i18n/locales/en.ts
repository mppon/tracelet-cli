/** 本文件提供 Tracelet Dashboard 的英文文案。 */

import type { Messages } from "../types";

export const en: Messages = {
  app: {
    loadSessionsError: "Failed to load sessions",
    loadExchangeError: "Failed to load request",
  },
  language: {
    label: "Switch interface language",
    chinese: "中文",
    english: "English",
  },
  sidebar: {
    subtitle: "Local LLM traces",
    sessions: "Sessions",
    noRecords: "No records yet. Start Claude Code or Codex through Tracelet first.",
    unknownModel: "Unknown model",
    complete: "Complete",
    recording: "Recording",
  },
  json: {
    format: "JSON",
    expandAll: "Expand all",
    expandTwo: "Expand two levels",
    collapse: "Collapse nodes",
    copy: "Copy JSON",
    copied: "Copied",
    collapseAria: "Collapse JSON",
    expandAria: "Expand JSON",
  },
  detail: {
    loading: "Loading trace…",
    emptyTitle: "Select an LLM request",
    emptyHint: "Inspect the complete Agent request, aggregated response, and raw stream data.",
    unknownModel: "Unknown model",
    complete: "Complete",
    recording: "Recording",
    navLabel: "Request details",
    tabs: {
      overview: "Overview",
      request: "Complete Request",
      response: "Complete Response",
      events: "SSE Events",
    },
    metrics: {
      duration: "Duration",
      request: "Request",
      response: "Response",
      events: "SSE events",
    },
    fields: {
      request: "Request information",
      model: "Model",
      protocol: "Protocol",
      path: "Path",
      startedAt: "Started at",
      session: "Session",
      sessionSource: "Session source",
      httpStatus: "HTTP status",
    },
    sources: {
      header: "Request header",
      conversation: "Conversation",
      responseChain: "Response chain",
      run: "Current run",
    },
    reconstructError: "The official SDK could not reconstruct the complete response",
    selectEvent: "Select an SSE event to inspect its complete content.",
    chunkRange: "Source chunks",
    rawEvent: "Raw SSE event",
  },
};
