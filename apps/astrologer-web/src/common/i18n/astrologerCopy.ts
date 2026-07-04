import type { OtpAuthFormCopy } from "@elevenhouse/design-system/components/OtpAuthForm";
import type { OtpCodeFormCopy } from "@elevenhouse/design-system/components/OtpCodeForm";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ProductIconName } from "../../features/products/model/productConstructorOptions";

export type AuthCopy = {
  documentTitle: string;
  sectionAriaLabel: string;
  visual: AuthVisualCopy;
  form: OtpAuthFormCopy;
  codeForm: OtpCodeFormCopy;
  validation: {
    email: string;
    name: string;
    phone: string;
  };
  errors: {
    invalidCode: string;
    identityExists: string;
    rateLimited: string;
    generic: string;
  };
  resendCooldown: {
    availableIn: string;
  };
  languageSwitcher: {
    ariaLabel: string;
  };
};

export type AuthVisualHighlightKey = "charts" | "automation" | "commerce";

export type AuthVisualCopy = {
  backLinkTitle: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  highlights: Array<{
    key: AuthVisualHighlightKey;
    label: string;
    description: string;
  }>;
  joinedInfoLabel: string;
  joinedInfoPrefix: string;
  joinedInfoCount: string;
  avatarInitials: string[];
};

export type AstrologerCopy = {
  auth: AuthCopy;
  appShell: {
    header: AppShellHeaderCopy;
    navigation: AppShellNavigationCopy;
  };
  dashboard: {
    documentTitle: string;
    title: string;
    kicker: string;
  };
  products: {
    documentTitle: string;
    title: string;
    createLabel: string;
    statusFilterAriaLabel: string;
    createTypeModal: {
      title: string;
      closeLabel: string;
      description: string;
    };
    editor: {
      title: string;
      closeLabel: string;
      typeLabel: string;
      titleLabel: string;
      titlePlaceholder: string;
      subtitleLabel: string;
      subtitlePlaceholder: string;
      priceLabel: string;
      durationLabel: string;
      durationSuffix: string;
      decrementDurationLabel: string;
      incrementDurationLabel: string;
      formatLabel: string;
      executionModeLabel: string;
      paymentModelLabel: string;
      packageLabel: string;
      packageSessionCountLabel: string;
      packageDiscountLabel: string;
      subscriptionLabel: string;
      subscriptionPeriodLabel: string;
      trialDaysLabel: string;
      participantModeLabel: string;
      groupSizeLabel: string;
      requiredClientDataLabel: string;
      methodsLabel: string;
      accessGrantsLabel: string;
      includedItemsLabel: string;
      includedItemTextLabel: string;
      includedItemPlaceholder: string;
      includedItemIconLabel: string;
      addIncludedItemLabel: string;
      removeIncludedItemLabel: string;
      modifiersLabel: string;
      modifierKindLabel: string;
      modifierFixedLabel: string;
      modifierPercentLabel: string;
      modifierFreeLabel: string;
      modifierLabelLabel: string;
      modifierLabelPlaceholder: string;
      modifierPriceLabel: string;
      addModifierLabel: string;
      removeModifierLabel: string;
      previewLabel: string;
      previewPriceLabel: string;
      previewIncludedItemsLabel: string;
      cancelLabel: string;
      saveDraftLabel: string;
      savingLabel: string;
      iconLabelByName: Record<ProductIconName, string>;
    };
    actions: {
      menuLabel: string;
      editLabel: string;
      duplicateLabel: string;
      publishLabel: string;
      draftLabel: string;
      archiveLabel: string;
    };
    summary: {
      activeLabel: string;
      salesLabel: string;
      revenueLabel: string;
      bestsellerLabel: string;
      emptyBestseller: string;
    };
    saveErrorLabel: string;
    emptyLabel: string;
    loadingLabel: string;
    errorLabel: string;
  };
  reference: {
    documentTitle: string;
    title: string;
    searchPlaceholder: string;
    resetLabel: string;
    addLabel: string;
    allCategoriesLabel: string;
    sourceFilterAriaLabel: string;
    sourceFilters: {
      all: string;
      platform: string;
      modified: string;
      custom: string;
    };
    sourceBadges: {
      platform: string;
      modified: string;
      custom: string;
    };
    entryActions: {
      editLabel: string;
      deleteLabel: string;
    };
    resetConfirmation: {
      title: string;
      closeLabel: string;
      description: string;
      confirmLabel: string;
      cancelLabel: string;
    };
    deleteConfirmation: {
      title: string;
      closeLabel: string;
      description: string;
      confirmLabel: string;
      cancelLabel: string;
    };
    entryModal: ReferenceEntryModalCopy;
    emptyLabel: string;
    emptyAddLabel: string;
    loadingLabel: string;
    errorLabel: string;
  };
  settings: {
    documentTitle: string;
    title: string;
  };
};

export type AppShellHeaderCopy = {
  searchPlaceholder: string;
  createLabel: string;
  createMenuAriaLabel: string;
  notificationsAriaLabel: string;
  unreadNotificationsLabel: string;
  profileSettingsLabel: string;
  profileName: string;
  profileTimezone: string;
  profileInitials: string;
  verifiedLabel: string;
};

export type AppShellNavigationItemId =
  | "dashboard"
  | "analytics"
  | "calendar"
  | "clients"
  | "products"
  | "funnels"
  | "chartEngine"
  | "numerology"
  | "destinyMatrix"
  | "humanDesign"
  | "astroCalendar"
  | "astroDiary"
  | "reference"
  | "settings";

export type AppShellNavigationItemCopy = {
  id: AppShellNavigationItemId;
  title: string;
  href: string;
  badge?: string;
  locked?: boolean;
};

export type AppShellNavigationCopy = {
  ariaLabel: string;
  brandTitle: string;
  brandSubtitle: string;
  collapseLabel: string;
  expandLabel: string;
  personalPage: {
    title: string;
    description: string;
    href: string;
    ariaLabel: string;
  };
  items: AppShellNavigationItemCopy[];
  footerItems: AppShellNavigationItemCopy[];
};

type ReferenceEntryModalCommonCopy = {
  categoryLabel: string;
  titleLabel: string;
  titlePlaceholder: string;
  contentLabel: string;
  contentPlaceholder: string;
  aiDraftLabel: string;
  aiDraftTitle: string;
  aiDraftLoadingLabel: string;
  aiDraftLoadingAnnouncement: string;
  aiDraftErrorLabel: string;
  aiDraftErrorTitle: string;
  aiDraftErrorAnnouncement: string;
  cancelLabel: string;
  saveLabel: string;
  savingLabel: string;
  genericError: string;
  validation: {
    categoryRequired: string;
    titleRequired: string;
    titleMaxLength: string;
    contentRequired: string;
    contentMaxLength: string;
  };
};

export type ReferenceEntryModalCopy = ReferenceEntryModalCommonCopy & {
  createTitle: string;
  editTitle: string;
  createCloseLabel: string;
  editCloseLabel: string;
};

export const astrologerCopyByLocale = {
  ru: {
    auth: {
      documentTitle: "ElevenHouse | Регистрация астролога",
      sectionAriaLabel: "Регистрация и вход астролога",
      visual: {
        backLinkTitle: "На главную",
        heroTitleLine1: "Кабинет, который",
        heroTitleLine2: "продаёт за вас",
        highlights: [
          {
            key: "charts",
            label: "Движок карт и все системы",
            description: ""
          },
          {
            key: "automation",
            label: "Воронки и AI-автоматизация",
            description: ""
          },
          {
            key: "commerce",
            label: "Оплаты, продукты, контент",
            description: ""
          }
        ],
        joinedInfoLabel: "Уже с нами 1 200+ астрологов",
        joinedInfoPrefix: "Уже с нами",
        joinedInfoCount: "1 200+ астрологов",
        avatarInitials: ["МК", "ДЛ", "ВМ", "НР"]
      },
      form: {
        brandTitle: "Eleven",
        brandAccent: "House",
        brandSubtitle: "КАБИНЕТ АСТРОЛОГА",
        registerTab: "Регистрация",
        loginTab: "Вход",
        registerTitle: "Создать кабинет",
        loginTitle: "Войти в кабинет",
        registerDescription: "Бесплатно, без карты. 10 минут до первой продажи.",
        loginDescription: "Войдите, чтобы вернуться к записям, клиентам и продажам.",
        nameLabel: "Имя",
        namePlaceholder: "Как вас зовут",
        emailLabel: "Email",
        emailPlaceholder: "you@example.com",
        phoneLabel: "Или телефон",
        phonePlaceholder: "+7 ___ ___ __ __",
        phoneCountryAriaLabel: "Страна телефона",
        hint: "Пришлём код для входа — пароль не нужен.",
        registerSubmitLabel: "Получить код",
        loginSubmitLabel: "Войти по коду"
      },
      codeForm: {
        title: "Введите код",
        description: "Мы отправили код на {identifier}",
        codeLabel: "Код из сообщения",
        codePlaceholder: "000000",
        submitLabel: "Продолжить",
        backLabel: "Изменить данные",
        changeIdentifierLabel: "Изменить контакт",
        resendLabel: "Отправить повторно",
        deliveryHint: "Проверьте SMS или сообщения в приложении"
      },
      validation: {
        email: "Введите корректный email",
        name: "Имя должно быть от 2 до 200 символов",
        phone: "Введите корректный номер телефона"
      },
      errors: {
        invalidCode: "Неверный или устаревший код",
        identityExists: "Кабинет с этим телефоном или email уже существует",
        rateLimited: "Слишком много попыток. Попробуйте позже",
        generic: "Не удалось выполнить запрос. Попробуйте ещё раз"
      },
      resendCooldown: {
        availableIn: "Повторно через {time}"
      },
      languageSwitcher: {
        ariaLabel: "Язык интерфейса"
      }
    },
    appShell: {
      header: {
        searchPlaceholder: "Поиск клиентов, заказов, карт…",
        createLabel: "Создать",
        createMenuAriaLabel: "Открыть меню создания",
        notificationsAriaLabel: "Открыть уведомления",
        unreadNotificationsLabel: "Есть непрочитанные уведомления",
        profileSettingsLabel: "Настройки профиля",
        profileName: "Алиса Вега",
        profileTimezone: "GMT+3, Москва",
        profileInitials: "АВ",
        verifiedLabel: "Верифицирован"
      },
      navigation: {
        ariaLabel: "Навигация кабинета астролога",
        brandTitle: "ElevenHouse",
        brandSubtitle: "ASTROLOGER WORKSPACE",
        collapseLabel: "Свернуть боковое меню",
        expandLabel: "Развернуть боковое меню",
        personalPage: {
          title: "Личная страница",
          description: "elevenhouse.app/alisa-vega",
          href: "https://elevenhouse.app/alisa-vega",
          ariaLabel: "Открыть личную страницу астролога"
        },
        items: [
          { id: "dashboard", title: "Дашборд", href: "/dashboard" },
          { id: "products", title: "Продукты", href: "/products" },
          { id: "reference", title: "Справочники", href: "/reference" }
        ],
        footerItems: [{ id: "settings", title: "Настройки", href: "/settings" }]
      }
    },
    dashboard: {
      documentTitle: "ElevenHouse | Кабинет астролога",
      kicker: "Astrologer surface",
      title: "ElevenHouse Astrologer Web"
    },
    products: {
      documentTitle: "ElevenHouse | Продукты",
      title: "Продукты",
      createLabel: "Создать продукт",
      statusFilterAriaLabel: "Фильтр статусов продуктов",
      createTypeModal: {
        title: "Новый продукт",
        closeLabel: "Закрыть выбор типа",
        description: "Выберите тип — дальше откроется конструктор с нужными полями."
      },
      editor: {
        title: "Конструктор продукта",
        closeLabel: "Закрыть конструктор продукта",
        typeLabel: "Тип",
        titleLabel: "Название",
        titlePlaceholder: "Например, Натальный разбор",
        subtitleLabel: "Описание",
        subtitlePlaceholder: "Коротко объясните, что получит клиент",
        priceLabel: "Цена",
        durationLabel: "Длительность",
        durationSuffix: " мин",
        decrementDurationLabel: "Уменьшить длительность",
        incrementDurationLabel: "Увеличить длительность",
        formatLabel: "Формат",
        executionModeLabel: "Сценарий выполнения",
        paymentModelLabel: "Оплата",
        packageLabel: "Пакет",
        packageSessionCountLabel: "Сессий в пакете",
        packageDiscountLabel: "Скидка пакета",
        subscriptionLabel: "Подписка",
        subscriptionPeriodLabel: "Период подписки",
        trialDaysLabel: "Пробный период",
        participantModeLabel: "Участники",
        groupSizeLabel: "Размер группы",
        requiredClientDataLabel: "Данные клиента",
        methodsLabel: "Методы",
        accessGrantsLabel: "Доступы",
        includedItemsLabel: "Что входит",
        includedItemTextLabel: "Текст пункта",
        includedItemPlaceholder: "Что получает клиент",
        includedItemIconLabel: "Иконка пункта",
        addIncludedItemLabel: "Добавить пункт",
        removeIncludedItemLabel: "Удалить пункт",
        modifiersLabel: "Модификаторы",
        modifierKindLabel: "Тип модификатора",
        modifierFixedLabel: "Фиксированная цена",
        modifierPercentLabel: "Процент",
        modifierFreeLabel: "Бесплатно",
        modifierLabelLabel: "Название модификатора",
        modifierLabelPlaceholder: "Название модификатора",
        modifierPriceLabel: "Цена модификатора",
        addModifierLabel: "Добавить модификатор",
        removeModifierLabel: "Удалить модификатор",
        previewLabel: "Превью",
        previewPriceLabel: "Стоимость",
        previewIncludedItemsLabel: "Включено",
        cancelLabel: "Отмена",
        saveDraftLabel: "Сохранить черновик",
        savingLabel: "Сохраняем",
        iconLabelByName: {
          check: "Галочка",
          sparkle: "Искра",
          video: "Видео",
          chat: "Чат",
          content: "Контент",
          flow: "Поток",
          box: "Коробка",
          wallet: "Кошелек",
          orbit: "Орбита",
          reference: "Справочник",
          verified: "Проверено",
          refresh: "Обновить"
        }
      },
      actions: {
        menuLabel: "Действия продукта",
        editLabel: "Изменить",
        duplicateLabel: "Дублировать",
        publishLabel: "Опубликовать",
        draftLabel: "В черновик",
        archiveLabel: "В архив"
      },
      summary: {
        activeLabel: "Активных",
        salesLabel: "Продаж всего",
        revenueLabel: "Выручка каталога",
        bestsellerLabel: "Бестселлер",
        emptyBestseller: "—"
      },
      saveErrorLabel: "Не удалось сохранить продукт",
      emptyLabel: "Нет продуктов в этом статусе",
      loadingLabel: "Загружаем продукты",
      errorLabel: "Не удалось загрузить продукты"
    },
    reference: {
      documentTitle: "ElevenHouse | Справочники",
      title: "Справочник трактовок",
      searchPlaceholder: "Поиск по трактовкам...",
      resetLabel: "Сбросить",
      addLabel: "Добавить",
      allCategoriesLabel: "Все трактовки",
      sourceFilterAriaLabel: "Фильтр источников трактовок",
      sourceFilters: {
        all: "Все источники",
        platform: "ElevenHouse",
        modified: "Изменённые",
        custom: "Свои"
      },
      sourceBadges: {
        platform: "ElevenHouse",
        modified: "изменено",
        custom: "своя"
      },
      entryActions: {
        editLabel: "Изменить",
        deleteLabel: "Удалить"
      },
      resetConfirmation: {
        title: "Сбросить справочники?",
        closeLabel: "Закрыть модалку сброса справочников",
        description:
          "Все созданные трактовки будут удалены, а измененные вернутся к исходному состоянию. Вы уверены что хотите сбросить справочники?",
        confirmLabel: "Сбросить",
        cancelLabel: "Отмена"
      },
      deleteConfirmation: {
        title: "Удалить трактовку?",
        closeLabel: "Закрыть модалку удаления трактовки",
        description: "Точно хотите удалить трактовку?",
        confirmLabel: "Удалить",
        cancelLabel: "Отмена"
      },
      entryModal: {
        createTitle: "Новая трактовка",
        editTitle: "Редактировать трактовку",
        createCloseLabel: "Закрыть модалку добавления трактовки",
        editCloseLabel: "Закрыть модалку редактирования трактовки",
        categoryLabel: "Категория",
        titleLabel: "Название",
        titlePlaceholder: "Напр. Солнце в Овне",
        contentLabel: "Текст трактовки",
        contentPlaceholder: "Ваша трактовка...",
        aiDraftLabel: "AI-черновик",
        aiDraftTitle: "AI набросает черновик по заголовку — отредактируйте под свой стиль",
        aiDraftLoadingLabel: "Генерируем...",
        aiDraftLoadingAnnouncement: "Генерируем AI-черновик",
        aiDraftErrorLabel: "Повторить AI-черновик",
        aiDraftErrorTitle: "Не удалось создать AI-черновик. Попробуйте ещё раз.",
        aiDraftErrorAnnouncement: "Не удалось создать AI-черновик",
        cancelLabel: "Отмена",
        saveLabel: "Сохранить",
        savingLabel: "Сохраняем",
        genericError: "Не удалось сохранить трактовку. Попробуйте ещё раз.",
        validation: {
          categoryRequired: "Выберите категорию",
          titleRequired: "Введите название трактовки",
          titleMaxLength: "Название не должно быть длиннее {max} символов",
          contentRequired: "Введите текст трактовки",
          contentMaxLength: "Текст не должен быть длиннее {max} символов"
        }
      },
      emptyLabel: "Ничего не найдено",
      emptyAddLabel: "Добавить трактовку",
      loadingLabel: "Загружаем справочники",
      errorLabel: "Не удалось загрузить справочники"
    },
    settings: {
      documentTitle: "ElevenHouse | Настройки",
      title: "Настройки"
    }
  },
  en: {
    auth: {
      documentTitle: "ElevenHouse | Astrologer sign up",
      sectionAriaLabel: "Astrologer sign up and sign in",
      visual: {
        backLinkTitle: "Home",
        heroTitleLine1: "A workspace that",
        heroTitleLine2: "sells for you",
        highlights: [
          {
            key: "charts",
            label: "Chart engine and all systems",
            description: ""
          },
          {
            key: "automation",
            label: "Funnels and AI automation",
            description: ""
          },
          {
            key: "commerce",
            label: "Payments, products, content",
            description: ""
          }
        ],
        joinedInfoLabel: "Already with us 1,200+ astrologers",
        joinedInfoPrefix: "Already with us",
        joinedInfoCount: "1,200+ astrologers",
        avatarInitials: ["MK", "DL", "VM", "NR"]
      },
      form: {
        brandTitle: "Eleven",
        brandAccent: "House",
        brandSubtitle: "ASTROLOGER DASHBOARD",
        registerTab: "Sign up",
        loginTab: "Sign in",
        registerTitle: "Create workspace",
        loginTitle: "Sign in",
        registerDescription: "Free, no card. 10 minutes to your first sale.",
        loginDescription: "Return to bookings, clients, and sales.",
        nameLabel: "Name",
        namePlaceholder: "What is your name?",
        emailLabel: "Email",
        emailPlaceholder: "you@example.com",
        phoneLabel: "Or phone",
        phonePlaceholder: "+7 ___ ___ __ __",
        phoneCountryAriaLabel: "Phone country",
        hint: "We will send a sign-in code — no password needed.",
        registerSubmitLabel: "Get code",
        loginSubmitLabel: "Sign in by code"
      },
      codeForm: {
        title: "Enter code",
        description: "We sent a code to {identifier}",
        codeLabel: "Message code",
        codePlaceholder: "000000",
        submitLabel: "Continue",
        backLabel: "Change details",
        changeIdentifierLabel: "Change contact",
        resendLabel: "Send again",
        deliveryHint: "Check SMS or app messages"
      },
      validation: {
        email: "Enter a valid email",
        name: "Name must be 2 to 200 characters",
        phone: "Enter a valid phone number"
      },
      errors: {
        invalidCode: "Invalid or expired code",
        identityExists: "A workspace with this phone or email already exists",
        rateLimited: "Too many attempts. Try again later",
        generic: "Request failed. Try again"
      },
      resendCooldown: {
        availableIn: "Again in {time}"
      },
      languageSwitcher: {
        ariaLabel: "Interface language"
      }
    },
    appShell: {
      header: {
        searchPlaceholder: "Search clients, orders, charts…",
        createLabel: "Create",
        createMenuAriaLabel: "Open create menu",
        notificationsAriaLabel: "Open notifications",
        unreadNotificationsLabel: "Unread notifications",
        profileSettingsLabel: "Profile settings",
        profileName: "Alisa Vega",
        profileTimezone: "GMT+3, Moscow",
        profileInitials: "AV",
        verifiedLabel: "Verified"
      },
      navigation: {
        ariaLabel: "Astrologer workspace navigation",
        brandTitle: "ElevenHouse",
        brandSubtitle: "ASTROLOGER WORKSPACE",
        collapseLabel: "Collapse sidebar navigation",
        expandLabel: "Expand sidebar navigation",
        personalPage: {
          title: "Personal page",
          description: "elevenhouse.app/alisa-vega",
          href: "https://elevenhouse.app/alisa-vega",
          ariaLabel: "Open astrologer personal page"
        },
        items: [
          { id: "dashboard", title: "Dashboard", href: "/dashboard" },
          { id: "products", title: "Products", href: "/products" },
          { id: "reference", title: "References", href: "/reference" }
        ],
        footerItems: [{ id: "settings", title: "Settings", href: "/settings" }]
      }
    },
    dashboard: {
      documentTitle: "ElevenHouse | Astrologer dashboard",
      kicker: "Astrologer surface",
      title: "ElevenHouse Astrologer Web"
    },
    products: {
      documentTitle: "ElevenHouse | Products",
      title: "Products",
      createLabel: "Create product",
      statusFilterAriaLabel: "Product status filter",
      createTypeModal: {
        title: "Choose product type",
        closeLabel: "Close product type selection",
        description: "The type sets starter defaults that can be adjusted in the editor."
      },
      editor: {
        title: "Product constructor",
        closeLabel: "Close product constructor",
        typeLabel: "Type",
        titleLabel: "Title",
        titlePlaceholder: "E.g. Natal reading",
        subtitleLabel: "Description",
        subtitlePlaceholder: "Briefly explain what the client receives",
        priceLabel: "Price",
        durationLabel: "Duration",
        durationSuffix: " min",
        decrementDurationLabel: "Decrease duration",
        incrementDurationLabel: "Increase duration",
        formatLabel: "Format",
        executionModeLabel: "Delivery scenario",
        paymentModelLabel: "Payment",
        packageLabel: "Package",
        packageSessionCountLabel: "Sessions in package",
        packageDiscountLabel: "Package discount",
        subscriptionLabel: "Subscription",
        subscriptionPeriodLabel: "Subscription period",
        trialDaysLabel: "Trial period",
        participantModeLabel: "Participants",
        groupSizeLabel: "Group size",
        requiredClientDataLabel: "Client data",
        methodsLabel: "Methods",
        accessGrantsLabel: "Access",
        includedItemsLabel: "Included",
        includedItemTextLabel: "Item text",
        includedItemPlaceholder: "What the client receives",
        includedItemIconLabel: "Item icon",
        addIncludedItemLabel: "Add item",
        removeIncludedItemLabel: "Remove item",
        modifiersLabel: "Modifiers",
        modifierKindLabel: "Modifier type",
        modifierFixedLabel: "Fixed price",
        modifierPercentLabel: "Percent",
        modifierFreeLabel: "Free",
        modifierLabelLabel: "Modifier name",
        modifierLabelPlaceholder: "Modifier name",
        modifierPriceLabel: "Modifier price",
        addModifierLabel: "Add modifier",
        removeModifierLabel: "Remove modifier",
        previewLabel: "Preview",
        previewPriceLabel: "Price",
        previewIncludedItemsLabel: "Included",
        cancelLabel: "Cancel",
        saveDraftLabel: "Save draft",
        savingLabel: "Saving",
        iconLabelByName: {
          check: "Check",
          sparkle: "Sparkle",
          video: "Video",
          chat: "Chat",
          content: "Content",
          flow: "Flow",
          box: "Box",
          wallet: "Wallet",
          orbit: "Orbit",
          reference: "Reference",
          verified: "Verified",
          refresh: "Refresh"
        }
      },
      actions: {
        menuLabel: "Product actions",
        editLabel: "Edit",
        duplicateLabel: "Duplicate",
        publishLabel: "Publish",
        draftLabel: "Move to draft",
        archiveLabel: "Archive"
      },
      summary: {
        activeLabel: "Active",
        salesLabel: "Total sales",
        revenueLabel: "Catalog revenue",
        bestsellerLabel: "Bestseller",
        emptyBestseller: "—"
      },
      saveErrorLabel: "Could not save the product",
      emptyLabel: "No products in this status",
      loadingLabel: "Loading products",
      errorLabel: "Could not load products"
    },
    reference: {
      documentTitle: "ElevenHouse | References",
      title: "Interpretation references",
      searchPlaceholder: "Search interpretations...",
      resetLabel: "Reset",
      addLabel: "Add",
      allCategoriesLabel: "All interpretations",
      sourceFilterAriaLabel: "Interpretation source filter",
      sourceFilters: {
        all: "All sources",
        platform: "ElevenHouse",
        modified: "Modified",
        custom: "Mine"
      },
      sourceBadges: {
        platform: "ElevenHouse",
        modified: "modified",
        custom: "mine"
      },
      entryActions: {
        editLabel: "Edit",
        deleteLabel: "Delete"
      },
      resetConfirmation: {
        title: "Reset references?",
        closeLabel: "Close reset references modal",
        description:
          "All created interpretations will be deleted, and modified interpretations will return to their original state. Are you sure you want to reset references?",
        confirmLabel: "Reset",
        cancelLabel: "Cancel"
      },
      deleteConfirmation: {
        title: "Delete interpretation?",
        closeLabel: "Close delete interpretation modal",
        description: "Are you sure you want to delete this interpretation?",
        confirmLabel: "Delete",
        cancelLabel: "Cancel"
      },
      entryModal: {
        createTitle: "New interpretation",
        editTitle: "Edit interpretation",
        createCloseLabel: "Close add interpretation modal",
        editCloseLabel: "Close edit interpretation modal",
        categoryLabel: "Category",
        titleLabel: "Title",
        titlePlaceholder: "E.g. Sun in Aries",
        contentLabel: "Interpretation text",
        contentPlaceholder: "Your interpretation...",
        aiDraftLabel: "AI draft",
        aiDraftTitle: "AI drafts text from the title — edit it to match your style",
        aiDraftLoadingLabel: "Generating...",
        aiDraftLoadingAnnouncement: "Generating AI draft",
        aiDraftErrorLabel: "Retry AI draft",
        aiDraftErrorTitle: "Could not create the AI draft. Try again.",
        aiDraftErrorAnnouncement: "Could not create the AI draft",
        cancelLabel: "Cancel",
        saveLabel: "Save",
        savingLabel: "Saving",
        genericError: "Could not save the interpretation. Try again.",
        validation: {
          categoryRequired: "Choose a category",
          titleRequired: "Enter an interpretation title",
          titleMaxLength: "Title must be no longer than {max} characters",
          contentRequired: "Enter the interpretation text",
          contentMaxLength: "Text must be no longer than {max} characters"
        }
      },
      emptyLabel: "No interpretations found",
      emptyAddLabel: "Add interpretation",
      loadingLabel: "Loading references",
      errorLabel: "Could not load references"
    },
    settings: {
      documentTitle: "ElevenHouse | Settings",
      title: "Settings"
    }
  }
} satisfies Record<SupportedLocale, AstrologerCopy>;
