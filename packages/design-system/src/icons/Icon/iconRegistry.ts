import type { ReactElement, SVGProps } from "react";
import { ArrowLeft } from "../ArrowLeft/index.js";
import { Bell } from "../Bell/index.js";
import { Box } from "../Box/index.js";
import { Chat } from "../Chat/index.js";
import { Check } from "../Check/index.js";
import { ChevronDown } from "../ChevronDown/index.js";
import { ChevronLeft } from "../ChevronLeft/index.js";
import { ChevronRight } from "../ChevronRight/index.js";
import { Close } from "../Close/index.js";
import { Content } from "../Content/index.js";
import { Edit } from "../Edit/index.js";
import { Flow } from "../Flow/index.js";
import { LayoutGrid } from "../LayoutGrid/index.js";
import { LogoMoon } from "../LogoMoon/index.js";
import { Orbit } from "../Orbit/index.js";
import { Plus } from "../Plus/index.js";
import { Reference } from "../Reference/index.js";
import { Refresh } from "../Refresh/index.js";
import { Search } from "../Search/index.js";
import { Sparkle } from "../Sparkle/index.js";
import { Trash } from "../Trash/index.js";
import { Verified } from "../Verified/index.js";
import { Video } from "../Video/index.js";
import { Wallet } from "../Wallet/index.js";

export type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

export const iconRegistry = {
  arrowLeft: ArrowLeft,
  bell: Bell,
  box: Box,
  chat: Chat,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: Close,
  content: Content,
  edit: Edit,
  flow: Flow,
  layoutGrid: LayoutGrid,
  logoMoon: LogoMoon,
  orbit: Orbit,
  plus: Plus,
  reference: Reference,
  refresh: Refresh,
  search: Search,
  sparkle: Sparkle,
  trash: Trash,
  verified: Verified,
  video: Video,
  wallet: Wallet
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof iconRegistry;
