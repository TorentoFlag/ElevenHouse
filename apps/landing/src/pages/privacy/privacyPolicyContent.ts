export type PrivacyPolicySection = {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
};

export const privacyPolicyUpdatedAt = "July 29, 2026";
export const privacyContactEmail = "privacy@elevenhouse.ai";

export const privacyPolicySections: readonly PrivacyPolicySection[] = [
  {
    title: "1. Who We Are",
    paragraphs: [
      "ElevenHouse is a SaaS workspace for astrologers that helps practitioners manage client relationships, bookings, communications, products, calculations, payments and related business operations.",
      "This Privacy Policy explains how ElevenHouse collects, uses, stores and shares personal data when you visit our websites, create an account, connect messaging channels, use our CRM and booking tools, or communicate with us."
    ]
  },
  {
    title: "2. Personal Data We Collect",
    paragraphs: [
      "We collect personal data that is necessary to provide the ElevenHouse service, operate the platform safely, communicate with users and comply with legal obligations."
    ],
    bullets: [
      "Account and contact data, such as name, email address, phone number, role, language, timezone and authentication records.",
      "Astrologer profile and business data, such as public profile information, service descriptions, availability, products, prices, payout and billing information.",
      "Client CRM and booking data, such as client names, contact details, notes, relationship records, bookings, order history and service context entered by the astrologer or client.",
      "Astrology calculation data, such as birth date, birth time, birth location, chart inputs, generated calculation records and related interpretation materials.",
      "Messaging data from connected channels, including Instagram Direct and Telegram messages, sender and recipient identifiers, message text, attachments, media metadata, timestamps, delivery state, conversation identifiers and channel connection metadata.",
      "Payment and transaction data, such as order details, payment status, currency, minor-unit amounts, invoices, payout requests and provider references. We do not store full payment card numbers unless a payment provider specifically requires and secures that processing.",
      "Device, log and usage data, such as IP address, browser type, operating system, pages viewed, actions taken, errors, security events and cookie or similar technology identifiers.",
      "Support and communication data, such as emails, support requests, feedback and administrative correspondence."
    ]
  },
  {
    title: "3. How We Use Personal Data",
    paragraphs: [
      "We use personal data to provide, secure, maintain and improve ElevenHouse."
    ],
    bullets: [
      "Create and manage user accounts, sessions, authentication, roles and permissions.",
      "Provide CRM, client management, booking, product, calculation, messaging, payment and automation features.",
      "Receive, display, organize and send messages through connected channels when a user authorizes an integration.",
      "Process orders, payments, payouts, invoices, refunds, disputes and financial reporting.",
      "Send operational notifications, service messages, security alerts and support replies.",
      "Monitor reliability, prevent abuse, investigate errors, protect the service and enforce our terms.",
      "Analyze aggregated or de-identified product usage to improve functionality and user experience.",
      "Comply with legal, accounting, tax, audit and regulatory obligations."
    ]
  },
  {
    title: "4. Messaging Integrations, Instagram and Telegram",
    paragraphs: [
      "When an astrologer connects an external messaging channel, ElevenHouse processes data from that channel only to provide the connected inbox, CRM, reply and automation features requested by the user.",
      "For Instagram, ElevenHouse may request permissions such as basic professional account information and message management permissions. If granted, we may receive and process Instagram Direct messages, conversation metadata and account identifiers through Meta's APIs and webhooks. We use this data to show conversations in ElevenHouse, associate conversations with client records, support replies and maintain delivery state.",
      "For Telegram, ElevenHouse may process messages and related metadata from connected Telegram Business or account-based integrations, depending on the connection method explicitly authorized by the user.",
      "We do not sell Instagram, Telegram or other messaging data. We do not use messaging data for third-party advertising. Access tokens and connection credentials are stored with security controls appropriate to the integration."
    ]
  },
  {
    title: "5. Legal Bases and Consent",
    paragraphs: [
      "Where applicable law requires a legal basis, we process personal data under one or more of the following bases: performance of a contract, legitimate interests, compliance with legal obligations and consent.",
      "Consent may be required for certain sensitive data, messaging integrations, cookies, marketing communications or optional product features. Where processing is based on consent, you may withdraw it at any time, subject to legal or contractual retention requirements."
    ]
  },
  {
    title: "6. How We Share Personal Data",
    paragraphs: [
      "We share personal data only as needed to operate ElevenHouse, provide requested integrations, comply with law or protect the service."
    ],
    bullets: [
      "Service providers and subprocessors that help us host infrastructure, store data, process payments, send notifications, monitor reliability, provide analytics or support users.",
      "Messaging and platform providers, such as Meta or Telegram, when a user connects an integration or sends replies through that provider.",
      "Payment providers, banks, tax, accounting, compliance and dispute-resolution partners when needed for transactions and payouts.",
      "Professional advisers, authorities or courts where disclosure is legally required or necessary to protect rights, safety and security.",
      "A successor organization in connection with a merger, acquisition, financing, restructuring or sale of assets, subject to appropriate confidentiality and data protection commitments."
    ]
  },
  {
    title: "7. Retention",
    paragraphs: [
      "We keep personal data for as long as needed to provide ElevenHouse, maintain business and security records, comply with legal obligations, resolve disputes and enforce agreements.",
      "Messaging, CRM, booking, payment and calculation records may be retained while the account or relevant client relationship remains active and for a reasonable period afterward. Some financial, tax, security and audit records may be retained longer where required by law or legitimate business needs."
    ]
  },
  {
    title: "8. Security",
    paragraphs: [
      "We use technical and organizational measures designed to protect personal data, including access controls, authentication, encryption where appropriate, monitoring, backups and separation of sensitive credentials from public application data.",
      "No system is perfectly secure. Users are responsible for maintaining the confidentiality of their login credentials and for connecting only accounts they are authorized to manage."
    ]
  },
  {
    title: "9. International Transfers",
    paragraphs: [
      "ElevenHouse may process and store personal data in countries other than the country where the user is located. Where required, we rely on appropriate safeguards for international transfers, such as contractual protections, provider commitments or other mechanisms allowed by applicable law."
    ]
  },
  {
    title: "10. Your Rights and Choices",
    paragraphs: [
      "Depending on your location, you may have rights to access, correct, delete, restrict, export or object to the processing of your personal data. You may also have the right to withdraw consent or lodge a complaint with a data protection authority.",
      "To request access, correction, deletion or account-data removal, contact us at privacy@elevenhouse.ai. Please include enough information for us to identify your account and verify the request. We may retain certain records where required by law, security, audit, payment or dispute-resolution obligations."
    ]
  },
  {
    title: "11. Cookies and Similar Technologies",
    paragraphs: [
      "We may use cookies, local storage and similar technologies to keep users signed in, remember preferences, protect sessions, measure performance, analyze usage and improve the service. Browser settings may allow users to block or delete cookies, but some service features may stop working correctly."
    ]
  },
  {
    title: "12. Children's Privacy",
    paragraphs: [
      "ElevenHouse is intended for business users and their clients. It is not directed to children under 16. We do not knowingly collect personal data from children under 16 without appropriate authorization."
    ]
  },
  {
    title: "13. Changes to This Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date and provide notice where required by law or appropriate for the change."
    ]
  },
  {
    title: "14. Contact",
    paragraphs: [
      "For privacy questions, data requests or deletion requests, contact ElevenHouse at privacy@elevenhouse.ai. For general support, contact support@elevenhouse.ai."
    ]
  }
];
