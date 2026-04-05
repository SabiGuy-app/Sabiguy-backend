// class PricingService {
//   constructor() {
//     // Base pricing configuration (customize as needed)
//     this.pricingRates = {
//       // Transport/Logistics rates per km
//       transport: {
//         baseRate: 500, // Base fee (NGN)
//         perKmRate: 100, // Per kilometer rate
//         minimumCharge: 1000, // Minimum charge
//       },
//       logistics: {
//         baseRate: 800,
//         perKmRate: 150,
//         minimumCharge: 1500,
//       },
//       delivery: {
//         baseRate: 400,
//         perKmRate: 80,
//         minimumCharge: 800,
//       },
//       courier: {
//         baseRate: 350,
//         perKmRate: 75,
//         minimumCharge: 700,
//       },
//       moving: {
//         baseRate: 2000,
//         perKmRate: 200,
//         minimumCharge: 5000,
//       },
//       taxi: {
//         baseRate: 500,
//         perKmRate: 120,
//         minimumCharge: 1000,
//       },
//       ride: {
//         baseRate: 400,
//         perKmRate: 100,
//         minimumCharge: 800,
//       },
//     };
//   }

//   calculateTransportPrice(distance, subCategory, serviceType = null) {
//     // Determine which rate category to use
//     const category = this.getTransportCategory(subCategory, serviceType);
//     const rates = this.pricingRates[category] || this.pricingRates.transport;

//     // Calculate price: base rate + (distance * per km rate)
//     let price = rates.baseRate + distance * rates.perKmRate;

//     // Apply minimum charge
//     if (price < rates.minimumCharge) {
//       price = rates.minimumCharge;
//     }

//     // Round to nearest 50 (optional, for cleaner pricing)
//     price = Math.ceil(price / 50) * 50;

//     return price;
//   }

//   getTransportCategory(subCategory, serviceType = null) {
//     const normalizedSubCategory = subCategory
//       ? String(subCategory).toLowerCase().trim()
//       : "";
//     const normalizedServiceType = serviceType
//       ? String(serviceType).toLowerCase().trim()
//       : "";

//     const explicitSubCategoryMap = {
//       "package delivery": "logistics",
//       "book a ride": "transport",
//     };

//     if (
//       normalizedSubCategory &&
//       explicitSubCategoryMap[normalizedSubCategory]
//     ) {
//       return explicitSubCategoryMap[normalizedSubCategory];
//     }

//     const combined = `${normalizedSubCategory} ${normalizedServiceType}`.trim();
//     if (!combined) return "transport";

//     for (const [key, value] of Object.entries(this.pricingRates)) {
//       if (combined.includes(key)) {
//         return key;
//       }
//     }

//     return "transport"; // Default
//   }

//   // Calculate platform service fee (e.g., 10%)
//   calculateServiceFee(amount, percentage = 10) {
//     return Math.round((amount * percentage) / 100);
//   }

//   // Calculate provider commission fee (e.g., 15% of agreed price)
//   calculateProviderCommission(agreedPrice, percentage = 15) {
//     return Math.round((agreedPrice * percentage) / 100);
//   }

//   // Calculate full pricing breakdown
//   calculatePricingBreakdown(
//     agreedPrice,
//     userFeePercentage = 10,
//     providerCommissionPercentage = 15,
//   ) {
//     const userFee = this.calculateServiceFee(agreedPrice, userFeePercentage);
//     const commission = this.calculateProviderCommission(
//       agreedPrice,
//       providerCommissionPercentage,
//     );

//     return {
//       agreedPrice,
//       userPays: agreedPrice + userFee,
//       providerReceives: agreedPrice - commission,
//       platformEarns: userFee + commission,
//     };
//   }

//   // Calculate total with service fee
//   calculateTotalAmount(agreedPrice, serviceFeePercentage = 10) {
//     const serviceFee = this.calculateServiceFee(
//       agreedPrice,
//       serviceFeePercentage,
//     );
//     return agreedPrice + serviceFee;
//   }
// }

// module.exports = new PricingService();

class PricingService {
  constructor() {
    // ── Ops-configurable values ───────────────────────────────────────────────
    this.config = {
      fuelPricePerLitre: 1500,
      marketAdjustment: 1500,
      platformFeePercent: 5,
      driverCommissionPercent: 15,

      efficiency: {
        pre2000: 12,
        post2000: 18,
        bike: 35,
      },

      baseFare: {
        pre2000: 1000,
        post2000: 1500,
        bike: 400,
      },
    };
  }

  // ── Resolve vehicle category ───────────────────────────────────────────────
  getVehicleCategory(vehicleProductionYear, isBike = false) {
    if (isBike) return "bike";
    const year = parseInt(vehicleProductionYear, 10);
    if (!year || isNaN(year)) return "post2000";
    return year <= 2000 ? "pre2000" : "post2000";
  }

  // ── Core: replaces calculateTransportPrice(distance, subCategory, serviceType) ──
  calculateTransportPrice(distance, subCategory, serviceType = null, durationMinutes = null, vehicleProductionYear = null, isBike = false) {
    const { fuelPricePerLitre, marketAdjustment, efficiency, baseFare } = this.config;

    const category = this.getVehicleCategory(vehicleProductionYear, isBike);

    // Base Fare (BF)
    const BF = baseFare[category];

    // Per-Km Rate (PK) = fuelPrice ÷ efficiency
    const perKmRate = fuelPricePerLitre / efficiency[category];

    // Total Distance Cost = BF + (PK × distance)
    const distanceCost = BF + perKmRate * distance;

    // Per-Minute Rate (PM) = distanceCost ÷ durationMinutes
    const perMinuteRate = durationMinutes > 0 ? distanceCost / durationMinutes : 0;

    // Time Cost = PM × duration
    const timeCost = perMinuteRate * (durationMinutes ?? 0);

    // Market Adjustment (MA)
    const MA = marketAdjustment;

    // Subtotal fare before fees
    const subtotalFare = distanceCost + timeCost + MA;

    // Platform / Insurance Fee
    const platformFee = this.roundToNearest50(
      (subtotalFare * this.config.platformFeePercent) / 100
    );
    const driverCommission = this.roundToNearest50(
      (subtotalFare * this.config.driverCommissionPercent) / 100
    );

    // Final amounts
    const riderPays = this.roundToNearest50(subtotalFare + platformFee);
    const driverReceives = this.roundToNearest50(subtotalFare - driverCommission);
    const platformEarns = this.roundToNearest50(platformFee + driverCommission);

    return {
      // Top-level key your booking code uses
      calculatedPrice: riderPays,

      breakdown: {
        baseFare: BF,
        distanceCost: this.roundToNearest50(perKmRate * distance),
        timeCost: this.roundToNearest50(timeCost),
        marketAdjustment: MA,
        subtotal: this.roundToNearest50(subtotalFare),
        platformFee,
      },

      driverReceives,
      platformEarns,

      meta: {
        vehicleCategory: category,
        distanceKm: distance,
        durationMinutes,
        ratesUsed: {
          perKmRate: parseFloat(perKmRate.toFixed(2)),
          perMinuteRate: parseFloat(perMinuteRate.toFixed(2)),
          baseFare: BF,
          marketAdjustment: MA,
          fuelPricePerLitre,
          efficiencyKmPerLitre: efficiency[category],
        },
      },
    };
  }

  // ── Kept exactly as you had them ───────────────────────────────────────────
  getTransportCategory(subCategory, serviceType = null) {
    const normalizedSubCategory = subCategory
      ? String(subCategory).toLowerCase().trim()
      : "";
    const normalizedServiceType = serviceType
      ? String(serviceType).toLowerCase().trim()
      : "";

    const explicitSubCategoryMap = {
      "package delivery": "logistics",
      "book a ride": "transport",
    };

    if (normalizedSubCategory && explicitSubCategoryMap[normalizedSubCategory]) {
      return explicitSubCategoryMap[normalizedSubCategory];
    }

    const combined = `${normalizedSubCategory} ${normalizedServiceType}`.trim();
    if (!combined) return "transport";

    for (const [key] of Object.entries(this.config.baseFare)) {
      if (combined.includes(key)) return key;
    }

    return "transport";
  }

  calculateServiceFee(amount, percentage = 10) {
    return Math.round((amount * percentage) / 100);
  }

  calculateProviderCommission(agreedPrice, percentage = 15) {
    return Math.round((agreedPrice * percentage) / 100);
  }

  calculatePricingBreakdown(agreedPrice, userFeePercentage = 10, providerCommissionPercentage = 15) {
    const userFee = this.calculateServiceFee(agreedPrice, userFeePercentage);
    const commission = this.calculateProviderCommission(agreedPrice, providerCommissionPercentage);

    return {
      agreedPrice,
      userPays: agreedPrice + userFee,
      providerReceives: agreedPrice - commission,
      platformEarns: userFee + commission,
    };
  }

  calculateTotalAmount(agreedPrice, serviceFeePercentage = 10) {
    const serviceFee = this.calculateServiceFee(agreedPrice, serviceFeePercentage);
    return agreedPrice + serviceFee;
  }

  roundToNearest50(amount) {
    return Math.ceil(amount / 50) * 50;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = new PricingService();