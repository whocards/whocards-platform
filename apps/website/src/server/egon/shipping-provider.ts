const providerMap = {
  // USA and Canada: Prefer DHL
  US: 66, // DHL Express Zone 4
  CA: 66, // DHL Express Zone 4

  // European countries: Prefer DPD, then GLS, then others
  SK: 2, // DPD Slovakia
  PL: 20, // DPD Poland
  AT: 104, // DPD Austria
  FR: 248, // DPD France
  DE: 294, // DPD Germany
  IT: 250, // DPD Italy
  LU: 226, // DPD Luxembourg
  BE: 42, // GLS Belgium v.2
  NL: 37, // GLS Netherlands v.2
  IE: 31, // GLS Ireland
  PT: 36, // GLS Portugal
  ES: 40, // GLS Spain
  DK: 27, // GLS Denmark
  SE: 28, // GLS Sweden
  FI: 55, // GLS Finland
  LT: 49, // GLS Lithuania
  LV: 50, // GLS Latvia
  EE: 51, // GLS Estonia
  HU: 57, // GLS Hungary
  BG: 15, // Speedy Bulgaria
  RO: 23, // FAN Courier
  SI: 86, // GLS Slovenia
  HR: 88, // GLS Croatia
  CZ: 8, // PPL (DHL) CZ
  GR: 53, // GLS Greece
  CY: 38, // GLS Cyprus
  MT: 52, // GLS Malta
  NO: 208, // Postnord Sweden v.2

  // Other cases
  GB: 200, // DHL Express Zone 3
  SG: 64, // DHL Express Zone 5
  AU: 64, // DHL Express Zone 5
}

const defaultProvider = 2 // DPD

export const getShippingProvider = (countryCode: string) => {
  return providerMap[countryCode as keyof typeof providerMap] || defaultProvider
}
