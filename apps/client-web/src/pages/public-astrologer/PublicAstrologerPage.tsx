import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { createClientJoinIntent } from "../../features/client-join/api/clientJoinApi";
import { writePendingClientJoinIntent } from "../../features/client-join/model/clientJoinStorage";
import { listPublicReviews } from "../../features/reviews/api/publicReviewsApi";
import {
  PublicAstrologerPageView,
  type PublicAstrologerJoinState
} from "./PublicAstrologerPageView";

const joinIntentRequests = new Map<
  string,
  ReturnType<typeof createClientJoinIntent>
>();

export function PublicAstrologerPage() {
  const { handle } = useParams<{ handle: string }>();
  const [state, setState] = useState<PublicAstrologerJoinState>({ status: "loading" });

  useDocumentTitle(handle ? `Astrologer ${handle}` : "Astrologer");

  useEffect(() => {
    let cancelled = false;
    if (!handle) {
      setState({ status: "error" });
      return;
    }

    setState({ status: "loading" });
    getClientJoinIntent(handle)
      .then(async (intent) => {
        if (cancelled) return;
        writePendingClientJoinIntent(intent);
        setState({ status: "ready", intent, reviews: { status: "loading" } });

        try {
          const reviews = await listPublicReviews({
            astrologerUserId: intent.astrologer.userId,
            limit: 50,
            cursor: null
          });
          if (!cancelled) {
            setState({
              status: "ready",
              intent,
              reviews: { status: "ready", items: reviews.items }
            });
          }
        } catch {
          if (!cancelled) {
            setState({ status: "ready", intent, reviews: { status: "error" } });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handle]);

  return <PublicAstrologerPageView state={state} />;
}

function getClientJoinIntent(handle: string): ReturnType<typeof createClientJoinIntent> {
  const existing = joinIntentRequests.get(handle);
  if (existing) return existing;

  const request = createClientJoinIntent({ publicHandle: handle }).finally(() => {
    joinIntentRequests.delete(handle);
  });
  joinIntentRequests.set(handle, request);
  return request;
}
