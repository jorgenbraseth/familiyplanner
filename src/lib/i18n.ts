// All UI strings live here so the language can be switched in one place.
// The UI language (Norwegian, Danish or both) is still open; Norwegian for now.

export const locale = "nb-NO";
export const htmlLang = "nb";

export const t = {
  appName: "Familieplanlegger",
  appDescription: "Kalendere, ukeplaner, lekser og stjerner for familien.",
  home: {
    title: "Familieplanlegger",
    comingSoon: "Snart kommer kalendere, ukeplaner, lekser og stjerner her.",
    week: (week: number) => `Uke ${week}`,
  },
} as const;
