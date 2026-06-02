const pricingService = require("./pricing.service");

class DiscountService {
  constructor() {
    this.config = {
      code: "launch_promo",
      percent: 15,
      maxDiscount: 500, // Cap discount at 500 naira
    };
  }

  getLaunchPromoBaseAmount(subtotal) {
    const baseDiscount = pricingService.roundToNearest50(
      Number(subtotal || 0) * (this.config.percent / 100),
    );
    // Cap the discount at 500 naira
    return Math.min(baseDiscount, this.config.maxDiscount);
  }

  getLaunchPromoStatus(user) {
    // All users are eligible for the launch promo discount
    return {
      eligible: true,
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
      discountReason: discountApplied ? "launch_promo" : null,
      launchPromo: {
        code: this.config.code,
        percent: this.config.percent,
        applied: discountApplied,
        eligible: promoStatus.eligible,
        amount: discountAmount,
        baseAmount: promoBaseAmount,
        maxDiscount: this.config.maxDiscount,
        reason: discountApplied ? "launch_promo" : null,
      },
      promoSubsidyAmount: discountApplied ? discountAmount : 0,
    };
  }
}

module.exports = new DiscountService();
