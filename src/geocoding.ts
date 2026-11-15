import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const resultSchema = z.array(z.object({
  display_name: z.string().min(1).max(500),
  lat: z.string(),
  lon: z.string(),
  address: z.record(z.string(), z.string()).optional(),
}));

export type GeocodedPlace = {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  token: string;
};

type CachedPlace = Omit<GeocodedPlace, "token">;

type TokenPayload = {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  expiresAt: number;
};

function signedToken(payload: TokenPayload, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGeocodedPlace(
  token: string,
  address: string,
  city: string,
  secret: string,
  now = Date.now(),
): Omit<TokenPayload, "expiresAt"> | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
    if (
      payload.expiresAt < now ||
      payload.address !== address ||
      payload.city !== city ||
      !Number.isFinite(payload.latitude) ||
      payload.latitude < -90 ||
      payload.latitude > 90 ||
      !Number.isFinite(payload.longitude) ||
      payload.longitude < -180 ||
      payload.longitude > 180
    ) return null;
    return {
      address: payload.address,
      city: payload.city,
      latitude: payload.latitude,
      longitude: payload.longitude,
    };
  } catch {
    return null;
  }
}

export function createGeocoder(
  endpoint: string,
  secret: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const cache = new Map<string, { at: number; places: CachedPlace[] }>();
  let requestQueue = Promise.resolve();
  let lastRequestAt = 0;

  async function fetchRateLimited(url: URL) {
    const request = requestQueue.then(async () => {
      const delay = Math.max(0, 1000 - (now() - lastRequestAt));
      if (delay) await wait(delay);
      lastRequestAt = now();
      const response = await fetcher(url, {
        headers: {
          "User-Agent": "Hoslink/1.0 (+https://hoslink.tmfolio.site)",
          "Accept-Language": "fr",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
      return resultSchema.parse(await response.json());
    });
    requestQueue = request.then(() => undefined, () => undefined);
    return request;
  }

  return {
    async search(address: string, city: string): Promise<GeocodedPlace[]> {
      const query = [address.trim(), city.trim(), "France"].filter(Boolean).join(", ");
      const key = query.toLocaleLowerCase("fr-FR");
      const cached = cache.get(key);
      if (cached && now() - cached.at < 24 * 60 * 60 * 1000) {
        return cached.places.map((place) => ({
          ...place,
          token: signedToken({ ...place, expiresAt: now() + 15 * 60 * 1000 }, secret),
        }));
      }
      const url = new URL(endpoint);
      url.search = new URLSearchParams({
        q: query,
        format: "jsonv2",
        addressdetails: "1",
        countrycodes: "fr",
        limit: "5",
      }).toString();
      const rows = await fetchRateLimited(url);
      const places = rows.flatMap((row): CachedPlace[] => {
        const latitude = Number(row.lat), longitude = Number(row.lon);
        if (
          !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        ) return [];
        const placeCity = row.address?.city || row.address?.town || row.address?.village || row.address?.municipality || city.trim();
        return [{
          address: row.display_name,
          city: placeCity,
          latitude,
          longitude,
        }];
      });
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: now(), places });
      return places.map((place) => ({
        ...place,
        token: signedToken({ ...place, expiresAt: now() + 15 * 60 * 1000 }, secret),
      }));
    },
  };
}
