import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { API_BASE_URL } from "@/api/client";
import { getAccessToken } from "@/lib/auth";
import { toast } from "@/components/ui/8bit/toast";
import { teamService } from "@/services/team.service";
import type { MeResponse, TeamEventPayload } from "@/types/auth";

const RECONNECT_DELAY_MS = 3000;

/** Live team state (life/score/attack) via Server-Sent Events, so attacks
 * from other teams show up without polling or a manual refresh.
 *
 * The JWT never travels in the URL: each connection attempt first swaps it
 * for a short-lived, single-use ticket (see team.service#getStreamTicket),
 * and only that ticket goes in the EventSource URL. Because a ticket is
 * single-use, a dropped connection needs a fresh one before reconnecting -
 * EventSource's built-in auto-reconnect (same URL) won't work here, so
 * reconnection is driven manually. */
export function useTeamEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!getAccessToken()) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const applyUpdate = (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as TeamEventPayload;
      queryClient.setQueryData<MeResponse>(["me"], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          team: {
            ...prev.team,
            life: payload.life,
            score: payload.score,
            attack: payload.attack,
          },
        };
      });
      return payload;
    };

    const scheduleReconnect = () => {
      source?.close();
      source = null;
      if (cancelled) return;
      reconnectTimeout = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      if (cancelled) return;
      try {
        const { data } = await teamService.getStreamTicket();
        if (cancelled) return;

        const url = `${API_BASE_URL}/teams/stream/?ticket=${encodeURIComponent(data.ticket)}`;
        source = new EventSource(url);

        source.addEventListener("team_attacked", (event) => {
          const payload = applyUpdate(event as MessageEvent);
          toast(payload.detail);
        });
        source.addEventListener("team_update", (event) => {
          applyUpdate(event as MessageEvent);
        });
        source.onerror = scheduleReconnect;
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimeout);
      source?.close();
    };
  }, [queryClient]);
}
