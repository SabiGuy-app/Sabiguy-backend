const campaignService = require("./campaign.service");

const sendError = (res, error) => {
  const status = error.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: error.message || "Campaign request failed",
  });
};

exports.createCampaign = async (req, res) => {
  try {
    const campaign = await campaignService.createCampaign(req.body);
    return res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.setStatus = async (req, res) => {
  try {
    const campaign = await campaignService.setCampaignStatus(
      req.params.campaignId,
      req.body.status,
    );
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.recordScan = async (req, res) => {
  try {
    const stats = await campaignService.recordQrScan(req.params.slug);
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.recordMetric = async (req, res) => {
  try {
    const stats = await campaignService.recordCampaignMetric(
      req.params.slug,
      req.params.metric,
    );
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getCampaign = async (req, res) => {
  try {
    const campaign = await campaignService.getCampaignBySlug(req.params.slug);
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }
    return res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getParticipation = async (req, res) => {
  try {
    const participation = await campaignService.getParticipation(
      req.params.slug,
      req.user.id,
    );
    return res.status(200).json({ success: true, data: participation });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.spin = async (req, res) => {
  try {
    const idempotencyKey =
      req.headers["idempotency-key"] || req.body.idempotencyKey;
    const result = await campaignService.spin(
      req.params.slug,
      req.user.id,
      idempotencyKey,
    );
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getCredits = async (req, res) => {
  try {
    const credits = await campaignService.getCredits(req.user.id);
    return res.status(200).json({ success: true, data: credits });
  } catch (error) {
    return sendError(res, error);
  }
};
