export const supportedPhoneCountries = [
  {
    iso2: "RU",
    name: "Россия",
    flag: "🇷🇺",
    callingCode: "7",
    placeholder: "+7 999 123-45-67"
  },
  {
    iso2: "BY",
    name: "Беларусь",
    flag: "🇧🇾",
    callingCode: "375",
    placeholder: "+375 29 123-45-67"
  },
  {
    iso2: "KZ",
    name: "Казахстан",
    flag: "🇰🇿",
    callingCode: "7",
    placeholder: "+7 701 123 45 67"
  },
  {
    iso2: "KG",
    name: "Кыргызстан",
    flag: "🇰🇬",
    callingCode: "996",
    placeholder: "+996 700 123 456"
  },
  {
    iso2: "AM",
    name: "Армения",
    flag: "🇦🇲",
    callingCode: "374",
    placeholder: "+374 77 123456"
  },
  {
    iso2: "AZ",
    name: "Азербайджан",
    flag: "🇦🇿",
    callingCode: "994",
    placeholder: "+994 50 123 45 67"
  },
  {
    iso2: "MD",
    name: "Молдова",
    flag: "🇲🇩",
    callingCode: "373",
    placeholder: "+373 69 123 456"
  },
  {
    iso2: "TJ",
    name: "Таджикистан",
    flag: "🇹🇯",
    callingCode: "992",
    placeholder: "+992 92 123 4567"
  },
  {
    iso2: "UZ",
    name: "Узбекистан",
    flag: "🇺🇿",
    callingCode: "998",
    placeholder: "+998 90 123 45 67"
  },
  {
    iso2: "TM",
    name: "Туркменистан",
    flag: "🇹🇲",
    callingCode: "993",
    placeholder: "+993 65 123456"
  },
  {
    iso2: "GE",
    name: "Грузия",
    flag: "🇬🇪",
    callingCode: "995",
    placeholder: "+995 555 12 34 56"
  }
] as const;

export type SupportedPhoneCountry = (typeof supportedPhoneCountries)[number];
export type PhoneCountryIso2 = SupportedPhoneCountry["iso2"];

const supportedPhoneCountryByIso2 = new Map<PhoneCountryIso2, SupportedPhoneCountry>(
  supportedPhoneCountries.map((country) => [country.iso2, country])
);

export function getSupportedPhoneCountry(iso2: PhoneCountryIso2): SupportedPhoneCountry {
  return supportedPhoneCountryByIso2.get(iso2) ?? supportedPhoneCountries[0];
}

export function isSupportedPhoneCountry(iso2: string | null | undefined): iso2 is PhoneCountryIso2 {
  return typeof iso2 === "string" && supportedPhoneCountryByIso2.has(iso2 as PhoneCountryIso2);
}

export function getSupportedPhoneCountryByCallingCode(
  callingCode: string,
  fallbackCountry: PhoneCountryIso2 = "RU"
): SupportedPhoneCountry | null {
  const matches = supportedPhoneCountries.filter((country) => country.callingCode === callingCode);

  if (matches.length === 0) {
    return null;
  }

  return matches.find((country) => country.iso2 === fallbackCountry) ?? matches[0] ?? null;
}
