export const BRIDGE_SOURCE = 'thay-minh-copilot' as const;

export type FillComposerMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'fill-composer';
  text: string;
  requestId?: string;
};
export type WidgetReadyMessage = { source: typeof BRIDGE_SOURCE; type: 'widget-ready' };
export type WidgetResizeMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'widget-resize';
  height?: number;
};
/** Widget asks host for DOM-scraped messages (fallback B). */
export type RequestDomMessagesMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'request-dom-messages';
  requestId: string;
};

export type BridgeReadyMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'bridge-ready';
  version: 1;
};
export type FillComposerResultMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'fill-composer-result';
  requestId?: string;
  ok: boolean;
  error?: string;
};
export type ConversationContextMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'conversation-context';
  conversationId: string | null;
  studentId?: string | null;
  studentName?: string | null;
  pageId?: string | null;
  url?: string;
};
/** Extension captured Pancake user access_token for login (do not log raw). */
export type PancakeAccessTokenMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'pancake-access-token';
  accessToken: string;
};
export type DomBridgeMessage = {
  id: string;
  sender: 'student' | 'staff' | 'system';
  text: string;
  createdAt: string;
  senderName?: string;
};
export type DomMessagesResultMessage = {
  source: typeof BRIDGE_SOURCE;
  type: 'dom-messages-result';
  requestId: string;
  ok: boolean;
  messages?: DomBridgeMessage[];
  error?: string;
};

export type WidgetToHostMessage =
  | FillComposerMessage
  | WidgetReadyMessage
  | WidgetResizeMessage
  | RequestDomMessagesMessage;
export type HostToWidgetMessage =
  | BridgeReadyMessage
  | FillComposerResultMessage
  | ConversationContextMessage
  | PancakeAccessTokenMessage
  | DomMessagesResultMessage;
