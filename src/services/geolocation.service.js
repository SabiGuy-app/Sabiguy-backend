const Provider = require('../../models/ServiceProvider');
const axios = require('axios');

class GeolocationService {
  constructor() {
    this.googleKey = process.env.GOOGLE_MAPS_API_KEY;
    this.googleBaseUrl = 'https://maps.googleapis.com/maps/api';
  }

  /* ─────────────────────────────────────────────────────────────
     Geocode address → coordinates
  ───────────────────────────────────────────────────────────── */
  async geocodeAddress(address) {
    try {
      if (!this.googleKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured');

      const response = await axios.get(`${this.googleBaseUrl}/geocode/json`, {
        params: {
          address,
          key: this.googleKey,
          region: 'ng',        // bias towards Nigeria
          language: 'en',
        },
      });

      if (
        response.data.status !== 'OK' ||
        !response.data.results?.length
      ) {
        throw new Error(`Geocoding failed: ${response.data.status}`);
      }

      const result = response.data.results[0];
      const { lat: latitude, lng: longitude } = result.geometry.location;
      const context = this.parseGoogleComponents(result.address_components);

      return {
        latitude,
        longitude,
        formattedAddress: result.formatted_address,
        placeName: context.route || context.neighborhood || context.sublocality,
        placeType: result.types?.[0],
        context: {
          streetNumber: context.street_number,
          street: context.route,
          neighborhood: context.neighborhood || context.sublocality_level_1,
          city: context.locality || context.administrative_area_level_2,
          state: context.administrative_area_level_1,
          country: context.country,
          postcode: context.postal_code,
        },
        placeId: result.place_id,
        locationType: result.geometry.location_type, // ROOFTOP = most accurate
      };
    } catch (error) {
      console.error('Geocoding error:', error.message);
      throw new Error(`Failed to geocode address: ${error.message}`);
    }
  }


  async reverseGeocode(longitude, latitude) {
  try {
    if (!this.googleKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured');

    // Call both APIs in parallel
    const [googleResult, nominatimResult] = await Promise.allSettled([
      this.reverseGeocodeGoogle(longitude, latitude),
      this.reverseGeocodeNominatim(latitude, longitude),
    ]);

    const google = googleResult.status === 'fulfilled' ? googleResult.value : null;
    const nominatim = nominatimResult.status === 'fulfilled' ? nominatimResult.value : null;

    // Merge: Google for street detail, Nominatim for neighborhood/area
    const merged = this.mergeAddresses(google, nominatim);

    console.log('🗺️ Google:', google?.formattedAddress);
    console.log('🌍 Nominatim:', nominatim?.formattedAddress);
    console.log('✅ Merged:', merged.formattedAddress);

    return merged;
  } catch (error) {
    console.error('Reverse geocoding error:', error.message);
    throw new Error(`Failed to reverse geocode: ${error.message}`);
  }
}

/* ─────────────────────────────────────────────────────────────
   Google reverse geocode
───────────────────────────────────────────────────────────── */
async reverseGeocodeGoogle(longitude, latitude) {
  const response = await axios.get(`${this.googleBaseUrl}/geocode/json`, {
    params: {
      latlng: `${latitude},${longitude}`,
      key: this.googleKey,
      language: 'en',
      result_type: 'street_address|premise|subpremise|route',
    },
  });

  if (response.data.status !== 'OK' || !response.data.results?.length) {
    throw new Error(`Google geocoding failed: ${response.data.status}`);
  }

  const result = response.data.results[0];
  const components = this.parseGoogleComponents(result.address_components);

  return {
    formattedAddress: result.formatted_address,
    components: {
      streetNumber: components.street_number || null,
      street: components.route || null,
      neighborhood: components.neighborhood || components.sublocality_level_1 || null,
      city: components.locality || components.administrative_area_level_2 || null,
      state: components.administrative_area_level_1 || null,
      country: components.country || null,
    },
  };
}

/* ─────────────────────────────────────────────────────────────
   Nominatim reverse geocode
───────────────────────────────────────────────────────────── */
async reverseGeocodeNominatim(latitude, longitude) {
  const response = await axios.get(
    `https://nominatim.openstreetmap.org/reverse`,
    {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
        addressdetails: 1,
      },
      headers: {
        'User-Agent': 'SabiguyApp/1.0',
        'Accept-Language': 'en',
      },
    }
  );

  if (!response.data || !response.data.address) {
    throw new Error('Nominatim returned no results');
  }

  const addr = response.data.address;

  return {
    formattedAddress: response.data.display_name,
    components: {
      streetNumber: addr.house_number || null,
      street: addr.road || null,
      neighborhood: addr.neighbourhood || addr.suburb || addr.quarter || null,
      area: addr.village || addr.town || null,
      city: addr.city || addr.town || addr.village || null,
      state: addr.state || null,
      country: addr.country || null,
    },
  };
}

/* ─────────────────────────────────────────────────────────────
   Merge Google + Nominatim into one detailed address
───────────────────────────────────────────────────────────── */
mergeAddresses(google, nominatim) {
  // If only one succeeded, return what we have
  if (!google && !nominatim) {
    throw new Error('Both geocoding services failed');
  }
  if (!google) return { formattedAddress: nominatim.formattedAddress, ...nominatim };
  if (!nominatim) return { formattedAddress: google.formattedAddress, ...google };

  const g = google.components;
  const n = nominatim.components;

  const parts = [];

  // Street number — prefer Google (more reliable)
  const streetNumber = g.streetNumber || n.streetNumber;
  if (streetNumber) parts.push(streetNumber);

  // Street name — prefer Google
  const street = g.street || n.street;
  if (street) parts.push(street);

  // Neighborhood/estate — prefer Nominatim (more granular for Nigeria)
  const neighborhood = n.neighborhood || g.neighborhood;
  if (neighborhood && neighborhood !== street) parts.push(neighborhood);

  // Sub-area — Nominatim only (e.g. Akobo, Alegongo)
  const area = n.area;
  if (area && area !== neighborhood && area !== street) parts.push(area);

  // City — prefer Google
  const city = g.city || n.city;
  if (city) parts.push(city);

  // State — prefer Google
  const state = g.state || n.state;
  if (state) parts.push(state);

  // Country — prefer Google
  const country = g.country || n.country;
  if (country) parts.push(country);

  const formattedAddress = parts.length >= 3
    ? parts.join(', ')
    : google.formattedAddress; // fallback to Google's full string

  return {
    formattedAddress,
    components: {
      streetNumber,
      street,
      neighborhood,
      area,
      city,
      state,
      country,
    },
  };
}

  /* ─────────────────────────────────────────────────────────────
     Get directions between two points
  ───────────────────────────────────────────────────────────── */
  async getDirections(origin, destination, profile = 'driving') {
    try {
      if (!this.googleKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured');

      // Google profile mapping
      const modeMap = {
        driving: 'driving',
        walking: 'walking',
        cycling: 'bicycling',
        transit: 'transit',
      };

      const response = await axios.get(`${this.googleBaseUrl}/directions/json`, {
        params: {
          origin: `${origin[1]},${origin[0]}`,           // lat,lng
          destination: `${destination[1]},${destination[0]}`,
          mode: modeMap[profile] || 'driving',
          key: this.googleKey,
          language: 'en',
          region: 'ng',
          departure_time: 'now',                          // accounts for live traffic
        },
      });

      if (
        response.data.status !== 'OK' ||
        !response.data.routes?.length
      ) {
        throw new Error(`Directions failed: ${response.data.status}`);
      }

      const leg = response.data.routes[0].legs[0];

      return {
        distance: {
          value: parseFloat((leg.distance.value / 1000).toFixed(2)), // meters → km
          unit: 'km',
          meters: leg.distance.value,
          text: leg.distance.text,
        },
        duration: {
          value: Math.ceil(leg.duration_in_traffic?.value / 60 || leg.duration.value / 60), // traffic-aware
          unit: 'minutes',
          seconds: leg.duration_in_traffic?.value || leg.duration.value,
          text: leg.duration_in_traffic?.text || leg.duration.text,
        },
        startAddress: leg.start_address,
        endAddress: leg.end_address,
      };
    } catch (error) {
      console.error('Directions error:', error.message);

      // Fallback: Haversine straight-line estimate
      const straightLineDistance = this.calculateDistance(
        origin[1], origin[0],
        destination[1], destination[0],
      );

      return {
        distance: {
          value: parseFloat(straightLineDistance.toFixed(2)),
          unit: 'km',
          meters: straightLineDistance * 1000,
        },
        duration: {
          value: Math.ceil(straightLineDistance * 2),
          unit: 'minutes',
        },
        isEstimate: true,
      };
    }
  }

  /* ─────────────────────────────────────────────────────────────
     Build a detailed address from parsed components
     Fills in the gaps when formatted_address is too vague
  ───────────────────────────────────────────────────────────── */
  buildDetailedAddress(context, fallback) {
    const parts = [];

    // Street-level detail first
    if (context.street_number) parts.push(context.street_number);
    if (context.route) parts.push(context.route);

    // Neighborhood / estate
    if (context.sublocality_level_1 && context.sublocality_level_1 !== context.route) {
      parts.push(context.sublocality_level_1);
    }
    if (context.neighborhood && context.neighborhood !== context.sublocality_level_1) {
      parts.push(context.neighborhood);
    }

    // City + state
    if (context.locality) parts.push(context.locality);
    if (context.administrative_area_level_1) parts.push(context.administrative_area_level_1);
    if (context.country) parts.push(context.country);

    // If we couldn't build anything meaningful, use Google's formatted_address
    return parts.length >= 3 ? parts.join(', ') : fallback;
  }

  /* ─────────────────────────────────────────────────────────────
     Parse Google address_components into a flat object
  ───────────────────────────────────────────────────────────── */
  parseGoogleComponents(components) {
    if (!components) return {};

    const parsed = {};
    components.forEach((component) => {
      component.types.forEach((type) => {
        parsed[type] = component.long_name;
      });
    });

    return parsed;
  }

   /**
   * Find nearby available providers
   * @param {Object} params
   * @param {Number} params.latitude
   * @param {Number} params.longitude
   * @param {String} params.serviceType
   * @param {Number} params.maxDistance - in meters (default 10km)
   */
  async findNearbyProviders({ latitude, longitude, serviceType, maxDistance = 10000 }) {
    try {
      const providers = await Provider.find({
        'currentLocation.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: maxDistance
          }
        },
        'availability.isAvailable': true,
        'services.category': serviceType,
        'isAvailable': true // Only online providers
      })
      .select('userId services currentLocation rating startingPrice completedJobs isAvailable')
      .populate('userId', 'fullName avatar phoneNumber')
      .limit(20);

      // Calculate distance for each provider
      const providersWithDistance = providers.map(provider => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          provider.currentLocation.coordinates[1],
          provider.currentLocation.coordinates[0]
        );

        return {
          providerId: provider._id,
          userId: provider.userId._id,
          name: `${provider.userId.firstName} ${provider.userId.lastName}`,
          avatar: provider.userId.avatar,
          phoneNumber: provider.userId.phoneNumber,
          services: provider.services,
          location: {
            type: 'Point',
            coordinates: provider.currentLocation.coordinates
          },
          distance: parseFloat(distance.toFixed(2)), // in km
          rating: provider.rating?.average || 0,
          reviewCount: provider.rating?.count || 0,
          startingPrice: provider.startingPrice,
          completedJobs: provider.completedJobs || 0,
          isAvailable: true,
          isOnline: provider.isOnline
        };
      });

      // Sort by rating and distance
      providersWithDistance.sort((a, b) => {
        // Prioritize rating, then distance
        if (b.rating !== a.rating) {
          return b.rating - a.rating;
        }
        return a.distance - b.distance;
      });

      return providersWithDistance;
    } catch (error) {
      console.error('Find nearby providers error:', error);
      throw new Error(`Error finding nearby providers: ${error.message}`);
    }
  }

  /* ─────────────────────────────────────────────────────────────
     Haversine distance (kept for fallback + provider ETA calc)
  ───────────────────────────────────────────────────────────── */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  isValidCoordinates(longitude, latitude) {
    return (
      typeof longitude === 'number' &&
      typeof latitude === 'number' &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90
    );
  }
}

module.exports = new GeolocationService();