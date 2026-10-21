// All UI strings live here so the language can be switched in one place. The UI is Norwegian.

export const locale = "nb-NO";
export const htmlLang = "nb";

export const t = {
  appName: "Familieplanlegger",
  appDescription: "Kalendere, ukeplaner, lekser og stjerner for familien.",
  nav: {
    today: "Meg",
    family: "Familien",
    members: "Medlemmer",
    signOut: "Logg ut",
  },
  login: {
    title: "Familieplanlegger",
    intro: "Logg inn med Google-kontoen din.",
    button: "Logg inn med Google",
    failed: "Innloggingen feilet. Prøv igjen.",
  },
  notInvited: {
    title: "Ikke invitert",
    body: (email: string | null) =>
      email
        ? `Kontoen ${email} har ikke tilgang. Be en forelder legge deg til under Medlemmer.`
        : "Denne Google-kontoen har ikke tilgang. Be en forelder legge deg til under Medlemmer.",
    tryAgain: "Logg inn med en annen konto",
  },
  home: {
    greeting: (name: string) => `Hei, ${name}!`,
    week: (week: number) => `Uke ${week}`,
    today: "I dag",
    thisWeek: "Denne uken",
    noCalendar: "Du har ingen kalender koblet til ennå. En forelder kan legge den til under Medlemmer.",
  },
  family: {
    title: "Familien",
    showWho: "Vis",
  },
  calendar: {
    untitled: "(uten tittel)",
    allDay: "Hele dagen",
    empty: "Ingenting i kalenderen.",
    failed: (names: string) => `Klarte ikke å hente kalenderen til ${names}.`,
    previousWeek: "Forrige uke",
    nextWeek: "Neste uke",
    thisWeek: "Denne uken",
  },
  members: {
    title: "Medlemmer",
    add: "Legg til medlem",
    edit: "Endre",
    save: "Lagre",
    delete: "Fjern",
    confirmDelete: (name: string) => `Fjerne ${name}? Personen mister tilgangen til appen.`,
    you: "deg",
    saved: "Lagret.",
    roles: { parent: "Forelder", child: "Barn" },
    locales: { "nb-NO": "Norsk", "da-DK": "Dansk" },
    fields: {
      name: "Navn",
      email: "Google-e-post",
      role: "Rolle",
      calendarId: "Kalender-ID",
      calendarIdHelp: "Vanligvis Gmail-adressen. Kalenderen må deles med tjenestekontoen.",
      colour: "Farge",
      locale: "Språk for tale",
    },
    errors: {
      name: "Skriv inn et navn (maks 60 tegn).",
      email: "Skriv inn en gyldig e-postadresse.",
      role: "Velg en rolle.",
      calendarId: "Kalender-ID-en er for lang.",
      colour: "Velg en farge.",
      locale: "Velg et språk.",
      duplicate: "Det finnes allerede et medlem med denne e-postadressen.",
      notAllowed: "Du har ikke lov til å gjøre dette.",
      failed: "Noe gikk galt. Prøv igjen.",
    },
  },
} as const;
