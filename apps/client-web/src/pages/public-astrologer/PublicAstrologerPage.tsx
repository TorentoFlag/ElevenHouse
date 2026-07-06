import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { CreateClientJoinIntentResponse } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { createClientJoinIntent } from "../../features/client-join/api/clientJoinApi";
import { writeClientJoinIntentToken } from "../../features/client-join/model/clientJoinStorage";

type JoinState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly intent: CreateClientJoinIntentResponse }
  | { readonly status: "error" };

export function PublicAstrologerPage() {
  const { handle } = useParams<{ handle: string }>();
  const [state, setState] = useState<JoinState>({ status: "loading" });

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
        writeClientJoinIntentToken(intent.token);
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

  if (state.status === "loading") {
    return <main aria-busy="true">Подготавливаем приглашение...</main>;
  }

  if (state.status === "error") {
    return (
      <main>
        <h1>Профиль недоступен</h1>
        <p>Проверьте ссылку, которую отправил астролог.</p>
      </main>
    );
  }

  return (
    <main>
      <p>@{state.intent.astrologer.publicHandle}</p>
      <h1>{state.intent.astrologer.publicName}</h1>
      <p>Войдите или зарегистрируйтесь, чтобы присоединиться к астрологу.</p>
      <Link to="/auth">Продолжить</Link>
    </main>
  );
}
