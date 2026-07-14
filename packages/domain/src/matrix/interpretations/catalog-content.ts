import type {
  MatrixArcanaContent,
  MatrixContextContent,
  MatrixInterpretationContext,
  MatrixInterpretationLocale
} from "./catalog-types";

const ruArcana: Record<number, MatrixArcanaContent> = {
  1: {
    title: "Маг",
    constructive:
      "Инициатива, ясное намерение и способность превращать идею в первый конкретный шаг.",
    shadow:
      "Стремление всё контролировать, обещать больше возможного или использовать влияние вместо диалога.",
    summary:
      "Сила проявляется через осознанную инициативу и ответственность за выбранные инструменты."
  },
  2: {
    title: "Верховная Жрица",
    constructive:
      "Тонкое наблюдение, интуитивное распознавание и умение выдержать паузу до ясности.",
    shadow: "Закрытость, пассивное ожидание и подмена проверки фактов внутренними догадками.",
    summary:
      "Внутреннее знание становится опорой, когда соединено с проверкой и своевременным действием."
  },
  3: {
    title: "Императрица",
    constructive:
      "Созидательность, забота о росте и способность придавать идеям красивую устойчивую форму.",
    shadow: "Избыточная опека, зависимость от признания и откладывание границ ради комфорта.",
    summary: "Ресурс раскрывается через созидание, зрелую заботу и уважение к собственным границам."
  },
  4: {
    title: "Император",
    constructive:
      "Структура, ответственность, стратегическое мышление и умение создавать понятные правила.",
    shadow: "Жёсткость, гиперконтроль и трудность признавать иной способ организации.",
    summary: "Порядок работает лучше всего, когда поддерживает людей и цель, а не заменяет их."
  },
  5: {
    title: "Иерофант",
    constructive:
      "Передача знаний, этический ориентир и способность соединять опыт с понятной системой.",
    shadow: "Догматизм, назидательность и опора на авторитет вместо живого понимания.",
    summary: "Знание становится ценным через практику, этику и уважение к свободе другого человека."
  },
  6: {
    title: "Влюблённые",
    constructive: "Осознанный выбор, партнёрство и согласование решений с личными ценностями.",
    shadow: "Колебания, зависимость от одобрения и попытка избежать ответственности за выбор.",
    summary: "Гармония появляется там, где выбор сделан честно и подтверждён действиями."
  },
  7: {
    title: "Колесница",
    constructive: "Собранность, движение к цели и способность направлять сильный импульс.",
    shadow:
      "Спешка, борьба ради победы и игнорирование сигналов усталости или сопротивления среды.",
    summary: "Продвижение устойчиво, когда скорость подчинена выбранному направлению."
  },
  8: {
    title: "Справедливость",
    constructive: "Баланс, причинно-следственное мышление и готовность принимать честные решения.",
    shadow: "Категоричность, самосуд и стремление свести сложную ситуацию к формальной правоте.",
    summary: "Равновесие требует учитывать факты, последствия и человеческий контекст одновременно."
  },
  9: {
    title: "Отшельник",
    constructive:
      "Глубина, самостоятельное исследование и способность выделять главное из лишнего.",
    shadow: "Изоляция, недоверие к обратной связи и бесконечный анализ без выхода к действию.",
    summary: "Глубина становится ресурсом, когда внутренний поиск возвращается в живой контакт."
  },
  10: {
    title: "Колесо Фортуны",
    constructive: "Гибкость, чувство времени и способность замечать окно возможностей в переменах.",
    shadow: "Ставка на случай, нестабильность решений и отказ видеть собственную долю влияния.",
    summary:
      "Перемены открывают возможности, когда сопровождаются вниманием и ответственным выбором."
  },
  11: {
    title: "Сила",
    constructive: "Спокойная смелость, жизненный тонус и умение направлять интенсивные эмоции.",
    shadow: "Давление, борьба за превосходство и подавление уязвимости.",
    summary: "Настоящая сила проявляется в устойчивости, мягком влиянии и умении дозировать напор."
  },
  12: {
    title: "Повешенный",
    constructive:
      "Новый угол зрения, добровольная пауза и способность отпустить неработающий сценарий.",
    shadow: "Зависание, роль жертвы и ожидание, что обстоятельства решат всё без участия человека.",
    summary: "Пауза полезна, если приводит к переоценке и новому способу действовать."
  },
  13: {
    title: "Трансформация",
    constructive:
      "Завершение этапа, освобождение ресурса и готовность обновить форму жизни или работы.",
    shadow: "Резкость разрыва, страх потерь и разрушение раньше, чем понятен следующий шаг.",
    summary: "Обновление начинается с честного завершения того, что уже выполнило свою задачу."
  },
  14: {
    title: "Умеренность",
    constructive: "Чувство меры, интеграция противоположностей и устойчивое постепенное развитие.",
    shadow: "Затягивание решений, избегание интенсивности и компромисс ценой собственной правды.",
    summary: "Гармония создаётся последовательной настройкой, а не отказом от различий."
  },
  15: {
    title: "Дьявол",
    constructive:
      "Сильная материальная мотивация, чувственность и способность видеть реальные желания.",
    shadow: "Зависимые сценарии, манипуляция, фиксация на выгоде или удовольствии любой ценой.",
    summary:
      "Большая энергия становится созидательной через честность мотивов и добровольные ограничения."
  },
  16: {
    title: "Башня",
    constructive:
      "Радикальная честность, освобождение от ложной конструкции и способность быстро перестроиться.",
    shadow: "Разрушение из импульса, конфликтность и отказ создавать новую опору после кризиса.",
    summary: "Кризис становится развитием, когда за освобождением следует осмысленная перестройка."
  },
  17: {
    title: "Звезда",
    constructive:
      "Вдохновение, открытость будущему и способность поддерживать надежду ясным образом цели.",
    shadow: "Идеализация, зависимость от внимания и мечта без практической опоры.",
    summary:
      "Вдохновение работает, когда дальний ориентир связан с сегодняшним небольшим действием."
  },
  18: {
    title: "Луна",
    constructive:
      "Воображение, эмоциональная чувствительность и умение замечать скрытые оттенки ситуации.",
    shadow: "Тревожные фантазии, туманность договорённостей и смешение интуиции со страхом.",
    summary:
      "Чувствительность помогает, когда впечатления проверяются фактами и ясными договорённостями."
  },
  19: {
    title: "Солнце",
    constructive:
      "Ясность, щедрость, жизнелюбие и способность объединять людей вокруг видимого результата.",
    shadow:
      "Эгоцентризм, зависимость от аплодисментов и вытеснение сложных переживаний позитивностью.",
    summary: "Яркость становится зрелой, когда рядом с самовыражением есть внимание к другим."
  },
  20: {
    title: "Суд",
    constructive:
      "Пробуждение, переоценка прошлого и готовность ответить на значимый внутренний вызов.",
    shadow: "Самообвинение, осуждение других и застревание в попытке переписать прошлое.",
    summary: "Призвание раскрывается через принятие опыта и конкретный ответ на сегодняшний вызов."
  },
  21: {
    title: "Мир",
    constructive:
      "Целостность, широкий взгляд и способность завершать большие циклы с понятным итогом.",
    shadow: "Рассеивание в масштабе, перфекционизм завершения и трудность выбрать следующий фокус.",
    summary:
      "Целостность укрепляется через завершение, признание результата и новый осознанный масштаб."
  },
  22: {
    title: "Шут",
    constructive:
      "Свобода эксперимента, свежесть восприятия и смелость начать путь без полной определённости.",
    shadow:
      "Безответственность, хаотичные старты и игнорирование последствий ради ощущения свободы.",
    summary:
      "Новизна становится ресурсом, когда любопытство сопровождается минимальной опорой и ответственностью."
  }
};

const enArcana: Record<number, MatrixArcanaContent> = {
  1: {
    title: "Magician",
    constructive: "Focused initiative and the ability to turn an idea into a practical first move.",
    shadow: "Over-control, inflated promises, or using influence instead of genuine exchange.",
    summary: "Intent becomes effective when skill is paired with accountability."
  },
  2: {
    title: "High Priestess",
    constructive:
      "Quiet perception, intuitive pattern recognition, and patience before a decision.",
    shadow: "Withdrawal, passive waiting, or treating assumptions as verified knowledge.",
    summary: "Inner knowing is strongest when it is tested and brought into timely action."
  },
  3: {
    title: "Empress",
    constructive:
      "Creative growth, attentive care, and a talent for giving ideas a sustainable form.",
    shadow: "Over-nurturing, approval seeking, or sacrificing boundaries for comfort.",
    summary: "Creation flourishes through mature care and respect for limits."
  },
  4: {
    title: "Emperor",
    constructive: "Structure, strategic responsibility, and the capacity to establish clear rules.",
    shadow: "Rigidity, excessive control, or resistance to other valid ways of organizing.",
    summary: "Structure serves best when it supports the purpose rather than replacing it."
  },
  5: {
    title: "Hierophant",
    constructive:
      "Ethical guidance, teaching, and the ability to turn experience into a coherent method.",
    shadow: "Dogma, moralizing, or relying on authority instead of living understanding.",
    summary: "Knowledge gains value through practice, ethics, and respect for autonomy."
  },
  6: {
    title: "Lovers",
    constructive: "Value-aligned choice, partnership, and the courage to make a clear commitment.",
    shadow: "Indecision, approval dependence, or avoiding ownership of a choice.",
    summary: "Harmony grows when a sincere choice is supported by action."
  },
  7: {
    title: "Chariot",
    constructive: "Direction, momentum, and the discipline to focus a strong drive.",
    shadow: "Rushing, competing for its own sake, or ignoring resistance and fatigue.",
    summary: "Momentum lasts when speed remains accountable to direction."
  },
  8: {
    title: "Justice",
    constructive:
      "Balance, causal reasoning, and willingness to make fair, evidence-based decisions.",
    shadow: "Harsh judgment, rigid correctness, or reducing a complex matter to a rule.",
    summary: "Fairness considers facts, consequences, and human context together."
  },
  9: {
    title: "Hermit",
    constructive:
      "Depth, independent inquiry, and the ability to separate essential insight from noise.",
    shadow: "Isolation, distrust of feedback, or analysis that never returns to action.",
    summary: "Depth becomes useful when reflection reconnects with people and practice."
  },
  10: {
    title: "Wheel of Fortune",
    constructive: "Adaptability, timing, and sensitivity to opportunity during change.",
    shadow: "Depending on luck, shifting direction impulsively, or denying personal influence.",
    summary: "Change opens doors when awareness is followed by responsible choice."
  },
  11: {
    title: "Strength",
    constructive:
      "Steady courage, vitality, and the capacity to channel intense emotion constructively.",
    shadow: "Pressure, dominance, or hiding vulnerability behind force.",
    summary: "Strength matures through steadiness, measured influence, and self-regulation."
  },
  12: {
    title: "Hanged Man",
    constructive: "A fresh perspective, a purposeful pause, and release of an exhausted pattern.",
    shadow: "Suspension without learning, victim identity, or waiting for life to decide.",
    summary: "A pause is productive when it changes perspective and future action."
  },
  13: {
    title: "Transformation",
    constructive: "Ending a completed cycle and freeing energy for a different form.",
    shadow: "Abrupt rupture, fear of loss, or destroying before a next step is understood.",
    summary: "Renewal begins by completing what has already served its purpose."
  },
  14: {
    title: "Temperance",
    constructive: "Proportion, integration, and patient development across competing needs.",
    shadow: "Endless delay, avoidance of intensity, or compromise that erases truth.",
    summary: "Harmony is an active calibration, not the absence of difference."
  },
  15: {
    title: "Devil",
    constructive: "Material drive, embodied desire, and honest recognition of powerful motives.",
    shadow: "Compulsion, manipulation, or choosing gain and pleasure without regard for cost.",
    summary: "Strong desire becomes productive through honesty and chosen boundaries."
  },
  16: {
    title: "Tower",
    constructive: "Radical clarity, release from a false structure, and rapid rebuilding capacity.",
    shadow: "Destruction by impulse, chronic conflict, or refusing to build a new foundation.",
    summary: "Disruption becomes growth when insight is followed by reconstruction."
  },
  17: {
    title: "Star",
    constructive:
      "Inspiration, future orientation, and the ability to offer a clear hopeful direction.",
    shadow: "Idealization, attention seeking, or vision without practical support.",
    summary: "Inspiration works when a distant guide is tied to a small present action."
  },
  18: {
    title: "Moon",
    constructive: "Imagination, emotional sensitivity, and awareness of subtle signals.",
    shadow: "Anxious projection, vague agreements, or confusing fear with intuition.",
    summary: "Sensitivity helps when impressions are checked against facts and clear agreements."
  },
  19: {
    title: "Sun",
    constructive:
      "Clarity, generosity, confidence, and the ability to gather people around visible value.",
    shadow: "Self-centeredness, applause dependence, or using positivity to avoid complexity.",
    summary: "Brightness matures when self-expression includes attention to others."
  },
  20: {
    title: "Judgement",
    constructive: "Awakening, honest review of the past, and response to a meaningful inner call.",
    shadow: "Self-condemnation, judging others, or trying to rewrite what cannot be changed.",
    summary: "Calling becomes real through acceptance of experience and a present response."
  },
  21: {
    title: "World",
    constructive: "Wholeness, broad perspective, and the ability to complete a large cycle well.",
    shadow: "Scattering across scale, perfectionism at the finish, or loss of the next focus.",
    summary: "Completion creates wholeness when the result is recognized and integrated."
  },
  22: {
    title: "Fool",
    constructive:
      "Experimental freedom, fresh perception, and courage to begin without complete certainty.",
    shadow: "Carelessness, chaotic starts, or ignoring consequences in the name of freedom.",
    summary: "Freshness becomes an asset when curiosity has a minimum structure and accountability."
  }
};

const ruContexts: Record<MatrixInterpretationContext, MatrixContextContent> = {
  portrait: {
    title: "портрет",
    constructive:
      "В центре личности это качество задаёт привычный способ воспринимать себя и принимать решения.",
    shadow: "В напряжении оно может сужать образ себя до одной роли.",
    question: "Как это качество проявляется в моих ежедневных решениях?",
    recommendation: "Соберите два примера зрелого проявления и один повторяющийся перегиб.",
    summary: "В портрете важно соединить естественную силу с более гибким образом себя."
  },
  talent: {
    title: "талант",
    constructive:
      "В талантах энергия показывает навык, который растёт через практику и полезность для других.",
    shadow: "Без практики дар может остаться образом потенциала или способом доказывать ценность.",
    question: "Какой наблюдаемый результат подтверждает этот талант?",
    recommendation:
      "Выберите небольшую задачу, где талант можно применить и получить обратную связь.",
    summary: "Талант раскрывается через регулярное применение и проверяемый результат."
  },
  karmic: {
    title: "урок",
    constructive:
      "В зоне урока качество помогает заметить повторяющийся сценарий и выбрать более зрелую реакцию.",
    shadow: "Автоматическая реакция может воспроизводить знакомое напряжение.",
    question: "Какой сценарий повторяется, когда я действую автоматически?",
    recommendation: "Опишите триггер, привычную реакцию и один альтернативный шаг.",
    summary: "Урок становится ресурсом через распознавание повторения и новый выбор."
  },
  relationship: {
    title: "отношения",
    constructive:
      "В отношениях энергия поддерживает контакт, договорённости и взаимное уважение различий.",
    shadow: "Непроговорённые ожидания могут превратить качество в давление или дистанцию.",
    question: "Что мне важно просить прямо, а не ожидать молча?",
    recommendation: "Сформулируйте одну конкретную просьбу и один доступный способ отказа.",
    summary: "В отношениях сила аркана раскрывается через ясность, границы и взаимность."
  },
  money: {
    title: "деньги и реализация",
    constructive:
      "В материальной сфере качество подсказывает продуктивный способ создавать ценность и обращаться с ресурсами.",
    shadow:
      "В перегибе оно может вести к импульсивным решениям или фиксации на одном источнике результата.",
    question: "Как эта энергия создаёт понятную ценность для клиента или проекта?",
    recommendation: "Свяжите одно сильное действие с измеримым результатом и пределом риска.",
    summary: "Финансовый потенциал требует ценности, дисциплины и осознанного отношения к риску."
  },
  lineage: {
    title: "родовая линия",
    constructive:
      "В родовой теме качество помогает увидеть унаследованный ресурс и способ продолжить его осознанно.",
    shadow:
      "Лояльность привычному сценарию может мешать отделить свой выбор от семейного ожидания.",
    question: "Что из семейного опыта я хочу сохранить, а что завершить?",
    recommendation: "Назовите один унаследованный ресурс и одну границу, которую важно установить.",
    summary: "Родовой ресурс становится опорой после отделения наследия от личного выбора."
  },
  purpose: {
    title: "предназначение",
    constructive:
      "В предназначении энергия показывает направление вклада, которое соединяет внутренний смысл и действие.",
    shadow: "Поиск идеальной миссии может откладывать реальный небольшой вклад.",
    question: "Какой вклад я могу сделать уже сейчас без ожидания полной ясности?",
    recommendation: "Сформулируйте ближайший полезный результат на горизонте одного месяца.",
    summary:
      "Предназначение проявляется как последовательный вклад, а не одна окончательная формула."
  },
  energy: {
    title: "энергетическая карта",
    constructive:
      "В энергетическом контексте это символический язык распределения внимания и активности.",
    shadow: "Не стоит превращать символ в диагноз или игнорировать реальные сигналы состояния.",
    question: "Где моё внимание сейчас собрано, а где ему не хватает присутствия?",
    recommendation:
      "Выберите один бережный режимный шаг и при необходимости опирайтесь на профильного специалиста.",
    summary: "Энергетическая трактовка остаётся метафорой для наблюдения, а не медицинским выводом."
  },
  compatibility: {
    title: "совместимость",
    constructive:
      "В паре энергия показывает общий способ координации, который можно развивать совместными правилами.",
    shadow:
      "Различия могут переживаться как доказательство несовместимости вместо темы для переговоров.",
    question: "Какое правило поможет нам использовать это качество без взаимного давления?",
    recommendation: "Согласуйте один наблюдаемый сигнал поддержки и один способ делать паузу.",
    summary:
      "Совместимость строится через договорённости вокруг общей энергии, а не через ярлык пары."
  },
  forecast: {
    title: "прогноз",
    constructive:
      "В годовом фокусе энергия выделяет тему, которой полезно уделять больше осознанного внимания.",
    shadow:
      "Прогноз может стать самоисполняющимся ожиданием, если воспринимать его как неизбежное событие.",
    question: "Какой выбор поможет прожить эту тему конструктивно в выбранном году?",
    recommendation: "Определите один ориентир, один риск и дату пересмотра прогноза.",
    summary: "Годовой аркан задаёт тему для решений, но не предопределяет события."
  }
};

const enContexts: Record<MatrixInterpretationContext, MatrixContextContent> = {
  portrait: {
    title: "portrait",
    constructive:
      "At the center of identity, this quality shapes the usual way of seeing oneself and making choices.",
    shadow: "Under strain, it can reduce identity to a single role.",
    question: "How does this quality show up in my everyday decisions?",
    recommendation: "Collect two examples of mature expression and one recurring excess.",
    summary: "In the portrait, natural strength benefits from a more flexible sense of self."
  },
  talent: {
    title: "talent",
    constructive:
      "As a talent, this energy becomes a skill through practice and usefulness to others.",
    shadow: "Without practice, it may remain an image of potential or a way to prove worth.",
    question: "What observable outcome demonstrates this talent?",
    recommendation: "Apply it to one small task and request specific feedback.",
    summary: "Talent becomes reliable through repetition and visible results."
  },
  karmic: {
    title: "learning pattern",
    constructive:
      "In a learning position, the quality helps identify a repeating pattern and choose a more deliberate response.",
    shadow: "Automatic reactions can reproduce the same familiar tension.",
    question: "What pattern returns when I respond on autopilot?",
    recommendation: "Write down the trigger, the default reaction, and one alternative move.",
    summary: "The lesson turns into capacity when repetition is recognized and interrupted."
  },
  relationship: {
    title: "relationships",
    constructive:
      "In relationships, the energy supports contact, agreements, and respect for difference.",
    shadow: "Unspoken expectations may turn it into pressure or distance.",
    question: "What do I need to ask for directly instead of expecting silently?",
    recommendation: "State one concrete request and make room for a clear no.",
    summary: "Relational strength grows through clarity, boundaries, and reciprocity."
  },
  money: {
    title: "money and work",
    constructive:
      "In material life, the quality suggests how value can be created and resources handled productively.",
    shadow: "Its excess may drive impulsive choices or dependence on one source of success.",
    question: "How does this energy create clear value for a client or project?",
    recommendation: "Tie one strong action to a measurable outcome and a defined risk limit.",
    summary: "Material potential needs value creation, discipline, and conscious risk."
  },
  lineage: {
    title: "lineage",
    constructive:
      "In family patterns, the quality reveals an inherited resource that can be continued consciously.",
    shadow:
      "Loyalty to a familiar script may blur the line between family expectation and personal choice.",
    question: "What from my family experience should continue, and what should end?",
    recommendation: "Name one inherited strength and one boundary that now belongs to you.",
    summary: "Lineage becomes support after inheritance is separated from personal choice."
  },
  purpose: {
    title: "purpose",
    constructive:
      "In purpose, the energy points toward contribution that joins meaning with action.",
    shadow: "Waiting for a perfect mission can postpone a real, modest contribution.",
    question: "What useful contribution can I make before everything feels certain?",
    recommendation: "Define one useful result for the next month.",
    summary: "Purpose appears through sustained contribution rather than one final formula."
  },
  energy: {
    title: "energy map",
    constructive:
      "In this context, the arcana is symbolic language for patterns of attention and activity.",
    shadow: "A symbol should not become a diagnosis or replace attention to actual wellbeing.",
    question: "Where is my attention available, and where is it currently absent?",
    recommendation:
      "Choose one gentle routine adjustment and seek qualified support when appropriate.",
    summary: "The energy reading is a reflective metaphor, not a medical conclusion."
  },
  compatibility: {
    title: "compatibility",
    constructive:
      "For a pair, the energy describes a shared coordination style that can be shaped by agreements.",
    shadow:
      "Difference may be treated as proof of incompatibility instead of material for negotiation.",
    question: "What agreement lets us use this quality without pressuring each other?",
    recommendation: "Agree on one visible sign of support and one way to pause escalation.",
    summary: "Compatibility grows through agreements around shared energy, not a fixed label."
  },
  forecast: {
    title: "forecast",
    constructive:
      "As an annual focus, the energy highlights a theme worth more deliberate attention.",
    shadow: "A forecast can become self-fulfilling when treated as an inevitable event.",
    question: "What choice would express this theme constructively during the selected year?",
    recommendation: "Set one intention, one risk marker, and a date to review the reading.",
    summary: "The annual arcana frames decisions; it does not predetermine events."
  }
};

export const MATRIX_ARCANA_CONTENT: Readonly<
  Record<MatrixInterpretationLocale, Readonly<Record<number, MatrixArcanaContent>>>
> = { ru: ruArcana, en: enArcana };

export const MATRIX_CONTEXT_CONTENT: Readonly<
  Record<
    MatrixInterpretationLocale,
    Readonly<Record<MatrixInterpretationContext, MatrixContextContent>>
  >
> = { ru: ruContexts, en: enContexts };
