// const Provider = require ('../../models/ServiceProvider');
// const axios = require('axios');


// class geolocationService {
//   constructor() {
//     this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
//     this.mapboxBaseUrl = 'https://api.mapbox.com';
//   }

//   /**
//    * Geocode address to coordinates using Mapbox Geocoding API
//    * @param {String} address - Address to geocode
//    * @returns {Object} { latitude, longitude, formattedAddress, placeName, context }
//    */
//   async geocodeAddress(address) {
//     try {
//       if (!this.mapboxToken) {
//         throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
//       }

//       const encodedAddress = encodeURIComponent(address);
//       const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${encodedAddress}.json`;

//       const response = await axios.get(url, {
//         params: {
//           access_token: this.mapboxToken,
//           limit: 1,
//           // Bias results towards Nigeria (optional, adjust as needed)
//           country: 'NG',
//           types: 'address,place,locality,neighborhood'
//         }
//       });

//       if (!response.data.features || response.data.features.length === 0) {
//         throw new Error('Address not found');
//       }

//       const feature = response.data.features[0];
//       const [longitude, latitude] = feature.center;

//       // Extract additional context (city, state, etc.)
//       const context = this.parseMapboxContext(feature.context);

//       return {
//         latitude,
//         longitude,
//         formattedAddress: feature.place_name,
//         placeName: feature.text,
//         placeType: feature.place_type[0],
//         context: {
//           city: context.place || context.locality,
//           state: context.region,
//           country: context.country,
//           postcode: context.postcode
//         },
//         bbox: feature.bbox, // Bounding box
//         relevance: feature.relevance
//       };
//     } catch (error) {
//       console.error('Geocoding error:', error.message);
//       throw new Error(`Failed to geocode address: ${error.message}`);
//     }
//   }

//   /**
//    * Reverse geocode coordinates to address
//    * @param {Number} longitude
//    * @param {Number} latitude
//    * @returns {Object} Address information
//    */
//   // async reverseGeocode(longitude, latitude) {
//   //   try {
//   //     if (!this.mapboxToken) {
//   //       throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
//   //     }

//   //     const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;

//   //     const response = await axios.get(url, {
//   //       params: {
//   //         access_token: this.mapboxToken,
//   //         limit: 1,
//   //         types: 'address,place'
//   //       }
//   //     });

//   //     if (!response.data.features || response.data.features.length === 0) {
//   //       throw new Error('Location not found');
//   //     }

//   //     const feature = response.data.features[0];
//   //     const context = this.parseMapboxContext(feature.context);

//   //     return {
//   //       formattedAddress: feature.place_name,
//   //       placeName: feature.text,
//   //       context: {
//   //         city: context.place || context.locality,
//   //         state: context.region,
//   //         country: context.country,
//   //         postcode: context.postcode
//   //       }
//   //     };
//   //   } catch (error) {
//   //     console.error('Reverse geocoding error:', error.message);
//   //     throw new Error(`Failed to reverse geocode: ${error.message}`);
//   //   }
//   // }

//   async reverseGeocode(longitude, latitude) {
//   try {
//     if (!this.mapboxToken) {
//       throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
//     }

//     const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;

//     const response = await axios.get(url, {
//       params: {
//         access_token: this.mapboxToken,
//         limit: 1,
//         // Changed: strict address type only, no broad 'place' fallback
//         types: 'address',
//         language: 'en',
//         country: 'NG',
//       },
//     });

//     // If no street-level result, fall back to neighborhood then place
//     const features = response.data.features;
//     if (!features || features.length === 0) {
//       const fallback = await axios.get(url.replace(`${longitude},${latitude}`, `${longitude},${latitude}`), {
//         params: {
//           access_token: this.mapboxToken,
//           limit: 1,
//           types: 'neighborhood,locality,place',
//           language: 'en',
//           country: 'NG',
//         },
//       });

//       if (!fallback.data.features?.length) {
//         throw new Error('Location not found');
//       }

//       const feature = fallback.data.features[0];
//       const context = this.parseMapboxContext(feature.context);

//       return {
//         formattedAddress: feature.place_name,
//         placeName: feature.text,
//         context: {
//           city: context.place || context.locality,
//           state: context.region,
//           country: context.country,
//           postcode: context.postcode,
//         },
//       };
//     }

//     const feature = features[0];
//     const context = this.parseMapboxContext(feature.context);

//     return {
//       formattedAddress: feature.place_name,
//       placeName: feature.text,
//       context: {
//         city: context.place || context.locality,
//         state: context.region,
//         country: context.country,
//         postcode: context.postcode,
//       },
//     };
//   } catch (error) {
//     console.error('Reverse geocoding error:', error.message);
//     throw new Error(`Failed to reverse geocode: ${error.message}`);
//   }
// }

//   /**
//    * Get distance and duration between two points using Mapbox Directions API
//    * @param {Array} origin - [longitude, latitude]
//    * @param {Array} destination - [longitude, latitude]
//    * @param {String} profile - driving-traffic, driving, walking, cycling
//    * @returns {Object} { distance, duration, geometry }
//    */
//   async getDirections(origin, destination, profile = 'driving') {
//     try {
//       if (!this.mapboxToken) {
//         throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
//       }

//       const coordinates = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
//       const url = `${this.mapboxBaseUrl}/directions/v5/mapbox/${profile}/${coordinates}`;

//       const response = await axios.get(url, {
//         params: {
//           access_token: this.mapboxToken,
//           geometries: 'geojson',
//           overview: 'full',
//           steps: false
//         }
//       });

//       if (!response.data.routes || response.data.routes.length === 0) {
//         throw new Error('No route found');
//       }

//       const route = response.data.routes[0];

//       return {
//         distance: {
//           value: (route.distance / 1000).toFixed(2), // Convert meters to km
//           unit: 'km',
//           meters: route.distance
//         },
//         duration: {
//           value: Math.ceil(route.duration / 60), // Convert seconds to minutes
//           unit: 'minutes',
//           seconds: route.duration
//         },
//         geometry: route.geometry // GeoJSON LineString for route visualization
//       };
//     } catch (error) {
//       console.error('Directions error:', error.message);
//       // Fallback to straight-line distance if directions fail
//       const straightLineDistance = this.calculateDistance(
//         origin[1], origin[0],
//         destination[1], destination[0]
//       );
      
//       return {
//         distance: {
//           value: straightLineDistance.toFixed(2),
//           unit: 'km',
//           meters: straightLineDistance * 1000
//         },
//         duration: {
//           value: Math.ceil(straightLineDistance * 2), // Rough estimate: 2 min per km
//           unit: 'minutes'
//         },
//         geometry: null,
//         isEstimate: true
//       };
//     }
//   }

//   /**
//    * Find nearby available providers
//    * @param {Object} params
//    * @param {Number} params.latitude
//    * @param {Number} params.longitude
//    * @param {String} params.serviceType
//    * @param {Number} params.maxDistance - in meters (default 10km)
//    */
//   async findNearbyProviders({ latitude, longitude, serviceType, maxDistance = 10000 }) {
//     try {
//       const providers = await Provider.find({
//         'currentLocation.coordinates': {
//           $near: {
//             $geometry: {
//               type: 'Point',
//               coordinates: [longitude, latitude]
//             },
//             $maxDistance: maxDistance
//           }
//         },
//         'availability.isAvailable': true,
//         'services.category': serviceType,
//         'isAvailable': true // Only online providers
//       })
//       .select('userId services currentLocation rating startingPrice completedJobs isAvailable')
//       .populate('userId', 'fullName avatar phoneNumber')
//       .limit(20);

//       // Calculate distance for each provider
//       const providersWithDistance = providers.map(provider => {
//         const distance = this.calculateDistance(
//           latitude,
//           longitude,
//           provider.currentLocation.coordinates[1],
//           provider.currentLocation.coordinates[0]
//         );

//         return {
//           providerId: provider._id,
//           userId: provider.userId._id,
//           name: `${provider.userId.firstName} ${provider.userId.lastName}`,
//           avatar: provider.userId.avatar,
//           phoneNumber: provider.userId.phoneNumber,
//           services: provider.services,
//           location: {
//             type: 'Point',
//             coordinates: provider.currentLocation.coordinates
//           },
//           distance: parseFloat(distance.toFixed(2)), // in km
//           rating: provider.rating?.average || 0,
//           reviewCount: provider.rating?.count || 0,
//           startingPrice: provider.startingPrice,
//           completedJobs: provider.completedJobs || 0,
//           isAvailable: true,
//           isOnline: provider.isOnline
//         };
//       });

//       // Sort by rating and distance
//       providersWithDistance.sort((a, b) => {
//         // Prioritize rating, then distance
//         if (b.rating !== a.rating) {
//           return b.rating - a.rating;
//         }
//         return a.distance - b.distance;
//       });

//       return providersWithDistance;
//     } catch (error) {
//       console.error('Find nearby providers error:', error);
//       throw new Error(`Error finding nearby providers: ${error.message}`);
//     }
//   }

//   /**
//    * Calculate straight-line distance between two coordinates (Haversine formula)
//    * @returns {Number} distance in kilometers
//    */
//   calculateDistance(lat1, lon1, lat2, lon2) {
//     const R = 6371; // Radius of Earth in kilometers
//     const dLat = this.toRad(lat2 - lat1);
//     const dLon = this.toRad(lon2 - lon1);
    
//     const a = 
//       Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//       Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
//       Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     const distance = R * c;
    
//     return distance;
//   }

//   toRad(degrees) {
//     return degrees * (Math.PI / 180);
//   }

//   /**
//    * Parse Mapbox context array into structured object
//    * @private
//    */
//   parseMapboxContext(context) {
//     if (!context) return {};

//     const parsed = {};
//     context.forEach(item => {
//       const type = item.id.split('.')[0];
//       parsed[type] = item.text;
//     });

//     return parsed;
//   }

//   /**
//    * Validate coordinates
//    */
//   isValidCoordinates(longitude, latitude) {
//     return (
//       typeof longitude === 'number' &&
//       typeof latitude === 'number' &&
//       longitude >= -180 &&
//       longitude <= 180 &&
//       latitude >= -90 &&
//       latitude <= 90
//     );
//   }
// }

// module.exports = new geolocationService();

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

  /* ─────────────────────────────────────────────────────────────
     Reverse geocode coordinates → address
     Uses Places API nearby search first for street-level accuracy,
     falls back to Geocoding API
  ───────────────────────────────────────────────────────────── */
  async reverseGeocode(longitude, latitude) {
    try {
      if (!this.googleKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured');

      // 1️⃣ Try Geocoding API with result_type for maximum granularity
      const response = await axios.get(`${this.googleBaseUrl}/geocode/json`, {
        params: {
          latlng: `${latitude},${longitude}`,
          key: this.googleKey,
          language: 'en',
          result_type: 'street_address|premise|subpremise|route|neighborhood',
        },
      });

      if (response.data.status !== 'OK' || !response.data.results?.length) {
        throw new Error(`Reverse geocoding failed: ${response.data.status}`);
      }

      // Google returns multiple results from most to least specific
      // Pick the most granular one (first result)
      const result = response.data.results[0];
      const context = this.parseGoogleComponents(result.address_components);

      // Build a detailed address string if formatted_address is vague
      const detailedAddress = this.buildDetailedAddress(context, result.formatted_address);

      return {
        formattedAddress: detailedAddress,
        placeName: context.route || context.neighborhood,
        placeId: result.place_id,
        locationType: result.geometry.location_type,
        context: {
          streetNumber: context.street_number,
          street: context.route,
          neighborhood: context.neighborhood || context.sublocality_level_1,
          city: context.locality || context.administrative_area_level_2,
          state: context.administrative_area_level_1,
          country: context.country,
          postcode: context.postal_code,
        },
      };
    } catch (error) {
      console.error('Reverse geocoding error:', error.message);
      throw new Error(`Failed to reverse geocode: ${error.message}`);
    }
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