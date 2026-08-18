export type PrivacyPolicySection = {
  readonly title: string;
  readonly blocks: readonly PrivacyPolicyBlock[];
};

export type PrivacyPolicyBlock =
  | {
      readonly kind: "paragraph";
      readonly text: string;
    }
  | {
      readonly kind: "subheading";
      readonly text: string;
    }
  | {
      readonly kind: "list";
      readonly items: readonly string[];
    };

export const privacyPolicyUpdatedAt = "30 июля 2026 г.";
export const privacyContactEmail = "info@kyulchoro.kg";

export const privacyPolicySections: readonly PrivacyPolicySection[] = [
  {
    title: "1. Общие положения",
    blocks: [
      {
        kind: "paragraph",
        text: "Настоящая Политика конфиденциальности определяет порядок сбора, обработки, хранения и защиты персональных данных пользователей интернет-приложения ElevenHouse (далее — Приложение)."
      },
      {
        kind: "paragraph",
        text: "Используя Приложение, пользователь подтверждает своё свободное, осознанное и информированное согласие с условиями настоящей Политики конфиденциальности."
      },
      {
        kind: "paragraph",
        text: "Оператор персональных данных: Общество с ограниченной ответственностью «Кюльчоро»."
      },
      {
        kind: "paragraph",
        text: "Юридический адрес: Кыргызская Республика, г. Бишкек, Ленинский район, ул. Кызыл-Адыр (ж/к Арча-Бешик), 172 А."
      },
      {
        kind: "paragraph",
        text: "ОсОО «Кюльчоро» является оператором персональных данных пользователей интернет-приложения ElevenHouse."
      }
    ]
  },
  {
    title: "2. Применимое законодательство",
    blocks: [
      {
        kind: "paragraph",
        text: "Обработка персональных данных осуществляется в соответствии с:"
      },
      {
        kind: "list",
        items: [
          "Конституцией Кыргызской Республики;",
          "Законом Кыргызской Республики «О персональных данных» № 58 от 14 апреля 2008 года;",
          "иными нормативными правовыми актами Кыргызской Республики;",
          "требованиями Google Play Developer Policy."
        ]
      }
    ]
  },
  {
    title: "3. Какие данные мы собираем",
    blocks: [
      {
        kind: "subheading",
        text: "3.1. Данные, предоставляемые пользователем"
      },
      {
        kind: "paragraph",
        text: "Приложение может обрабатывать следующие данные, добровольно предоставляемые пользователем:"
      },
      {
        kind: "list",
        items: [
          "имя или псевдоним (при наличии);",
          "дата, время и место рождения (для астрологических расчётов);",
          "адрес электронной почты (при обращении в службу поддержки или регистрации, если предусмотрено);",
          "местоположение (необязательно) — используется исключительно при наличии явного согласия пользователя для повышения точности астрологических расчётов."
        ]
      },
      {
        kind: "subheading",
        text: "3.2. Технические данные"
      },
      {
        kind: "paragraph",
        text: "Мы можем автоматически собирать:"
      },
      {
        kind: "list",
        items: [
          "тип и модель устройства;",
          "операционную систему и её версию;",
          "язык системы;",
          "уникальные идентификаторы устройства, включая Advertising ID;",
          "данные об использовании приложения (просматриваемые экраны, используемые функции, продолжительность сессий);",
          "отчёты о сбоях и диагностические данные."
        ]
      },
      {
        kind: "subheading",
        text: "3.3. Геолокация"
      },
      {
        kind: "paragraph",
        text: "Геолокация используется только с разрешения пользователя и исключительно для корректной работы функционала Приложения. Пользователь может отозвать разрешение в настройках устройства."
      }
    ]
  },
  {
    title: "4. Цели и правовые основания обработки данных",
    blocks: [
      {
        kind: "subheading",
        text: "4.1. Цели обработки"
      },
      {
        kind: "paragraph",
        text: "Персональные данные обрабатываются исключительно для:"
      },
      {
        kind: "list",
        items: [
          "предоставления и улучшения функциональности Приложения;",
          "выполнения астрологических расчётов и формирования персонализированного контента;",
          "аналитики и улучшения пользовательского опыта;",
          "показа рекламы (если применимо);",
          "обработки обращений и предоставления поддержки пользователям;",
          "выполнения требований законодательства Кыргызской Республики."
        ]
      },
      {
        kind: "paragraph",
        text: "Персональные данные не используются для автоматического принятия юридически значимых решений."
      },
      {
        kind: "subheading",
        text: "4.2. Правовые основания"
      },
      {
        kind: "paragraph",
        text: "Обработка персональных данных осуществляется на основании:"
      },
      {
        kind: "list",
        items: [
          "согласия пользователя;",
          "необходимости исполнения пользовательского соглашения;",
          "требований законодательства Кыргызской Республики."
        ]
      }
    ]
  },
  {
    title: "5. Реклама и аналитика",
    blocks: [
      {
        kind: "paragraph",
        text: "Если в Приложении используется реклама:"
      },
      {
        kind: "list",
        items: [
          "могут применяться рекламные идентификаторы (Advertising ID);",
          "реклама может быть персонализированной;",
          "пользователь вправе ограничить персонализацию рекламы в настройках своего устройства."
        ]
      },
      {
        kind: "paragraph",
        text: "Для аналитики, стабильности и безопасности Приложения могут использоваться сервисы Google (включая Google Play Services, Firebase и аналогичные инструменты)."
      }
    ]
  },
  {
    title: "6. Передача данных третьим лицам",
    blocks: [
      {
        kind: "paragraph",
        text: "Мы не продаём персональные данные пользователей."
      },
      {
        kind: "paragraph",
        text: "Передача персональных данных возможна только в следующих случаях:"
      },
      {
        kind: "list",
        items: [
          "по законному требованию государственных органов;",
          "поставщикам услуг (хостинг, аналитика, рекламные партнёры), исключительно в рамках целей обработки;",
          "при использовании сервисов Google;",
          "при реорганизации бизнеса (слияние, поглощение, передача активов);",
          "при наличии явного согласия пользователя."
        ]
      },
      {
        kind: "paragraph",
        text: "Все третьи лица обязаны соблюдать требования конфиденциальности и защиты персональных данных."
      }
    ]
  },
  {
    title: "7. Трансграничная передача и хранение данных",
    blocks: [
      {
        kind: "paragraph",
        text: "Персональные данные могут храниться и обрабатываться как на территории Кыргызской Республики, так и за её пределами, при условии соблюдения требований законодательства Кыргызской Республики и обеспечения надлежащего уровня защиты персональных данных."
      },
      {
        kind: "paragraph",
        text: "Срок хранения данных не превышает период, необходимый для достижения целей обработки, если иное не требуется законом."
      }
    ]
  },
  {
    title: "8. Права пользователя",
    blocks: [
      {
        kind: "paragraph",
        text: "Пользователь имеет право:"
      },
      {
        kind: "list",
        items: [
          "получать информацию о своих персональных данных;",
          "требовать исправления, блокирования или удаления данных;",
          "отозвать согласие на обработку персональных данных;",
          "ограничить обработку персональных данных;",
          "обратиться за защитой своих прав в уполномоченные органы или суд."
        ]
      },
      {
        kind: "paragraph",
        text: "Для реализации своих прав пользователь может направить обращение по электронной почте, указанной в разделе «Контакты»."
      }
    ]
  },
  {
    title: "9. Дети",
    blocks: [
      {
        kind: "paragraph",
        text: "Приложение не предназначено для использования детьми младше 14 лет и не предназначено для детей младше 13 лет в соответствии с требованиями Google Play."
      },
      {
        kind: "paragraph",
        text: "Мы сознательно не собираем персональные данные детей."
      },
      {
        kind: "paragraph",
        text: "Если вам стало известно, что данные ребёнка были переданы нам, пожалуйста, свяжитесь с нами для их удаления."
      }
    ]
  },
  {
    title: "10. Меры по защите персональных данных",
    blocks: [
      {
        kind: "paragraph",
        text: "Мы применяем необходимые организационные и технические меры для защиты персональных данных, включая:"
      },
      {
        kind: "list",
        items: [
          "хранение данных на защищённых серверах;",
          "ограничение доступа к данным только уполномоченным лицам;",
          "использование договоров о конфиденциальности;",
          "регулярные меры по предотвращению несанкционированного доступа."
        ]
      },
      {
        kind: "paragraph",
        text: "Пользователь самостоятельно принимает меры по защите своего устройства и учётных данных."
      }
    ]
  },
  {
    title: "11. Изменения Политики",
    blocks: [
      {
        kind: "paragraph",
        text: "Мы вправе вносить изменения в настоящую Политику конфиденциальности."
      },
      {
        kind: "paragraph",
        text: "Актуальная версия всегда доступна по ссылке, указанной в Google Play."
      },
      {
        kind: "paragraph",
        text: "Продолжение использования Приложения означает согласие с обновлённой редакцией."
      }
    ]
  },
  {
    title: "12. Контакты",
    blocks: [
      {
        kind: "paragraph",
        text: "По всем вопросам, связанным с обработкой персональных данных, вы можете связаться с нами:"
      },
      {
        kind: "paragraph",
        text: `Email: ${privacyContactEmail}`
      }
    ]
  }
];

export const privacyPolicySectionsEn: readonly PrivacyPolicySection[] = [
  {
    title: "1. General Provisions",
    blocks: [
      {
        kind: "paragraph",
        text: "This Privacy Policy defines the procedure for collecting, processing, storing, and protecting personal data of users of the internet application ElevenHouse (the Application)."
      },
      {
        kind: "paragraph",
        text: "By using the Application, the user confirms their free, conscious, and informed consent to the terms of this Privacy Policy."
      },
      {
        kind: "paragraph",
        text: "Personal data operator: Limited Liability Company Kyulchoro."
      },
      {
        kind: "paragraph",
        text: "Legal address: Kyrgyz Republic, Bishkek, Leninsky District, Kyzyl-Adyr Street (Archa-Beshik residential area), 172 A."
      },
      {
        kind: "paragraph",
        text: "Kyulchoro LLC is the personal data operator for users of the internet application ElevenHouse."
      }
    ]
  },
  {
    title: "2. Applicable Law",
    blocks: [
      {
        kind: "paragraph",
        text: "Personal data is processed in accordance with:"
      },
      {
        kind: "list",
        items: [
          "the Constitution of the Kyrgyz Republic;",
          'Law of the Kyrgyz Republic "On Personal Data" No. 58 dated April 14, 2008;',
          "other regulatory legal acts of the Kyrgyz Republic;",
          "the requirements of the Google Play Developer Policy."
        ]
      }
    ]
  },
  {
    title: "3. Data We Collect",
    blocks: [
      {
        kind: "subheading",
        text: "3.1. Data provided by the user"
      },
      {
        kind: "paragraph",
        text: "The Application may process the following data voluntarily provided by the user:"
      },
      {
        kind: "list",
        items: [
          "name or pseudonym, if provided;",
          "date, time, and place of birth for astrological calculations;",
          "email address when contacting support or registering, if applicable;",
          "location, optionally and only with the user's explicit consent, to improve the accuracy of astrological calculations."
        ]
      },
      {
        kind: "subheading",
        text: "3.2. Technical data"
      },
      {
        kind: "paragraph",
        text: "We may automatically collect:"
      },
      {
        kind: "list",
        items: [
          "device type and model;",
          "operating system and version;",
          "system language;",
          "unique device identifiers, including Advertising ID;",
          "application usage data, including viewed screens, used features, and session duration;",
          "crash reports and diagnostic data."
        ]
      },
      {
        kind: "subheading",
        text: "3.3. Geolocation"
      },
      {
        kind: "paragraph",
        text: "Geolocation is used only with the user's permission and solely for correct operation of the Application's functionality. The user may withdraw permission in the device settings."
      }
    ]
  },
  {
    title: "4. Purposes and Legal Grounds for Processing",
    blocks: [
      {
        kind: "subheading",
        text: "4.1. Processing purposes"
      },
      {
        kind: "paragraph",
        text: "Personal data is processed exclusively for:"
      },
      {
        kind: "list",
        items: [
          "providing and improving the Application's functionality;",
          "performing astrological calculations and generating personalized content;",
          "analytics and user experience improvement;",
          "displaying advertising, where applicable;",
          "processing requests and providing user support;",
          "complying with the requirements of the laws of the Kyrgyz Republic."
        ]
      },
      {
        kind: "paragraph",
        text: "Personal data is not used for automated decision-making that produces legal effects."
      },
      {
        kind: "subheading",
        text: "4.2. Legal grounds"
      },
      {
        kind: "paragraph",
        text: "Personal data is processed on the basis of:"
      },
      {
        kind: "list",
        items: [
          "the user's consent;",
          "the need to perform the user agreement;",
          "the requirements of the laws of the Kyrgyz Republic."
        ]
      }
    ]
  },
  {
    title: "5. Advertising and Analytics",
    blocks: [
      {
        kind: "paragraph",
        text: "If advertising is used in the Application:"
      },
      {
        kind: "list",
        items: [
          "advertising identifiers, including Advertising ID, may be used;",
          "advertising may be personalized;",
          "the user may limit ad personalization in their device settings."
        ]
      },
      {
        kind: "paragraph",
        text: "Google services, including Google Play Services, Firebase, and similar tools, may be used for analytics, stability, and security of the Application."
      }
    ]
  },
  {
    title: "6. Transfer of Data to Third Parties",
    blocks: [
      {
        kind: "paragraph",
        text: "We do not sell users' personal data."
      },
      {
        kind: "paragraph",
        text: "Personal data may be transferred only in the following cases:"
      },
      {
        kind: "list",
        items: [
          "upon a lawful request from public authorities;",
          "to service providers, including hosting, analytics, and advertising partners, only within the purposes of processing;",
          "when Google services are used;",
          "in connection with business reorganization, including merger, acquisition, or transfer of assets;",
          "with the user's explicit consent."
        ]
      },
      {
        kind: "paragraph",
        text: "All third parties must comply with confidentiality and personal data protection requirements."
      }
    ]
  },
  {
    title: "7. Cross-Border Transfer and Data Storage",
    blocks: [
      {
        kind: "paragraph",
        text: "Personal data may be stored and processed both in the Kyrgyz Republic and outside it, provided that the requirements of the laws of the Kyrgyz Republic are met and an appropriate level of personal data protection is ensured."
      },
      {
        kind: "paragraph",
        text: "The data retention period does not exceed the period necessary to achieve the processing purposes, unless otherwise required by law."
      }
    ]
  },
  {
    title: "8. User Rights",
    blocks: [
      {
        kind: "paragraph",
        text: "The user has the right to:"
      },
      {
        kind: "list",
        items: [
          "receive information about their personal data;",
          "request correction, blocking, or deletion of data;",
          "withdraw consent to personal data processing;",
          "restrict personal data processing;",
          "seek protection of their rights from authorized authorities or a court."
        ]
      },
      {
        kind: "paragraph",
        text: "To exercise their rights, the user may send a request by email to the address specified in the Contacts section."
      }
    ]
  },
  {
    title: "9. Children",
    blocks: [
      {
        kind: "paragraph",
        text: "The Application is not intended for children under 14 and is not intended for children under 13 in accordance with Google Play requirements."
      },
      {
        kind: "paragraph",
        text: "We do not knowingly collect children's personal data."
      },
      {
        kind: "paragraph",
        text: "If you become aware that a child's data has been transferred to us, please contact us so that it can be deleted."
      }
    ]
  },
  {
    title: "10. Personal Data Protection Measures",
    blocks: [
      {
        kind: "paragraph",
        text: "We apply necessary organizational and technical measures to protect personal data, including:"
      },
      {
        kind: "list",
        items: [
          "storing data on protected servers;",
          "restricting data access to authorized persons only;",
          "using confidentiality agreements;",
          "regular measures to prevent unauthorized access."
        ]
      },
      {
        kind: "paragraph",
        text: "The user independently takes measures to protect their device and account credentials."
      }
    ]
  },
  {
    title: "11. Changes to the Policy",
    blocks: [
      {
        kind: "paragraph",
        text: "We may make changes to this Privacy Policy."
      },
      {
        kind: "paragraph",
        text: "The current version is always available through the link specified in Google Play."
      },
      {
        kind: "paragraph",
        text: "Continued use of the Application means consent to the updated version."
      }
    ]
  },
  {
    title: "12. Contacts",
    blocks: [
      {
        kind: "paragraph",
        text: "For all questions related to personal data processing, you may contact us:"
      },
      {
        kind: "paragraph",
        text: `Email: ${privacyContactEmail}`
      }
    ]
  }
];
