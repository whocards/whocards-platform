import type {Language} from '~types'

type HubCopy = {
  title: string
  description: string
  intro: string
  play: string
  print: string
  all: string
  prev: string
  next: string
  playQuestion: string
}

// shortcut: "66" is written into each string because number agreement differs per language; the test fails if the pool size changes.
export const HUB_COPY: Record<Language, HubCopy> = {
  en: {
    title: '66 Conversation Starters',
    description:
      '66 deep conversation starters and icebreaker questions that move past small talk, for friends, family, dates and teams. Free to play online in 14 languages.',
    intro:
      'Honest, open-ended questions that move a conversation past small talk. Use them with friends, family, on a date, or as a check-in with your team. There are no right answers: ask one, then listen.',
    play: 'Play them online',
    print: 'Print a deck',
    all: 'All conversation starters',
    prev: 'Previous question',
    next: 'Next question',
    playQuestion: 'Play this question',
  },
  da: {
    title: '66 samtalestartere',
    description:
      '66 dybe samtalestartere og isbryderspørgsmål, der fører samtalen forbi small talk – for venner, familie, dates og teams. Spil gratis online på 14 sprog.',
    intro:
      'Ærlige, åbne spørgsmål, der fører samtalen forbi small talk. Brug dem med venner, familie, på en date eller som check-in med dit team. Der er ingen rigtige svar: stil ét, og lyt så.',
    play: 'Spil dem online',
    print: 'Print et kortsæt',
    all: 'Alle samtalestartere',
    prev: 'Forrige spørgsmål',
    next: 'Næste spørgsmål',
    playQuestion: 'Spil dette spørgsmål',
  },
  de: {
    title: '66 Gesprächsstarter',
    description:
      '66 tiefgehende Gesprächsstarter und Kennenlernfragen jenseits von Smalltalk – für Freunde, Familie, Dates und Teams. Kostenlos online spielen in 14 Sprachen.',
    intro:
      'Ehrliche, offene Fragen, die ein Gespräch über Smalltalk hinausführen. Für Freunde, Familie, ein Date oder als Check-in im Team. Es gibt keine richtigen Antworten: Stell eine Frage und hör dann zu.',
    play: 'Online spielen',
    print: 'Deck ausdrucken',
    all: 'Alle Gesprächsstarter',
    prev: 'Vorherige Frage',
    next: 'Nächste Frage',
    playQuestion: 'Diese Frage spielen',
  },
  es: {
    title: '66 preguntas para conversar',
    description:
      '66 preguntas profundas para conversar y romper el hielo, más allá de la charla trivial: para amigos, familia, citas y equipos. Juega gratis online en 14 idiomas.',
    intro:
      'Preguntas honestas y abiertas que llevan la conversación más allá de la charla trivial. Úsalas con amigos, en familia, en una cita o como check-in con tu equipo. No hay respuestas correctas: haz una pregunta y escucha.',
    play: 'Juega online',
    print: 'Imprime una baraja',
    all: 'Todas las preguntas para conversar',
    prev: 'Pregunta anterior',
    next: 'Pregunta siguiente',
    playQuestion: 'Juega esta pregunta',
  },
  fr: {
    title: '66 questions pour lancer la conversation',
    description:
      '66 questions profondes pour lancer la conversation et briser la glace, au-delà des banalités : entre amis, en famille, en rendez-vous ou en équipe. Jouez gratuitement en ligne en 14 langues.',
    intro:
      "Des questions sincères et ouvertes qui emmènent la conversation au-delà des banalités. À poser entre amis, en famille, lors d'un rendez-vous ou en check-in avec votre équipe. Il n'y a pas de bonne réponse : posez-en une, puis écoutez.",
    play: 'Jouer en ligne',
    print: 'Imprimer un jeu',
    all: 'Toutes les questions',
    prev: 'Question précédente',
    next: 'Question suivante',
    playQuestion: 'Jouer cette question',
  },
  he: {
    title: '66 שאלות לפתיחת שיחה',
    description:
      '66 שאלות עמוקות לפתיחת שיחה ולשבירת הקרח, מעבר לשיחות חולין: לחברים, למשפחה, לדייטים ולצוותים. שחקו בחינם באינטרנט ב-14 שפות.',
    intro:
      "שאלות כנות ופתוחות שלוקחות את השיחה מעבר לשיחות חולין. השתמשו בהן עם חברים, עם המשפחה, בדייט או כצ'ק-אין עם הצוות. אין תשובות נכונות: שאלו שאלה אחת, ואז הקשיבו.",
    play: 'שחקו באינטרנט',
    print: 'הדפיסו חפיסה',
    all: 'כל השאלות לפתיחת שיחה',
    prev: 'השאלה הקודמת',
    next: 'השאלה הבאה',
    playQuestion: 'שחקו בשאלה הזו',
  },
  hu: {
    title: '66 beszélgetésindító kérdés',
    description:
      '66 mély beszélgetésindító és jégtörő kérdés a small talkon túlra: barátoknak, családnak, randira és csapatoknak. Játssz ingyen online 14 nyelven.',
    intro:
      'Őszinte, nyitott kérdések, amelyek túlviszik a beszélgetést a small talkon. Használd őket barátokkal, a családdal, randin vagy csapat-check-inként. Nincsenek jó válaszok: tegyél fel egyet, aztán figyelj.',
    play: 'Játssz online',
    print: 'Nyomtass paklit',
    all: 'Összes beszélgetésindító kérdés',
    prev: 'Előző kérdés',
    next: 'Következő kérdés',
    playQuestion: 'Játszd ezt a kérdést',
  },
  pl: {
    title: '66 pytań na rozpoczęcie rozmowy',
    description:
      '66 głębokich pytań na rozpoczęcie rozmowy i przełamanie lodów, wykraczających poza small talk: dla przyjaciół, rodziny, na randki i dla zespołów. Graj za darmo online w 14 językach.',
    intro:
      'Szczere, otwarte pytania, które prowadzą rozmowę dalej niż small talk. Zadawaj je przyjaciołom, rodzinie, na randce albo na check-inie z zespołem. Nie ma dobrych odpowiedzi: zadaj jedno pytanie, a potem słuchaj.',
    play: 'Graj online',
    print: 'Wydrukuj talię',
    all: 'Wszystkie pytania',
    prev: 'Poprzednie pytanie',
    next: 'Następne pytanie',
    playQuestion: 'Zagraj tym pytaniem',
  },
  pt: {
    title: '66 perguntas para começar uma conversa',
    description:
      '66 perguntas profundas para começar uma conversa e quebrar o gelo, para lá da conversa de circunstância: para amigos, família, encontros e equipas. Joga grátis online em 14 idiomas.',
    intro:
      'Perguntas honestas e abertas que levam a conversa para lá da conversa de circunstância. Usa-as com amigos, com a família, num encontro ou como check-in com a tua equipa. Não há respostas certas: faz uma pergunta e depois ouve.',
    play: 'Joga online',
    print: 'Imprime um baralho',
    all: 'Todas as perguntas',
    prev: 'Pergunta anterior',
    next: 'Pergunta seguinte',
    playQuestion: 'Joga esta pergunta',
  },
  'pt-br': {
    title: '66 perguntas para puxar conversa',
    description:
      '66 perguntas profundas para puxar conversa e quebrar o gelo, indo além do papo furado: para amigos, família, encontros e equipes. Jogue grátis online em 14 idiomas.',
    intro:
      'Perguntas honestas e abertas que levam a conversa além do papo furado. Use com amigos, com a família, em um encontro ou como check-in com sua equipe. Não há respostas certas: faça uma pergunta e depois escute.',
    play: 'Jogue online',
    print: 'Imprima um baralho',
    all: 'Todas as perguntas',
    prev: 'Pergunta anterior',
    next: 'Próxima pergunta',
    playQuestion: 'Jogue esta pergunta',
  },
  ro: {
    title: '66 de întrebări pentru a începe o conversație',
    description:
      '66 de întrebări profunde pentru a începe o conversație și a sparge gheața, dincolo de discuțiile banale: pentru prieteni, familie, întâlniri și echipe. Joacă gratuit online în 14 limbi.',
    intro:
      'Întrebări sincere și deschise care duc conversația dincolo de discuțiile banale. Folosește-le cu prietenii, cu familia, la o întâlnire sau ca check-in cu echipa ta. Nu există răspunsuri corecte: pune o întrebare, apoi ascultă.',
    play: 'Joacă online',
    print: 'Printează un pachet',
    all: 'Toate întrebările',
    prev: 'Întrebarea anterioară',
    next: 'Întrebarea următoare',
    playQuestion: 'Joacă această întrebare',
  },
  sr: {
    title: '66 питања за започињање разговора',
    description:
      '66 дубоких питања за започињање разговора и пробијање леда, даље од празног ћаскања: за пријатеље, породицу, састанке и тимове. Играј бесплатно онлајн на 14 језика.',
    intro:
      'Искрена, отворена питања која воде разговор даље од празног ћаскања. Користи их с пријатељима, породицом, на састанку или као чек-ин с тимом. Нема тачних одговора: постави једно питање, па слушај.',
    play: 'Играј онлајн',
    print: 'Одштампај шпил',
    all: 'Сва питања',
    prev: 'Претходно питање',
    next: 'Следеће питање',
    playQuestion: 'Играј ово питање',
  },
  zh: {
    title: '66 個對話破冰問題',
    description:
      '66 個深入的對話破冰問題，帶你超越閒聊：適合朋友、家人、約會和團隊。免費線上遊玩，支援 14 種語言。',
    intro:
      '真誠、開放的問題，讓對話超越閒聊。適合和朋友、家人一起，在約會中，或作為團隊的開場分享。沒有標準答案：問一個問題，然後好好聆聽。',
    play: '線上遊玩',
    print: '列印一副卡牌',
    all: '所有對話問題',
    prev: '上一題',
    next: '下一題',
    playQuestion: '玩這個問題',
  },
  jp: {
    title: '会話のきっかけになる66の質問',
    description:
      '雑談の先へ進む、66の深い会話のきっかけとアイスブレイクの質問。友人、家族、デート、チームに。14言語で無料オンラインプレイ。',
    intro:
      '雑談の先へ会話を進める、正直でオープンな質問です。友人や家族と、デートで、またはチームのチェックインに使ってください。正解はありません。ひとつ質問して、あとは耳を傾けましょう。',
    play: 'オンラインでプレイ',
    print: 'デッキを印刷',
    all: 'すべての質問',
    prev: '前の質問',
    next: '次の質問',
    playQuestion: 'この質問をプレイ',
  },
}
