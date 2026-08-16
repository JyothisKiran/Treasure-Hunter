import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RecordSubscription } from "pocketbase";

import { pb } from "@/api/client";
import { TEAMS_COLLECTION } from "@/api/endpoints";
import { getAccessToken } from "@/lib/auth";
import { toast } from "@/components/ui/8bit/toast";
import type { MeResponse, TeamRecord } from "@/types/auth";

/** Live team state (life/score/attack) over PocketBase's realtime API, so
 * attacks from other teams show up without polling or a manual refresh.
 *
 * Subscribing to the whole `teams` collection is safe: its view rule is
 * `@request.auth.team = id`, so the server only ever pushes the caller's own
 * team. The SDK authenticates the subscription with the stored auth token and
 * handles reconnection itself.
 *
 * The numbers ride along on the record; `last_event` carries the message for
 * the toast. Because *any* write to the team re-broadcasts the whole record
 * (a score change on scan, say), a notification is only new when its `seq`
 * advances - which is why the current seq is read once up front. */
export function useTeamEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!getAccessToken()) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let lastSeq = 0;

    const handle = ({ record }: RecordSubscription<TeamRecord>) => {
      queryClient.setQueryData<MeResponse>(["me"], (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          team: {
            ...previous.team,
            life: record.life,
            score: record.score,
            attack: record.attack,
          },
        };
      });

      const event = record.last_event;
      if (!event?.seq || event.seq <= lastSeq) return;
      lastSeq = event.seq;
      if (event.kind === "team_attacked") {
        toast(event.detail);
      }
    };

    const connect = async () => {
      try {
        const team = await pb.collection(TEAMS_COLLECTION).getFirstListItem<TeamRecord>("");
        lastSeq = team.last_event?.seq ?? 0;
      } catch {
        // No team yet (or it can't be read): start from scratch rather than
        // giving up on the subscription.
        lastSeq = 0;
      }
      if (cancelled) return;

      unsubscribe = await pb.collection(TEAMS_COLLECTION).subscribe<TeamRecord>("*", handle);
      if (cancelled) unsubscribe();
    };

    connect();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [queryClient]);
}
