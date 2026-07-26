import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { createClientJoinIntent } from "../../features/client-join/api/clientJoinApi";
import { writePendingClientJoinIntent } from "../../features/client-join/model/clientJoinStorage";
import {
  PublicAstrologerPageView,
  type PublicAstrologerJoinState
} from "./PublicAstrologerPageView";

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
    createClientJoinIntent({ publicHandle: handle })
      .then((intent) => {
        if (cancelled) return;
        writePendingClientJoinIntent(intent);
        setState({ status: "ready", intent });
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
