const mongoose = require("mongoose");
const Campaign = require("./Campaign.model");
const Participation = require("./CampaignParticipation.model");
const PromotionalCredit = require("./PromotionalCredit.model");
const Wallet = require("../wallet/Wallet.model");
const Transaction = require("../transactions/transaction.model");
const notificationService = require("../../services/notification.service");

const SHIFT_PRIZES = [
  { code: "NGN5000", label: "NGN 5,000", amount: 5000, remaining: 2 },
  { code: "NGN2500", label: "NGN 2,500", amount: 2500, remaining: 2 },
  { code: "NGN1000", label: "NGN 1,000", amount: 1000, remaining: 5 },
  { code: "NGN500", label: "NGN 500", amount: 500, remaining: 20 },
  { code: "NGN200", label: "NGN 200", amount: 200, remaining: 50 },
  { code: "NGN100", label: "NGN 100", amount: 100, remaining: 100 },
  { code: "TRY_AGAIN", label: "Try Again", amount: 0, remaining: 171 },
];

class CampaignError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const isCampaignPlayable = (campaign, now = new Date()) =>
  campaign.status === "active" &&
  (!campaign.startsAt || campaign.startsAt <= now) &&
  (!campaign.endsAt || campaign.endsAt >= now);

const generateReference = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const pickAvailablePrize = (campaign) => {
  const available = campaign.prizes.filter((prize) => prize.remaining > 0);
  if (!available.length) return null;
  const total = available.reduce((sum, prize) => sum + prize.remaining, 0);
  let draw = Math.random() * total;
  for (const prize of available) {
    draw -= prize.remaining;
    if (draw < 0) return prize;
  }
  return available[available.length - 1];
};

exports.CampaignError = CampaignError;
exports.SHIFT_PRIZES = SHIFT_PRIZES;

exports.createCampaign = async (payload) => {
  const slug = String(payload.slug || "").trim().toLowerCase();
  if (!slug) throw new CampaignError("Campaign slug is required");
  const prizes = payload.prizes?.length ? payload.prizes : SHIFT_PRIZES;
  const maxRewardSpins = Number(payload.maxRewardSpins ?? 350);
  const maxPayout = Number(payload.maxPayout ?? 50000);
  const outcomeCount = prizes.reduce(
    (sum, prize) => sum + Number(prize.remaining || 0),
    0,
  );
  const payout = prizes.reduce(
    (sum, prize) =>
      sum + Number(prize.amount || 0) * Number(prize.remaining || 0),
    0,
  );
  if (outcomeCount !== maxRewardSpins) {
    throw new CampaignError("Prize inventory must match maxRewardSpins");
  }
  if (payout > maxPayout) {
    throw new CampaignError("Prize payout exceeds the campaign payout limit");
  }
  return Campaign.create({
    ...payload,
    slug,
    prizes,
  });
};

exports.getCampaignBySlug = (slug) =>
  Campaign.findOne({ slug: String(slug).trim().toLowerCase() }).lean();

exports.setCampaignStatus = async (campaignId, status) => {
  if (!["draft", "active", "paused", "closed"].includes(status)) {
    throw new CampaignError("Invalid campaign status");
  }
  const campaign = await Campaign.findByIdAndUpdate(
    campaignId,
    { status },
    { new: true, runValidators: true },
  );
  if (!campaign) throw new CampaignError("Campaign not found", 404);
  return campaign;
};

exports.recordQrScan = async (slug) => {
  const campaign = await Campaign.findOneAndUpdate(
    { slug: String(slug).trim().toLowerCase() },
    { $inc: { "stats.qrScans": 1 } },
    { new: true },
  );
  if (!campaign) throw new CampaignError("Campaign not found", 404);
  return campaign.stats;
};

exports.recordCampaignMetric = async (slug, metric) => {
  const allowed = [
    "registrations",
    "providerRegistrations",
    "bookingsGenerated",
  ];
  if (!allowed.includes(metric)) throw new CampaignError("Invalid campaign metric");
  const campaign = await Campaign.findOneAndUpdate(
    { slug: String(slug).trim().toLowerCase() },
    { $inc: { [`stats.${metric}`]: 1 } },
    { new: true },
  );
  if (!campaign) throw new CampaignError("Campaign not found", 404);
  return campaign.stats;
};

exports.getParticipation = async (slug, userId) => {
  const campaign = await Campaign.findOne({ slug: String(slug).toLowerCase() }).lean();
  if (!campaign) throw new CampaignError("Campaign not found", 404);
  const participation = await Participation.findOne({
    campaignId: campaign._id,
    userId,
  }).lean();
  const credits = await PromotionalCredit.find({
    campaignId: campaign._id,
    userId,
    status: "active",
  })
    .sort({ expiresAt: 1 })
    .lean();
  return {
    campaign: {
      slug: campaign.slug,
      name: campaign.name,
      status: campaign.status,
      prizes: campaign.prizes,
    },
    availableSpins: Math.max(0, campaign.spinsPerUser - (participation?.spinCount || 0)),
    spinCount: participation?.spinCount || 0,
    spins: participation?.spins || [],
    rewards: credits.map((credit) => ({
      amount: credit.remainingAmount,
      originalAmount: credit.originalAmount,
      expiresAt: credit.expiresAt,
      countdownDays: Math.max(
        0,
        Math.ceil((new Date(credit.expiresAt).getTime() - Date.now()) / 86400000),
      ),
    })),
  };
};

exports.spin = async (slug, userId, idempotencyKey) => {
  const key = String(idempotencyKey || "").trim();
  if (!key) throw new CampaignError("Idempotency key is required");

  const campaign = await Campaign.findOne({ slug: String(slug).trim().toLowerCase() });
  if (!campaign) throw new CampaignError("Campaign not found", 404);
  if (!isCampaignPlayable(campaign)) {
    throw new CampaignError("Campaign is not currently active");
  }

  const session = await mongoose.startSession();
  let result;
  let creditNotification = null;

  try {
    await session.withTransaction(async () => {
    let participation = await Participation.findOne({
      campaignId: campaign._id,
      userId,
    }).session(session);

    if (!participation) {
      participation = await Participation.create(
        [{ campaignId: campaign._id, userId, spinCount: 0, spins: [] }],
        { session },
      ).then((rows) => rows[0]);
    }

    const existing = participation.spins.find((spin) => spin.idempotencyKey === key);
    if (existing) {
      result = {
        idempotent: true,
        spinNumber: existing.spinNumber,
        outcome: {
          code: existing.outcomeCode,
          label: existing.outcomeLabel,
          amount: existing.amount,
        },
        availableSpins: Math.max(0, campaign.spinsPerUser - participation.spinCount),
      };
      return;
    }

    if (participation.spinCount >= campaign.spinsPerUser) {
      throw new CampaignError("You have already used both spins");
    }

    const spinNumber = participation.spinCount + 1;
    if (spinNumber === 1) {
      participation.spins.push({
        spinNumber,
        outcomeCode: "ENGAGEMENT",
        outcomeLabel: "Engagement Spin",
        amount: 0,
        idempotencyKey: key,
      });
      participation.spinCount = 1;
      await participation.save({ session });
      result = {
        spinNumber: 1,
        outcome: { code: "ENGAGEMENT", label: "Engagement Spin", amount: 0 },
        availableSpins: 1,
      };
      return;
    }

    if (campaign.stats.rewardSpins >= campaign.maxRewardSpins) {
      throw new CampaignError("Campaign reward inventory is fully allocated");
    }

    const prize = pickAvailablePrize(campaign);
    if (!prize) throw new CampaignError("Campaign reward inventory is exhausted");
    if (campaign.stats.totalPaid + prize.amount > campaign.maxPayout) {
      throw new CampaignError("Campaign payout limit has been reached");
    }

    const prizeCode = prize.code;
    const updatedCampaign = await Campaign.findOneAndUpdate(
      {
        _id: campaign._id,
        status: "active",
        "stats.rewardSpins": { $lt: campaign.maxRewardSpins },
        "stats.totalPaid": { $lte: campaign.maxPayout - prize.amount },
        prizes: { $elemMatch: { code: prizeCode, remaining: { $gt: 0 } } },
      },
      {
        $inc: {
          "stats.rewardSpins": 1,
          "stats.winners": prize.amount > 0 ? 1 : 0,
          "stats.totalPaid": prize.amount,
          "prizes.$[prize].remaining": -1,
        },
      },
      {
        session,
        new: true,
        arrayFilters: [{ "prize.code": prizeCode }],
      },
    );
    if (!updatedCampaign) throw new CampaignError("Prize allocation failed");

    participation.spins.push({
      spinNumber: 2,
      outcomeCode: prize.code,
      outcomeLabel: prize.label,
      amount: prize.amount,
      idempotencyKey: key,
    });
    participation.spinCount = 2;
    participation.rewardGranted = prize.amount > 0;
    await participation.save({ session });

    let credit = null;
    if (prize.amount > 0) {
      const expiresAt = new Date();
      expiresAt.setUTCDate(expiresAt.getUTCDate() + campaign.creditValidityDays);
      credit = await PromotionalCredit.create(
        [{
          campaignId: campaign._id,
          userId,
          spinId: participation._id,
          originalAmount: prize.amount,
          remainingAmount: prize.amount,
          usedAmount: 0,
          expiresAt,
          status: "active",
        }],
        { session },
      ).then((rows) => rows[0]);

      await Wallet.updateOne(
        { ownerId: userId, ownerModel: "Buyer" },
        { $inc: { "balance.bonus": prize.amount, "balance.total": prize.amount } },
        { upsert: true, setDefaultsOnInsert: true, session },
      );
      await Transaction.create(
        [{
          reference: generateReference("CAMPAIGN"),
          type: "bonus",
          to: { userId, userModel: "Buyer" },
          amount: prize.amount,
          metadata: { campaignId: campaign._id, creditId: credit._id, expiresAt },
          status: "completed",
          description: `Promotional campaign bonus: ${prize.label}`,
          completedAt: new Date(),
        }],
        { session },
      );

      creditNotification = {
        type: "campaign_bonus_credited",
        title: "You won!",
        body: `Your promotional bonus of NGN${prize.amount.toLocaleString()} has been credited.`,
        campaignId: String(campaign._id),
        creditId: String(credit._id),
        amount: prize.amount,
        expiresAt,
      };
    }

    result = {
      spinNumber: 2,
      outcome: { code: prize.code, label: prize.label, amount: prize.amount },
      availableSpins: 0,
      credit: credit
        ? { amount: credit.originalAmount, expiresAt: credit.expiresAt }
        : null,
    };
    });
  } finally {
    await session.endSession();
  }

  if (creditNotification) {
    try {
      await notificationService.notifyUser(userId, creditNotification);
    } catch (error) {
      console.error(
        `Campaign bonus notification failed for Buyer:${userId}:`,
        error.message,
      );
    }
  }

  return result;
};

exports.getCredits = async (userId) =>
  PromotionalCredit.find({
    userId,
    status: "active",
    expiresAt: { $gt: new Date() },
  }).sort({ expiresAt: 1 }).lean();

exports.getUsableCreditAmount = async (userId, amount) => {
  const chargeAmount = Number(amount);
  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) return 0;
  const credits = await PromotionalCredit.find({
    userId,
    status: "active",
    expiresAt: { $gt: new Date() },
  }).sort({ expiresAt: 1 }).lean();
  const usable = credits.reduce(
    (sum, credit) => sum + Math.min(Number(credit.remainingAmount) || 0, Math.max(0, chargeAmount - sum)),
    0,
  );
  return usable;
};

exports.consumeCredits = async (userId, amount, bookingId, { session } = {}) => {
  const chargeAmount = Number(amount);
  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) return { applied: 0, cashAmount: 0 };

  const now = new Date();
  let creditsQuery = PromotionalCredit.find({
    userId,
    status: "active",
    expiresAt: { $gt: now },
  });
  if (session) creditsQuery = creditsQuery.session(session);
  const credits = await creditsQuery.sort({ expiresAt: 1 });

  let remainingCharge = chargeAmount;
  let applied = 0;
  const redemptions = [];

  for (const credit of credits) {
    if (remainingCharge <= 0) break;
    const usable = Math.min(credit.remainingAmount, remainingCharge);
    if (usable <= 0) continue;

    credit.remainingAmount -= usable;
    credit.usedAmount += usable;
    remainingCharge -= usable;
    applied += usable;
    if (credit.remainingAmount === 0) credit.status = "used";
    if (session) await credit.save({ session });
    else await credit.save();
    redemptions.push({ creditId: credit._id, amount: usable });
  }

  if (applied > 0) {
    await Wallet.updateOne(
      { ownerId: userId, ownerModel: "Buyer" },
      { $inc: { "balance.bonus": -applied, "balance.total": -applied } },
      session ? { session } : undefined,
    );
  }

  return {
    applied,
    cashAmount: remainingCharge,
    redemptions,
  };
};

exports.processCreditExpiryAndReminders = async () => {
  const now = new Date();
  const activeCredits = await PromotionalCredit.find({
    status: "active",
    remainingAmount: { $gt: 0 },
  });

  let remindersSent = 0;
  let expired = 0;

  for (const credit of activeCredits) {
    if (credit.expiresAt <= now) {
      const expiredAmount = credit.remainingAmount;
      credit.status = "expired";
      await credit.save();
      await Wallet.updateOne(
        { ownerId: credit.userId, ownerModel: "Buyer" },
        { $inc: { "balance.bonus": -expiredAmount, "balance.total": -expiredAmount } },
      );
      const wallet = await Wallet.findOne({ ownerId: credit.userId, ownerModel: "Buyer" }).lean();
      await Transaction.create({
        reference: generateReference("BONUS_EXP"),
        type: "bonus",
        from: { userId: credit.userId, userModel: "Buyer", walletId: wallet?._id },
        amount: expiredAmount,
        metadata: { campaignId: credit.campaignId, creditId: credit._id, reason: "expired" },
        status: "completed",
        description: "Promotional campaign bonus expired",
        completedAt: now,
      });
      credit.remainingAmount = 0;
      await credit.save();
      await notificationService.notifyUser(credit.userId, {
        type: "campaign_bonus_expired",
        title: "Promotional bonus expired",
        body: "Your remaining promotional bonus has expired.",
      });
      expired += 1;
      continue;
    }

    const ageDays = Math.floor((now.getTime() - credit.createdAt.getTime()) / 86400000);
    const remainingDays = Math.ceil((credit.expiresAt.getTime() - now.getTime()) / 86400000);
    const reminderDay = [7, 14, 21, 27, 29, 30].find(
      (day) => ageDays >= day && !credit.remindersSent.some((item) => item.day === day),
    );

    if (reminderDay) {
      credit.remindersSent.push({ day: reminderDay, sentAt: now });
      await credit.save();
      await notificationService.notifyUser(credit.userId, {
        type: "campaign_bonus_reminder",
        title: reminderDay === 30 ? "Bonus expires today" : "Use your promotional bonus",
        body: `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining before your bonus expires.`,
        amount: credit.remainingAmount,
        expiresAt: credit.expiresAt,
      });
      remindersSent += 1;
    }
  }

  return { remindersSent, expired };
};
