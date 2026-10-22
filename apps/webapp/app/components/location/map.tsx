/**
 * Location map
 *
 * Renders a small pigeon-maps map with a marker for a location. Tiles come
 * from MapTiler when `MAPTILER_TOKEN` holds a real key; when it is empty or
 * set to `disabled` (self-hosted installs without a MapTiler account), the map
 * uses pigeon-maps' built-in OpenStreetMap provider, which needs no key and
 * shows the OpenStreetMap attribution that its tile usage policy requires.
 *
 * @see {@link file://./../../routes/_layout+/locations.$locationId.tsx}
 */
import { Map, Marker } from "pigeon-maps";
// @ts-ignore - Using direct CJS import to fix production build ESM issue
import { maptiler } from "pigeon-maps/lib/providers.cjs.js";
import { ClientOnly } from "remix-utils/client-only";
import { MAPTILER_TOKEN } from "~/utils/env";

/** Placeholder values that mean "no MapTiler key configured". */
const NO_MAPTILER_TOKEN = ["", "disabled"];

/**
 * MapTiler tile provider, or `undefined` so pigeon-maps falls back to its
 * default OpenStreetMap tiles.
 */
const mapProvider = NO_MAPTILER_TOKEN.includes(
  (MAPTILER_TOKEN ?? "").trim().toLowerCase()
)
  ? undefined
  : maptiler(MAPTILER_TOKEN, "streets");

/**
 * Map centred on a location, with a marker at its coordinates.
 *
 * @param props.latitude - Latitude of the location
 * @param props.longitude - Longitude of the location
 */
export const ShelfMap = ({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) => (
  <ClientOnly>
    {() => (
      <div
        style={{
          width: "100%",
          height: "240px",
          borderTopLeftRadius: "6px",
          borderTopRightRadius: "6px",
          overflow: "hidden",
        }}
      >
        <Map
          height={240}
          center={[latitude, longitude]}
          zoom={15}
          provider={mapProvider}
        >
          <Marker anchor={[latitude, longitude]} width={30}>
            <img
              src="/static/images/map-marker.png"
              width={30}
              alt="Map marker"
            />
          </Marker>
        </Map>
      </div>
    )}
  </ClientOnly>
);
