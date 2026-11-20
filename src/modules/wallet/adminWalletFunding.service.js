const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Buyer = require("../../../models/ServiceUser");
const Transaction = require("../transactions/transaction.model");
const notificationService = require("../../services/notification.service");
const Wallet = require("./Wallet.model");
const WalletFundingBatch = require("./walletFundingBatch.model");

const PAYSTACK_BASE_URL = "https://api.paystack.co";
const MAX_BATCH_ENTRIES = 50;

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const summarizePayment = (payment) => ({
  transactionId: payment.id,
  reference: payment.reference,
  status: payment.status,
  amount: payment.amount,
  currency: payment.currency,
  channel: payment.channel,
  paidAt: payment.paid_at,
  customerEmail: payment.customer?.email,
});

const normalizeFundingEntries = (entries) => {
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.length > MAX_BATCH_ENTRIES
  ) {
    throw createError(
      `Provide between 1 and ${MAX_BATCH_ENTRIES} buyer funding entries`,
    );
  }

  const seenEmails = new Set();
  const normalizedEntries = entries.map((entry, index) => {
    const email = String(entry?.email || "")
      .trim()
      .toLowerCase();
    const amount = entry?.amount;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw createError(`Entry ${index + 1} has an invalid buyer email`);
    }
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1) {
      throw createError(
        `Entry ${index + 1} amount must be a positive whole number of naira`,
      );
    }
    if (seenEmails.has(email)) {
      throw createError(`Buyer email ${email} appears more than once`);
    }
    seenEmails.add(email);
    return { email, amount };
  });

  const totalAmount = normalizedEntries.reduce(
    (total, entry) => total + entry.amount,
    0,
  );
  if (!Number.isSafeInteger(totalAmount * 100)) {
    throw createError("Total funding amount is too large");
  }

  return { entries: normalizedEntries, totalAmount };
};

const toPublicBatch = (batch) => ({
  reference: batch.reference,
  status: batch.status,
  totalAmount: batch.totalAmount,
  currency: batch.currency,
  reason: batch.reason,
  entries: batch.entries.map(({ email, amount }) => ({ email, amount })),
  authorizationUrl: batch.authorizationUrl,
  paymentPayerEmail: batch.paymentPayerEmail,
  paymentChannel: batch.paymentResponse?.channel,
  paidAt: batch.paidAt,
  completedAt: batch.completedAt,
  error: batch.error,
  createdAt: batch.createdAt,
});

class AdminWalletFundingService {
  getPaystackHeaders() {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      throw createError("Paystack is not configured", 503);
    }
    return {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    };
  }

  async createBatch({ adminId, adminEmail, entries, reason, callbackUrl }) {
    const normalizedEmail = String(adminEmail || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      throw createError("Authenticated admin email is unavailable", 400);
    }
    if (typeof reason !== "string" || !reason.trim() || reason.length > 500) {
      throw createError("A reason of 1 to 500 characters is required");
    }

    const { entries: allocations, totalAmount } =
      normalizeFundingEntries(entries);
    const buyers = await Buyer.find({
      $or: allocations.map(({ email }) => ({
        email: new RegExp(
          `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      })),
    })
      .select("_id email isActive isDeleted")
      .lean();
    const buyersByEmail = new Map(
      buyers.map((buyer) => [buyer.email.toLowerCase(), buyer]),
    );

    const resolvedEntries = allocations.map((allocation) => {
      const buyer = buyersByEmail.get(allocation.email);
      if (!buyer || buyer.isDeleted || buyer.isActive === false) {
        throw createError(
          `No active buyer account found for ${allocation.email}`,
          404,
        );
      }
      return {
        buyerId: buyer._id,
        email: allocation.email,
        amount: allocation.amount,
      };
    });

    const reference = `AWF_${Date.now()}_${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
    const batch = await WalletFundingBatch.create({
      reference,
      createdBy: adminId,
      initiatedByEmail: normalizedEmail,
      totalAmount,
      entries: resolvedEntries,
      reason: reason.trim(),
      status: "initializing",
    });

    try {
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        {
          email: normalizedEmail,
          amount: totalAmount * 100,
          currency: "NGN",
          reference,
          callback_url: callbackUrl,
          metadata: {
            type: "admin_wallet_funding_batch",
            batchReference: reference,
            adminId: String(adminId),
            recipientCount: resolvedEntries.length,
          },
        },
        { headers: this.getPaystackHeaders() },
      );

      const payment = response.data?.data;
      if (
        !response.data?.status ||
        !payment?.authorization_url ||
        payment.reference !== reference
      ) {
        throw createError("Paystack did not initialize this payment", 502);
      }

      await WalletFundingBatch.updateOne(
        {
          _id: batch._id,
          status: {
            $in: [
              "initializing",
              "pending_payment",
              "paid_pending_credit",
              "completed",
            ],
          },
        },
        {
          $set: {
            authorizationUrl: payment.authorization_url,
          },
        },
      );
      await WalletFundingBatch.updateOne(
        { _id: batch._id, status: "initializing" },
        { $set: { status: "pending_payment" } },
      );

      const currentBatch = await WalletFundingBatch.findById(batch._id);
      if (!currentBatch) {
        throw createError("Wallet funding batch could not be retrieved", 500);
      }
      return toPublicBatch(currentBatch);
    } catch (error) {
      await WalletFundingBatch.updateOne(
        { _id: batch._id, status: "initializing" },
        {
          $set: {
            status: "failed",
            error: error.response?.data?.message || error.message,
          },
        },
      );
      if (error.statusCode) throw error;
      throw createError(
        error.response?.data?.message || "Failed to initialize Paystack checkout",
        502,
      );
    }
  }

  async getBatch(reference) {
    const batch = await WalletFundingBatch.findOne({ reference }).lean();
    if (!batch) throw createError("Wallet funding batch not found", 404);
    return toPublicBatch(batch);
  }

  async verifyBatch(reference) {
    const batch = await WalletFundingBatch.findOne({ reference });
    if (!batch) throw createError("Wallet funding batch not found", 404);
    if (batch.status === "completed") return toPublicBatch(batch);
    if (
      !["initializing", "pending_payment", "paid_pending_credit"].includes(
        batch.status,
      )
    ) {
      throw createError("This funding batch is not awaiting payment", 409);
    }

    let response;
    try {
      response = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: this.getPaystackHeaders() },
      );
    } catch (error) {
      throw createError(
        error.response?.data?.message || "Paystack verification is temporarily unavailable",
        502,
      );
    }
    const payment = response.data?.data;
    if (!response.data?.status || !payment) {
      throw createError("Paystack could not verify this payment", 502);
    }
    if (payment.status !== "success") {
      if (["failed", "abandoned"].includes(payment.status)) {
        await WalletFundingBatch.updateOne(
          { _id: batch._id, status: { $ne: "completed" } },
          {
            $set: {
              status: "failed",
              paymentResponse: summarizePayment(payment),
              error: `Paystack payment ${payment.status}`,
            },
          },
        );
      }
      throw createError("Paystack payment has not succeeded", 409);
    }

    await this.processPaystackCharge(payment);
    return this.getBatch(reference);
  }

  async processPaystackCharge(payment) {
    const reference = payment?.reference;
    if (!reference) return false;
    const batch = await WalletFundingBatch.findOne({ reference });
    if (!batch) return false;
    if (batch.status === "completed") return true;

    const paymentMatches =
      payment.status === "success" &&
      Number(payment.amount) === batch.totalAmount * 100 &&
      payment.currency === batch.currency &&
      payment.reference === batch.reference;

    if (!paymentMatches) {
      await WalletFundingBatch.updateOne(
        { _id: batch._id, status: { $ne: "completed" } },
        {
          $set: {
            status: "paid_pending_credit",
            paymentResponse: summarizePayment(payment),
            paidAt: new Date(),
            paymentPayerEmail: payment.customer?.email,
            error: "Verified payment does not match the expected amount or currency",
          },
        },
      );
      throw new Error("Paystack payment does not match the funding batch");
    }

    const session = await mongoose.startSession();
    let completedByThisCall = false;
    try {
      await session.withTransaction(async () => {
        completedByThisCall = false;
        const currentBatch = await WalletFundingBatch.findOne({
          reference,
        }).session(session);
        if (!currentBatch) throw createError("Wallet funding batch not found", 404);
        if (currentBatch.status === "completed") return;

        const transactionRecords = [];
        for (let index = 0; index < currentBatch.entries.length; index += 1) {
          const entry = currentBatch.entries[index];
          const wallet = await Wallet.findOneAndUpdate(
            { ownerId: entry.buyerId, ownerModel: "Buyer" },
            {
              $inc: {
                "balance.available": entry.amount,
                "balance.total": entry.amount,
              },
              $set: { lastTransactionAt: new Date() },
              $setOnInsert: {
                ownerId: entry.buyerId,
                ownerModel: "Buyer",
                currency: currentBatch.currency,
              },
            },
            {
              new: true,
              upsert: true,
              setDefaultsOnInsert: true,
              session,
            },
          );
          const balanceAfter = {
            available: wallet.balance.available,
            pending: wallet.balance.pending,
            total: wallet.balance.total,
          };
          const balanceBefore = {
            available: balanceAfter.available - entry.amount,
            pending: balanceAfter.pending,
            total: balanceAfter.total - entry.amount,
          };

          transactionRecords.push({
            reference: `${currentBatch.reference}_${index + 1}`,
            type: "credit",
            from: {
              userModel: "Platform",
            },
            to: {
              userId: entry.buyerId,
              userModel: "Buyer",
              walletId: wallet._id,
            },
            amount: entry.amount,
            balances: { before: balanceBefore, after: balanceAfter },
            status: "completed",
            description: "Admin-funded wallet credit via Paystack",
            completedAt: new Date(),
            metadata: {
              purpose: "admin_wallet_funding",
              batchReference: currentBatch.reference,
              paystackReference: currentBatch.reference,
              adminId: currentBatch.createdBy,
              initiatedByAdminEmail: currentBatch.initiatedByEmail,
              payerEmail: payment.customer?.email,
              paymentChannel: payment.channel,
              reason: currentBatch.reason,
            },
          });
        }

        await Transaction.create(transactionRecords, {
          session,
          ordered: true,
        });
        currentBatch.status = "completed";
        currentBatch.paymentResponse = summarizePayment(payment);
        currentBatch.paymentPayerEmail = payment.customer?.email;
        currentBatch.paidAt = currentBatch.paidAt || new Date();
        currentBatch.completedAt = new Date();
        currentBatch.error = undefined;
        await currentBatch.save({ session });
        completedByThisCall = true;
      });
    } catch (error) {
      await WalletFundingBatch.updateOne(
        { _id: batch._id, status: { $ne: "completed" } },
        {
          $set: {
            status: "paid_pending_credit",
            paymentResponse: summarizePayment(payment),
            paidAt: new Date(),
            paymentPayerEmail: payment.customer?.email,
            error: error.message,
          },
        },
      );
      throw error;
    } finally {
      await session.endSession();
    }

    if (completedByThisCall) {
      for (const entry of batch.entries) {
        try {
          await notificationService.notifyUser(entry.buyerId, {
            type: "wallet_funded",
            title: "Wallet Funded",
            message: `Your wallet has been funded with NGN${entry.amount.toLocaleString()}.`,
            reference,
            amount: entry.amount,
          });
        } catch (error) {
          console.error("Failed to notify buyer about admin wallet funding:", error);
        }
      }
    }
    return true;
  }
}

module.exports = {
  AdminWalletFundingService: new AdminWalletFundingService(),
  normalizeFundingEntries,
};
