import { z } from 'zod';
import { route, requireUser, json, badRequest } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { logger } from '@/lib/server/logger';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

interface Store {
  name: string;
  brand?: string;
  address?: string;
  distanceMi: number;
  mapsUrl: string;
  priceTier: 1 | 2 | 3;
  priceLabel: '$' | '$$' | '$$$';
}

// Affordability heuristic by chain reputation (NOT live prices). 1 = budget.
const BUDGET = /aldi|walmart|winco|food 4 less|foodmaxx|grocery outlet|save.?a.?lot|lidl|smart & final|costco|sam's club|superior|cardenas|el super|food.?4.?less|market basket|price ?rite|99 ranch|dollar/i;
const PREMIUM = /whole foods|erewhon|gelson|bristol farms|eataly|central market|mollie stone|the fresh market|new seasons|metropolitan market|pavilions|balducci|citarella|dean & deluca/i;

function classifyTier(name: string, brand?: string): { priceTier: 1 | 2 | 3; priceLabel: '$' | '$$' | '$$$' } {
  const s = `${name} ${brand ?? ''}`;
  if (BUDGET.test(s)) return { priceTier: 1, priceLabel: '$' };
  if (PREMIUM.test(s)) return { priceTier: 3, priceLabel: '$$$' };
  return { priceTier: 2, priceLabel: '$$' }; // mainstream / unknown
}

/** Fetch with a hard timeout so a slow upstream never hangs the request. */
async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * GET /api/stores?zip=90210 — find grocery stores near a US zip code.
 * Keyless: Zippopotam (zip→coords) + OpenStreetMap Overpass (nearby shops).
 * Degrades gracefully: always returns the location + a Maps link even if the
 * live store lookup is slow/unavailable.
 */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit(`stores:${u.id}`, 40, 3600, 'Too many lookups — try again later.');

  const zip = z.string().regex(/^\d{5}$/, 'Enter a 5-digit US ZIP code').parse(req.nextUrl.searchParams.get('zip') ?? '');

  // 1) Geocode the zip.
  let geo: { lat: number; lon: number; city: string; state: string };
  try {
    const res = await fetchWithTimeout(`https://api.zippopotam.us/us/${zip}`, 6000);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { places?: Array<{ latitude: string; longitude: string; 'place name': string; 'state abbreviation': string }> };
    const place = data.places?.[0];
    if (!place) throw new Error('no place');
    geo = { lat: parseFloat(place.latitude), lon: parseFloat(place.longitude), city: place['place name'], state: place['state abbreviation'] };
  } catch {
    throw badRequest("Couldn't find that ZIP code. Double-check it's a valid US ZIP.");
  }

  const mapsUrl = `https://www.google.com/maps/search/grocery+store/@${geo.lat},${geo.lon},13z`;

  // 2) Find nearby grocery stores (best-effort).
  let stores: Store[] = [];
  try {
    const q = `[out:json][timeout:15];(node["shop"~"supermarket|grocery|greengrocer"](around:6000,${geo.lat},${geo.lon});way["shop"~"supermarket|grocery"](around:6000,${geo.lat},${geo.lon}););out center 30;`;
    const res = await fetchWithTimeout('https://overpass-api.de/api/interpreter', 18000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TastyEmber/1.0 (store locator)' },
      body: 'data=' + encodeURIComponent(q),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        elements?: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
      };
      stores = (data.elements ?? [])
        .map((e) => {
          const lat = e.lat ?? e.center?.lat;
          const lon = e.lon ?? e.center?.lon;
          const t = e.tags ?? {};
          if (!lat || !lon || !t.name) return null;
          const address = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || undefined;
          return {
            name: t.name,
            brand: t.brand,
            address,
            distanceMi: Math.round(milesBetween(geo.lat, geo.lon, lat, lon) * 10) / 10,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.name + ' ' + (address ?? zip))}`,
            ...classifyTier(t.name, t.brand),
          } as Store;
        })
        .filter((s): s is Store => s !== null)
        .sort((a, b) => a.distanceMi - b.distanceMi)
        .slice(0, 12);
    }
  } catch (err) {
    logger.warn({ err: String(err), zip }, 'Overpass store lookup failed');
  }

  return json({ location: { zip, city: geo.city, state: geo.state }, stores, mapsUrl });
});
