/** 本文件定义 Dashboard 国际化模块使用的语言与文案结构。 */

export type Locale = "zh-CN" | "en";

export interface Messages {
  app: {
    loadSessionsError: string;
    loadExchangeError: string;
  };
  language: {
    label: string;
    chinese: string;
    english: string;
  };
  sidebar: {
    subtitle: string;
    sessions: string;
    noRecords: string;
    unknownModel: string;
    complete: string;
    recording: string;
  };
  json: {
    format: string;
    expandAll: string;
    expandTwo: string;
    collapse: string;
    copy: string;
    copied: string;
    collapseAria: string;
    expandAria: string;
  };
  detail: {
    loading: string;
    emptyTitle: string;
    emptyHint: string;
    unknownModel: string;
    complete: string;
    recording: string;
    navLabel: string;
    tabs: {
      overview: string;
      request: string;
      response: string;
      events: string;
    };
    metrics: {
      duration: string;
      request: string;
      response: string;
      events: string;
    };
    fields: {
      request: string;
      model: string;
      protocol: string;
      path: string;
      startedAt: string;
      session: string;
      sessionSource: string;
      httpStatus: string;
    };
    sources: {
      header: string;
      conversation: string;
      responseChain: string;
      run: string;
    };
    reconstructError: string;
    selectEvent: string;
    chunkRange: string;
    rawEvent: string;
  };
}

export interface I18nValue {
  locale: Locale;
  messages: Messages;
  /** 切换 Dashboard 当前语言。 */
  setLocale(locale: Locale): void;
}
