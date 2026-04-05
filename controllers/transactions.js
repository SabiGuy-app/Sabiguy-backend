const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");

class TransactionController {
  /**
   * Get all transactions with pagination, filtering, and sorting
   */
  async getAllTransactions(req, res) {
    try {
      const {
        type,
        fromUserModel,
        toUserModel,
        status,
        bookingId,
        userId,
        startDate,
        endDate,
        search,
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const allowedTypes = new Set([
        "payment",
        "payout",
        "refund",
        "escrow_hold",
        "escrow_release",
        "withdrawal",
        "credit",
        "debit",
        "platform_fee",
        "bonus",
        "commission",
        "tip",
      ]);
      const allowedStatuses = new Set([
        "pending",
        "processing",
        "completed",
        "failed",
        "reversed",
      ]);
      const allowedUserModels = new Set(["Buyer", "Provider", "Platform"]);
      const sortFields = {
        createdAt: "createdAt",
        amount: "amount",
        status: "status",
        type: "type",
        reference: "reference",
      };

      const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
      const normalizedLimit = Math.min(
        Math.max(parseInt(limit, 10) || 10, 1),
        100,
      );
      const normalizedSortBy = sortFields[sortBy] || "createdAt";
      const normalizedSortOrder = sortOrder === "asc" ? 1 : -1;

      // Build query object
      const query = {};
      const andFilters = [];

      // Filter by transaction type
      if (type) {
        // Ensure type is either a string or an array of strings
        if (Array.isArray(type)) {
          const invalidTypeElement = type.some(
            (value) => typeof value !== "string" || !allowedTypes.has(value),
          );
          if (invalidTypeElement) {
            return res.status(400).json({
              success: false,
              message: "Invalid transaction type",
            });
          }
          query.type = { $in: type };
        } else {
          if (typeof type !== "string" || !allowedTypes.has(type)) {
            return res.status(400).json({
              success: false,
              message: "Invalid transaction type",
            });
          }
          query.type = type;
        }
      }

      // Filter by status
      if (status) {
        // Ensure status is either a string or an array of strings
        if (Array.isArray(status)) {
          const invalidStatusElement = status.some(
            (value) => typeof value !== "string" || !allowedStatuses.has(value),
          );
          if (invalidStatusElement) {
            return res.status(400).json({
              success: false,
              message: "Invalid transaction status",
            });
          }
          query.status = { $in: status };
        } else {
          if (typeof status !== "string" || !allowedStatuses.has(status)) {
            return res.status(400).json({
              success: false,
              message: "Invalid transaction status",
            });
          }
          query.status = status;
        }
      }

      // Filter by from userModel
      if (fromUserModel) {
        if (!allowedUserModels.has(fromUserModel)) {
          return res.status(400).json({
            success: false,
            message: "Invalid fromUserModel",
          });
        }
        query["from.userModel"] = fromUserModel;
      }

      // Filter by to userModel
      if (toUserModel) {
        if (!allowedUserModels.has(toUserModel)) {
          return res.status(400).json({
            success: false,
            message: "Invalid toUserModel",
          });
        }
        query["to.userModel"] = toUserModel;
      }

      // Filter by specific userId (either as from or to)
      if (userId) {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID format",
          });
        }
        andFilters.push({
          $or: [
            { "from.userId": mongoose.Types.ObjectId(userId) },
            { "to.userId": mongoose.Types.ObjectId(userId) },
          ],
        });
      }

      // Filter by booking ID
      if (bookingId) {
        if (!mongoose.Types.ObjectId.isValid(bookingId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid booking ID format",
          });
        }
        query.bookingId = mongoose.Types.ObjectId(bookingId);
      }

      // Filter by date range
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Search by reference or description
      if (search) {
        const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        andFilters.push({
          $or: [
            { reference: { $regex: escaped, $options: "i" } },
            { description: { $regex: escaped, $options: "i" } },
          ],
        });
      }

      if (andFilters.length > 0) {
        query.$and = andFilters;
      }

      // Sort configuration
      const sortConfig = {};
      sortConfig[normalizedSortBy] = normalizedSortOrder;

      // Execute query with pagination
      const transactions = await Transaction.find(query)
        .populate("from.userId", "fullName email phoneNumber profilePicture")
        .populate("to.userId", "fullName email phoneNumber profilePicture")
        .populate("bookingId", "reference status")
        .sort(sortConfig)
        .limit(normalizedLimit)
        .skip((normalizedPage - 1) * normalizedLimit)
        .lean();

      // Get total count for pagination
      const count = await Transaction.countDocuments(query);

      // Calculate statistics by type and status
      const typeStats = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      const statusStats = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);

      // Calculate amount summary
      const amountSummary = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            averageAmount: { $avg: "$amount" },
            minAmount: { $min: "$amount" },
            maxAmount: { $max: "$amount" },
          },
        },
      ]);

      return res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / normalizedLimit),
          currentPage: normalizedPage,
          perPage: normalizedLimit,
        },
        stats: {
          byType: typeStats.reduce((acc, item) => {
            acc[item._id] = {
              count: item.count,
              totalAmount: item.totalAmount,
            };
            return acc;
          }, {}),
          byStatus: statusStats.reduce((acc, item) => {
            acc[item._id] = {
              count: item.count,
              totalAmount: item.totalAmount,
            };
            return acc;
          }, {}),
          amount: amountSummary[0] || {
            totalAmount: 0,
            averageAmount: 0,
            minAmount: 0,
            maxAmount: 0,
          },
        },
      });
    } catch (error) {
      console.error("Get all transactions error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching transactions",
        error: error.message,
      });
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(req, res) {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid transaction ID format",
        });
      }

      const transaction = await Transaction.findById(id)
        .populate("from.userId", "fullName email phoneNumber profilePicture")
        .populate("to.userId", "fullName email phoneNumber profilePicture")
        .populate("bookingId", "reference status")
        .lean();

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      console.error("Get transaction by ID error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching transaction",
        error: error.message,
      });
    }
  }
}

module.exports = new TransactionController();
