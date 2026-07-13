


// class PricingService {
//   constructor() {
//     // ── Ops-configurable & government-set values ───────────────────────────
//     this.config = {
//       // Row 15
//       fuelPricePerLitre: 1200,

//       // Row 16 – km per litre
//       efficiency: {
//         bike: 20,
//         pre2000: 10,
//         post2000: 14,
//       },

//       baseFare: {
//         bike: 250,
//         pre2000: 600,
//         post2000: 900,
//       },

//       perMinuteRate: {
//         bike: 15,
//         pre2000: 25,
//         post2000: 30,
//       },

//       marketAdjustment: {
//         bike: 400,
//         pre2000: 1000,
//         post2000: 1500,
//       },

//       riderPlatformFeePercent: 5,

//       driverPlatformFeePercent: 15,

//       taxRate: 7.5,

//       defaultSurgeMultiplier: 1.0,
//     };
//   }

//   // ── Resolve vehicle category ─────────────────────────────────────────────
//   /**
//    * @param {number|string|null} vehicleProductionYear
//    * @param {boolean}            isBike
//    * @returns {'bike'|'pre2000'|'post2000'}
//    */
//   getVehicleCategory(vehicleProductionYear, isBike = false) {
//     if (isBike) return "bike";
//     const year = parseInt(vehicleProductionYear, 10);
//     if (!year || isNaN(year)) return "post2000";
//     return year <= 2000 ? "pre2000" : "post2000";
//   }

//   // ── Core pricing calculator ──────────────────────────────────────────────
//   /**
//    * @param {number}      distance              - kilometres (from map API)
//    * @param {string}      subCategory           - booking sub-category string
//    * @param {string|null} serviceType           - optional service type
//    * @param {number|null} durationMinutes       - trip duration in minutes (from map API)
//    * @param {number|null} vehicleProductionYear - year car was manufactured
//    * @param {boolean}     isBike                - true if the vehicle is a motorcycle
//    * @param {number}      surgeMultiplier       - dynamic surge (default 1.0 = no surge)
//    * @returns {object}
//    */
//   calculateTransportPrice(
//     distance,
//     subCategory,
//     serviceType = null,
//     durationMinutes = null,
//     vehicleProductionYear = null,
//     isBike = false,
//     surgeMultiplier = this.config.defaultSurgeMultiplier,
//   ) {
//     const {
//       fuelPricePerLitre,
//       efficiency,
//       baseFare,
//       perMinuteRate,
//       marketAdjustment,
//       riderPlatformFeePercent,
//       driverPlatformFeePercent,
//       taxRate,
//     } = this.config;

//     const category = this.getVehicleCategory(vehicleProductionYear, isBike);
//     const duration = durationMinutes ?? 0;

//     // ── Row 14: Base Fare (BF) ───────────────────────────────────────────
//     const BF = baseFare[category];

//     // ── Row 17: Per-Km Rate (PK) = Fuel Price ÷ Vehicle Efficiency ──────
//     const PK = fuelPricePerLitre / efficiency[category];

//     // ── Distance Cost = BF + (PK × distance) ────────────────────────────
//     const distanceCost = BF + PK * distance;

//     // ── Row 18: Per-Min Rate (PM) – fixed by Operations ─────────────────
//     const PM = perMinuteRate[category];

//     // ── Time Cost = PM × duration ────────────────────────────────────────
//     const timeCost = PM * duration;

//     // ── Row 19: Market Adjustment (MA) ───────────────────────────────────
//     const MA = marketAdjustment[category];

//     // ── Subtotal (pre-fees, pre-surge) ───────────────────────────────────
//     const subtotal = distanceCost + timeCost + MA;

//     // ── Row 22: Rider Platform Fee ───────────────────────────────────────
//     const platformFee = this.roundToNearest50(
//       (subtotal * riderPlatformFeePercent) / 100,
//     );

//     // ── Pre-surge rider amount ────────────────────────────────────────────
//     const preSurgeAmount = subtotal + platformFee;

//     // ── Row 25: Surge Multiplier ─────────────────────────────────────────
//     const effectiveSurge = surgeMultiplier > 0 ? surgeMultiplier : 1.0;
//     const riderPays = this.roundToNearest50(preSurgeAmount * effectiveSurge);

//     // ── Row 24: Tax (VAT) applied to final rider amount ──────────────────
//     const tax = this.roundToNearest50((riderPays * taxRate) / 100);
//     const riderPaysFinal = riderPays + tax;

//     // ── Row 23: Driver Commission ─────────────────────────────────────────
//     const driverCommission = this.roundToNearest50(
//       (subtotal * driverPlatformFeePercent) / 100,
//     );

//     // ── Driver & platform earnings ────────────────────────────────────────
//     const driverReceives = this.roundToNearest50(subtotal - driverCommission);
//     // Platform earns the rider platform fee + driver commission; tax is
//     // collected on behalf of government and remitted separately.
//     const platformEarns = this.roundToNearest50(platformFee + driverCommission);

//     return {
//       // Primary price your booking code uses (inclusive of VAT)
//       calculatedPrice: riderPaysFinal,

//       breakdown: {
//         baseFare: BF,
//         distanceCost: this.roundToNearest50(PK * distance), // excludes BF for clarity
//         timeCost: this.roundToNearest50(timeCost),
//         marketAdjustment: MA,
//         subtotal: this.roundToNearest50(subtotal),
//         platformFee,                          // rider-side fee (5%)
//         surgeMultiplier: effectiveSurge,
//         preSurgeFare: this.roundToNearest50(preSurgeAmount),
//         riderPaysBeforeTax: riderPays,
//         tax,
//         riderPaysFinal,                       // === calculatedPrice
//         driverCommission,                     // provider-side fee (15%)
//         driverReceives,                       // provider net earnings
//         platformEarns,                        // total platform earnings
//       },

//       driverReceives,
//       driverCommission,
//       platformEarns,

//       meta: {
//         vehicleCategory: category,
//         distanceKm: distance,
//         durationMinutes: duration,
//         ratesUsed: {
//           baseFare: BF,
//           perKmRate: parseFloat(PK.toFixed(2)),         
//           perMinuteRate: PM,                             
//           marketAdjustment: MA,                          
//           fuelPricePerLitre,                            
//           efficiencyKmPerLitre: efficiency[category],    
//           riderPlatformFeePercent,                       
//           driverPlatformFeePercent,                      
//           taxRate,                                       
//           surgeMultiplier: effectiveSurge,               
//         },
//       },
//     };
//   }

//   // ── Helpers (unchanged from original) ────────────────────────────────────
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
//     const serviceFee = this.calculateServiceFee(agreedPrice, serviceFeePercentage);
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


class PricingService {
  constructor() {
this.config = {
  fuelPricePerLitre: 1200,

  efficiency: {
    bike: 35,
    pre2000: 6,
    post2000: 10,
    car: 8,
  },

  // ── Bike-specific tiered rates ────────────────────────────────────────
  bikeTiers: [
    { upTo: 5,        ratePerKm: 100 },   // 0–5km
    { upTo: 10,       ratePerKm: 150 },  // 6–10km
    { upTo: Infinity, ratePerKm: 120 },  // 11km+
  ],

  // Lowered for bikes specifically to make room for tiered distance cost
  baseFare: {
    bike: 250,        // was 500 — lowered to fit tiered model
    pre2000: 800,
    post2000: 1200,
    car: 1000,
  },

  perMinuteRate: {
    bike: 20,          // was 25 — slightly lowered
    pre2000: 35,
    post2000: 45,
    car: 40,
  },

  marketAdjustment: {
    bike: 150,         // was 600 — lowered to fit tiered model
    pre2000: 1500,
    post2000: 2000,
    car: 1750,
  },

  minimumFare: {
    bike: 700,          // lowered slightly since tiers handle scaling now
    pre2000: 1500,
    post2000: 2000,
    car: 1750,
  },

  // Driver earnings cap — applies to bike only, prevents overpaying on
  // unusually long bike trips (bikes shouldn't really do 30km+ trips anyway)
  maxDriverEarnings: {
    bike: 4000,
  },

  riderPlatformFeePercent: 5,
  driverPlatformFeePercent: 7.5,
  taxRate: 7.5,
  defaultSurgeMultiplier: 1.0,
};
  }

  // ── Resolve vehicle category from production year ────────────────────────
  /**
   * Maps a vehicle production year to a pricing category.
   * If no year is provided (booking creation before provider is assigned),
   * returns 'car' which uses the averaged rates as a safe fallback.
   *
   * @param {number|string|null} vehicleProductionYear
   * @param {boolean}            isBike
   * @returns {'bike'|'pre2000'|'post2000'|'car'}
   */
  getVehicleCategory(vehicleProductionYear, isBike = false) {
    if (isBike) return "bike";
    const year = parseInt(vehicleProductionYear, 10);
    if (!year || isNaN(year)) return "car"; // averaged fallback — no year known
    return year <= 2000 ? "pre2000" : "post2000";
  }

  // ── Core pricing calculator ──────────────────────────────────────────────
  /**
   * Calculates the full fare for a transport booking.
   *
   * Formula:
   *   PK (per-km fuel rate) = fuelPrice ÷ efficiency
   *   distanceCost          = BF + (PK × distance)
   *   timeCost              = PM × durationMinutes
   *   subtotal              = distanceCost + timeCost + MA
   *   platformFee           = subtotal × 5%   (added on top for rider)
   *   preSurgeAmount        = subtotal + platformFee
   *   riderPays             = preSurgeAmount × surgeMultiplier
   *   riderPaysFinal        = riderPays + VAT
   *   driverReceives        = subtotal - (subtotal × 15%)
   *   platformEarns         = platformFee + driverCommission
   *
  //  * @param {number}      distance              - km (pickup → dropoff from map API)
  //  * @param {string}      subCategory           - booking sub-category
  //  * @param {string|null} serviceType           - booking service type
  //  * @param {number|null} durationMinutes       - total trip duration in minutes
  //  * @param {number|null} vehicleProductionYear - provider's vehicle year
  //  * @param {boolean}     isBike                - true if modeOfDelivery === 'Bike'
  //  * @param {number}      surgeMultiplier       - 1.0 = no surge
  //  * @returns {object}    Full pricing result with breakdown
  //  */

  /**
 * Calculates tiered distance cost for bikes.
 * Each tier's km only gets charged at that tier's rate —
 * e.g. for 12km: first 5km @ ₦80, next 5km @ ₦150, last 2km @ ₦180.
 *
 * @param {number} distance - total trip distance in km
 * @returns {number} total distance cost in NGN
 */
calculateTieredDistanceCost(distance) {
  const tiers = this.config.bikeTiers;
  let remaining = distance;
  let cost = 0;
  let previousUpTo = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;

    const tierSpan = tier.upTo - previousUpTo;       // how many km this tier covers
    const kmInThisTier = Math.min(remaining, tierSpan);

    cost += kmInThisTier * tier.ratePerKm;
    remaining -= kmInThisTier;
    previousUpTo = tier.upTo;
  }

  return cost;
}


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
    fuelPricePerLitre, efficiency, baseFare, perMinuteRate,
    marketAdjustment, minimumFare, maxDriverEarnings,
    riderPlatformFeePercent, driverPlatformFeePercent, taxRate,
  } = this.config;

  const category = this.getVehicleCategory(vehicleProductionYear, isBike);
  const duration = durationMinutes ?? 0;

  const BF = baseFare[category];

  // ── Distance cost: tiered for bikes, flat fuel-based for cars ─────────
  let distanceCostOnly;
  let PK = null; // only relevant for non-bike, kept in meta for transparency

  if (category === "bike") {
    // Bikes use tiered per-km rates, not fuel-based calculation
    distanceCostOnly = this.calculateTieredDistanceCost(distance);
  } else {
    // Cars still use fuel-price ÷ efficiency model
    PK = fuelPricePerLitre / efficiency[category];
    distanceCostOnly = PK * distance;
  }

  const perKmRate = PK == null ? null : Number(PK.toFixed(2));

  const distanceCost = BF + distanceCostOnly;

  const PM = perMinuteRate[category];
  const timeCost = PM * duration;

  const MA = marketAdjustment[category];

  const rawSubtotal = distanceCost + timeCost + MA;
  const subtotal = Math.max(rawSubtotal, minimumFare[category]);

  const platformFee = this.roundToNearest50((subtotal * riderPlatformFeePercent) / 100);
  const preSurgeAmount = subtotal + platformFee;

  const effectiveSurge = surgeMultiplier > 0 ? surgeMultiplier : 1.0;
  const riderPaysBeforeTax = this.roundToNearest50(preSurgeAmount * effectiveSurge);

  const tax = this.roundToNearest50((riderPaysBeforeTax * taxRate) / 100);
  const riderPaysFinal = riderPaysBeforeTax + tax;

  const driverCommission = this.roundToNearest50((subtotal * driverPlatformFeePercent) / 100);
  let driverReceives = this.roundToNearest50(subtotal - driverCommission);

  // ── Apply driver earnings cap (bike only) ──────────────────────────────
  const earningsCap = maxDriverEarnings?.[category];
  const capApplied = earningsCap && driverReceives > earningsCap;
  if (capApplied) {
    driverReceives = earningsCap;
  }

  const platformEarns = this.roundToNearest50(platformFee + driverCommission);

  return {
    calculatedPrice: riderPaysFinal,
    breakdown: {
      baseFare: BF,
      perKmRate: category === "bike" ? "tiered" : perKmRate,
      distanceCost: this.roundToNearest50(distanceCostOnly),
      timeCost: this.roundToNearest50(timeCost),
      marketAdjustment: MA,
      subtotal: this.roundToNearest50(subtotal),
      minimumFareApplied: rawSubtotal < minimumFare[category],
      platformFee,
      surgeMultiplier: effectiveSurge,
      preSurgeFare: this.roundToNearest50(preSurgeAmount),
      riderPaysBeforeTax,
      tax,
      riderPaysFinal,
      driverCommission,
      driverReceives,
      driverEarningsCapApplied: capApplied,
      platformEarns,
    },
    driverReceives,
    driverCommission,
    platformEarns,
    meta: {
      vehicleCategory: category,
      distanceKm: distance,
      durationMinutes: duration,
      pricingModel: category === "bike" ? "tiered" : "fuel-based",
      ratesUsed: {
        baseFare: BF,
        perKmRate: category === "bike" ? "tiered" : perKmRate,
        perMinuteRate: PM,
        marketAdjustment: MA,
        minimumFare: minimumFare[category],
        ...(category === "bike"
          ? { tiers: this.config.bikeTiers }
          : { fuelPricePerLitre, efficiencyKmPerLitre: efficiency[category] }),
        riderPlatformFeePercent,
        driverPlatformFeePercent,
        taxRate,
        surgeMultiplier: effectiveSurge,
      },
    },
  };
}
//   calculateTransportPrice(
//     distance,
//     subCategory,
//     serviceType = null,
//     durationMinutes = null,
//     vehicleProductionYear = null,
//     isBike = false,
//     surgeMultiplier = this.config.defaultSurgeMultiplier,
//   ) {
//     const {
//       fuelPricePerLitre,
//       efficiency,
//       baseFare,
//       perMinuteRate,
//       marketAdjustment,
//       minimumFare,
//       riderPlatformFeePercent,
//       driverPlatformFeePercent,
//       taxRate,
//     } = this.config;

//     const category = this.getVehicleCategory(vehicleProductionYear, isBike);
//     const duration = durationMinutes ?? 0;

//     // ── Step 1: Base Fare (BF) ─────────────────────────────────────────────
//     // Fixed pickup fee. Covers driver's cost just to arrive and start the trip.
//     const BF = baseFare[category];

//     // ── Step 2: Per-Km Fuel Rate (PK) ─────────────────────────────────────
//     // How much fuel costs per km for this vehicle type.
//     // PK = fuelPrice ÷ efficiency (e.g. ₦1200 ÷ 10km/L = ₦120/km for post2000)
//     const PK = fuelPricePerLitre / efficiency[category];

//     // ── Step 3: Distance Cost ──────────────────────────────────────────────
//     // Total cost of covering the distance: base fare + fuel cost for the trip.
//     const distanceCost = BF + PK * distance;

//     // ── Step 4: Time Cost ──────────────────────────────────────────────────
//     // Compensates driver for time spent (especially in traffic).
//     // Uses a fixed per-minute rate set by Operations — not derived from distance.
//     const PM = perMinuteRate[category];
//     const timeCost = PM * duration;

//     // ── Step 5: Market Adjustment (MA) ────────────────────────────────────
//     // Flat fee covering maintenance, tyres, depreciation, and inflation buffer.
//     // const MA = marketAdjustment[category];

//     // // ── Step 6: Subtotal (pre-fees, pre-surge) ────────────────────────────
//     // // Raw trip cost before platform fees and surge.
//     // const rawSubtotal = distanceCost + timeCost + MA;

//     const MA = category === 'bike'
//   ? this.config.marketAdjustmentPerKm.bike * distance
//   : this.config.marketAdjustment[category];

// const rawSubtotal = distanceCost + timeCost + MA;

//     // ── Step 7: Apply minimum fare ────────────────────────────────────────
//     // No trip should pay less than the minimum, regardless of how short it is.
//     const subtotal = Math.max(rawSubtotal, minimumFare[category]);

//     // ── Step 8: Rider Platform Fee (5%) ──────────────────────────────────
//     // Added ON TOP of subtotal — rider pays this, not the driver.
//     // Covers platform operations + insurance for the rider.
//     const platformFee = this.roundToNearest50(
//       (subtotal * riderPlatformFeePercent) / 100,
//     );

//     // ── Step 9: Pre-surge rider amount ───────────────────────────────────
//     const preSurgeAmount = subtotal + platformFee;

//     // ── Step 10: Surge multiplier ─────────────────────────────────────────
//     // During peak demand, Ops can push surgeMultiplier above 1.0.
//     // e.g. 1.5 = 50% price increase during rush hour.
//     const effectiveSurge = surgeMultiplier > 0 ? surgeMultiplier : 1.0;
//     const riderPaysBeforeTax = this.roundToNearest50(
//       preSurgeAmount * effectiveSurge,
//     );

//     // ── Step 11: VAT (7.5%) ───────────────────────────────────────────────
//     // Applied to final rider amount inclusive of surge.
//     // Collected by platform and remitted to government separately.
//     const tax = this.roundToNearest50((riderPaysBeforeTax * taxRate) / 100);
//     const riderPaysFinal = riderPaysBeforeTax + tax;

//     // ── Step 12: Driver Commission (15%) ─────────────────────────────────
//     // Deducted FROM driver's subtotal earnings — driver pays this to platform.
//     // Note: commission is on subtotal, not on the full rider amount
//     // (driver doesn't pay commission on platform fee or VAT).
//     const driverCommission = this.roundToNearest50(
//       (subtotal * driverPlatformFeePercent) / 100,
//     );

//     // ── Step 13: Driver net earnings ─────────────────────────────────────
//     const driverReceives = this.roundToNearest50(subtotal - driverCommission);

//     // ── Step 14: Platform total earnings ─────────────────────────────────
//     // Platform earns: rider platform fee + driver commission.
//     // VAT is collected separately and remitted to government.
//     const platformEarns = this.roundToNearest50(platformFee + driverCommission);

//     return {
//       // ── Primary field used by booking code ───────────────────────────────
//       calculatedPrice: riderPaysFinal,

//       // ── Full breakdown for receipts / transparency ────────────────────
//       breakdown: {
//         baseFare: BF,
//         perKmRate: parseFloat(PK.toFixed(2)),
//         distanceCost: this.roundToNearest50(PK * distance),  // fuel portion only
//         timeCost: this.roundToNearest50(timeCost),
//         marketAdjustment: MA,
//         subtotal: this.roundToNearest50(subtotal),
//         minimumFareApplied: rawSubtotal < minimumFare[category],
//         platformFee,
//         surgeMultiplier: effectiveSurge,
//         preSurgeFare: this.roundToNearest50(preSurgeAmount),
//         riderPaysBeforeTax,
//         tax,
//         riderPaysFinal,       // === calculatedPrice
//         driverCommission,
//         driverReceives,
//         platformEarns,
//       },

//       // ── Top-level shortcuts used by booking code ──────────────────────
//       driverReceives,
//       driverCommission,
//       platformEarns,

//       // ── Metadata for debugging / logging ──────────────────────────────
//       meta: {
//         vehicleCategory: category,
//         distanceKm: distance,
//         durationMinutes: duration,
//         ratesUsed: {
//           baseFare: BF,
//           perKmRate: parseFloat(PK.toFixed(2)),
//           perMinuteRate: PM,
//           marketAdjustment: MA,
//           minimumFare: minimumFare[category],
//           fuelPricePerLitre,
//           efficiencyKmPerLitre: efficiency[category],
//           riderPlatformFeePercent,
//           driverPlatformFeePercent,
//           taxRate,
//           surgeMultiplier: effectiveSurge,
//         },
//       },
//     };
//   }

  // ── Helpers (unchanged) ──────────────────────────────────────────────────
  getTransportCategory(subCategory, serviceType = null) {
    const normalizedSubCategory = subCategory
      ? String(subCategory).toLowerCase().trim() : "";
    const normalizedServiceType = serviceType
      ? String(serviceType).toLowerCase().trim() : "";

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
