import { Chat } from "@elevenhouse/design-system/icons/Chat";
import { Content } from "@elevenhouse/design-system/icons/Content";
import { Orbit } from "@elevenhouse/design-system/icons/Orbit";
import { Video } from "@elevenhouse/design-system/icons/Video";
import type { ComponentType, SVGProps } from "react";

type HighlightIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const authHighlights: Array<{ Icon: HighlightIcon; label: string; description: string }> = [
  {
    Icon: Video,
    label: "Записи и онлайн консультации",
    description: "История сессий, записи и материалы — всегда под рукой"
  },
  {
    Icon: Orbit,
    label: "Ваши натальные карты",
    description: "Карты, расчёты и разборы от вашего астролога"
  },
  {
    Icon: Chat,
    label: "Личные сообщения",
    description: "Переписка с астрологом в одном окне"
  },
  {
    Icon: Content,
    label: "Астродневник и контент",
    description: "Прогнозы, дневник и закрытый контент по подписке"
  }
];
