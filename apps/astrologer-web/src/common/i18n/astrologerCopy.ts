import type { OtpAuthFormCopy } from "@elevenhouse/design-system/components/OtpAuthForm";
import type { OtpCodeFormCopy } from "@elevenhouse/design-system/components/OtpCodeForm";
import type {
  AstroDiaryJournalSummaryResponse,
  AstroDiaryMoodId,
  AstroDiaryParticipantRole,
  AstroDiaryTimelineItem
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import {
  chartEngineCopyByLocale,
  type ChartEngineCopy
} from "../../features/charts/model/chartEngineCopy";

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

export type NumerologyInterpretationCopy = {
  readonly sectionLabel: string;
  readonly createAiDraftLabel: string;
  readonly creatingAiDraftLabel: string;
  readonly openEditorLabel: string;
  readonly modalTitle: string;
  readonly closeModalLabel: string;
  readonly textLabel: string;
  readonly individualPlaceholder: string;
  readonly compatibilityPlaceholder: string;
  readonly saveDraftLabel: string;
  readonly approveLabel: string;
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
  finance: {
    documentTitle: string;
    title: string;
  };
  astroDiary: {
    documentTitle: string;
    title: string;
    eyebrow: string;
    loadingAriaLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    errorTitle: string;
    errorDescription: string;
    retryLabel: string;
    journalListTitle: string;
    clientLabel: (clientIdPrefix: string) => string;
    unreadLabel: (count: number) => string;
    accessLabel: (mode: string) => string;
    journalStateLabel: (summary: AstroDiaryJournalSummaryResponse) => string;
    backToListLabel: string;
    responseDueLabel: (formattedDate: string) => string;
    archivedLabel: string;
    readOnlyComposerLabel: string;
    waitingForClientLabel: string;
    timeline: {
      ariaLabel: string;
      contextTitle: string;
      contextDescription: string;
      emptyLabel: string;
      errorLabel: string;
      loadMoreLabel: string;
      loadingMoreLabel: string;
      authorLabels: Record<AstroDiaryParticipantRole, string>;
      kindLabels: Record<AstroDiaryTimelineItem["kind"], string>;
      tombstoneLabels: Record<"hidden_by_author" | "content_erased", string>;
      moodLabels: Record<AstroDiaryMoodId, string>;
    };
    reply: {
      writeLabel: string;
      modeLabel: string;
      title: string;
      bodyLabel: string;
      placeholder: string;
      saveLabel: string;
      savingLabel: string;
      savedLabel: string;
      unsavedLabel: string;
      publishLabel: string;
      publishingLabel: string;
      reloadLatestLabel: string;
      reviewDraftLabel: string;
      characterCountLabel: (count: number, maximum: number) => string;
      errors: Record<
        "stale" | "idempotency" | "allowance" | "read_only" | "no_cycle" | "generic",
        string
      >;
    };
  };
  calendar: {
    documentTitle: string;
    title: string;
    views: Record<"day" | "week" | "month", string>;
    todayLabel: string;
    previousLabel: string;
    nextLabel: string;
    showPanelLabel: string;
    hidePanelLabel: string;
    availabilityLabel: string;
    availabilityDoneLabel: string;
    createBookingLabel: string;
    loadingLabel: string;
    errorLabel: string;
    retryLabel: string;
    profileRequired: {
      title: string;
      description: string;
      settingsLabel: string;
    };
    emptyLabel: string;
    conflictMessage: string;
    mobileAgenda: {
      agendaLabel: string;
      confirmedLabel: string;
      blockedLabel: string;
      availabilityLabel: string;
      emptyLabel: string;
      bookFromLabel: (time: string) => string;
    };
    monthGrid: {
      gridLabel: string;
      confirmedLabel: string;
      blockedLabel: string;
      availabilityLabel: string;
      openDateLabel: (date: string) => string;
      moreLabel: (count: number) => string;
    };
    bookingDetail: {
      panelLabel: string;
      closeLabel: string;
      confirmedLabel: string;
      loadingLabel: string;
      errorLabel: string;
      retryLabel: string;
      fieldLabels: {
        productAndPrice: string;
        date: string;
        time: string;
        deliveryFormat: string;
      };
      deliveryFormats: Record<"video" | "audio" | "chat" | "text" | "file" | "channel", string>;
    };
    manualBooking: {
      eyebrow: string;
      title: string;
      closeLabel: string;
      clientLabel: string;
      clientPlaceholder: string;
      serviceLabel: string;
      dateLabel: string;
      timeLabel: string;
      formatLabel: string;
      summaryLabel: string;
      loadingProductsLabel: string;
      productsErrorLabel: string;
      noScheduleLabel: string;
      noProductsLabel: string;
      loadingSlotsLabel: string;
      slotsErrorLabel: string;
      noSlotsLabel: string;
      retryLabel: string;
      cancelLabel: string;
      createLabel: string;
      creatingLabel: string;
      genericErrorLabel: string;
      durationLabel: (minutes: number) => string;
      slotPicker: {
        pickerLabel: string;
        previousMonthLabel: string;
        nextMonthLabel: string;
        timeSlotsLabel: (date: string) => string;
        availableDateLabel: (date: string, count: number) => string;
        unavailableDateLabel: (date: string) => string;
        selectedDateLabel: string;
        slotCountLabel: (count: number) => string;
        noSlotsForDateLabel: string;
      };
    };
    availabilityEditor: {
      instruction: string;
      title: string;
      description: string;
      startIntervalLabel: string;
      bufferBeforeLabel: string;
      bufferAfterLabel: string;
      minimumNoticeLabel: string;
      bookingHorizonLabel: string;
      maximumBookingsLabel: string;
      unlimitedLabel: string;
      minutesShort: string;
      hoursShort: string;
      daysShort: string;
      immediateLabel: string;
      weeklyTitle: string;
      weeklyDescription: string;
      weekdays: readonly string[];
      unavailableLabel: string;
      addPeriodLabel: string;
      removePeriodLabel: string;
      fromLabel: string;
      toLabel: string;
      overridesTitle: string;
      overridesDescription: string;
      overrideDateLabel: string;
      addOverrideLabel: string;
      availableLabel: string;
      closedLabel: string;
      removeOverrideLabel: string;
      productsTitle: string;
      productsDescription: string;
      productsEmptyLabel: string;
      productsLoadingLabel: string;
      productsErrorLabel: string;
      saveLabel: string;
      savingLabel: string;
      loadErrorLabel: string;
      saveErrorLabel: string;
      conflictErrorLabel: string;
      savedLabel: string;
      retryLabel: string;
    };
  };
  chartEngine: ChartEngineCopy;
  numerology: {
    interpretation: NumerologyInterpretationCopy;
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
      loadError: string;
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
      durationSuffix: string;
      formatLabel: string;
      paymentModelLabel: string;
      packageSessionCountLabel: string;
      packageDiscountLabel: string;
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
      saveDraftLabel: string;
      savingLabel: string;
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
    actionErrorReloadLabel: string;
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
  profileFallbackInitials: string;
  profileLoadingName: string;
  profileLoadingTimezone: string;
  profileMissingName: string;
  profileMissingTimezone: string;
  verifiedLabel: string;
};

export type AppShellNavigationItemId =
  | "dashboard"
  | "analytics"
  | "calendar"
  | "clients"
  | "finance"
  | "products"
  | "funnels"
  | "chartEngine"
  | "numerology"
  | "destinyMatrix"
  | "humanDesign"
  | "astroCalendar"
  | "astroDiary"
  | "inbox"
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
  mobile: {
    ariaLabel: string;
    moreLabel: string;
    moreDialogTitle: string;
    closeLabel: string;
  };
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
  aiDraftDisabledTooltip: string;
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
        profileFallbackInitials: "EH",
        profileLoadingName: "Загрузка профиля",
        profileLoadingTimezone: "Данные профиля загружаются",
        profileMissingName: "Профиль не заполнен",
        profileMissingTimezone: "Укажите часовой пояс в настройках",
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
          { id: "calendar", title: "Календарь", href: "/calendar" },
          { id: "finance", title: "Финансы", href: "/finance" },
          { id: "funnels", title: "Воронки", href: "/flows" },
          { id: "products", title: "Продукты", href: "/products" },
          { id: "chartEngine", title: "Движок карт", href: "/chart-engine" },
          { id: "numerology", title: "Нумерология", href: "/numerology" },
          { id: "destinyMatrix", title: "Матрица судьбы", href: "/matrix" },
          { id: "humanDesign", title: "Дизайн человека", href: "/human-design" },
          { id: "astroCalendar", title: "Астрокалендарь", href: "/astro-calendar" },
          { id: "astroDiary", title: "Астродневник", href: "/astro-diary" },
          { id: "reference", title: "Справочники", href: "/reference" },
          { id: "inbox", title: "Сообщения", href: "/inbox" }
        ],
        footerItems: [{ id: "settings", title: "Настройки", href: "/settings" }],
        mobile: {
          ariaLabel: "Основная навигация кабинета астролога",
          moreLabel: "Ещё",
          moreDialogTitle: "Все разделы",
          closeLabel: "Закрыть навигацию"
        }
      }
    },
    dashboard: {
      documentTitle: "ElevenHouse | Кабинет астролога",
      kicker: "Astrologer surface",
      title: "ElevenHouse Astrologer Web"
    },
    finance: {
      documentTitle: "ElevenHouse | Финансы",
      title: "Финансы"
    },
    astroDiary: {
      documentTitle: "ElevenHouse | Астродневник",
      title: "Астродневник",
      eyebrow: "Дневник клиента",
      loadingAriaLabel: "Загрузка журналов Астродневника",
      emptyTitle: "Нет активных журналов",
      emptyDescription: "Активных подписок на Астродневник пока нет.",
      errorTitle: "Не удалось загрузить журналы",
      errorDescription: "Повторите запрос. Данные журнала не подменяются локальной копией.",
      retryLabel: "Повторить",
      journalListTitle: "Клиенты",
      clientLabel: (clientIdPrefix) => `Клиент ${clientIdPrefix}`,
      unreadLabel: (count) => `Непрочитано: ${count}`,
      accessLabel: (mode) => `Доступ: ${mode}`,
      journalStateLabel: (summary): string =>
        summary.access.mode === "read_only"
          ? "Только чтение"
          : summary.currentObligation?.state === "open" ||
              summary.currentObligation?.state === "overdue"
            ? "Нужен ответ"
            : "Активный журнал",
      backToListLabel: "Назад к списку журналов",
      responseDueLabel: (formattedDate) => `Ответ до ${formattedDate}`,
      archivedLabel: "Подписка завершена · история доступна только для чтения",
      readOnlyComposerLabel: "Новые ответы недоступны в архивном журнале.",
      waitingForClientLabel: "Сейчас ход клиента. Ответ откроется после новой записи.",
      timeline: {
        ariaLabel: "Лента Астродневника",
        contextTitle: "Личный контекст",
        contextDescription:
          "Записи и ответы видны только участникам этого журнала. Контекст рассчитывается сервером.",
        emptyLabel: "В этом журнале пока нет опубликованных записей.",
        errorLabel: "Не удалось загрузить ленту журнала.",
        loadMoreLabel: "Показать более новые записи",
        loadingMoreLabel: "Загружаем записи…",
        authorLabels: { client: "Клиент", astrologer: "Вы" },
        kindLabels: {
          client_entry: "Запись клиента",
          astrologer_reply: "Ответ астролога",
          reflection_prompt: "Вопрос для рефлексии",
          correction: "Исправление",
          tombstone: "Удалённая запись"
        },
        tombstoneLabels: {
          hidden_by_author: "Автор скрыл содержимое записи.",
          content_erased: "Содержимое записи удалено."
        },
        moodLabels: {
          inspired: "Вдохновение",
          joy: "Радость",
          calm: "Спокойствие",
          tired: "Усталость",
          anxious: "Тревога",
          sad: "Грусть"
        }
      },
      reply: {
        writeLabel: "Написать ответ",
        modeLabel: "Ответ",
        title: "Черновик ответа",
        bodyLabel: "Текст ответа",
        placeholder: "Напишите бережный ответ клиенту…",
        saveLabel: "Сохранить черновик",
        savingLabel: "Сохраняем…",
        savedLabel: "Черновик сохранён",
        unsavedLabel: "Есть несохранённые изменения",
        publishLabel: "Опубликовать ответ",
        publishingLabel: "Публикуем…",
        reloadLatestLabel: "Загрузить актуальную версию",
        reviewDraftLabel: "Проверить черновик",
        characterCountLabel: (count, maximum) => `${count} из ${maximum}`,
        errors: {
          stale:
            "Дневник изменился в другой сессии. Загрузите актуальную версию — ваш текст сохранён здесь.",
          idempotency: "Этот ключ уже связан с другим текстом. Повторите сохранение без изменений.",
          allowance: "Лимит новых циклов на текущий оплаченный период исчерпан.",
          read_only: "Подписка завершена. Журнал доступен только для чтения.",
          no_cycle: "Открытого цикла для ответа больше нет. Загрузите актуальную версию.",
          generic: "Не удалось сохранить ответ. Повторите запрос — текст останется в редакторе."
        }
      }
    },
    calendar: {
      documentTitle: "ElevenHouse | Календарь",
      title: "Календарь",
      views: { day: "День", week: "Неделя", month: "Месяц" },
      todayLabel: "Сегодня",
      previousLabel: "Предыдущий период",
      nextLabel: "Следующий период",
      showPanelLabel: "Показать панель",
      hidePanelLabel: "Скрыть панель",
      availabilityLabel: "Доступность",
      availabilityDoneLabel: "Готово",
      createBookingLabel: "Запись",
      loadingLabel: "Загружаем календарь",
      errorLabel: "Не удалось загрузить календарь",
      retryLabel: "Повторить",
      profileRequired: {
        title: "Заполните профиль астролога",
        description:
          "Календарю нужен часовой пояс, чтобы корректно показывать записи и доступность.",
        settingsLabel: "Перейти в настройки"
      },
      emptyLabel: "На этот период записей нет",
      conflictMessage: "Это время уже занято. Календарь обновлён — выберите другой слот.",
      mobileAgenda: {
        agendaLabel: "Расписание",
        confirmedLabel: "Подтверждена",
        blockedLabel: "Недоступно",
        availabilityLabel: "Доступно",
        emptyLabel: "На этот период записей и доступных часов нет",
        bookFromLabel: (time) => `Записать с ${time}`
      },
      monthGrid: {
        gridLabel: "Календарь на месяц",
        confirmedLabel: "Подтверждена",
        blockedLabel: "Недоступно",
        availabilityLabel: "Есть доступное время",
        openDateLabel: (date) => `Открыть ${date}`,
        moreLabel: (count) => `+${count} ещё`
      },
      bookingDetail: {
        panelLabel: "Детали записи",
        closeLabel: "Закрыть детали записи",
        confirmedLabel: "Подтверждена",
        loadingLabel: "Загружаем детали записи",
        errorLabel: "Не удалось загрузить детали записи",
        retryLabel: "Повторить",
        fieldLabels: {
          productAndPrice: "Услуга и стоимость",
          date: "Дата",
          time: "Время и длительность",
          deliveryFormat: "Формат"
        },
        deliveryFormats: {
          video: "Видеозвонок",
          audio: "Аудиозвонок",
          chat: "Чат",
          text: "Текст",
          file: "Файл",
          channel: "Канал"
        }
      },
      manualBooking: {
        eyebrow: "Новая запись",
        title: "Записать клиента",
        closeLabel: "Закрыть окно записи",
        clientLabel: "Клиент",
        clientPlaceholder: "Имя или поиск в CRM…",
        serviceLabel: "Услуга",
        dateLabel: "День",
        timeLabel: "Время",
        formatLabel: "Формат",
        summaryLabel: "Параметры записи",
        loadingProductsLabel: "Загружаем услуги…",
        productsErrorLabel: "Не удалось загрузить услуги.",
        noScheduleLabel: "Сначала настройте доступность и сохраните расписание.",
        noProductsLabel: "Нет активных услуг, подключённых к расписанию.",
        loadingSlotsLabel: "Ищем доступное время…",
        slotsErrorLabel: "Не удалось загрузить доступное время.",
        noSlotsLabel: "В этом периоде нет доступного времени.",
        retryLabel: "Повторить",
        cancelLabel: "Отмена",
        createLabel: "Создать запись",
        creatingLabel: "Создаём…",
        genericErrorLabel: "Не удалось создать запись. Проверьте данные и повторите.",
        durationLabel: (minutes) => `${minutes} мин · онлайн`,
        slotPicker: {
          pickerLabel: "Календарь доступных дат",
          previousMonthLabel: "Предыдущий месяц",
          nextMonthLabel: "Следующий месяц",
          timeSlotsLabel: (date) => `Доступное время${date ? ` · ${date}` : ""}`,
          availableDateLabel: (date, count) => `${date}, ${formatRussianSlotCount(count)}`,
          unavailableDateLabel: (date) => `${date}, нет доступного времени`,
          selectedDateLabel: "Выбранный день",
          slotCountLabel: formatRussianSlotCount,
          noSlotsForDateLabel: "На выбранный день нет доступного времени."
        }
      },
      availabilityEditor: {
        instruction:
          "Настройте рабочие часы и правила записи. Изменения применятся после сохранения.",
        title: "Настройка доступности",
        description: "Время хранится в часовом поясе вашего профиля.",
        startIntervalLabel: "Шаг начала записи",
        bufferBeforeLabel: "Буфер до",
        bufferAfterLabel: "Буфер после",
        minimumNoticeLabel: "Минимум до записи",
        bookingHorizonLabel: "Горизонт записи",
        maximumBookingsLabel: "Макс. записей в день",
        unlimitedLabel: "Без лимита",
        minutesShort: "мин",
        hoursShort: "ч.",
        daysShort: "дн.",
        immediateLabel: "Сразу",
        weeklyTitle: "Рабочие часы",
        weeklyDescription: "Можно добавить несколько периодов в один день.",
        weekdays: [
          "Понедельник",
          "Вторник",
          "Среда",
          "Четверг",
          "Пятница",
          "Суббота",
          "Воскресенье"
        ],
        unavailableLabel: "Недоступно",
        addPeriodLabel: "Добавить период",
        removePeriodLabel: "Удалить период",
        fromLabel: "С",
        toLabel: "До",
        overridesTitle: "Исключения по датам",
        overridesDescription: "Отпуск, выходной или особые часы на конкретную дату.",
        overrideDateLabel: "Дата исключения",
        addOverrideLabel: "Добавить дату",
        availableLabel: "Особые часы",
        closedLabel: "Недоступно весь день",
        removeOverrideLabel: "Удалить исключение",
        productsTitle: "Услуги для записи",
        productsDescription: "Выберите активные услуги, которые используют это расписание.",
        productsEmptyLabel: "Активных услуг пока нет.",
        productsLoadingLabel: "Загружаем услуги",
        productsErrorLabel: "Не удалось загрузить услуги",
        saveLabel: "Сохранить доступность",
        savingLabel: "Сохраняем…",
        loadErrorLabel: "Не удалось загрузить доступность.",
        saveErrorLabel: "Не удалось сохранить доступность. Проверьте периоды и повторите.",
        conflictErrorLabel:
          "Расписание изменилось в другой вкладке. Данные обновлены — внесите изменения ещё раз.",
        savedLabel: "Доступность сохранена",
        retryLabel: "Повторить"
      }
    },
    chartEngine: chartEngineCopyByLocale.ru,
    numerology: {
      interpretation: {
        sectionLabel: "AI-разбор портрета",
        createAiDraftLabel: "Создать AI-черновик",
        creatingAiDraftLabel: "Создаём AI-черновик…",
        openEditorLabel: "Открыть редактор трактовки",
        modalTitle: "Трактовка нумерологического портрета",
        closeModalLabel: "Закрыть редактор трактовки",
        textLabel: "Текст трактовки",
        individualPlaceholder: "Введите трактовку для клиента",
        compatibilityPlaceholder: "Введите трактовку для пары",
        saveDraftLabel: "Сохранить черновик",
        approveLabel: "Утвердить"
      }
    },
    products: {
      documentTitle: "ElevenHouse | Продукты",
      title: "Продукты",
      createLabel: "Создать продукт",
      statusFilterAriaLabel: "Фильтр статусов продуктов",
      createTypeModal: {
        title: "Новый продукт",
        closeLabel: "Закрыть выбор типа",
        description: "Выберите тип — дальше откроется конструктор с нужными полями.",
        loadError: "Не удалось загрузить шаблоны. Выберите тип вручную."
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
        durationSuffix: " мин",
        formatLabel: "Формат поставки",
        paymentModelLabel: "Оплата",
        packageSessionCountLabel: "Сессий в пакете",
        packageDiscountLabel: "Скидка пакета",
        subscriptionPeriodLabel: "Период подписки",
        trialDaysLabel: "Пробный период",
        participantModeLabel: "Участники",
        groupSizeLabel: "Размер группы",
        requiredClientDataLabel: "Данные от клиента",
        methodsLabel: "Метод / система",
        accessGrantsLabel: "Доступ",
        includedItemsLabel: "Что входит",
        includedItemTextLabel: "Текст пункта",
        includedItemPlaceholder: "Что получает клиент",
        includedItemIconLabel: "Иконка пункта",
        addIncludedItemLabel: "Добавить пункт",
        removeIncludedItemLabel: "Удалить пункт",
        modifiersLabel: "Допы · модификаторы",
        modifierKindLabel: "Тип модификатора",
        modifierFixedLabel: "Фиксированная цена",
        modifierPercentLabel: "Процент",
        modifierFreeLabel: "Бесплатно",
        modifierLabelLabel: "Название модификатора",
        modifierLabelPlaceholder: "Название модификатора",
        modifierPriceLabel: "Цена модификатора",
        addModifierLabel: "Свой модификатор",
        removeModifierLabel: "Удалить модификатор",
        saveDraftLabel: "Сохранить черновик",
        savingLabel: "Сохраняем"
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
      actionErrorReloadLabel: "Обновить продукты",
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
        aiDraftDisabledTooltip: "Сначала заполните название",
        saveLabel: "Сохранить",
        cancelLabel: "Отмена",
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
        profileFallbackInitials: "EH",
        profileLoadingName: "Loading profile",
        profileLoadingTimezone: "Profile data is loading",
        profileMissingName: "Profile is incomplete",
        profileMissingTimezone: "Set timezone in settings",
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
          { id: "calendar", title: "Calendar", href: "/calendar" },
          { id: "finance", title: "Finance", href: "/finance" },
          { id: "funnels", title: "Flows", href: "/flows" },
          { id: "products", title: "Products", href: "/products" },
          { id: "chartEngine", title: "Chart engine", href: "/chart-engine" },
          { id: "numerology", title: "Numerology", href: "/numerology" },
          { id: "destinyMatrix", title: "Destiny Matrix", href: "/matrix" },
          { id: "humanDesign", title: "Human Design", href: "/human-design" },
          { id: "astroCalendar", title: "Astro calendar", href: "/astro-calendar" },
          { id: "astroDiary", title: "Astro journal", href: "/astro-diary" },
          { id: "reference", title: "References", href: "/reference" },
          { id: "inbox", title: "Messages", href: "/inbox" }
        ],
        footerItems: [{ id: "settings", title: "Settings", href: "/settings" }],
        mobile: {
          ariaLabel: "Primary astrologer workspace navigation",
          moreLabel: "More",
          moreDialogTitle: "All sections",
          closeLabel: "Close navigation"
        }
      }
    },
    dashboard: {
      documentTitle: "ElevenHouse | Astrologer dashboard",
      kicker: "Astrologer surface",
      title: "ElevenHouse Astrologer Web"
    },
    finance: {
      documentTitle: "ElevenHouse | Finance",
      title: "Finance"
    },
    astroDiary: {
      documentTitle: "ElevenHouse | AstroDiary",
      title: "AstroDiary",
      eyebrow: "Client journal",
      loadingAriaLabel: "Loading AstroDiary journals",
      emptyTitle: "No active journals",
      emptyDescription: "There are no active AstroDiary subscriptions yet.",
      errorTitle: "Could not load journals",
      errorDescription: "Retry the request. Journal data is never replaced with a local copy.",
      retryLabel: "Retry",
      journalListTitle: "Clients",
      clientLabel: (clientIdPrefix) => `Client ${clientIdPrefix}`,
      unreadLabel: (count) => `Unread: ${count}`,
      accessLabel: (mode) => `Access: ${mode}`,
      journalStateLabel: (summary): string =>
        summary.access.mode === "read_only"
          ? "Read-only"
          : summary.currentObligation?.state === "open" ||
              summary.currentObligation?.state === "overdue"
            ? "Reply needed"
            : "Active journal",
      backToListLabel: "Back to journal list",
      responseDueLabel: (formattedDate) => `Reply by ${formattedDate}`,
      archivedLabel: "Subscription ended · history is read-only",
      readOnlyComposerLabel: "New replies are unavailable in an archived journal.",
      waitingForClientLabel: "It is the client's turn. Reply opens after a new entry.",
      timeline: {
        ariaLabel: "AstroDiary timeline",
        contextTitle: "Private context",
        contextDescription:
          "Entries and replies are visible only to this journal's participants. Context is calculated by the server.",
        emptyLabel: "This journal has no published entries yet.",
        errorLabel: "Could not load the journal timeline.",
        loadMoreLabel: "Show newer entries",
        loadingMoreLabel: "Loading entries…",
        authorLabels: { client: "Client", astrologer: "You" },
        kindLabels: {
          client_entry: "Client entry",
          astrologer_reply: "Astrologer reply",
          reflection_prompt: "Reflection prompt",
          correction: "Correction",
          tombstone: "Deleted entry"
        },
        tombstoneLabels: {
          hidden_by_author: "The author hid this entry's content.",
          content_erased: "This entry's content was erased."
        },
        moodLabels: {
          inspired: "Inspired",
          joy: "Joy",
          calm: "Calm",
          tired: "Tired",
          anxious: "Anxious",
          sad: "Sad"
        }
      },
      reply: {
        writeLabel: "Write reply",
        modeLabel: "Reply",
        title: "Reply draft",
        bodyLabel: "Reply text",
        placeholder: "Write a thoughtful reply to your client…",
        saveLabel: "Save draft",
        savingLabel: "Saving…",
        savedLabel: "Draft saved",
        unsavedLabel: "Unsaved changes",
        publishLabel: "Publish reply",
        publishingLabel: "Publishing…",
        reloadLatestLabel: "Load latest",
        reviewDraftLabel: "Review draft",
        characterCountLabel: (count, maximum) => `${count} of ${maximum}`,
        errors: {
          stale:
            "The journal changed in another session. Load the latest version—your text is still here.",
          idempotency: "This key is already bound to different text. Retry without changing it.",
          allowance: "The new-cycle allowance for this paid period has been used.",
          read_only: "The subscription ended. This journal is read-only.",
          no_cycle: "The reply cycle is no longer open. Load the latest version.",
          generic: "Could not save the reply. Retry—the editor will keep your text."
        }
      }
    },
    calendar: {
      documentTitle: "ElevenHouse | Calendar",
      title: "Calendar",
      views: { day: "Day", week: "Week", month: "Month" },
      todayLabel: "Today",
      previousLabel: "Previous period",
      nextLabel: "Next period",
      showPanelLabel: "Show panel",
      hidePanelLabel: "Hide panel",
      availabilityLabel: "Availability",
      availabilityDoneLabel: "Done",
      createBookingLabel: "Booking",
      loadingLabel: "Loading calendar",
      errorLabel: "Could not load calendar",
      retryLabel: "Retry",
      profileRequired: {
        title: "Complete your astrologer profile",
        description: "Calendar needs your time zone to show bookings and availability correctly.",
        settingsLabel: "Go to settings"
      },
      emptyLabel: "No bookings in this period",
      conflictMessage:
        "This time is no longer available. Choose another slot from the refreshed calendar.",
      mobileAgenda: {
        agendaLabel: "Schedule",
        confirmedLabel: "Confirmed",
        blockedLabel: "Unavailable",
        availabilityLabel: "Available",
        emptyLabel: "There are no bookings or available hours in this period",
        bookFromLabel: (time) => `Book from ${time}`
      },
      monthGrid: {
        gridLabel: "Monthly calendar",
        confirmedLabel: "Confirmed",
        blockedLabel: "Unavailable",
        availabilityLabel: "Available time",
        openDateLabel: (date) => `Open ${date}`,
        moreLabel: (count) => `+${count} more`
      },
      bookingDetail: {
        panelLabel: "Booking details",
        closeLabel: "Close booking details",
        confirmedLabel: "Confirmed",
        loadingLabel: "Loading booking details",
        errorLabel: "Could not load booking details",
        retryLabel: "Retry",
        fieldLabels: {
          productAndPrice: "Service and price",
          date: "Date",
          time: "Time and duration",
          deliveryFormat: "Format"
        },
        deliveryFormats: {
          video: "Video call",
          audio: "Audio call",
          chat: "Chat",
          text: "Text",
          file: "File",
          channel: "Channel"
        }
      },
      manualBooking: {
        eyebrow: "New booking",
        title: "Book a client",
        closeLabel: "Close booking dialog",
        clientLabel: "Client",
        clientPlaceholder: "Name or CRM search…",
        serviceLabel: "Service",
        dateLabel: "Day",
        timeLabel: "Time",
        formatLabel: "Format",
        summaryLabel: "Booking details",
        loadingProductsLabel: "Loading services…",
        productsErrorLabel: "Could not load services.",
        noScheduleLabel: "Set and save availability before creating a booking.",
        noProductsLabel: "No active services are connected to this schedule.",
        loadingSlotsLabel: "Finding available times…",
        slotsErrorLabel: "Could not load available times.",
        noSlotsLabel: "There are no available times in this period.",
        retryLabel: "Retry",
        cancelLabel: "Cancel",
        createLabel: "Create booking",
        creatingLabel: "Creating…",
        genericErrorLabel: "Could not create the booking. Check the details and try again.",
        durationLabel: (minutes) => `${minutes} min · online`,
        slotPicker: {
          pickerLabel: "Available date calendar",
          previousMonthLabel: "Previous month",
          nextMonthLabel: "Next month",
          timeSlotsLabel: (date) => `Available times${date ? ` · ${date}` : ""}`,
          availableDateLabel: (date, count) =>
            `${date}, ${count} ${count === 1 ? "slot" : "slots"}`,
          unavailableDateLabel: (date) => `${date}, no available time`,
          selectedDateLabel: "Selected day",
          slotCountLabel: (count) => `${count} ${count === 1 ? "slot" : "slots"}`,
          noSlotsForDateLabel: "There are no available times for the selected day."
        }
      },
      availabilityEditor: {
        instruction: "Set working hours and booking rules. Changes apply after you save.",
        title: "Availability settings",
        description: "Times are stored in your profile time zone.",
        startIntervalLabel: "Start interval",
        bufferBeforeLabel: "Buffer before",
        bufferAfterLabel: "Buffer after",
        minimumNoticeLabel: "Minimum notice",
        bookingHorizonLabel: "Booking horizon",
        maximumBookingsLabel: "Max. bookings per day",
        unlimitedLabel: "No limit",
        minutesShort: "min",
        hoursShort: "hr",
        daysShort: "days",
        immediateLabel: "Immediately",
        weeklyTitle: "Working hours",
        weeklyDescription: "You can add multiple periods to one day.",
        weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        unavailableLabel: "Unavailable",
        addPeriodLabel: "Add period",
        removePeriodLabel: "Remove period",
        fromLabel: "From",
        toLabel: "To",
        overridesTitle: "Date overrides",
        overridesDescription: "Vacation, a day off, or special hours for one date.",
        overrideDateLabel: "Override date",
        addOverrideLabel: "Add date",
        availableLabel: "Special hours",
        closedLabel: "Unavailable all day",
        removeOverrideLabel: "Remove override",
        productsTitle: "Bookable products",
        productsDescription: "Select active products that use this schedule.",
        productsEmptyLabel: "There are no active products yet.",
        productsLoadingLabel: "Loading products",
        productsErrorLabel: "Could not load products",
        saveLabel: "Save availability",
        savingLabel: "Saving…",
        loadErrorLabel: "Could not load availability.",
        saveErrorLabel: "Could not save availability. Check the periods and try again.",
        conflictErrorLabel:
          "The schedule changed in another tab. It has been refreshed; apply your changes again.",
        savedLabel: "Availability saved",
        retryLabel: "Retry"
      }
    },
    chartEngine: chartEngineCopyByLocale.en,
    numerology: {
      interpretation: {
        sectionLabel: "AI portrait interpretation",
        createAiDraftLabel: "Create AI draft",
        creatingAiDraftLabel: "Creating AI draft…",
        openEditorLabel: "Open interpretation editor",
        modalTitle: "Numerology portrait interpretation",
        closeModalLabel: "Close interpretation editor",
        textLabel: "Interpretation text",
        individualPlaceholder: "Enter an interpretation for the client",
        compatibilityPlaceholder: "Enter an interpretation for the pair",
        saveDraftLabel: "Save draft",
        approveLabel: "Approve"
      }
    },
    products: {
      documentTitle: "ElevenHouse | Products",
      title: "Products",
      createLabel: "Create product",
      statusFilterAriaLabel: "Product status filter",
      createTypeModal: {
        title: "Choose product type",
        closeLabel: "Close product type selection",
        description: "The type sets starter defaults that can be adjusted in the editor.",
        loadError: "Could not load templates. Choose a product type manually."
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
        durationSuffix: " min",
        formatLabel: "Format",
        paymentModelLabel: "Payment",
        packageSessionCountLabel: "Sessions in package",
        packageDiscountLabel: "Package discount",
        subscriptionPeriodLabel: "Subscription period",
        trialDaysLabel: "Trial period",
        participantModeLabel: "Participants",
        groupSizeLabel: "Group size",
        requiredClientDataLabel: "Client-provided data",
        methodsLabel: "Method / system",
        accessGrantsLabel: "Access",
        includedItemsLabel: "What is included",
        includedItemTextLabel: "Item text",
        includedItemPlaceholder: "What the client receives",
        includedItemIconLabel: "Item icon",
        addIncludedItemLabel: "Add item",
        removeIncludedItemLabel: "Remove item",
        modifiersLabel: "Add-ons · modifiers",
        modifierKindLabel: "Modifier type",
        modifierFixedLabel: "Fixed price",
        modifierPercentLabel: "Percent",
        modifierFreeLabel: "Free",
        modifierLabelLabel: "Modifier name",
        modifierLabelPlaceholder: "Modifier name",
        modifierPriceLabel: "Modifier price",
        addModifierLabel: "Custom modifier",
        removeModifierLabel: "Remove modifier",
        saveDraftLabel: "Save draft",
        savingLabel: "Saving"
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
      actionErrorReloadLabel: "Reload products",
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
        aiDraftDisabledTooltip: "Fill in the title first",
        saveLabel: "Save",
        cancelLabel: "Cancel",
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

function formatRussianSlotCount(count: number): string {
  const lastTwoDigits = Math.abs(count) % 100;
  const lastDigit = Math.abs(count) % 10;
  const noun =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? "слотов"
      : lastDigit === 1
        ? "слот"
        : lastDigit >= 2 && lastDigit <= 4
          ? "слота"
          : "слотов";

  return `${count} ${noun}`;
}
