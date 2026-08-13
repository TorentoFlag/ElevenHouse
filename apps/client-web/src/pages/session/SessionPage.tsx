import { VideoSessionExperience } from "@elevenhouse/session-web-client/experience";
import "@elevenhouse/session-web-client/VideoSessionExperience.css";
import { useI18n } from "@elevenhouse/i18n";
import { Navigate, useNavigate, useParams } from "react-router";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import { sessionApi } from "../../features/sessions/api/sessionApi";

export function SessionPage() {
  const { locale } = useI18n<ClientCopy>();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  if (!sessionId) return <Navigate to="/me" replace />;
  return (
    <VideoSessionExperience
      api={sessionApi}
      locale={locale}
      sessionId={sessionId}
      onExit={() => navigate("/me")}
    />
  );
}
