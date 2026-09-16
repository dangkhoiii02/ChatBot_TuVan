export const BRIDGE_SOURCE = 'thay-minh-copilot' as const;

export type FillComposerMessage = { source: typeof BRIDGE_SOURCE; type: 'fill-composer'; text: string; requestId?: string };
export type WidgetReadyMessage = { source: typeof BRIDGE_SOURCE; type: 'widget-ready' };
export type WidgetResizeMessage = { source: typeof BRIDGE_SOURCE; type: 'widget-resize'; height?: number };

export type BridgeReadyMessage = { source: typeof BRIDGE_SOURCE; type: 'bridge-ready'; version: 1 };
export type FillComposerResultMessage = { source: typeof BRIDGE_SOURCE; type: 'fill-composer-result'; requestId?: string; ok: boolean; error?: string };
export type ConversationContextMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'conversation-context';
  conversationId: string | null;
  studentName?: string | null;
  pageId?: string | null;
  url?: string;
};

export type WidgetToHostMessage = FillComposerMessage | WidgetReadyMessage | WidgetResizeMessage;
export type HostToWidgetMessage = BridgeReadyMessage | FillComposerResultMessage | ConversationContextMessage;
