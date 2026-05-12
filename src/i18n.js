/**
 * UI strings (Danish). Change values here or swap `MESSAGES` for another language.
 * Use `t('section.key')` — dot paths walk nested objects.
 * Quiz question copy lives only in `questions.js`, not here.
 */

const MESSAGES = {
  common: {
    documentTitle: 'SpotQuiz',
    emDash: '—',
    missingName: '(mangler navn)',
    questionNoun: 'Spørgsmål',
    secondsUnit: ' sek.',
    firebaseConnect:
      'Tilslut Firebase (<code>VITE_FIREBASE_DATABASE_URL</code>) for at bruge denne side.',
    firebaseConnectShort:
      'Tilslut Firebase (<code>VITE_FIREBASE_DATABASE_URL</code>).',
  },
  errors: {
    firebaseUrlMissing:
      'Realtime Database-URL mangler. Tilføj VITE_FIREBASE_DATABASE_URL i din .env-fil.',
    displayNameEmpty: 'Visningsnavn må ikke være tomt.',
    noGameInProgress: 'Intet spil i gang.',
    alreadyLastQuestion: 'Du er allerede på sidste spørgsmål.',
    deletionFailed: 'Sletning mislykkedes.',
  },
  roles: {
    guest: 'Gæst',
    confirmand: 'Konfirmand',
  },
  guest: {
    joinTitle: 'Vær med i quizzen',
    joinLede: 'Vælg det navn, alle kan se.',
    joinPlaceholder: 'f.eks. Alex',
    confirmandJoinTitle: 'Konfirmand',
    confirmandJoinLede: 'Indtast det navn, arrangørerne kan se.',
    confirmandPlaceholder: 'Dit navn',
    displayNameLabel: 'Visningsnavn',
    joinSubmit: 'Tilmeld',
    joinError:
      'Kunne ikke tilmelde lige nu. Tjek forbindelsen og Firebase-konfigurationen, og prøv igen.',
    pageTitlePrefix: 'Du er med',
    playingAs: 'Spiller som',
    waitingPrimary: 'Venter på næste spørgsmål',
    questionClosed: 'Spørgsmålet er lukket',
    timeLeftPrefix: 'Tid tilbage:',
    timeUp: 'Tiden er udløbet',
    answerRegistered: 'Dit svar er registreret',
    myStatusTitle: 'Min status',
    myStatusSub: 'Indtil videre',
    statTotalPoints: 'Point i alt',
    statCorrect: 'Rigtige svar',
    statRank: 'Placering',
    statAvgTime: 'Snit svartid',
    answerAriaPrefix: 'Svar',
  },
  admin: {
    title: 'Admin',
    lede: 'Start runder, følg med og se hvem der er tilmeldt i realtid.',
    startQuestion: 'Start spørgsmål',
    closeQuestion: 'Luk spørgsmål',
    nextQuestion: 'Næste spørgsmål',
    resetGame: 'Nulstil spil',
    resetDialogTitle: 'Nulstil spil',
    resetDialogLede:
      'Dette sletter alle svar, resultater og point. Deltagere bevares.',
    resetTypeReset: 'Skriv <strong>RESET</strong> for at bekræfte',
    resetCancel: 'Annuller',
    resetConfirm: 'Nulstil spil',
    resetTypeError: 'Skriv RESET præcis (store bogstaver).',
    resetFailed: 'Kunne ikke nulstille spillet.',
    gameStatus: 'Spilstatus',
    noGameYet:
      'Intet aktivt spil endnu. Brug <strong>Start spørgsmål</strong>, når I er klar.',
    phase: 'Fase',
    questionIndex: 'Spørgsmålsindeks',
    question: 'Spørgsmål',
    started: 'Startet',
    closes: 'Lukker',
    answeredProgress: 'har svaret',
    confirmandPanelTitle: 'Konfirmand',
    registration: 'Tilmelding',
    noConfirmand: 'Ingen konfirmand tilmeldt endnu',
    registered: 'Tilmeldt',
    registeredAs: 'som',
    currentQuestion: 'Aktuelt spørgsmål',
    startQuestionToTrack: '— (start et spørgsmål for at følge svar)',
    hasAnswered: 'Har svaret',
    currentQuestionNa: '— (ingen konfirmand)',
    notAnsweredYet: 'Ikke svaret endnu',
    closedNoConfirmandWarning:
      'Advarsel: Spørgsmålet er lukket, men konfirmanden har ikke svaret. Point er ikke beregnet for dette spørgsmål.',
    noParticipants: 'Ingen deltagere endnu.',
    connectFirebaseAdmin:
      'Tilslut Firebase (<code>VITE_FIREBASE_DATABASE_URL</code>) for at administrere deltagere.',
    displayNameAria: 'Visningsnavn',
    save: 'Gem',
    cancel: 'Annuller',
    edit: 'Rediger',
    couldNotStart: 'Kunne ikke starte spørgsmålet.',
    couldNotClose: 'Kunne ikke lukke spørgsmålet.',
    couldNotNext: 'Kunne ikke gå til næste spørgsmål.',
    couldNotSaveName: 'Kunne ikke gemme visningsnavn.',
  },
  screen: {
    headline: 'Skærm',
    waitingGameState: 'Venter på spilstatus …',
    answered: 'har svaret',
    correctAnswer: 'Rigtigt svar',
    applyingScores: 'Beregner point …',
    noConfirmandScores:
      'Konfirmanden har ikke svaret på dette spørgsmål — point er ikke opdateret.',
    scoreboard: 'Stilling',
    noGuests: 'Ingen gæster tilmeldt endnu.',
    colPlayer: 'Spiller',
    colRound: 'Runde',
    colAvgAnswer: 'Gennemsnitlig svartid',
    colTotal: 'I alt',
    waitingNextQuestion: 'Venter på næste spørgsmål',
  },
  devTools: {
    title: 'Udviklerværktøjer',
    disabled: 'Udviklerværktøjer er slået fra',
    allDeleted: 'Alle testdata er slettet',
    warningIntro:
      '<strong>Kun til test.</strong> Dette fjerner live data under:',
    warningOutro: 'i din Realtime Database. Der er ingen fortrydelse.',
    deleteAll: 'Slet alle testdata',
    confirmDelete:
      'Slette ALT under game, participants, answers, results, scores og debug?',
  },
  resetUser: {
    title: 'Nulstil denne bruger',
    success: 'Denne bruger er nulstillet',
    backHome: 'Tilbage til quiz-forsiden',
    lede:
      'Dette rydder kun gemte data i <strong>denne browser på denne enhed</strong> (dit bruger-id, visningsnavn og mellemlagret rolle). Intet slettes på serveren, og andre påvirkes ikke.',
    submit: 'Nulstil denne bruger',
  },
  gamePhase: {
    waiting: 'Venter',
    question_open: 'Spørgsmål åben',
    question_closed: 'Spørgsmål lukket',
  },
}

/** @param {string} path Dot-separated path, e.g. `'guest.joinTitle'` */
export function t(path) {
  const parts = path.split('.')
  let cur = MESSAGES
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) {
      console.warn('[i18n] Missing string:', path)
      return path
    }
    cur = cur[p]
  }
  if (typeof cur === 'string') return cur
  console.warn('[i18n] Not a string:', path)
  return path
}
