const WalletService = require ('../src/services/wallet.service.js');
const Booking = require ('../models/Bookings.js')
const axios = require ('axios');


class WalletController {
    async getBalance(req, res) {
    try {
      const providerId = req.user.providerId || req.user.id;
      const ownerModel = req.user.role === 'provider' ? 'Provider' : 'Buyer';
      console.log(ownerModel)
      const balance = await WalletService.getBalance(providerId, ownerModel);
      
      return res.status(200).json({
        success: true,
        data: balance
      });
    } catch (error) {
      console.error('Get balance error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch balance',
        error: error.message
      });
    }
  }

  // Fund User Wallet


async fundWallet(req, res) {
  try {
    const userId = req.user.id;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }
    console.log('AUTH USER:', req.user);

    
    // Initialize Paystack payment for wallet funding
    const PaymentService = require('../src/services/payment.service.js');
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: req.user.email,
        amount: amount * 100, // Convert to kobo
        currency: 'NGN',
        reference: WalletService.generateReference('FUND'),
        callback_url: `${process.env.FRONTEND_URL}/wallet/funding/callback`,
        metadata: {
          userId,
          purpose: 'wallet_funding',
          amount
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('email', userId.email)
    if (!paystackResponse.data.status) {
      throw new Error('Failed to initialize wallet funding');
    }
    
    return res.status(200).json({
      success: true,
      message: 'Wallet funding initiated',
      data: {
        authorizationUrl: paystackResponse.data.data.authorization_url,
        reference: paystackResponse.data.data.reference,
        amount
      }
    });
    
  } catch (error) {
    console.error('Fund wallet error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate wallet funding',
      error: error.message
    });
  }
}

/**
 * Verify wallet funding
 */
async verifyWalletFunding(req, res) {
  try {
    const { reference } = req.params;
    const userId = req.user.id;
    
    // Verify with Paystack
    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );
    
    if (!paystackResponse.data.status || paystackResponse.data.data.status !== 'success') {
      throw new Error('Payment verification failed');
    }
    
    const amount = paystackResponse.data.data.amount / 100; // Convert from kobo
    
    // Fund wallet
    const result = await WalletService.fundUserWallet(userId, amount, reference);
    
    // return res.status(200).json({
    //   success: true,
    //   message: 'Wallet funded successfully',
    //   data: {
    //     amount,
    //     newBalance: result.wallet.balance.available
    //   }
    // });

    return res.status(200).json({
  success: true,
  message: result.alreadyProcessed
    ? 'Wallet already funded'
    : 'Wallet funded successfully',
  data: {
    amount,
    balance: result.wallet.balance
  }
});
    
  } catch (error) {
    console.error('Verify wallet funding error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify wallet funding',
      error: error.message
    });
  }
}


//  * Pay from wallet (alternative to Paystack)
 
// async payFromWallet(req, res) {
//   try {
//     const userId = req.user.id;
//     const { bookingId } = req.body;
    
//     if (!bookingId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Booking ID is required'
//       });
//     }
    
//     const booking = await Booking.findById(bookingId);
    
//     if (!booking) {
//       return res.status(404).json({
//         success: false,
//         message: 'Booking not found'
//       });
//     }
    
//     if (booking.userId.toString() !== userId.toString()) {
//       return res.status(403).json({
//         success: false,
//         message: 'Unauthorized'
//       });
//     }
    
//     const totalAmount = parseFloat(booking.totalAmount || booking.agreedPrice || booking.budget);

//      if (isNaN(totalAmount) || totalAmount <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid booking amount'
//       });
//     }
//     console.log('💳 Processing wallet payment:', {
//       bookingId,
//       amount: totalAmount,
//       userId
//     });
//     // Pay from wallet
//     const result = await WalletService.payFromWallet(userId, totalAmount, bookingId);
    
//     // Update booking
//     booking.status = 'paid_escrow';
//     booking.payment = {
//       paystackRef: result.transaction.reference,
//       escrowStatus: 'held',
//       escrowAmount: booking.agreedPrice,
//       paidAt: new Date()
//     };
//     await booking.save();
    
//     // Record in wallet (escrow for provider)
//     await WalletService.recordPayment(
//       userId,
//       booking.providerId,
//       booking._id,
//       {
//         agreedPrice: booking.agreedPrice,
//         serviceFee: booking.serviceFee,
//         totalAmount
//       }
//     );
    
//     return res.status(200).json({
//       success: true,
//       message: 'Payment successful from wallet',
//       data: {
//         booking,
//         // newWalletBalance: result.wallet.balance.available
//         transaction: result.transaction,
//         walletBalance: {
//           available: result.wallet.balance.available,
//           pending: result.wallet.balance.pending,
//           total: result.wallet.balance.total
//         }
//       }
//     });
    
//   } catch (error) {
//     console.error('Pay from wallet error:', error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to process wallet payment',
//       error: error.message
//     });
//   }
// }

async payFromWallet(req, res) {
  try {
    const userId = req.user.id;
    const { bookingId } = req.body;
    
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }
    
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    if (booking.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }
    
    // ✅ Ensure we're getting a valid number
    const totalAmount = parseFloat(booking.totalAmount || booking.agreedPrice || booking.budget);
    
    if (isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking amount'
      });
    }
    
    console.log('💳 Processing wallet payment:', {
      bookingId,
      amount: totalAmount,
      userId
    });
    
    // Pay from wallet (moves to escrow)
    const result = await WalletService.payFromWallet(userId, totalAmount, bookingId);
    
    // Update booking
    booking.status = 'paid_escrow';
    booking.payment = {
      method: 'wallet',
      paystackRef: result.transaction.reference,
      escrowStatus: 'held',
      escrowAmount: totalAmount,
      paidAt: new Date()
    };
    await booking.save();
    
    // ✅ Don't call recordPayment here - it's already handled in payFromWallet
    // The escrow is already recorded in the buyer's wallet as pending
    
    return res.status(200).json({
      success: true,
      message: 'Payment successful from wallet',
      data: {
        booking,
        transaction: result.transaction,
        walletBalance: {
          available: result.wallet.balance.available,
          pending: result.wallet.balance.pending,
          total: result.wallet.balance.total
        }
      }
    });
    
  } catch (error) {
    console.error('Pay from wallet controller error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error processing wallet payment',
      error: error.message
    });
  }
}
  /**
   * Get transaction history
   */
  // async getTransactions(req, res) {
  //   try {
  //     const userId = req.user.id;
  //     const ownerModel = req.user.role === 'provider' ? 'Provider' : 'Buyer';
  //     const { page, limit, type } = req.query;
      
  //     const result = await WalletService.getTransactionHistory(
  //       userId,
  //       ownerModel,
  //       { page: parseInt(page), limit: parseInt(limit), type }
  //     );
      
  //     return res.status(200).json({
  //       success: true,
  //       data: result.transactions,
  //       pagination: result.pagination
  //     });
  //   } catch (error) {
  //     console.error('Get transactions error:', error);
  //     return res.status(500).json({
  //       success: false,
  //       message: 'Failed to fetch transactions',
  //       error: error.message
  //     });
  //   }
  // }
  // Get transaction history
   
  // async getTransactions(req, res) {
  //   try {
  //     const providerId = req.user.providerId || req.user.id;
  //     const ownerModel = req.user.userType === 'provider' ? 'provider' : 'buyer';
  //     const { page, limit, type } = req.query;
      
  //     const result = await WalletService.getTransactionHistory(
  //       providerId,
  //       ownerModel,
  //       { page: parseInt(page), limit: parseInt(limit), type }
  //     );
      
  //     return res.status(200).json({
  //       success: true,
  //       data: result.transactions,
  //       pagination: result.pagination
  //     });
  //   } catch (error) {
  //     console.error('Get transactions error:', error);
  //     return res.status(500).json({
  //       success: false,
  //       message: 'Failed to fetch transactions',
  //       error: error.message
  //     });
  //   }
  // }
async getTransactions(req, res) {
  try {
    const userId = req.user.id;
    
    // ✅ Map to the correct model names used in your Transaction schema
    let userModel;
    if (req.user.role === 'provider') {
      userModel = 'Provider';  // Match what's in your transactions
    } else if (req.user.role === 'buyer') {
      userModel = 'Buyer';
    } else {
      userModel = 'User';
    }
    
    console.log('🔍 Fetching transactions for:', { userId, userModel });
    
    const { page, limit, type } = req.query;
    
    const result = await WalletService.getTransactionHistory(
      userId,
      userModel,
      { 
        page: parseInt(page) || 1, 
        limit: parseInt(limit) || 10, 
        type 
      }
    );
    
    console.log('📊 Found transactions:', result.transactions.length);
    
    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: result.pagination
    });
    
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
}
}
module.exports = new WalletController();