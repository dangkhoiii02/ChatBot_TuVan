import {
  BRIDGE_SOURCE,
  type FillComposerMessage,
  type HostToWidgetMessage,
  type RequestDomMessagesMessage,
  type WidgetReadyMessage,
  type WidgetResizeMessage,
  type WidgetToHostMessage,
} from '@shared/bridge';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isHostMessage(data: unknown): data is HostToWidgetMessage {
  if (!isRecord(data)) return false;
  if (data.source !== BRIDGE_SOURCE) return false;
  const type = data.type;
  return (
    type === 'bridge-ready' ||
    type === 'fill-composer-result' ||
    type === 'conversation-context' ||
    type === 'pancake-access-token' ||
    type === 'dom-messages-result'
  );
}

export function emitToHost(message: WidgetToHostMessage): void {
  try {
    window.parent.postMessage(message, '*');
  } catch (err) {
    console.warn('[thay-minh-widget] postMessage failed', err);
  }
}

export function emitWidgetReady(): void {
  const message: WidgetReadyMessage = { source: BRIDGE_SOURCE, type: 'widget-ready' };
  emitToHost(message);
}

export function emitFillComposer(text: string, requestId?: string): void {
  const message: FillComposerMessage = {
    source: BRIDGE_SOURCE,
    type: 'fill-composer',
    text,
    requestId,
  };
  emitToHost(message);
}

export function emitWidgetResize(height?: number): void {
  const message: WidgetResizeMessage = {
    source: BRIDGE_SOURCE,
    type: 'widget-resize',
    height,
  };
  emitToHost(message);
}

export function emitRequestDomMessages(requestId: string): void {
  const message: RequestDomMessagesMessage = {
    source: BRIDGE_SOURCE,
    type: 'request-dom-messages',
    requestId,
  };
  emitToHost(message);
}

export function listenHostMessages(handler: (msg: HostToWidgetMessage) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!isHostMessage(event.data)) return;
    handler(event.data);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/** Promise wrapper for DOM messages fallback (B). */
export function requestDomMessagesFromHost(timeoutMs = 2500): Promise<
  import('@shared/bridge').DomBridgeMessage[]
> {
  const requestId = `dom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      stop();
      reject(new Error('DOM messages timeout'));
    }, timeoutMs);

    const stop = listenHostMessages((msg) => {
      if (msg.type !== 'dom-messages-result' || msg.requestId !== requestId) return;
      window.clearTimeout(timer);
      stop();
      if (!msg.ok) {
        reject(new Error(msg.error || 'DOM messages failed'));
        return;
      }
      resolve(msg.messages || []);
    });

    emitRequestDomMessages(requestId);
  });
}
