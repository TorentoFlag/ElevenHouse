import { Chat } from "@elevenhouse/design-system/icons/Chat";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import { Video } from "@elevenhouse/design-system/icons/Video";
import type { AuthVisualHighlightKey } from "../../common/i18n/clientCopy";
import type { ComponentType, SVGProps } from "react";

type HighlightIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const authHighlightIcons: Record<AuthVisualHighlightKey, HighlightIcon> = {
  sessions: Video,
  charts: Orbit,
  messages: Chat,
  content: Content
};
