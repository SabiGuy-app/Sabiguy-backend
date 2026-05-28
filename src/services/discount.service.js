const pricingService = require("./pricing.service");

class DiscountService {
  constructor() {
    this.config = {
      code: "first_two_rides",
      percent: 20,
      maxRedemptions: 2,
    };
  }

  getLaunchPromoBaseAmount(subtotal) {
    return pricingService.roundToNearest50(
      Number(subtotal || 0) * (this.config.percent / 100),
    );
  }

  getLaunchPromoStatus(user) {
    const used = Number(user?.firstRideDiscountUsed ?? 0);
    const remaining = Math.max(this.config.maxRedemptions - used, 0);

    return {
      used,
      remaining,
      eligible: remaining > 0,
    };
  }

  previewLaunchPromoBreakdown({ user, booking, pricingBreakdown = {} } = {}) {
    return this.buildLaunchPromoBreakdown({
      user,
      booking,
      pricingBreakdown,
      applyDiscount: false,
    });
  }

  buildLaunchPromoBreakdown({
    user,
    booking,
    pricingBreakdown = {},
    applyDiscount = false,
  } = {}) {
    const subtotal = Number(
      pricingBreakdown.subtotal ??
        booking?.agreedPrice ??
        booking?.budget ??
        booking?.totalAmount ??
        booking?.calculatedPrice ??
        0,
    );
    const originalServiceFee = Number(
      pricingBreakdown.originalServiceFee ??
        pricingBreakdown.platformFee ??
        booking?.serviceFee ??
        0,
    );
    const originalProviderCommission = Number(
      pricingBreakdown.originalProviderCommission ??
        pricingBreakdown.driverCommission ??
        booking?.providerCommission ??
        0,
    );
    const originalProviderReceives = Number(
      pricingBreakdown.originalProviderReceives ??
        pricingBreakdown.driverReceives ??
        booking?.driverReceives ??
        booking?.providerReceives ??
        Math.max(subtotal - originalProviderCommission, 0),
    );
    const originalPlatformEarns = Number(
      pricingBreakdown.originalPlatformEarns ??
        pricingBreakdown.platformEarns ??
        booking?.platformEarns ??
        originalServiceFee + originalProviderCommission,
    );
    const originalTotalAmount = Number(
      pricingBreakdown.originalTotalAmount ??
        pricingBreakdown.riderPaysFinal ??
        booking?.totalAmount ??
        booking?.calculatedPrice ??
        subtotal + originalServiceFee,
    );

    const promoStatus = this.getLaunchPromoStatus(user);
    const promoBaseAmount = this.getLaunchPromoBaseAmount(subtotal);
    const discountApplied = Boolean(applyDiscount && promoStatus.eligible);
    const usedAfter = discountApplied ? promoStatus.used + 1 : promoStatus.used;
    const remainingAfter = Math.max(
      this.config.maxRedemptions - usedAfter,
      0,
    );
    const discountAmount = discountApplied
      ? Math.min(promoBaseAmount, originalPlatformEarns)
      : 0;
    const discountedTotalAmount = Math.max(
      originalTotalAmount - discountAmount,
      0,
    );

    return {
      agreedPrice: subtotal,
      subtotal,
      grossEarnings: subtotal,
      serviceFee: discountApplied ? 0 : originalServiceFee,
      userPlatformFee: discountApplied ? 0 : originalServiceFee,
      providerCommission: discountApplied ? 0 : originalProviderCommission,
      providerPlatformFee: discountApplied ? 0 : originalProviderCommission,
      providerReceives: originalProviderReceives,
      platformEarns: discountApplied ? 0 : originalPlatformEarns,
      totalAmount: discountedTotalAmount,
      originalTotalAmount,
      originalServiceFee,
      originalProviderCommission,
      originalProviderReceives,
      originalPlatformEarns,
      discountAmount,
      discountPercent: discountApplied ? this.config.percent : 0,
      discountApplied,
      discountCode: discountApplied ? this.config.code : null,
      discountReason: discountApplied ? "first_two_rides" : null,
      launchPromo: {
        code: this.config.code,
        percent: this.config.percent,
        applied: discountApplied,
        eligible: promoStatus.eligible,
        used: promoStatus.used,
        remaining: promoStatus.remaining,
        amount: discountAmount,
        baseAmount: promoBaseAmount,
        reason: discountApplied ? "first_two_rides" : null,
      },
      launchPromoSummary: {
        used: promoStatus.used,
        remaining: promoStatus.remaining,
        eligible: promoStatus.eligible,
        usedAfter,
        remainingAfter,
      },
      promoSubsidyAmount: discountApplied ? discountAmount : 0,
    };
  }
}

module.exports = new DiscountService();
