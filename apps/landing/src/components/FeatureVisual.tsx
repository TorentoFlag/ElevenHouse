import type { showcaseItems } from "../content/landingContent";
import { cssVars } from "../common/cssVars";
import type { IconName, LandingLanguage } from "../content/landingContent";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

type ShowcaseId = (typeof showcaseItems)[number]["id"];

const featureVisualCopy = {
  ru: {
    engineTabs: ["Натал", "Транзиты", "Синастрия", "Соляр"],
    engineRows: [
      ["☉ Солнце", "Телец · 10 дом"],
      ["☽ Луна", "Рыбы · 8 дом"],
      ["☿ Меркурий", "Овен · 9 дом"]
    ],
    aiNote: "AI-трактовка: «Сильный 10 дом - год про карьеру и признание...»",
    flowItems: [
      { icon: "spark", label: "Новый лид со страницы", tag: "триггер", color: "#6FA8FF" },
      { icon: "orbit", label: "Движок строит карту", tag: "авто", color: "#B79CFB" },
      {
        icon: "ai",
        label: "AI пишет разбор в вашем тоне",
        tag: "нейросеть",
        color: "linear-gradient(140deg,#B79CFB,#F4C430)"
      },
      { icon: "wallet", label: "Счет и напоминание об оплате", tag: "авто", color: "#4EC8A0" },
      { icon: "check", label: "Клиент оплатил -> задача вам", tag: "готово", color: "#F4C430" }
    ],
    crm: {
      initials: "МК",
      name: "Марина Краснова",
      meta: "5 сессий · LTV 38 900 ₽ · Telegram",
      linked: "● привязана",
      tiles: [
        ["orbit", "Натальная карта"],
        ["num", "Нумерология"],
        ["chart", "Матрица"]
      ],
      rows: [
        ["Оплата · Синастрия", "5 400 ₽"],
        ["Сессия · Натал", "12 апр"]
      ]
    },
    analytics: {
      stats: [
        ["Доход", "284 500 ₽", "↑ 18%"],
        ["Сессий", "47", "↑ 9%"],
        ["Конверсия", "32%", "↑ 4пп"]
      ],
      note: "Цель месяца: 300 000 ₽ - прогноз достижения 95%"
    }
  },
  en: {
    engineTabs: ["Natal", "Transits", "Synastry", "Solar"],
    engineRows: [
      ["☉ Sun", "Taurus · 10th house"],
      ["☽ Moon", "Pisces · 8th house"],
      ["☿ Mercury", "Aries · 9th house"]
    ],
    aiNote: "AI interpretation: “A strong 10th house points to career and recognition...”",
    flowItems: [
      { icon: "spark", label: "New lead from page", tag: "trigger", color: "#6FA8FF" },
      { icon: "orbit", label: "Engine builds chart", tag: "auto", color: "#B79CFB" },
      {
        icon: "ai",
        label: "AI writes in your tone",
        tag: "neural",
        color: "linear-gradient(140deg,#B79CFB,#F4C430)"
      },
      { icon: "wallet", label: "Invoice and payment reminder", tag: "auto", color: "#4EC8A0" },
      { icon: "check", label: "Client paid -> task for you", tag: "done", color: "#F4C430" }
    ],
    crm: {
      initials: "MK",
      name: "Marina Krasnova",
      meta: "5 sessions · LTV ₽38,900 · Telegram",
      linked: "● linked",
      tiles: [
        ["orbit", "Natal chart"],
        ["num", "Numerology"],
        ["chart", "Matrix"]
      ],
      rows: [
        ["Payment · Synastry", "₽5,400"],
        ["Session · Natal", "Apr 12"]
      ]
    },
    analytics: {
      stats: [
        ["Revenue", "₽284,500", "↑ 18%"],
        ["Sessions", "47", "↑ 9%"],
        ["Conversion", "32%", "↑ 4pp"]
      ],
      note: "Monthly goal: ₽300,000 - 95% forecast"
    }
  }
} as const;

type FeatureVisualProps = {
  readonly id: ShowcaseId;
  readonly language: LandingLanguage;
};

export function FeatureVisual({ id, language }: FeatureVisualProps) {
  const copy = featureVisualCopy[language];

  if (id === "engine") {
    return (
      <div className="browser-mock__content browser-mock__content--engine">
        <NatalWheel />
        <div className="mini-table">
          {copy.engineTabs.map((label, index) => (
            <span className={index === 0 ? "mini-pill mini-pill--active" : "mini-pill"} key={label}>
              {label}
            </span>
          ))}
          {copy.engineRows.map(([label, value]) => (
            <div className="mini-row" key={label}>
              <b>{label}</b>
              <span>{value}</span>
            </div>
          ))}
          <div className="ai-note">
            <Icon name="spark" size={13} />
            {copy.aiNote}
          </div>
        </div>
      </div>
    );
  }

  if (id === "flows") {
    return (
      <div className="flow-preview">
        {copy.flowItems.map(({ icon, label, tag, color }, index) => (
          <div className="flow-preview__item-wrap" key={label}>
            {index > 0 ? <span className="flow-preview__line" /> : null}
            <div className="flow-preview__item">
              <span
                className="flow-preview__icon"
                style={cssVars({
                  "--flow-color": color
                })}
              >
                <Icon name={icon as IconName} size={16} />
              </span>
              <b>{label}</b>
              <em>{tag}</em>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (id === "crm") {
    return (
      <div className="crm-preview">
        <div className="crm-preview__head">
          <Avatar initials={copy.crm.initials} size={42} />
          <div>
            <b>{copy.crm.name}</b>
            <span>{copy.crm.meta}</span>
          </div>
        </div>
        <div className="crm-preview__tiles">
          {copy.crm.tiles.map(([icon, label]) => (
            <div key={label}>
              <Icon name={icon as "orbit"} size={17} />
              <span>{label}</span>
              <small>{copy.crm.linked}</small>
            </div>
          ))}
        </div>
        {copy.crm.rows.map(([label, value]) => (
          <div className="mini-row" key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="analytics-preview">
      <div className="analytics-preview__stats">
        {copy.analytics.stats.map(([label, value, delta]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{value}</b>
            <em>{delta}</em>
          </div>
        ))}
      </div>
      <div className="analytics-preview__bars">
        {[42, 58, 50, 71, 64, 83, 92].map((height, index) => (
          <span key={index} style={cssVars({ "--bar-height": `${height}%` })} />
        ))}
      </div>
      <div className="ai-note">
        <Icon name="spark" size={13} />
        {copy.analytics.note}
      </div>
    </div>
  );
}

function NatalWheel() {
  return (
    <div className="natal-wheel" aria-hidden="true">
      <span className="natal-wheel__ring natal-wheel__ring--outer" />
      <span className="natal-wheel__ring natal-wheel__ring--middle" />
      <span className="natal-wheel__ring natal-wheel__ring--inner" />
      {Array.from({ length: 12 }, (_, index) => (
        <span
          className="natal-wheel__ray"
          key={index}
          style={cssVars({ "--ray-rotate": `${index * 30}deg` })}
        />
      ))}
      <span className="natal-wheel__core">
        <Icon name="spark" size={24} />
      </span>
    </div>
  );
}
