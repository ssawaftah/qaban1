function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
}

export function matchesMixerSearch(mixer: { vehicleNumber: string; driverName: string }, search: string): boolean {
  const query = normalizeDigits(search.trim()).toLocaleLowerCase();
  if (!query) return true;
  const vehicle = normalizeDigits(mixer.vehicleNumber).toLocaleLowerCase();
  // One or two digits identify the end of a plate, not digits in its prefix.
  if (/^\d{1,2}$/.test(query)) return vehicle.replace(/\D/g, '').endsWith(query);
  return vehicle.includes(query) || mixer.driverName.toLocaleLowerCase().includes(query);
}
