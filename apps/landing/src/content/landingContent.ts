import { createAuthHref } from "../config/authRoutes";

export const primaryCtaHref = createAuthHref("register");
export const loginHref = createAuthHref("login");

export const landingSections = [
  { id: "hero", label: "Главная" },
  { id: "pains", label: "Проблемы" },
  { id: "showcase", label: "Превью" },
  { id: "features", label: "Возможности" },
  { id: "replace", label: "Сервисы" },
  { id: "how", label: "Как это работает" },
  { id: "pricing", label: "Тарифы" },
  { id: "quotes", label: "Отзывы" },
  { id: "faq", label: "FAQ" },
  { id: "footer", label: "Подвал" }
] as const;

export type IconName =
  | "ai"
  | "box"
  | "calendar"
  | "chart"
  | "chat"
  | "check"
  | "chevD"
  | "chevR"
  | "content"
  | "flow"
  | "globe"
  | "library"
  | "moon"
  | "num"
  | "orbit"
  | "play"
  | "spark"
  | "star"
  | "users"
  | "wallet";

export const navLinks = [
  { label: "Возможности", href: "#features" },
  { label: "Как это работает", href: "#how" },
  { label: "Тарифы", href: "#pricing" }
] as const;

export const heroProof = [
  "Бесплатный тариф — без карты",
  "Запуск за один вечер",
  "AI-черновик разбора за минуты"
] as const;

export const heroStats = [
  ["1 200+", "астрологов"],
  ["9", "систем в одном кабинете"],
  ["4.9★", "оценка практиков"]
] as const;

export const pains = [
  {
    problem: "Карты - в программе, заметки - в блокноте, файлы - по чатам",
    solution: "Карта, заметки, файлы и вся история - в одной карточке клиента"
  },
  {
    problem: "Заявки в директе: «напомните дату и время рождения?»",
    solution: "Запись сама собирает данные рождения и строит карту"
  },
  {
    problem: "Каждый разбор пишете с нуля - уходит целый вечер",
    solution: "AI собирает черновик разбора за минуты - вы только правите"
  },
  {
    problem: "Оплата переводом «на карту», без предоплат и чеков",
    solution: "Платежные ссылки, предоплата, возвраты и кошелек - встроены"
  },
  {
    problem: "Клиент пропал после первой консультации",
    solution: "Астрокалендарь и воронки сами находят повод вернуть его"
  }
] as const;

export const results = [
  { value: "-12 ч", label: "рутины в неделю", color: "#F4C430" },
  { value: "x3", label: "быстрее готов разбор", color: "#E59CC4" },
  { value: "+34%", label: "повторных продаж", color: "#B79CFB" },
  { value: "24/7", label: "воронки продают за вас", color: "#6FA8FF" }
] as const;

export const showcaseItems: ReadonlyArray<{
  readonly id: "engine" | "flows" | "crm" | "analytics";
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
  readonly colors: readonly [string, string];
}> = [
  {
    id: "engine",
    icon: "orbit",
    title: "Движок карт",
    text: "Натал, синастрия, прогрессии, детские карты - с колесом, таблицами и AI-трактовкой.",
    colors: ["#F4C430", "#F47A7A"]
  },
  {
    id: "flows",
    icon: "flow",
    title: "Воронки + AI",
    text: "Нейросеть считает карты, отвечает клиентам и продает автоматически.",
    colors: ["#E59CC4", "#B79CFB"]
  },
  {
    id: "crm",
    icon: "users",
    title: "Клиенты и CRM",
    text: "Карточка клиента: история, оплаты, расчеты, переписка из всех каналов.",
    colors: ["#6FA8FF", "#4EC8A0"]
  },
  {
    id: "analytics",
    icon: "chart",
    title: "Аналитика",
    text: "Доход, конверсии, цели и прогнозы - вся практика как на ладони.",
    colors: ["#B79CFB", "#6FA8FF"]
  }
];

export const features: ReadonlyArray<{
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle: string;
  readonly colors: readonly [string, string];
  readonly points: readonly string[];
}> = [
  {
    icon: "orbit",
    title: "Движок карт",
    subtitle: "Ядро для расчетов любой сложности.",
    colors: ["#F4C430", "#F47A7A"],
    points: [
      "Натал, транзиты, прогрессии",
      "Синастрия и композит",
      "Соляры и возвращения",
      "Колесо, таблицы, аспекты"
    ]
  },
  {
    icon: "flow",
    title: "Воронки + AI",
    subtitle: "Автоматизация делает рутину за вас.",
    colors: ["#E59CC4", "#B79CFB"],
    points: [
      "AI считает карты и пишет разборы",
      "Отвечает клиентам в вашем тоне",
      "Готовые сценарии-шаблоны",
      "Лид -> оплата без участия"
    ]
  },
  {
    icon: "num",
    title: "Все системы",
    subtitle: "Не только астрология.",
    colors: ["#B79CFB", "#6FA8FF"],
    points: ["Нумерология", "Матрица судьбы", "Дизайн человека", "Привязка к клиенту"]
  },
  {
    icon: "box",
    title: "Конструктор продуктов",
    subtitle: "Соберите услугу из кубиков.",
    colors: ["#6FA8FF", "#4EC8A0"],
    points: ["Формат, длительность, цена", "Пакеты и подписки", "Доступы и медиа", "Живое превью"]
  },
  {
    icon: "wallet",
    title: "Оплаты и кошелек",
    subtitle: "Деньги под контролем.",
    colors: ["#4EC8A0", "#F4C430"],
    points: ["Прием оплат и ссылки", "Предоплата и постоплата", "Возвраты", "Вывод средств"]
  },
  {
    icon: "moon",
    title: "Астрокалендарь",
    subtitle: "Поводы для касаний и продаж.",
    colors: ["#F4C430", "#B79CFB"],
    points: ["Транзиты и фазы Луны", "Соляры и ДР клиентов", "События по их картам", "В воронку одним кликом"]
  },
  {
    icon: "content",
    title: "Контент и подписки",
    subtitle: "Растите аудиторию.",
    colors: ["#F47A7A", "#E59CC4"],
    points: ["Публичный и закрытый контент", "Автопостинг в соцсети", "Контент-план", "Доход с подписок"]
  },
  {
    icon: "library",
    title: "Справочник",
    subtitle: "Ваша база трактовок.",
    colors: ["#E59CC4", "#F4C430"],
    points: ["Знаки, дома, аспекты", "Базовый набор ElevenHouse", "Свои трактовки", "Поиск"]
  }
];

export const stackItems = [
  ["Программа расчета карт", "≈ 750 ₽/мес", "orbit"],
  ["CRM для клиентов", "≈ 1 490 ₽/мес", "users"],
  ["Конструктор сайта", "≈ 990 ₽/мес", "globe"],
  ["Рассылки и чат-боты", "≈ 1 290 ₽/мес", "chat"],
  ["Онлайн-запись", "≈ 760 ₽/мес", "calendar"],
  ["Прием оплат", "договор + %", "wallet"]
] as const;

export const includedItems = [
  "Движок карт + 9 систем расчетов",
  "CRM, запись и календарь",
  "Личная страница и продукты",
  "Воронки и AI-автоматизация",
  "Оплаты, кошелек и выводы",
  "Контент, рассылки и отзывы"
] as const;

export const steps: ReadonlyArray<{
  readonly number: string;
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
  readonly meta: string;
  readonly glyph: string;
  readonly colors: readonly [string, string];
}> = [
  {
    number: "01",
    icon: "users",
    title: "Регистрация и профиль",
    text: "Заполните профиль, выберите системы и каналы - за пару минут.",
    meta: "~2 минуты",
    glyph: "☿",
    colors: ["#F4C430", "#F47A7A"]
  },
  {
    number: "02",
    icon: "box",
    title: "Соберите продукты",
    text: "Услуги, подписки, лид-магниты в конструкторе. Опубликуйте личную страницу.",
    meta: "конструктор",
    glyph: "♀",
    colors: ["#E59CC4", "#B79CFB"]
  },
  {
    number: "03",
    icon: "flow",
    title: "Включите автоматизацию",
    text: "Воронки и AI ведут клиента от лида до оплаты, пока вы консультируете.",
    meta: "AI + воронки",
    glyph: "♃",
    colors: ["#B79CFB", "#6FA8FF"]
  },
  {
    number: "04",
    icon: "chart",
    title: "Растите практику",
    text: "Аналитика, астрокалендарь и контент возвращают клиентов снова и снова.",
    meta: "рост",
    glyph: "☉",
    colors: ["#6FA8FF", "#4EC8A0"]
  }
];

export const plans = [
  {
    id: "start",
    name: "Старт",
    tagline: "Для запуска личной страницы и первых продуктов.",
    price: 0,
    fee: 12,
    color: "#F4C430",
    icon: "spark" as IconName,
    popular: false,
    features: ["Личная страница", "3 продукта", "Базовый движок карт", "Справочник", "Поддержка"]
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Для практики с регулярными консультациями.",
    price: 2490,
    fee: 8,
    color: "#B79CFB",
    icon: "orbit" as IconName,
    popular: true,
    features: ["Все из Старт", "Безлимит продуктов", "CRM и календарь", "AI-черновики", "Воронки", "Аналитика"]
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "Для команды, контента и масштабирования.",
    price: 6490,
    fee: 5,
    color: "#6FA8FF",
    icon: "flow" as IconName,
    popular: false,
    features: ["Все из Pro", "Команда", "Контент и подписки", "White label", "API", "Приоритет"]
  }
] as const;

export const quotes = [
  {
    initials: "МК",
    name: "Марина К.",
    role: "астролог · 7 лет практики",
    chip: "+33% клиентов",
    color: "#F4C430",
    quote:
      "Разбор занимал у меня весь вечер. Теперь AI собирает черновик за пару минут по моим же трактовкам, я только довожу тоном."
  },
  {
    initials: "ДЛ",
    name: "Дарья Л.",
    role: "нумерология · матрица судьбы",
    chip: "18 продаж на автопилоте",
    color: "#B79CFB",
    quote:
      "Уехала в отпуск на две недели, а воронка сама продала разборы: собрала даты рождения, приняла оплаты и выдала материалы."
  },
  {
    initials: "ВМ",
    name: "Виктор М.",
    role: "Human Design",
    chip: "+47% к среднему чеку",
    color: "#6FA8FF",
    quote:
      "Платежные ссылки и предоплата сделали запись серьезнее - клиенты перестали пропадать, а средний чек вырос."
  }
] as const;

export const faq = [
  {
    question: "Я не дружу с техникой - справлюсь?",
    answer:
      "Да. Онбординг собирает профиль и первый продукт за несколько минут, а воронки включаются из готовых шаблонов."
  },
  {
    question: "Это правда бесплатно? Нужна карта?",
    answer:
      "Тариф «Старт» бесплатный, карта для регистрации не нужна. Платные тарифы нужны для автоматизации, большего числа продуктов и меньшей комиссии."
  },
  {
    question: "AI напишет разбор за меня - это этично?",
    answer:
      "AI считает карты и собирает черновик по вашей базе трактовок и в вашем тоне. Клиенту уходит только то, что утвердили вы."
  },
  {
    question: "Как я получаю деньги?",
    answer:
      "Клиенты платят по ссылке или на личной странице. Средства отражаются в кошельке ElevenHouse, вывод оформляется на карту или счет."
  }
] as const;

export const landingLanguages = ["ru", "en"] as const;
export type LandingLanguage = (typeof landingLanguages)[number];

export const landingCopy = {
  ru: {
    logoSub: "Кабинет астролога",
    navAria: "Основная навигация",
    languageAria: "Язык",
    navLinks,
    auth: {
      login: "Войти",
      startFree: "Начать бесплатно"
    },
    hero: {
      badge: "Платформа для астрологов нового поколения",
      title: ["Звёздная практика", "в одном кабинете"],
      subtitle:
        "Расчёты, клиенты, продукты, оплаты и контент. AI и воронки берут рутину на себя — вы остаётесь с людьми и звёздами.",
      demo: "Как это выглядит",
      proof: heroProof,
      stats: heroStats
    },
    pain: {
      kicker: "Узнаете себя?",
      title: "Ручной режим - против ElevenHouse",
      subtitle: "Та же практика, те же клиенты. Разница - сколько часов и денег остается вам.",
      manualTitle: "Практика в ручном режиме",
      productTitle: "Практика в ElevenHouse",
      note: "Медианные цифры активных практиков после 2 месяцев на платформе",
      items: pains,
      results
    },
    showcase: {
      kicker: "Живое превью",
      title: "Посмотрите, как это ощущается",
      items: showcaseItems,
      captions: ["Связано с клиентом", "Работает 24/7", "Все в одном кабинете"]
    },
    features: {
      kicker: "Возможности",
      title: "Все, что нужно практике",
      items: features
    },
    replace: {
      kicker: "Простая математика",
      title: "Один кабинет вместо шести сервисов",
      subtitle: "Перестаньте склеивать практику из подписок и вкладок - все уже собрано и связано между собой.",
      stackTitle: "Обычный набор практика",
      stackItems,
      totalLabel: "Итого",
      totalValue: "≈ 5 280 ₽/мес",
      totalNote: "+ шесть вкладок, шесть паролей и ничего не связано между собой",
      includedItems,
      price: "от 0 ₽",
      priceNote: "/мес - тариф «Старт» бесплатный",
      cta: "Собрать практику в одном месте"
    },
    how: {
      kicker: "Как начать",
      title: "Четыре шага до живой практики",
      subtitle: "От регистрации до автоматизации - без технической сборки из разных сервисов.",
      steps,
      cta: "Начать бесплатно"
    },
    pricing: {
      kicker: "Тарифы",
      title: "Начните бесплатно, растите по мере практики",
      subtitle: "Все тарифы включают движок карт и ключевые инструменты кабинета.",
      cycles: [
        ["month", "Месяц"],
        ["year", "Год -20%"]
      ] as const,
      plans,
      hit: "хит",
      perMonth: "/мес",
      fee: "Комиссия",
      saving: "экономия 20%",
      start: "Начать",
      choose: "Выбрать",
      locale: "ru-RU",
      note: "Все тарифы включают движок карт и все системы расчетов · смена тарифа в любой момент"
    },
    quotes: {
      kicker: "Уже в ElevenHouse",
      title: "Практики о платформе",
      items: quotes
    },
    faq: {
      kicker: "Коротко о важном",
      title: "Частые вопросы",
      items: faq
    },
    finalCta: {
      title: ["Соберите практику", "в один космос"],
      text: "Личная страница, продукты, клиенты, расчеты, оплаты и контент - в одном кабинете астролога.",
      cta: "Начать бесплатно"
    },
    legal: {
      privacy: "Политика конфиденциальности",
      offer: "Публичная оферта",
      legal: "Юридические данные",
      close: "Закрыть",
      title: "Демонстрационный документ-шаблон",
      text:
        "Юридические тексты из дизайн-референса перенесены как визуальное состояние модального окна. Перед публикацией production-документы должны быть заменены утвержденной юридической редакцией.",
      contacts: "Контакты: hello@elevenhouse.ai · privacy@elevenhouse.ai · support@elevenhouse.ai",
      confirm: "Понятно"
    },
    footer: {
      tagline: "Кабинет астролога с AI и автоматизацией. Расчеты, клиенты, продукты, оплаты и контент - в одном месте.",
      product: "Продукт",
      features: "Возможности",
      how: "Как это работает",
      pricing: "Тарифы",
      registration: "Регистрация",
      documents: "Документы",
      contacts: "Контакты",
      support: "Поддержка",
      legalId: "ИНН 7700000000 · ОГРН 1230000000000"
    }
  },
  en: {
    logoSub: "Astrologer workspace",
    navAria: "Primary navigation",
    languageAria: "Language",
    navLinks: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how" },
      { label: "Pricing", href: "#pricing" }
    ],
    auth: {
      login: "Log in",
      startFree: "Start free"
    },
    hero: {
      badge: "Next-generation platform for astrologers",
      title: ["Your stellar practice", "in one workspace"],
      subtitle:
        "Charts, clients, products, payments and content. AI and funnels handle the routine — you stay with people and the stars.",
      demo: "See how it works",
      proof: ["Free plan — no card", "Launch in one evening", "AI reading draft in minutes"],
      stats: [
        ["1 200+", "astrologers"],
        ["9", "systems in one workspace"],
        ["4.9★", "practitioner rating"]
      ]
    },
    pain: {
      kicker: "Sound familiar?",
      title: "Manual practice vs ElevenHouse",
      subtitle: "Same practice, same clients. The difference is how many hours and how much money stay with you.",
      manualTitle: "Manual practice",
      productTitle: "Practice in ElevenHouse",
      note: "Median results from active practitioners after 2 months on the platform",
      items: [
        {
          problem: "Charts in one app, notes in notebooks, files scattered across chats",
          solution: "Charts, notes, files and full history live in one client profile"
        },
        {
          problem: "DM bookings start with: “remind me of your birth date and time?”",
          solution: "Booking collects birth data and builds the chart automatically"
        },
        {
          problem: "Every reading starts from scratch and eats the whole evening",
          solution: "AI drafts the reading in minutes — you review and refine"
        },
        {
          problem: "Payments by transfer, without prepayment or clear records",
          solution: "Payment links, prepayment, refunds and wallet are built in"
        },
        {
          problem: "Clients disappear after the first consultation",
          solution: "Astro-calendar and funnels find the right reason to bring them back"
        }
      ],
      results: [
        { value: "-12 h", label: "routine per week", color: "#F4C430" },
        { value: "x3", label: "faster reading prep", color: "#E59CC4" },
        { value: "+34%", label: "repeat sales", color: "#B79CFB" },
        { value: "24/7", label: "funnels sell for you", color: "#6FA8FF" }
      ]
    },
    showcase: {
      kicker: "Live preview",
      title: "See how it feels in practice",
      items: [
        {
          id: "engine",
          icon: "orbit",
          title: "Chart engine",
          text: "Natal, synastry, progressions and child charts with wheel, tables and AI interpretation.",
          colors: ["#F4C430", "#F47A7A"]
        },
        {
          id: "flows",
          icon: "flow",
          title: "Funnels + AI",
          text: "AI calculates charts, replies to clients and sells automatically.",
          colors: ["#E59CC4", "#B79CFB"]
        },
        {
          id: "crm",
          icon: "users",
          title: "Clients and CRM",
          text: "Client profile with history, payments, charts and conversations from every channel.",
          colors: ["#6FA8FF", "#4EC8A0"]
        },
        {
          id: "analytics",
          icon: "chart",
          title: "Analytics",
          text: "Revenue, conversion, goals and forecasts — your whole practice at a glance.",
          colors: ["#B79CFB", "#6FA8FF"]
        }
      ],
      captions: ["Linked to client", "Works 24/7", "All in one workspace"]
    },
    features: {
      kicker: "Features",
      title: "Everything your practice needs",
      items: [
        {
          icon: "orbit",
          title: "Chart engine",
          subtitle: "A core for calculations of any complexity.",
          colors: ["#F4C430", "#F47A7A"],
          points: ["Natal, transits, progressions", "Synastry and composite", "Solar returns", "Wheel, tables, aspects"]
        },
        {
          icon: "flow",
          title: "Funnels + AI",
          subtitle: "Automation handles routine for you.",
          colors: ["#E59CC4", "#B79CFB"],
          points: ["AI calculates charts and writes drafts", "Replies in your tone", "Ready-made scenarios", "Lead -> payment without manual work"]
        },
        {
          icon: "num",
          title: "All systems",
          subtitle: "Not astrology only.",
          colors: ["#B79CFB", "#6FA8FF"],
          points: ["Numerology", "Matrix of destiny", "Human Design", "Linked to client"]
        },
        {
          icon: "box",
          title: "Product builder",
          subtitle: "Build an offer from blocks.",
          colors: ["#6FA8FF", "#4EC8A0"],
          points: ["Format, duration, price", "Packages and subscriptions", "Access and media", "Live preview"]
        },
        {
          icon: "wallet",
          title: "Payments and wallet",
          subtitle: "Money under control.",
          colors: ["#4EC8A0", "#F4C430"],
          points: ["Payments and links", "Prepay and postpay", "Refunds", "Payouts"]
        },
        {
          icon: "moon",
          title: "Astro-calendar",
          subtitle: "Reasons to reach out and sell.",
          colors: ["#F4C430", "#B79CFB"],
          points: ["Transits and moon phases", "Returns and birthdays", "Events by client charts", "Add to funnel in one click"]
        },
        {
          icon: "content",
          title: "Content and subscriptions",
          subtitle: "Grow your audience.",
          colors: ["#F47A7A", "#E59CC4"],
          points: ["Public and private content", "Social autoposting", "Content plan", "Subscription revenue"]
        },
        {
          icon: "library",
          title: "Reference library",
          subtitle: "Your interpretation base.",
          colors: ["#E59CC4", "#F4C430"],
          points: ["Signs, houses, aspects", "ElevenHouse starter set", "Your own meanings", "Search"]
        }
      ]
    },
    replace: {
      kicker: "Simple math",
      title: "One workspace instead of six services",
      subtitle: "Stop stitching your practice together from subscriptions and tabs — everything is connected already.",
      stackTitle: "Usual practitioner stack",
      stackItems: [
        ["Chart calculation app", "≈ ₽750/mo", "orbit"],
        ["Client CRM", "≈ ₽1,490/mo", "users"],
        ["Website builder", "≈ ₽990/mo", "globe"],
        ["Mailing and chatbots", "≈ ₽1,290/mo", "chat"],
        ["Online booking", "≈ ₽760/mo", "calendar"],
        ["Payment acceptance", "contract + %", "wallet"]
      ],
      totalLabel: "Total",
      totalValue: "≈ ₽5,280/mo",
      totalNote: "+ six tabs, six passwords and nothing connected",
      includedItems: [
        "Chart engine + 9 calculation systems",
        "CRM, booking and calendar",
        "Personal page and products",
        "Funnels and AI automation",
        "Payments, wallet and payouts",
        "Content, campaigns and reviews"
      ],
      price: "from ₽0",
      priceNote: "/mo - the Start plan is free",
      cta: "Bring the practice into one place"
    },
    how: {
      kicker: "How to start",
      title: "Four steps to a live practice",
      subtitle: "From registration to automation without assembling different services.",
      steps: [
        {
          number: "01",
          icon: "users",
          title: "Register and set up profile",
          text: "Fill in your profile, choose systems and channels in a couple of minutes.",
          meta: "~2 minutes",
          glyph: "☿",
          colors: ["#F4C430", "#F47A7A"]
        },
        {
          number: "02",
          icon: "box",
          title: "Build products",
          text: "Services, subscriptions and lead magnets in the builder. Publish your personal page.",
          meta: "builder",
          glyph: "♀",
          colors: ["#E59CC4", "#B79CFB"]
        },
        {
          number: "03",
          icon: "flow",
          title: "Turn on automation",
          text: "Funnels and AI move clients from lead to payment while you consult.",
          meta: "AI + funnels",
          glyph: "♃",
          colors: ["#B79CFB", "#6FA8FF"]
        },
        {
          number: "04",
          icon: "chart",
          title: "Grow the practice",
          text: "Analytics, astro-calendar and content bring clients back again and again.",
          meta: "growth",
          glyph: "☉",
          colors: ["#6FA8FF", "#4EC8A0"]
        }
      ],
      cta: "Start free"
    },
    pricing: {
      kicker: "Pricing",
      title: "Start free, grow with your practice",
      subtitle: "Every plan includes the chart engine and core workspace tools.",
      cycles: [
        ["month", "Month"],
        ["year", "Year -20%"]
      ] as const,
      plans: [
        {
          id: "start",
          name: "Start",
          tagline: "For launching your page and first products.",
          price: 0,
          fee: 12,
          color: "#F4C430",
          icon: "spark" as IconName,
          popular: false,
          features: ["Personal page", "3 products", "Basic chart engine", "Reference library", "Support"]
        },
        {
          id: "pro",
          name: "Pro",
          tagline: "For regular consultation practices.",
          price: 2490,
          fee: 8,
          color: "#B79CFB",
          icon: "orbit" as IconName,
          popular: true,
          features: ["Everything in Start", "Unlimited products", "CRM and calendar", "AI drafts", "Funnels", "Analytics"]
        },
        {
          id: "studio",
          name: "Studio",
          tagline: "For teams, content and scaling.",
          price: 6490,
          fee: 5,
          color: "#6FA8FF",
          icon: "flow" as IconName,
          popular: false,
          features: ["Everything in Pro", "Team", "Content and subscriptions", "White label", "API", "Priority"]
        }
      ],
      hit: "popular",
      perMonth: "/mo",
      fee: "Fee",
      saving: "save 20%",
      start: "Start",
      choose: "Choose",
      locale: "en-US",
      note: "Every plan includes the chart engine and all calculation systems · switch plans anytime"
    },
    quotes: {
      kicker: "Already in ElevenHouse",
      title: "Practitioners on the platform",
      items: [
        {
          initials: "MK",
          name: "Marina K.",
          role: "astrologer · 7 years in practice",
          chip: "+33% clients",
          color: "#F4C430",
          quote:
            "A reading used to take my whole evening. Now AI drafts it in minutes from my own meanings, and I only polish the tone."
        },
        {
          initials: "DL",
          name: "Daria L.",
          role: "numerology · matrix of destiny",
          chip: "18 autopilot sales",
          color: "#B79CFB",
          quote:
            "I left for a two-week vacation and the funnel sold readings by itself: collected birth data, accepted payments and delivered materials."
        },
        {
          initials: "VM",
          name: "Victor M.",
          role: "Human Design",
          chip: "+47% average check",
          color: "#6FA8FF",
          quote:
            "Payment links and prepayment made bookings more serious — clients stopped disappearing and average check grew."
        }
      ]
    },
    faq: {
      kicker: "Quick answers",
      title: "Frequently asked questions",
      items: [
        {
          question: "I am not technical — can I handle it?",
          answer: "Yes. Onboarding builds your profile and first product in minutes, and funnels start from ready-made templates."
        },
        {
          question: "Is it really free? Do I need a card?",
          answer:
            "The Start plan is free and no card is required to register. Paid plans add automation, more products and a lower fee."
        },
        {
          question: "Is it ethical if AI writes a reading for me?",
          answer:
            "AI calculates charts and drafts text from your interpretation base and tone. Clients receive only what you approve."
        },
        {
          question: "How do I receive money?",
          answer:
            "Clients pay by link or on your personal page. Funds appear in your ElevenHouse wallet, with payouts to card or account."
        }
      ]
    },
    finalCta: {
      title: ["Bring your practice", "into one cosmos"],
      text: "Personal page, products, clients, charts, payments and content in one astrologer workspace.",
      cta: "Start free"
    },
    legal: {
      privacy: "Privacy policy",
      offer: "Public offer",
      legal: "Legal details",
      close: "Close",
      title: "Demo document template",
      text:
        "Legal texts from the design reference are represented as the modal visual state. Before publication, production documents must be replaced with approved legal copy.",
      contacts: "Contacts: hello@elevenhouse.ai · privacy@elevenhouse.ai · support@elevenhouse.ai",
      confirm: "Got it"
    },
    footer: {
      tagline: "Astrologer workspace with AI and automation. Charts, clients, products, payments and content in one place.",
      product: "Product",
      features: "Features",
      how: "How it works",
      pricing: "Pricing",
      registration: "Sign up",
      documents: "Documents",
      contacts: "Contacts",
      support: "Support",
      legalId: "TIN 7700000000 · PSRN 1230000000000"
    }
  }
} as const;

export type LandingCopy = (typeof landingCopy)[LandingLanguage];
