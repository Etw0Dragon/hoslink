import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

type Place = {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  token: string;
};

const defaultTiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const defaultAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const csrf = () => document.querySelector<HTMLInputElement>('input[name="csrf"]')?.value || "";

async function geocode(address: string, city: string): Promise<Place[]> {
  const response = await fetch("/api/maps/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ address, city, csrf: csrf() }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Recherche d’adresse impossible.");
  return result.places as Place[];
}

function addBaseLayer(map: L.Map, url: string, attribution = defaultAttribution) {
  L.tileLayer(url || defaultTiles, { maxZoom: 19, attribution }).addTo(map);
}

function pin(latitude: number, longitude: number) {
  return L.marker([latitude, longitude], {
    icon: L.divIcon({
      className: "hoslink-map-pin",
      html: '<span aria-hidden="true"></span>',
      iconSize: [22, 30],
      iconAnchor: [11, 29],
      popupAnchor: [0, -28],
    }),
  });
}

function popupContent(place: {
  name?: string;
  category?: string;
  city?: string;
  address?: string;
  url?: string;
}) {
  const box = document.createElement("div");
  if (place.name) {
    const title = document.createElement("strong");
    title.textContent = place.name;
    box.append(title, document.createElement("br"));
  }
  if (place.category) {
    const type = document.createElement("span");
    type.textContent = place.category;
    box.append(type, document.createElement("br"));
  }
  if (place.address) {
    const address = document.createElement("span");
    address.textContent = place.address;
    box.append(address, document.createElement("br"));
  }
  if (place.city) {
    const city = document.createElement("span");
    city.textContent = place.city;
    box.append(city, document.createElement("br"));
  }
  if (place.url) {
    const link = document.createElement("a");
    link.href = place.url;
    link.textContent = "Voir la fiche";
    box.append(link);
  }
  return box;
}

function resultButton(place: Place, onSelect: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary osm-place-choice";
  button.textContent = place.address;
  button.addEventListener("click", onSelect);
  return button;
}

document.querySelectorAll<HTMLElement>("[data-osm-geocode]").forEach((widget) => {
  const form = widget.closest<HTMLFormElement>("form"),
    addressInput = form?.querySelector<HTMLInputElement>("[data-address-field]"),
    cityInput = form?.querySelector<HTMLInputElement>("[data-city-field]"),
    tokenInput = form?.querySelector<HTMLInputElement>("[data-geocode-token]"),
    button = widget.querySelector<HTMLButtonElement>("[data-geocode-search]"),
    status = widget.querySelector<HTMLElement>("[data-geocode-status]"),
    results = widget.querySelector<HTMLElement>("[data-geocode-results]"),
    mapElement = widget.querySelector<HTMLElement>("[data-osm-preview]");
  let preview: L.Map | undefined,
    marker: L.Marker | undefined;

  const showPreview = (latitude: number, longitude: number) => {
    if (!mapElement) return;
    mapElement.dataset.lat = String(latitude);
    mapElement.dataset.lon = String(longitude);
    if (!preview) {
      preview = L.map(mapElement, { scrollWheelZoom: false }).setView([latitude, longitude], 16);
      addBaseLayer(preview, mapElement.dataset.mapTileUrl || defaultTiles, mapElement.dataset.mapAttribution || defaultAttribution);
    } else preview.setView([latitude, longitude], 16);
    marker?.remove();
    marker = pin(latitude, longitude).addTo(preview);
    window.setTimeout(() => preview?.invalidateSize(), 50);
  };

  addressInput?.addEventListener("input", () => {
    if (tokenInput) tokenInput.value = "";
  });
  cityInput?.addEventListener("input", () => {
    if (tokenInput) tokenInput.value = "";
  });
  button?.addEventListener("click", async () => {
    if (!addressInput || !cityInput || !results || !status) return;
    button.disabled = true;
    status.textContent = "Recherche de l’adresse…";
    results.replaceChildren();
    try {
      const places = await geocode(addressInput.value, cityInput.value);
      if (!places.length) {
        status.textContent = "Aucune adresse trouvée. Précisez le numéro, la rue et la commune, puis réessayez.";
        return;
      }
      status.textContent = "Choisissez l’adresse qui correspond à votre établissement.";
      for (const place of places) {
        results.append(resultButton(place, () => {
          addressInput.value = place.address;
          cityInput.value = place.city || cityInput.value;
          if (tokenInput) tokenInput.value = place.token;
          status.textContent = "Adresse vérifiée. Enregistrez le formulaire pour la conserver.";
          showPreview(place.latitude, place.longitude);
        }));
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Le service de recherche d’adresse est indisponible.";
    } finally {
      button.disabled = false;
    }
  });

  const rawLatitude = mapElement?.dataset.lat || "",
    rawLongitude = mapElement?.dataset.lon || "",
    latitude = Number(rawLatitude),
    longitude = Number(rawLongitude);
  if (mapElement && rawLatitude && rawLongitude && Number.isFinite(latitude) && Number.isFinite(longitude))
    showPreview(latitude, longitude);
});

document.querySelectorAll<HTMLElement>("[data-osm-map-search]").forEach((widget) => {
  const address = widget.querySelector<HTMLInputElement>("[data-map-location-address]"),
    city = widget.querySelector<HTMLInputElement>("[data-map-location-city]"),
    button = widget.querySelector<HTMLButtonElement>("[data-map-location-search]"),
    status = widget.querySelector<HTMLElement>("[data-map-location-status]"),
    results = widget.querySelector<HTMLElement>("[data-map-location-results]");
  button?.addEventListener("click", async () => {
    if (!address || !city || !results || !status) return;
    button.disabled = true;
    status.textContent = "Recherche de l’adresse…";
    results.replaceChildren();
    try {
      const places = await geocode(address.value, city.value);
      if (!places.length) {
        status.textContent = "Aucune adresse trouvée. Essayez avec une commune ou un code postal.";
        return;
      }
      status.textContent = "Choisissez un résultat pour centrer la carte.";
      for (const place of places) {
        results.append(resultButton(place, () => {
          status.textContent = place.address;
          document.dispatchEvent(new CustomEvent("hoslink:map-locate", { detail: place }));
        }));
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Le service de recherche d’adresse est indisponible.";
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll<HTMLElement>("[data-directory-map]").forEach((element) => {
  const markers = JSON.parse(element.dataset.mapMarkers || "[]") as Array<{
    id: number;
    name: string;
    category: string;
    city: string;
    address: string;
    latitude: number;
    longitude: number;
    url: string;
  }>;
  const map = L.map(element).setView([46.6, 2.4], 5);
  addBaseLayer(map, element.dataset.mapTileUrl || defaultTiles, element.dataset.mapAttribution || defaultAttribution);
  const lookupMarker = L.layerGroup().addTo(map);
  const markerById = new Map<number, L.Marker>();
  for (const place of markers) {
    const marker = pin(place.latitude, place.longitude).addTo(map);
    marker.bindPopup(popupContent(place));
    markerById.set(place.id, marker);
  }
  if (markers.length > 1) map.fitBounds(L.latLngBounds(markers.map((place) => [place.latitude, place.longitude])), { padding: [24, 24], maxZoom: 13 });
  else if (markers.length === 1) map.setView([markers[0].latitude, markers[0].longitude], 13);

  document.querySelectorAll<HTMLElement>("[data-directory-result]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("a,button")) return;
      const latitude = Number(card.dataset.latitude), longitude = Number(card.dataset.longitude);
      const headingLink = card.querySelector<HTMLAnchorElement>("h3 a");
      const id = Number(headingLink?.pathname.split("/").pop());
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      map.setView([latitude, longitude], 15);
      markerById.get(id)?.openPopup();
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.addEventListener("hoslink:map-locate", (event) => {
    const place = (event as CustomEvent<Place>).detail;
    map.setView([place.latitude, place.longitude], 15);
    lookupMarker.clearLayers();
    pin(place.latitude, place.longitude).addTo(lookupMarker).bindPopup(popupContent({ address: place.address, city: place.city })).openPopup();
  });

  document.querySelector<HTMLButtonElement>("[data-map-search-area]")?.addEventListener("click", () => {
    const form = document.querySelector<HTMLFormElement>("[data-directory-filters]"),
      boundsInput = form?.querySelector<HTMLInputElement>("[data-map-bounds]"),
      bounds = map.getBounds();
    if (!form || !boundsInput) return;
    boundsInput.value = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((value) => value.toFixed(6)).join(",");
    form.requestSubmit();
  });
  window.addEventListener("resize", () => map.invalidateSize());
});

document.querySelectorAll<HTMLElement>("[data-osm-single-map]").forEach((element) => {
  const latitude = Number(element.dataset.lat), longitude = Number(element.dataset.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const map = L.map(element, { scrollWheelZoom: false }).setView([latitude, longitude], 16);
  addBaseLayer(map, element.dataset.mapTileUrl || defaultTiles, element.dataset.mapAttribution || defaultAttribution);
  pin(latitude, longitude).addTo(map);
  window.setTimeout(() => map.invalidateSize(), 50);
});
