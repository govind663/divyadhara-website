import { useEffect } from "react";
import L, { type LatLngBoundsExpression } from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { PanditServiceArea } from "../../data/types/pandit";

type ServiceAreaMapProps = {
  serviceAreas: PanditServiceArea[];
  title?: string;
};

function isValidCoordinate(area: PanditServiceArea): boolean {
  return (
    Number.isFinite(area.lat) &&
    Number.isFinite(area.lng) &&
    area.lat >= -90 &&
    area.lat <= 90 &&
    area.lng >= -180 &&
    area.lng <= 180
  );
}

function createNumberedMarkerIcon(number: number): L.DivIcon {
  return L.divIcon({
    className: "divyadhara-service-area-marker",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:2px solid #9a3412;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f59e0b;color:#431407;font-weight:800;font-size:13px;box-shadow:0 2px 8px rgba(154,52,18,.38)"><span style="transform:rotate(45deg)">${number}</span></div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -34],
  });
}

function FitMapToServiceAreas({
  serviceAreas,
}: {
  serviceAreas: PanditServiceArea[];
}) {
  const map = useMap();

  useEffect(() => {
    if (serviceAreas.length === 0) return;

    if (serviceAreas.length === 1) {
      const area = serviceAreas[0];
      map.setView([area.lat, area.lng], 11);
      return;
    }

    const bounds: LatLngBoundsExpression = serviceAreas.map(
      (area) => [area.lat, area.lng] as [number, number],
    );
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 11 });
  }, [map, serviceAreas]);

  return null;
}

export default function ServiceAreaMap({
  serviceAreas,
  title = "Service Areas on Map",
}: ServiceAreaMapProps) {
  const validServiceAreas = serviceAreas.filter(isValidCoordinate);

  if (serviceAreas.length === 0) {
    return (
      <section aria-label={title} className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">
          Service areas have not been added yet. Please enquire to confirm coverage.
        </p>
      </section>
    );
  }

  if (validServiceAreas.length === 0) {
    return (
      <section aria-label={title} className="rounded-2xl border p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">
          Service-area names are available, but valid map coordinates have not been added yet.
        </p>
        <ul className="mt-3 list-disc pl-5 text-sm text-gray-600">
          {serviceAreas.map((area) => (
            <li key={area.id}>{area.name}</li>
          ))}
        </ul>
      </section>
    );
  }

  const firstArea = validServiceAreas[0];
  const initialCenter: [number, number] = [firstArea.lat, firstArea.lng];

  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-600">
          Saffron markers show listed locations; dotted saffron circles are approximate visual coverage guides (2.5 km around each marker), not verified service boundaries.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border" style={{ height: 360 }}>
        <MapContainer
          center={initialCenter}
          zoom={validServiceAreas.length === 1 ? 11 : 7}
          scrollWheelZoom={false}
          className="h-full w-full"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitMapToServiceAreas serviceAreas={validServiceAreas} />

          {validServiceAreas.map((area) => (
            <Circle
              key={`coverage-${area.id}`}
              center={[area.lat, area.lng]}
              radius={2500}
              pathOptions={{
                color: "#f59e0b",
                weight: 3,
                opacity: 0.95,
                fillColor: "#fbbf24",
                fillOpacity: 0.13,
                dashArray: "3 8",
                lineCap: "round",
              }}
            />
          ))}

          {validServiceAreas.map((area) => {
            const originalIndex = serviceAreas.findIndex((item) => item.id === area.id);
            const position: [number, number] = [area.lat, area.lng];

            return (
              <Marker
                key={area.id}
                position={position}
                title={area.name}
                icon={createNumberedMarkerIcon(originalIndex + 1)}
              >
                <Popup>
                  <div className="max-w-56 text-sm">
                    <strong>{area.name}</strong>
                    <p>{area.address}</p>
                    <p>Confirm exact coverage and availability before booking.</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2">
        {serviceAreas.map((area, index) => (
          <li
            key={area.id}
            className="flex items-start gap-3 rounded-xl border p-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-900">
              {index + 1}
            </span>
            <div>
              <p className="font-medium">{area.name}</p>
              <p className="text-sm text-gray-600">{area.address}</p>
              {!isValidCoordinate(area) && (
                <p className="mt-1 text-xs text-amber-800">
                  Map coordinates are not available for this area yet.
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs leading-5 text-gray-500">
        Map data © OpenStreetMap contributors. Confirm service availability with the Pandit before booking.
      </p>
    </section>
  );
}
