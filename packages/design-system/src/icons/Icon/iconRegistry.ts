import type { ReactElement, SVGProps } from "react";
import { ArrowLeft } from "../ArrowLeft/index.js";
import { ArrowUpRight } from "../ArrowUpRight/index.js";
import { Bell } from "../Bell/index.js";
import { Box } from "../Box/index.js";
import { Calendar } from "../Calendar/index.js";
import { Chat } from "../Chat/index.js";
import { Check } from "../Check/index.js";
import { ChevronDown } from "../ChevronDown/index.js";
import { ChevronLeft } from "../ChevronLeft/index.js";
import { ChevronRight } from "../ChevronRight/index.js";
import { Clock } from "../Clock/index.js";
import { Close } from "../Close/index.js";
import { Content } from "../Content/index.js";
import { Doc } from "../Doc/index.js";
import { Dots } from "../Dots/index.js";
import { Edit } from "../Edit/index.js";
import { FileDown } from "../FileDown/index.js";
import { Flow } from "../Flow/index.js";
import { Gift } from "../Gift/index.js";
import { Globe } from "../Globe/index.js";
import { Image } from "../Image/index.js";
import { LayoutGrid } from "../LayoutGrid/index.js";
import { Lightning } from "../Lightning/index.js";
import { LogoMoon } from "../LogoMoon/index.js";
import { Map } from "../Map/index.js";
import { Mic } from "../Mic/index.js";
import { Numerology } from "../Numerology/index.js";
import { Orbit } from "../Orbit/index.js";
import { Plus } from "../Plus/index.js";
import { Pin } from "../Pin/index.js";
import { Reference } from "../Reference/index.js";
import { Refresh } from "../Refresh/index.js";
import { Search } from "../Search/index.js";
import { Settings } from "../Settings/index.js";
import { Sparkle } from "../Sparkle/index.js";
import { Star } from "../Star/index.js";
import { Trash } from "../Trash/index.js";
import { Users } from "../Users/index.js";
import { Verified } from "../Verified/index.js";
import { Video } from "../Video/index.js";
import { Wallet } from "../Wallet/index.js";

export type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

export const iconRegistry = {
  arrowLeft: ArrowLeft,
  arrowUpRight: ArrowUpRight,
  bell: Bell,
  box: Box,
  calendar: Calendar,
  chat: Chat,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  clock: Clock,
  close: Close,
  content: Content,
  doc: Doc,
  dots: Dots,
  edit: Edit,
  fileDown: FileDown,
  flow: Flow,
  gift: Gift,
  globe: Globe,
  image: Image,
  layoutGrid: LayoutGrid,
  lightning: Lightning,
  logoMoon: LogoMoon,
  map: Map,
  mic: Mic,
  numerology: Numerology,
  orbit: Orbit,
  plus: Plus,
  pin: Pin,
  reference: Reference,
  refresh: Refresh,
  search: Search,
  settings: Settings,
  sparkle: Sparkle,
  star: Star,
  trash: Trash,
  users: Users,
  verified: Verified,
  video: Video,
  wallet: Wallet
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof iconRegistry;
