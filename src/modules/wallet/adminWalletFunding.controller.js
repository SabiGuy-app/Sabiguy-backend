const {
  AdminWalletFundingService,
} = require("./adminWalletFunding.service");

const getCallbackUrl = (req) => {
  const apiBaseUrl =
    process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  const parsedBaseUrl = new URL(normalizedBaseUrl);
  if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
    throw new Error("API_BASE_URL must use HTTP or HTTPS");
  }
  return `${normalizedBaseUrl}/api/v1/admin/wallet/funding-batches/paystack-callback`;
};

class AdminWalletFundingController {
  async createBatch(req, res) {
    try {
      const batch = await AdminWalletFundingService.createBatch({
        adminId: req.user.id,
        adminEmail: req.user.email,
        entries: req.body?.entries,
        reason: req.body?.reason,
        callbackUrl: getCallbackUrl(req),
      });
      return res.status(201).json({
        success: true,
        message: "Wallet funding checkout created",
        data: batch,
      });
    } catch (error) {
      console.error("Create admin wallet funding batch error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to create wallet funding checkout",
      });
    }
  }

  async getBatchStatus(req, res) {
    try {
      const batch = await AdminWalletFundingService.getBatch(
        req.params.reference,
      );
      return res.status(200).json({ success: true, data: batch });
    } catch (error) {
      console.error("Get admin wallet funding batch error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch wallet funding batch",
      });
    }
  }

  async paystackCallback(req, res) {
    const reference = req.query.reference || req.query.trxref;
    if (typeof reference !== "string" || !reference.trim()) {
      return res.status(400).json({
        success: false,
        message: "Paystack reference is required",
      });
    }

    try {
      try {
        await AdminWalletFundingService.verifyBatch(reference);
      } catch (error) {
        if (error.statusCode === 404) throw error;
        if (![409, 502].includes(error.statusCode)) throw error;
      }

      const batch = await AdminWalletFundingService.getBatch(reference);
      const frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl) {
        return res.status(batch.status === "completed" ? 200 : 202).json({
          success: batch.status === "completed",
          reference: batch.reference,
          status: batch.status,
        });
      }

      const redirectUrl = new URL(frontendUrl);
      if (!["http:", "https:"].includes(redirectUrl.protocol)) {
        throw new Error("FRONTEND_URL must use HTTP or HTTPS");
      }
      redirectUrl.searchParams.set("walletFundingReference", batch.reference);
      redirectUrl.searchParams.set("walletFundingStatus", batch.status);
      return res.redirect(303, redirectUrl.toString());
    } catch (error) {
      console.error("Paystack wallet funding callback error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to process Paystack callback",
      });
    }
  }

  async verifyBatch(req, res) {
    try {
      const batch = await AdminWalletFundingService.verifyBatch(
        req.params.reference,
      );
      return res.status(200).json({
        success: true,
        message: "Wallet funding batch verified",
        data: batch,
      });
    } catch (error) {
      console.error("Verify admin wallet funding batch error:", error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to verify wallet funding batch",
      });
    }
  }
}

module.exports = new AdminWalletFundingController();
