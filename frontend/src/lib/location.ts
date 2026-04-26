export interface ReverseGeocodeResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
  };
}

export const reverseGeocodeLocation = async (latitude: number, longitude: number) => {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed with status ${response.status}`);
  }

  const data = await response.json() as ReverseGeocodeResponse;
  return data.address?.city
    || data.address?.town
    || data.address?.village
    || data.address?.municipality
    || data.address?.county
    || data.address?.state
    || null;
};
