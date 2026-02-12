const Provider = require ('../../models/ServiceProvider');
const axios = require('axios');


class geolocationService {
  constructor() {
    this.mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    this.mapboxBaseUrl = 'https://api.mapbox.com';
  }

  /**
   * Geocode address to coordinates using Mapbox Geocoding API
   * @param {String} address - Address to geocode
   * @returns {Object} { latitude, longitude, formattedAddress, placeName, context }
   */
  async geocodeAddress(address) {
    try {
      if (!this.mapboxToken) {
        throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
      }

      const encodedAddress = encodeURIComponent(address);
      const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${encodedAddress}.json`;

      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          limit: 1,
          // Bias results towards Nigeria (optional, adjust as needed)
          country: 'NG',
          types: 'address,place,locality,neighborhood'
        }
      });

      if (!response.data.features || response.data.features.length === 0) {
        throw new Error('Address not found');
      }

      const feature = response.data.features[0];
      const [longitude, latitude] = feature.center;

      // Extract additional context (city, state, etc.)
      const context = this.parseMapboxContext(feature.context);

      return {
        latitude,
        longitude,
        formattedAddress: feature.place_name,
        placeName: feature.text,
        placeType: feature.place_type[0],
        context: {
          city: context.place || context.locality,
          state: context.region,
          country: context.country,
          postcode: context.postcode
        },
        bbox: feature.bbox, // Bounding box
        relevance: feature.relevance
      };
    } catch (error) {
      console.error('Geocoding error:', error.message);
      throw new Error(`Failed to geocode address: ${error.message}`);
    }
  }

  /**
   * Reverse geocode coordinates to address
   * @param {Number} longitude
   * @param {Number} latitude
   * @returns {Object} Address information
   */
  async reverseGeocode(longitude, latitude) {
    try {
      if (!this.mapboxToken) {
        throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
      }

      const url = `${this.mapboxBaseUrl}/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;

      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          limit: 1,
          types: 'address,place'
        }
      });

      if (!response.data.features || response.data.features.length === 0) {
        throw new Error('Location not found');
      }

      const feature = response.data.features[0];
      const context = this.parseMapboxContext(feature.context);

      return {
        formattedAddress: feature.place_name,
        placeName: feature.text,
        context: {
          city: context.place || context.locality,
          state: context.region,
          country: context.country,
          postcode: context.postcode
        }
      };
    } catch (error) {
      console.error('Reverse geocoding error:', error.message);
      throw new Error(`Failed to reverse geocode: ${error.message}`);
    }
  }

  /**
   * Get distance and duration between two points using Mapbox Directions API
   * @param {Array} origin - [longitude, latitude]
   * @param {Array} destination - [longitude, latitude]
   * @param {String} profile - driving-traffic, driving, walking, cycling
   * @returns {Object} { distance, duration, geometry }
   */
  async getDirections(origin, destination, profile = 'driving') {
    try {
      if (!this.mapboxToken) {
        throw new Error('MAPBOX_ACCESS_TOKEN is not configured');
      }

      const coordinates = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
      const url = `${this.mapboxBaseUrl}/directions/v5/mapbox/${profile}/${coordinates}`;

      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          geometries: 'geojson',
          overview: 'full',
          steps: false
        }
      });

      if (!response.data.routes || response.data.routes.length === 0) {
        throw new Error('No route found');
      }

      const route = response.data.routes[0];

      return {
        distance: {
          value: (route.distance / 1000).toFixed(2), // Convert meters to km
          unit: 'km',
          meters: route.distance
        },
        duration: {
          value: Math.ceil(route.duration / 60), // Convert seconds to minutes
          unit: 'minutes',
          seconds: route.duration
        },
        geometry: route.geometry // GeoJSON LineString for route visualization
      };
    } catch (error) {
      console.error('Directions error:', error.message);
      // Fallback to straight-line distance if directions fail
      const straightLineDistance = this.calculateDistance(
        origin[1], origin[0],
        destination[1], destination[0]
      );
      
      return {
        distance: {
          value: straightLineDistance.toFixed(2),
          unit: 'km',
          meters: straightLineDistance * 1000
        },
        duration: {
          value: Math.ceil(straightLineDistance * 2), // Rough estimate: 2 min per km
          unit: 'minutes'
        },
        geometry: null,
        isEstimate: true
      };
    }
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

  /**
   * Calculate straight-line distance between two coordinates (Haversine formula)
   * @returns {Number} distance in kilometers
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Parse Mapbox context array into structured object
   * @private
   */
  parseMapboxContext(context) {
    if (!context) return {};

    const parsed = {};
    context.forEach(item => {
      const type = item.id.split('.')[0];
      parsed[type] = item.text;
    });

    return parsed;
  }

  /**
   * Validate coordinates
   */
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

module.exports = new geolocationService();