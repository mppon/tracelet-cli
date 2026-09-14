/** 本文件提供 Tracelet Dashboard 的简体中文文案。 */

import type { Messages } from "../types";

export const zhCN: Messages = {
  app: {
    loadSessionsError: "加载会话失败",
    loadExchangeError: "加载请求失败",
  },
  language: {
    label: "切换界面语言",
    chinese: "中文",
    english: "English",
  },
  sidebar: {
    subtitle: "本地 LLM 追踪",
    sessions: "会话",
    noRecords: "暂无记录，请先通过 Tracelet 启动 Claude Code 或 Codex。",
    unknownModel: "未知模型",
    complete: "已完成",
    recording: "记录中",
  },
  json: {
    format: "JSON",
    expandAll: "全部展开",
    expandTwo: "展开两层",
    collapse: "收起节点",
    copy: "复制 JSON",
    copied: "已复制",
    collapseAria: "折叠 JSON",
    expandAria: "展开 JSON",
  },
  detail: {
    loading: "正在读取记录…",
    emptyTitle: "选择一次 LLM 请求",
    emptyHint: "查看 Agent 发出的完整请求、聚合响应和原始流数据。",
    unknownModel: "未知模型",
    complete: "已完成",
    recording: "记录中",
    navLabel: "请求详情",
    tabs: {
      overview: "概览",
      request: "完整请求",
      response: "完整响应",
      events: "SSE 事件",
    },
    metrics: {
      duration: "总耗时",
      request: "请求大小",
      response: "响应大小",
      events: "SSE 事件数",
    },
    fields: {
      request: "请求信息",
      model: "模型",
      protocol: "协议",
      path: "路径",
      startedAt: "开始时间",
      session: "会话",
      sessionSource: "会话来源",
      httpStatus: "HTTP 状态",
    },
    sources: {
      header: "请求 Header",
      conversation: "Conversation",
      responseChain: "响应链",
      run: "当前运行",
    },
    reconstructError: "官方 SDK 未能还原完整响应",
    selectEvent: "选择一个 SSE 事件查看完整内容。",
    chunkRange: "来源 Chunk",
    rawEvent: "原始 SSE 事件",
  },
};
