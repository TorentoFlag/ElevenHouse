import { VideoSessionExperience } from "@elevenhouse/session-web-client/experience";
import "@elevenhouse/session-web-client/VideoSessionExperience.css";
import { useI18n } from "@elevenhouse/i18n";
import { Navigate, useNavigate, useParams } from "react-router";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { sessionApi } from "../../features/sessions/api/sessionApi";

export function SessionPage() {
  const { locale } = useI18n<AstrologerCopy>();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  if (!sessionId) return <Navigate to="/calendar" replace />;
  return (
    <VideoSessionExperience
      api={sessionApi}
      locale={locale}
      sessionId={sessionId}
      onExit={() => navigate("/calendar")}
    />
  );
}
