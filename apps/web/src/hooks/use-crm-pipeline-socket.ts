import { windowId } from "@kaneo/libs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getApiUrl } from "@/fetchers/get-api-url";
import { authClient } from "@/lib/auth-client";

export function getCrmWsUrl(pipelineId: string) {
  const base = getApiUrl("ws/crm");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/${encodeURIComponent(pipelineId)}?windowId=${encodeURIComponent(windowId)}`;
}

const CRM_MESSAGE_TYPES = new Set([
  "CRM_DEAL_CREATED",
  "CRM_DEAL_UPDATED",
  "CRM_DEAL_MOVED",
  "CRM_DEAL_DELETED",
]);

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
// Cloudflare closes idle WebSocket connections after 100 seconds.
const WS_PING_INTERVAL_MS = 30_000;

/**
 * Keeps the pipeline board in step with the rest of the team. Broadcasts caused
 * by this window are filtered out server-side via the window id, so a rep never
 * sees their own drag bounce back.
 */
export function useCrmPipelineSocket(pipelineId: string | undefined) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pipelineId || !session?.user?.id) return;

    retriesRef.current = 0;
    let disposed = false;

    function clearPing() {
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
    }

    function clearReconnect() {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (disposed || retriesRef.current >= MAX_RETRIES) return;
      const delay = BASE_DELAY * 2 ** retriesRef.current;
      retriesRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    }

    function connect() {
      reconnectRef.current = null;
      if (disposed || !pipelineId) return;

      const existing = wsRef.current;
      if (existing && existing.readyState !== WebSocket.CLOSED) {
        wsRef.current = null;
        existing.close();
      }

      const ws = new WebSocket(getCrmWsUrl(pipelineId));
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        retriesRef.current = 0;
        clearPing();
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, WS_PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const message = JSON.parse(String(event.data)) as { type?: string };
          if (message.type && CRM_MESSAGE_TYPES.has(message.type)) {
            // Stage totals are computed server-side, so a partial cache patch
            // would leave the column footers wrong. Refetch instead.
            queryClient.invalidateQueries({ queryKey: ["crm"] });
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        clearPing();
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearReconnect();
      clearPing();
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [pipelineId, queryClient, session?.user?.id]);
}
