// class PricingService {
//   constructor() {
//     // ── Ops-configurable values ───────────────────────────────────────────────
//     this.config = {
//       fuelPricePerLitre: 1200,
//       platformFeePercent: 5,
//       driverCommissionPercent: 15,

//       efficiency: {
//         pre2000: 10,
//         post2000: 14,
//         bike: 35,
//       },

//       baseFare: {
//         pre2000: 600,
//         post2000: 900,
//         bike: 250,
//       },

//       marketAdjustment: {
//         pre2000: 1000,
//         post2000: 1500,
//         bike: 400,
//       },
//     };
//   }

//   // ── Resolve vehicle category ───────────────────────────────────────────────
//   getVehicleCategory(vehicleProductionYear, isBike = false) {
//     if (isBike) return "bike";
//     const year = parseInt(vehicleProductionYear, 10);
//     if (!year || isNaN(year)) return "post2000";
//     return year <= 2000 ? "pre2000" : "post2000";
//   }

//   // ── Core: replaces calculateTransportPrice(distance, subCategory, serviceType) ──
//   calculateTransportPrice(
//     distance,
//     subCategory,
//     serviceType = null,
//     durationMinutes = null,
//     vehicleProductionYear = null,
//     isBike = false,
//   ) {
//     const { fuelPricePerLitre, marketAdjustment, efficiency, baseFare } =
//       this.config;

//     const category = this.getVehicleCategory(vehicleProductionYear, isBike);

//     // Base Fare (BF)
//     const BF = baseFare[category];

//     // Per-Km Rate (PK) = fuelPrice ÷ efficiency
//     const perKmRate = fuelPricePerLitre / efficiency[category];

//     // Total Distance Cost = BF + (PK × distance)
//     const distanceCost = BF + perKmRate * distance;

//     // Per-Minute Rate (PM) = distanceCost ÷ durationMinutes
//     const perMinuteRate =
//       durationMinutes > 0 ? distanceCost / durationMinutes : 0;

//     // Time Cost = PM × duration
//     const timeCost = perMinuteRate * (durationMinutes ?? 0);

//     // Market Adjustment (MA) - varies by vehicle type
//     const MA = marketAdjustment[category];

//     // Subtotal fare before fees
//     const subtotalFare = distanceCost + timeCost + MA;

//     // Platform / Insurance Fee
//     const platformFee = this.roundToNearest50(
//       (subtotalFare * this.config.platformFeePercent) / 100,
//     );
//     const driverCommission = this.roundToNearest50(
//       (subtotalFare * this.config.driverCommissionPercent) / 100,
//     );

//     // Final amounts
//     const riderPays = this.roundToNearest50(subtotalFare + platformFee);
//     const driverReceives = this.roundToNearest50(
//       subtotalFare - driverCommission,
//     );
//     const platformEarns = this.roundToNearest50(platformFee + driverCommission);

//     return {
//       // Top-level key your booking code uses
//       calculatedPrice: riderPays,

//       breakdown: {
//         baseFare: BF,
//         distanceCost: this.roundToNearest50(perKmRate * distance),
//         timeCost: this.roundToNearest50(timeCost),
//         marketAdjustment: MA,
//         subtotal: this.roundToNearest50(subtotalFare),
//         platformFee,
//       },

//       driverReceives,
//       platformEarns,

//       meta: {
//         vehicleCategory: category,
//         distanceKm: distance,
//         durationMinutes,
//         ratesUsed: {
//           perKmRate: parseFloat(perKmRate.toFixed(2)),
//           perMinuteRate: parseFloat(perMinuteRate.toFixed(2)),
//           baseFare: BF,
//           marketAdjustment: MA,
//           fuelPricePerLitre,
//           efficiencyKmPerLitre: efficiency[category],
//         },
//       },
//     };
//   }

//   // ── Kept exactly as you had them ───────────────────────────────────────────
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

//     for (const [key] of Object.entries(this.config.baseFare)) {
//       if (combined.includes(key)) return key;
//     }

//     return "transport";
//   }

//   calculateServiceFee(amount, percentage = 10) {
//     return Math.round((amount * percentage) / 100);
//   }

//   calculateProviderCommission(agreedPrice, percentage = 15) {
//     return Math.round((agreedPrice * percentage) / 100);
//   }

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

//   calculateTotalAmount(agreedPrice, serviceFeePercentage = 10) {
//     const serviceFee = this.calculateServiceFee(
//       agreedPrice,
//       serviceFeePercentage,
//     );
//     return agreedPrice + serviceFee;
//   }

//   roundToNearest50(amount) {
//     return Math.ceil(amount / 50) * 50;
//   }

//   updateConfig(newConfig) {
//     this.config = { ...this.config, ...newConfig };
//   }
// }

// module.exports = new PricingService();

/**
 * PricingService
 *
 * Columns in the pricing sheet (rows 14-25):
 *   Col A = Bike      Col B = Pre-2000 car    Col C = Post-2000 car
 *
 * Row  Field                 Source
 *  14  Base Fare             Hardcoded in system
 *  15  Fuel Price            Set by Operations
 *  16  Vehicle Efficiency    Set by Operations  (km/litre)
 *  17  PK Rate               Fuel Price ÷ Vehicle Efficiency
 *  18  Per-Min Rate          Set by Operations  (fixed, not derived from distance)
 *  19  Market Adjustment     Set by Operations
 *  20  Avg Distance          From map API weight
 *  21  Avg Duration          From map API weight
 *  22  Rider Platform Fee    Set by Operations  (% applied to subtotal)
 *  23  Driver Platform Fee   Set by Operations  (% applied to subtotal)
 *  24  Tax Rate              Set by Government  (VAT, applied to rider-pays amount)
 *  25  Surge Multiplier      Dynamic            (Rider pays × surge)
 *
 * Fare formula (per sheet):
 *   distanceCost  = BF + (PK × distance)
 *   timeCost      = PM × durationMinutes
 *   subtotal      = distanceCost + timeCost + MA
 *   platformFee   = roundToNearest50(subtotal × riderPlatformFeePercent)
 *   riderPays     = roundToNearest50((subtotal + platformFee) × surgeMultiplier)
 *   tax           = roundToNearest50(riderPays × taxRate)
 *   riderPaysFinal= riderPays + tax
 *   driverCommission = roundToNearest50(subtotal × driverPlatformFeePercent)
 *   driverReceives   = roundToNearest50(subtotal - driverCommission)
 *   platformEarns    = platformFee + driverCommission  (before tax remittance)
 */

class PricingService {
  constructor() {
    // ── Ops-configurable & government-set values ───────────────────────────
    this.config = {
      // Row 15
      fuelPricePerLitre: 1200,

      // Row 16 – km per litre
      efficiency: {
        bike: 35,
        pre2000: 10,
        post2000: 14,
      },

      // Row 14 – hardcoded base fares (₦)
      baseFare: {
        bike: 250,
        pre2000: 600,
        post2000: 900,
      },

      perMinuteRate: {
        bike: 15,
        pre2000: 25,
        post2000: 30,
      },

      marketAdjustment: {
        bike: 400,
        pre2000: 1000,
        post2000: 1500,
      },

      riderPlatformFeePercent: 5,

      driverPlatformFeePercent: 15,

      taxRate: 7.5,

      defaultSurgeMultiplier: 1.0,
    };
  }

  // ── Resolve vehicle category ─────────────────────────────────────────────
  /**
   * @param {number|string|null} vehicleProductionYear
   * @param {boolean}            isBike
   * @returns {'bike'|'pre2000'|'post2000'}
   */
  getVehicleCategory(vehicleProductionYear, isBike = false) {
    if (isBike) return "bike";
    const year = parseInt(vehicleProductionYear, 10);
    if (!year || isNaN(year)) return "post2000";
    return year <= 2000 ? "pre2000" : "post2000";
  }

  // ── Core pricing calculator ──────────────────────────────────────────────
  /**
   * @param {number}      distance              - kilometres (from map API)
   * @param {string}      subCategory           - booking sub-category string
   * @param {string|null} serviceType           - optional service type
   * @param {number|null} durationMinutes       - trip duration in minutes (from map API)
   * @param {number|null} vehicleProductionYear - year car was manufactured
   * @param {boolean}     isBike                - true if the vehicle is a motorcycle
   * @param {number}      surgeMultiplier       - dynamic surge (default 1.0 = no surge)
   * @returns {object}
   */
  calculateTransportPrice(
    distance,
    subCategory,
    serviceType = null,
    durationMinutes = null,
    vehicleProductionYear = null,
    isBike = false,
    surgeMultiplier = this.config.defaultSurgeMultiplier,
  ) {
    const {
      fuelPricePerLitre,
      efficiency,
      baseFare,
      perMinuteRate,
      marketAdjustment,
      riderPlatformFeePercent,
      driverPlatformFeePercent,
      taxRate,
    } = this.config;

    const category = this.getVehicleCategory(vehicleProductionYear, isBike);
    const duration = durationMinutes ?? 0;

    // ── Row 14: Base Fare (BF) ───────────────────────────────────────────
    const BF = baseFare[category];

    // ── Row 17: Per-Km Rate (PK) = Fuel Price ÷ Vehicle Efficiency ──────
    const PK = fuelPricePerLitre / efficiency[category];

    // ── Distance Cost = BF + (PK × distance) ────────────────────────────
    const distanceCost = BF + PK * distance;

    // ── Row 18: Per-Min Rate (PM) – fixed by Operations ─────────────────
    const PM = perMinuteRate[category];

    // ── Time Cost = PM × duration ────────────────────────────────────────
    const timeCost = PM * duration;

    // ── Row 19: Market Adjustment (MA) ───────────────────────────────────
    const MA = marketAdjustment[category];

    // ── Subtotal (pre-fees, pre-surge) ───────────────────────────────────
    const subtotal = distanceCost + timeCost + MA;

    // ── Row 22: Rider Platform Fee ───────────────────────────────────────
    const platformFee = this.roundToNearest50(
      (subtotal * riderPlatformFeePercent) / 100,
    );

    // ── Pre-surge rider amount ────────────────────────────────────────────
    const preSurgeAmount = subtotal + platformFee;

    // ── Row 25: Surge Multiplier ─────────────────────────────────────────
    const effectiveSurge = surgeMultiplier > 0 ? surgeMultiplier : 1.0;
    const riderPays = this.roundToNearest50(preSurgeAmount * effectiveSurge);

    // ── Row 24: Tax (VAT) applied to final rider amount ──────────────────
    const tax = this.roundToNearest50((riderPays * taxRate) / 100);
    const riderPaysFinal = riderPays + tax;

    // ── Row 23: Driver Commission ─────────────────────────────────────────
    const driverCommission = this.roundToNearest50(
      (subtotal * driverPlatformFeePercent) / 100,
    );

    // ── Driver & platform earnings ────────────────────────────────────────
    const driverReceives = this.roundToNearest50(subtotal - driverCommission);
    // Platform earns the rider platform fee + driver commission; tax is
    // collected on behalf of government and remitted separately.
    const platformEarns = this.roundToNearest50(platformFee + driverCommission);

    return {
      // Primary price your booking code uses (inclusive of VAT)
      calculatedPrice: riderPaysFinal,

      breakdown: {
        baseFare: BF,
        distanceCost: this.roundToNearest50(PK * distance), // excludes BF for clarity
        timeCost: this.roundToNearest50(timeCost),
        marketAdjustment: MA,
        subtotal: this.roundToNearest50(subtotal),
        platformFee,                          // rider-side fee (5%)
        surgeMultiplier: effectiveSurge,
        preSurgeFare: this.roundToNearest50(preSurgeAmount),
        riderPaysBeforeTax: riderPays,
        tax,
        riderPaysFinal,                       // === calculatedPrice
      },

      driverReceives,
      driverCommission,
      platformEarns,

      meta: {
        vehicleCategory: category,
        distanceKm: distance,
        durationMinutes: duration,
        ratesUsed: {
          baseFare: BF,
          perKmRate: parseFloat(PK.toFixed(2)),         // Row 17
          perMinuteRate: PM,                             // Row 18
          marketAdjustment: MA,                          // Row 19
          fuelPricePerLitre,                             // Row 15
          efficiencyKmPerLitre: efficiency[category],    // Row 16
          riderPlatformFeePercent,                       // Row 22
          driverPlatformFeePercent,                      // Row 23
          taxRate,                                       // Row 24
          surgeMultiplier: effectiveSurge,               // Row 25
        },
      },
    };
  }

  // ── Helpers (unchanged from original) ────────────────────────────────────
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

    if (
      normalizedSubCategory &&
      explicitSubCategoryMap[normalizedSubCategory]
    ) {
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

  calculatePricingBreakdown(
    agreedPrice,
    userFeePercentage = 10,
    providerCommissionPercentage = 15,
  ) {
    const userFee = this.calculateServiceFee(agreedPrice, userFeePercentage);
    const commission = this.calculateProviderCommission(
      agreedPrice,
      providerCommissionPercentage,
    );

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
