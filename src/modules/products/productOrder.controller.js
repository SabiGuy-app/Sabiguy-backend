const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('./product.model');
const ProductOrder = require('./productOrder.model');
const ProductDeliveryQuote = require('./productDeliveryQuote.model');
const Transaction = require('../transactions/transaction.model');
const Wallet = require('../wallet/Wallet.model');
const Buyer = require('../../../models/ServiceUser');
const Provider = require('../../../models/ServiceProvider');
const Business = require('../business/business.model');
const Admin = require('../admin/Admin.model');
const geolocationService = require('../../services/geolocation.service');
const pricingService = require('../../services/pricing.service');
const notificationService = require('../../services/notification.service');
const campaignService = require('../campaigns/campaign.service');
const { sendProductOrderSellerEmail, sendProductDeliveryDisputeEmail } = require('../../config/emailVerification');

const paystackBaseURL = 'https://api.paystack.co';
const PRODUCT_COMMISSION_RATE = 0.10;
const BUYER_FLAT_PLATFORM_FEE = 200;
const PRODUCT_ORDER_STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'ready_for_pickup', 'delivered', 'disputed', 'completed'];
const PLATFORM_WALLET_ID = new mongoose.Types.ObjectId('000000000000000000000001');
const paystackHeaders = () => ({ Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` });
const notify = async (method, id, data) => {
  try { await notificationService[method](id, data); }
  catch (error) { console.error('Product order notification failed:', error.message); }
};
const formatOrderAmount = (amount) => `₦${Number(amount || 0).toLocaleString('en-NG')}`;
const formatOrderItems = (order) => order.items
  .map((item) => `${item.name} × ${item.quantity} (${formatOrderAmount(item.unitPrice)} each, ${formatOrderAmount(item.lineTotal)} total)`)
  .join('; ');
const getOrderNotificationData = (order) => ({
  orderId: String(order._id),
  orderNumber: order.orderNumber,
  items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
  fulfillmentType: order.fulfillmentType,
  deliveryAddress: order.fulfillmentType === 'delivery' ? order.deliveryAddress : null,
  pickupNote: order.pickupNote || null,
  subtotal: order.subtotal,
  deliveryFee: order.deliveryFee || 0,
  productCommission: order.productCommission || 0,
  buyerPlatformFee: order.buyerPlatformFee || 0,
  orderAmountExcludingBuyerPlatformFee: order.subtotal + (order.deliveryFee || 0),
  totalAmount: order.totalAmount,
  sellerPayout: order.sellerPayout ?? order.subtotal,
  currency: order.currency,
  status: order.status,
  trackingNumber: order.trackingNumber || null,
  deliveredAt: order.deliveredAt || null,
  buyerConfirmedAt: order.buyerConfirmedAt || null,
});

const notifySellerOfPaidOrder = async (orderId, sellerModel) => {
  const order = await ProductOrder.findById(orderId).lean();
  if (!order) return;
  const Seller = sellerModel === 'Business' ? Business : Provider;
  const [seller, buyer] = await Promise.all([
    Seller.findById(order.seller).select('fullName BusinessName email').lean(),
    Buyer.findById(order.buyer).select('fullName phoneNumber city address').lean(),
  ]);
  if (!seller) return;

  const buyerName = buyer?.fullName || 'A SabiGuy customer';
  const deliveryAddress = order.deliveryAddress || {};
  const itemSummary = formatOrderItems(order);
  const sellerOrderAmount = order.subtotal + (order.deliveryFee || 0);
  const dashboardUrl = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/dashboard`;
  const notifyMethod = sellerModel === 'Business' ? 'notifyBusiness' : 'notifyProvider';

  if (!order.sellerPushNotifiedAt) {
    const pushData = {
      type: 'product_order_received',
      title: 'New product order',
      message: `${buyerName} paid ${formatOrderAmount(sellerOrderAmount)} for ${itemSummary}. ${order.fulfillmentType === 'delivery' ? `Delivery: ${deliveryAddress.address || 'See order details'}; delivery fee ${formatOrderAmount(order.deliveryFee)}. Please arrange delivery with your personal rider. The delivery fee paid by the buyer is included in your order payout after delivery is confirmed.` : 'Fulfillment: Pickup. Please prepare the order for buyer pickup.'}`,
      data: {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        buyerName,
        buyerPhoneNumber: buyer?.phoneNumber || deliveryAddress.phone || null,
        items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
        fulfillmentType: order.fulfillmentType,
        deliveryAddress: order.fulfillmentType === 'delivery' ? deliveryAddress : null,
        pickupNote: order.pickupNote || null,
        subtotal: order.subtotal,
        productCommission: order.productCommission || 0,
        buyerPlatformFee: order.buyerPlatformFee || 0,
        deliveryFee: order.deliveryFee || 0,
        orderAmountExcludingBuyerPlatformFee: sellerOrderAmount,
        sellerPayout: order.sellerPayout ?? order.subtotal,
        currency: order.currency,
        sellerAction: order.fulfillmentType === 'delivery' ? 'Arrange delivery with your personal rider using the buyer-paid delivery fee.' : 'Prepare the order for buyer pickup.',
      },
    };
    try {
      await notificationService[notifyMethod](order.seller, pushData);
      await ProductOrder.updateOne({ _id: order._id, sellerPushNotifiedAt: null }, { $set: { sellerPushNotifiedAt: new Date() } });
    } catch (error) {
      console.error('Product order seller notification failed:', error.message);
    }
  }

  if (seller.email && !order.sellerEmailNotifiedAt) {
    try {
      await sendProductOrderSellerEmail(seller.email, {
        sellerName: seller.fullName || seller.BusinessName || 'Seller',
        buyerName,
        buyerPhoneNumber: buyer?.phoneNumber || deliveryAddress.phone || '',
        buyerLocation: [buyer?.city, buyer?.address].filter(Boolean).join(', ') || 'Not provided',
        orderNumber: order.orderNumber,
        items: order.items,
        fulfillmentType: order.fulfillmentType,
        deliveryAddress,
        pickupNote: order.pickupNote,
        subtotal: order.subtotal,
        productCommission: order.productCommission || 0,
        buyerPlatformFee: order.buyerPlatformFee || 0,
        deliveryFee: order.deliveryFee || 0,
        orderAmountExcludingBuyerPlatformFee: sellerOrderAmount,
        sellerPayout: order.sellerPayout ?? order.subtotal,
        purchaseTime: new Date(order.paidAt || Date.now()).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }),
        dashboardUrl,
      });
      await ProductOrder.updateOne({ _id: order._id, sellerEmailNotifiedAt: null }, { $set: { sellerEmailNotifiedAt: new Date() } });
    } catch (error) {
      console.error('Product order seller email failed:', error.message);
    }
  }
};

const createDeliveryQuote = async (req, res) => {
  try {
    const { productId, destination, modeOfDelivery = 'Bike' } = req.body || {};
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: 'A valid productId is required' });
    }
    if (!['Bike', 'Car'].includes(modeOfDelivery)) {
      return res.status(400).json({ success: false, message: 'modeOfDelivery must be Bike or Car' });
    }
    const latitude = Number(destination?.latitude);
    const longitude = Number(destination?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, message: 'Valid destination latitude and longitude are required' });
    }

    const product = await Product.findOne({ _id: productId, status: 'approved' }).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Approved product not found' });
    const Seller = product.ownerModel === 'Provider' ? Provider : Business;
    const seller = await Seller.findById(product.owner).select('currentLocation').lean();
    const pickupCoordinates = seller?.currentLocation?.coordinates;
    if (
      !Array.isArray(pickupCoordinates) ||
      pickupCoordinates.length !== 2 ||
      pickupCoordinates.some((coordinate) => !Number.isFinite(Number(coordinate))) ||
      Number(pickupCoordinates[0]) < -180 || Number(pickupCoordinates[0]) > 180 ||
      Number(pickupCoordinates[1]) < -90 || Number(pickupCoordinates[1]) > 90
    ) {
      return res.status(409).json({ success: false, message: 'Seller pickup location is not available for delivery quotes' });
    }

    const directions = await geolocationService.getDirections(
      pickupCoordinates.map(Number),
      [longitude, latitude],
      'driving',
    );
    let distanceKm = Number(directions.distance?.value);
    let durationMinutes = Number(directions.duration?.value);
    let isEstimate = Boolean(directions.isEstimate);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      // Directions may fail or return an empty leg. Fall back to the same
      // straight-line distance estimate used by the geolocation service.
      distanceKm = geolocationService.calculateDistance(
        Number(pickupCoordinates[1]),
        Number(pickupCoordinates[0]),
        latitude,
        longitude,
      );
      isEstimate = true;
    }
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      return res.status(502).json({ success: false, message: 'Could not calculate a delivery distance from the seller and destination coordinates' });
    }
    // The pricing minimum fare handles short trips; use a minimum 1 minute
    // duration so same-location/nearby addresses can still receive a quote.
    distanceKm = Math.max(distanceKm, 0.01);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      durationMinutes = Math.max(1, Math.ceil(distanceKm * 2));
      isEstimate = true;
    }

    const pricing = pricingService.calculateTransportPrice(
      distanceKm,
      'product_delivery',
      'product_delivery',
      durationMinutes,
      null,
      modeOfDelivery === 'Bike',
    );
    // Booking transport pricing adds the 5% user platform fee (and tax) after
    // its fare subtotal. Product delivery quotes expose only that fare subtotal.
    const deliveryFee = Number(pricing.breakdown.subtotal);
    const quote = await ProductDeliveryQuote.create({
      buyer: req.user.id,
      product: product._id,
      seller: product.owner,
      sellerModel: product.ownerModel,
      pickup: {
        address: seller.currentLocation.address || null,
        coordinates: pickupCoordinates.map(Number),
      },
      dropoff: {
        address: typeof destination.address === 'string' ? destination.address.trim() : null,
        coordinates: [longitude, latitude],
      },
      modeOfDelivery,
      distanceKm,
      durationMinutes,
      isEstimate,
      deliveryFee,
      currency: 'NGN',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    return res.status(200).json({
      success: true,
      message: 'Delivery quote calculated',
      data: {
        quoteId: quote._id,
        productId: product._id,
        sellerId: product.owner,
        modeOfDelivery,
        pickup: {
          coordinates: quote.pickup.coordinates,
          ...(quote.pickup.address ? { address: quote.pickup.address } : {}),
        },
        deliveryAddress: {
          coordinates: quote.dropoff.coordinates,
          ...(quote.dropoff.address ? { address: quote.dropoff.address } : {}),
        },
        distance: { value: distanceKm, unit: 'km', isEstimate: quote.isEstimate },
        duration: { value: durationMinutes, unit: 'minutes', isEstimate: quote.isEstimate },
        deliveryFee,
        currency: 'NGN',
        expiresAt: quote.expiresAt,
      },
    });
  } catch (error) {
    console.error('Product delivery quote error:', error);
    return res.status(500).json({ success: false, message: 'Failed to calculate delivery quote' });
  }
};

const getCatalog = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { status: 'approved' };
    if (['provider', 'business'].includes(req.query.ownerType)) filter.ownerType = req.query.ownerType;
    if (req.query.search) filter.name = { $regex: String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [products, total] = await Promise.all([
      Product.find(filter).populate('owner', 'fullName BusinessName profilePicture').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, data: products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    console.error('Product catalog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch product catalog' });
  }
};

const createCheckout = async (req, res) => {
  let order;
  let claimedQuoteId = null;
  try {
    const { items, fulfillmentType, deliveryDetails, pickupNote, quoteId } = req.body || {};
    const paymentMethod = req.body?.paymentMethod || 'paystack';
    if (!['paystack', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'paymentMethod must be paystack or wallet' });
    }
    if (!Array.isArray(items) || !items.length || items.length > 30) {
      return res.status(400).json({ success: false, message: 'Provide between 1 and 30 product items' });
    }
    if (!['delivery', 'pickup'].includes(fulfillmentType)) {
      return res.status(400).json({ success: false, message: 'fulfillmentType must be delivery or pickup' });
    }
    if (fulfillmentType === 'delivery' && !mongoose.isValidObjectId(quoteId)) {
      return res.status(400).json({ success: false, message: 'quoteId is required for delivery orders' });
    }
    if (fulfillmentType === 'pickup' && quoteId) {
      return res.status(400).json({ success: false, message: 'quoteId is not used for pickup orders' });
    }
    if (fulfillmentType === 'delivery' && (!deliveryDetails || typeof deliveryDetails.phone !== 'string' || !deliveryDetails.phone.trim())) {
      return res.status(400).json({ success: false, message: 'Delivery requires deliveryDetails.phone and a valid quoteId' });
    }

    const quantities = new Map();
    for (const item of items) {
      if (!mongoose.isValidObjectId(item?.productId)) return res.status(400).json({ success: false, message: 'Each item needs a valid productId' });
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return res.status(400).json({ success: false, message: 'Each quantity must be an integer from 1 to 100' });
      quantities.set(String(item.productId), (quantities.get(String(item.productId)) || 0) + quantity);
    }
    const products = await Product.find({ _id: { $in: [...quantities.keys()] }, status: 'approved' }).lean();
    if (products.length !== quantities.size) return res.status(400).json({ success: false, message: 'One or more products are unavailable' });
    const unavailableStock = products.find((product) => Number(product.quantity || 0) < quantities.get(String(product._id)));
    if (unavailableStock) {
      return res.status(409).json({ success: false, message: `Insufficient stock for ${unavailableStock.name}`, data: { productId: unavailableStock._id, available: unavailableStock.quantity || 0, requested: quantities.get(String(unavailableStock._id)) } });
    }
    const first = products[0];
    if (products.some((product) => String(product.owner) !== String(first.owner) || product.ownerType !== first.ownerType || product.currency !== 'NGN')) {
      return res.status(400).json({ success: false, message: 'An order must contain NGN products from one seller' });
    }
    let deliveryQuote = null;
    if (fulfillmentType === 'delivery') {
      deliveryQuote = await ProductDeliveryQuote.findOne({
        _id: quoteId,
        buyer: req.user.id,
        seller: first.owner,
        sellerModel: first.ownerModel,
        expiresAt: { $gt: new Date() },
        usedAt: null,
      }).lean();
      if (!deliveryQuote) {
        return res.status(400).json({ success: false, message: 'Delivery quote is invalid, expired, already used, or belongs to another seller' });
      }
      if (!quantities.has(String(deliveryQuote.product))) {
        return res.status(400).json({ success: false, message: 'The product used for the delivery quote must be included in the order' });
      }
    }
    const orderItems = products.map((product) => {
      const quantity = quantities.get(String(product._id));
      return { product: product._id, name: product.name, productImage: product.productImage || null, quantity, unitPrice: product.price, lineTotal: product.price * quantity };
    });
    const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    if (!Number.isFinite(subtotal) || subtotal <= 0) return res.status(400).json({ success: false, message: 'Order total must be greater than zero' });
    const deliveryFee = deliveryQuote?.deliveryFee || 0;
    const productCommission = Math.round(subtotal * PRODUCT_COMMISSION_RATE);
    const buyerPlatformFee = BUYER_FLAT_PLATFORM_FEE;
    const platformFee = productCommission + buyerPlatformFee;
    const sellerPayout = subtotal - productCommission + deliveryFee;
    // The 10% commission is withheld from the seller's item proceeds; only
    // the flat buyer platform fee is added on top of the item and delivery fees.
    const totalAmount = subtotal + deliveryFee + buyerPlatformFee;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return res.status(400).json({ success: false, message: 'Order total must be greater than zero' });

    const buyer = await Buyer.findById(req.user.id).select('email fullName');
    if (!buyer || (paymentMethod === 'paystack' && !buyer.email)) return res.status(400).json({ success: false, message: 'A buyer email is required for Paystack checkout' });
    const paymentReference = `PRD_${Date.now()}_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    order = await ProductOrder.create({
      orderNumber: `SGP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      buyer: buyer._id,
      seller: first.owner,
      sellerModel: first.ownerModel,
      sellerType: first.ownerType,
      items: orderItems,
      fulfillmentType,
      deliveryQuote: deliveryQuote?._id || null,
      deliveryAddress: fulfillmentType === 'delivery' ? {
        recipientName: typeof deliveryDetails.recipientName === 'string' ? deliveryDetails.recipientName.trim() : null,
        phone: deliveryDetails.phone.trim(),
        instructions: typeof deliveryDetails.instructions === 'string' ? deliveryDetails.instructions.trim() : null,
        address: deliveryQuote.dropoff.address || null,
        coordinates: deliveryQuote.dropoff.coordinates,
      } : undefined,
      pickupNote: fulfillmentType === 'pickup' && typeof pickupNote === 'string' ? pickupNote.trim() : undefined,
      subtotal,
      deliveryFee,
      productCommission,
      buyerPlatformFee,
      platformFee,
      sellerPayout,
      totalAmount,
      currency: 'NGN',
      paymentReference,
      paymentMethod,
    });

    if (deliveryQuote) {
      const claimedQuote = await ProductDeliveryQuote.findOneAndUpdate(
        { _id: deliveryQuote._id, buyer: req.user.id, usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { new: true },
      );
      if (!claimedQuote) {
        await ProductOrder.deleteOne({ _id: order._id });
        order = null;
        return res.status(409).json({ success: false, message: 'Delivery quote has expired or has already been used' });
      }
      claimedQuoteId = deliveryQuote._id;
    }

    let payment = null;
    if (paymentMethod === 'paystack') {
      const paymentResponse = await axios.post(`${paystackBaseURL}/transaction/initialize`, {
        email: buyer.email,
        amount: Math.round(totalAmount * 100),
        currency: 'NGN',
        reference: paymentReference,
        callback_url: `${process.env.FRONTEND_URL}/product-orders/callback`,
        metadata: {
          type: 'product_order', orderId: String(order._id), orderNumber: order.orderNumber,
          buyerId: String(buyer._id), sellerId: String(first.owner), sellerModel: first.ownerModel,
          productSubtotal: subtotal, deliveryFee, productCommission, buyerPlatformFee, platformFee, sellerPayout,
          custom_fields: [{ display_name: 'Order Number', variable_name: 'order_number', value: order.orderNumber }],
        },
      }, { headers: { ...paystackHeaders(), 'Content-Type': 'application/json' } });
      if (!paymentResponse.data?.status) throw new Error('Paystack did not initialize this payment');
      payment = paymentResponse.data.data;
    }
    return res.status(201).json({
      success: true,
      message: paymentMethod === 'wallet'
        ? 'Product order created; pay from your wallet using the returned order ID'
        : 'Product order created; complete payment to confirm it',
      data: {
        orderId: String(order._id),
        order,
        deliveryQuote: deliveryQuote ? {
          quoteId: deliveryQuote._id,
          productId: deliveryQuote.product,
          sellerId: deliveryQuote.seller,
          modeOfDelivery: deliveryQuote.modeOfDelivery,
          pickup: deliveryQuote.pickup,
          deliveryAddress: {
            ...deliveryQuote.dropoff,
            recipientName: order.deliveryAddress.recipientName,
            phone: order.deliveryAddress.phone,
            instructions: order.deliveryAddress.instructions,
          },
          distance: { value: deliveryQuote.distanceKm, unit: 'km', isEstimate: deliveryQuote.isEstimate },
          duration: { value: deliveryQuote.durationMinutes, unit: 'minutes', isEstimate: deliveryQuote.isEstimate },
          deliveryFee: deliveryQuote.deliveryFee,
          currency: deliveryQuote.currency,
          expiresAt: deliveryQuote.expiresAt,
        } : null,
        paymentMethod,
        authorizationUrl: payment?.authorization_url || null,
        accessCode: payment?.access_code || null,
        reference: payment?.reference || null,
        productSubtotal: subtotal,
        deliveryFee,
        productCommission,
        buyerPlatformFee,
        platformFee,
        sellerPayout,
        totalAmount,
      },
    });
  } catch (error) {
    if (order?._id) await ProductOrder.deleteOne({ _id: order._id, status: 'pending_payment' }).catch(() => {});
    if (claimedQuoteId) await ProductDeliveryQuote.updateOne({ _id: claimedQuoteId, usedAt: { $ne: null } }, { $set: { usedAt: null } }).catch(() => {});
    console.error('Product checkout error:', error.response?.data || error);
    return res.status(500).json({ success: false, message: error.response?.data?.message || error.message || 'Failed to initialize product checkout' });
  }
};

const verifyCheckout = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  const session = await mongoose.startSession();
  try {
    const order = await ProductOrder.findOne({ _id: id, buyer: req.user.id }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if ((order.paymentMethod || 'paystack') !== 'paystack') return res.status(409).json({ success: false, message: 'This order was created for wallet payment; use the pay-from-wallet endpoint' });
    if (order.status !== 'pending_payment') {
      if (order.paidAt) await notifySellerOfPaidOrder(order._id, order.sellerModel);
      return res.status(200).json({ success: true, message: 'Order payment already verified', data: order });
    }
    const verified = await axios.get(`${paystackBaseURL}/transaction/verify/${encodeURIComponent(order.paymentReference)}`, { headers: paystackHeaders() });
    const payment = verified.data?.data;
    const payableTotal = Number(order.totalAmount ?? (order.subtotal + (order.deliveryFee || 0)));
    if (!verified.data?.status || payment?.status !== 'success' || Number(payment.amount) !== Math.round(payableTotal * 100) || payment.currency !== order.currency || payment.reference !== order.paymentReference || String(payment.metadata?.orderId) !== String(order._id)) {
      return res.status(400).json({ success: false, message: 'Payment is not successful or does not match this order' });
    }

    await session.withTransaction(async () => {
      const updated = await ProductOrder.findOneAndUpdate({ _id: order._id, status: 'pending_payment' }, { $set: { status: 'paid', paidAt: new Date(), paymentMethod: 'paystack' } }, { new: true, session });
      if (!updated) return;
      for (const item of order.items) {
        const inventoryUpdate = await Product.updateOne(
          { _id: item.product, status: 'approved', quantity: { $gte: item.quantity } },
          { $inc: { quantity: -item.quantity } },
          { session },
        );
        if (inventoryUpdate.modifiedCount !== 1) {
          const stockError = new Error(`Insufficient stock for ${item.name}; payment was received but inventory could not be committed`);
          stockError.code = 'PRODUCT_STOCK_UNAVAILABLE';
          throw stockError;
        }
      }
      const sellerPayout = Number(order.sellerPayout ?? order.subtotal);
      const platformFee = Number(order.platformFee || 0);
      const sellerWallet = await Wallet.findOneAndUpdate(
        { ownerId: order.seller, ownerModel: order.sellerModel },
        { $inc: { 'balance.pending': sellerPayout, 'balance.total': sellerPayout }, $set: { lastTransactionAt: new Date() }, $setOnInsert: { currency: order.currency } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session },
      );
      let platformWallet = null;
      if (platformFee > 0) {
        platformWallet = await Wallet.findOneAndUpdate(
          { ownerId: PLATFORM_WALLET_ID, ownerModel: 'Platform' },
          { $inc: { 'balance.available': platformFee, 'balance.total': platformFee }, $set: { lastTransactionAt: new Date() }, $setOnInsert: { currency: order.currency } },
          { new: true, upsert: true, setDefaultsOnInsert: true, session },
        );
      }
      await Transaction.create([{
        reference: order.paymentReference,
        type: 'payment',
        from: { userId: order.buyer, userModel: 'Buyer' },
        to: { userId: PLATFORM_WALLET_ID, userModel: 'Platform', ...(platformWallet ? { walletId: platformWallet._id } : {}) },
        amount: order.totalAmount,
        breakdown: {
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          productCommission: order.productCommission || 0,
          buyerPlatformFee: order.buyerPlatformFee || 0,
          platformFee,
          sellerPayout,
          totalAmount: order.totalAmount,
          currency: order.currency,
        },
        productOrderId: order._id,
        gateway: { name: 'paystack', reference: order.paymentReference, response: payment },
        status: 'completed',
        description: `Payment for product order ${order.orderNumber}`,
        completedAt: new Date(),
        metadata: { type: 'product_order', orderNumber: order.orderNumber, escrowStatus: 'held' },
      }], { session, ordered: true });
      await Transaction.create([{
        reference: `PESC_${order._id}`,
        type: 'escrow_hold',
        from: { userId: PLATFORM_WALLET_ID, userModel: 'Platform' },
        to: { userId: order.seller, userModel: order.sellerModel, walletId: sellerWallet._id },
        amount: sellerPayout,
        breakdown: { productSubtotal: order.subtotal, productCommission: order.productCommission || 0, deliveryFee: order.deliveryFee || 0, sellerPayout },
        productOrderId: order._id,
        status: 'completed',
        description: `Seller proceeds held for product order ${order.orderNumber}`,
        completedAt: new Date(),
        metadata: { type: 'product_order', orderNumber: order.orderNumber },
      }], { session, ordered: true });
      if (platformFee > 0) {
        const platformTransactions = [];
        if (order.productCommission > 0) platformTransactions.push({
          reference: `PCOM_${order._id}`,
          type: 'commission',
          from: { userId: order.seller, userModel: order.sellerModel },
          to: { userId: PLATFORM_WALLET_ID, userModel: 'Platform', walletId: platformWallet._id },
          amount: order.productCommission,
          productOrderId: order._id,
          status: 'completed',
          description: `10% product commission for order ${order.orderNumber}`,
          completedAt: new Date(),
          metadata: { type: 'product_order', orderNumber: order.orderNumber },
        });
        if (order.buyerPlatformFee > 0) platformTransactions.push({
          reference: `PFLAT_${order._id}`,
          type: 'platform_fee',
          from: { userId: order.buyer, userModel: 'Buyer' },
          to: { userId: PLATFORM_WALLET_ID, userModel: 'Platform', walletId: platformWallet._id },
          amount: order.buyerPlatformFee,
          productOrderId: order._id,
          status: 'completed',
          description: `Flat buyer platform fee for product order ${order.orderNumber}`,
          completedAt: new Date(),
          metadata: { type: 'product_order', orderNumber: order.orderNumber },
        });
        if (platformTransactions.length) await Transaction.create(platformTransactions, { session, ordered: true });
      }
    });
    const paidOrder = await ProductOrder.findById(order._id).lean();
    const buyerFulfillmentDetails = order.fulfillmentType === 'delivery'
      ? `Delivery to ${order.deliveryAddress?.address || 'the address in your order'}; delivery fee ${formatOrderAmount(order.deliveryFee)}.`
      : `Pickup${order.pickupNote ? `: ${order.pickupNote}` : ''}.`;
    await notify('notifyUser', order.buyer, {
      type: 'product_order_paid',
      title: 'Product order paid',
      message: `Payment confirmed for ${order.orderNumber}. Items: ${formatOrderItems(order)}. Item subtotal: ${formatOrderAmount(order.subtotal)}; ${buyerFulfillmentDetails} Total paid, including the ₦200 buyer platform fee: ${formatOrderAmount(order.totalAmount)}. The seller will prepare your order.`,
      data: { ...getOrderNotificationData(paidOrder || order), paidAt: paidOrder?.paidAt || new Date() },
    });
    await notifySellerOfPaidOrder(order._id, order.sellerModel);
    return res.status(200).json({ success: true, message: 'Product order payment verified', data: paidOrder });
  } catch (error) {
    console.error('Product payment verification error:', error.response?.data || error);
    if (error.code === 'PRODUCT_STOCK_UNAVAILABLE') {
      return res.status(409).json({ success: false, message: error.message, resolution: 'Contact support to arrange a refund or restock before retrying verification.' });
    }
    return res.status(500).json({ success: false, message: error.response?.data?.message || 'Failed to verify product payment' });
  } finally {
    await session.endSession();
  }
};

const payProductOrderFromWallet = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  const session = await mongoose.startSession();
  let paidOrder;
  let buyerWalletAfter;
  try {
    const order = await ProductOrder.findOne({ _id: id, buyer: req.user.id }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.paymentMethod !== 'wallet') return res.status(409).json({ success: false, message: 'This order was not created for wallet payment; create a wallet-payment order at checkout' });
    if (order.status !== 'pending_payment') {
      if (order.paidAt) return res.status(200).json({ success: true, message: 'Order has already been paid', data: order });
      return res.status(409).json({ success: false, message: 'This order is not awaiting payment' });
    }
    const totalAmount = Number(order.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid order amount' });

    await session.withTransaction(async () => {
      const paymentTime = new Date();
      const updatedOrder = await ProductOrder.findOneAndUpdate(
        { _id: order._id, buyer: req.user.id, status: 'pending_payment' },
        { $set: { status: 'paid', paidAt: paymentTime, paymentMethod: 'wallet' } },
        { new: true, session },
      );
      if (!updatedOrder) {
        const paymentError = new Error('This order is no longer awaiting payment');
        paymentError.statusCode = 409;
        throw paymentError;
      }

      for (const item of order.items) {
        const inventoryUpdate = await Product.updateOne(
          { _id: item.product, status: 'approved', quantity: { $gte: item.quantity } },
          { $inc: { quantity: -item.quantity } },
          { session },
        );
        if (inventoryUpdate.modifiedCount !== 1) {
          const stockError = new Error(`Insufficient stock for ${item.name}`);
          stockError.statusCode = 409;
          stockError.code = 'PRODUCT_STOCK_UNAVAILABLE';
          throw stockError;
        }
      }

      const buyerWallet = await Wallet.findOne({ ownerId: order.buyer, ownerModel: 'Buyer' }).session(session);
      const available = Number(buyerWallet?.balance?.available || 0);
      const walletUnavailable = Boolean(buyerWallet && buyerWallet.status !== 'active');
      if (!buyerWallet || walletUnavailable) {
        const walletError = new Error('Your wallet is not available for payments');
        walletError.statusCode = walletUnavailable ? 403 : 400;
        walletError.code = 'WALLET_UNAVAILABLE';
        throw walletError;
      }

      const promotionalCredit = await campaignService.consumeCredits(
        order.buyer,
        totalAmount,
        order._id,
        { session },
      );
      const walletCharge = promotionalCredit.cashAmount;
      if (available < walletCharge) {
        const shortfallAmount = walletCharge - available;
        const message = promotionalCredit.applied > 0
          ? `Your NGN${promotionalCredit.applied.toLocaleString()} promotional credit will remain available. Add NGN${shortfallAmount.toLocaleString()} to your wallet to complete this order.`
          : `Add NGN${shortfallAmount.toLocaleString()} to your wallet to complete this order.`;
        const walletError = new Error(message);
        walletError.statusCode = 400;
        walletError.code = 'INSUFFICIENT_WALLET_BALANCE';
        walletError.details = {
          totalAmount,
          amountDueAfterPromo: walletCharge,
          walletAvailable: available,
          shortfallAmount,
          promotionalCreditApplied: promotionalCredit.applied,
        };
        throw walletError;
      }

      const buyerBalanceBefore = {
        available: buyerWallet.balance.available,
        pending: buyerWallet.balance.pending,
        total: buyerWallet.balance.total,
      };
      const debitedWallet = await Wallet.findOneAndUpdate(
        { _id: buyerWallet._id, status: 'active', 'balance.available': { $gte: walletCharge } },
        { $inc: { 'balance.available': -walletCharge, 'balance.total': -walletCharge }, $set: { lastTransactionAt: paymentTime } },
        { new: true, session },
      );
      if (!debitedWallet) {
        const walletError = new Error('Wallet balance changed during payment. Please try again.');
        walletError.statusCode = 409;
        walletError.code = 'WALLET_BALANCE_CHANGED';
        throw walletError;
      }
      buyerWalletAfter = {
        available: debitedWallet.balance.available,
        pending: debitedWallet.balance.pending,
        total: debitedWallet.balance.total,
      };

      const sellerPayout = Number(order.sellerPayout ?? order.subtotal);
      const platformFee = Number(order.platformFee || 0);
      const sellerWallet = await Wallet.findOneAndUpdate(
        { ownerId: order.seller, ownerModel: order.sellerModel },
        { $inc: { 'balance.pending': sellerPayout, 'balance.total': sellerPayout }, $set: { lastTransactionAt: paymentTime }, $setOnInsert: { currency: order.currency } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session },
      );
      let platformWallet = null;
      if (platformFee > 0) {
        platformWallet = await Wallet.findOneAndUpdate(
          { ownerId: PLATFORM_WALLET_ID, ownerModel: 'Platform' },
          { $inc: { 'balance.available': platformFee, 'balance.total': platformFee }, $set: { lastTransactionAt: paymentTime }, $setOnInsert: { currency: order.currency } },
          { new: true, upsert: true, setDefaultsOnInsert: true, session },
        );
      }

      const paymentReference = `WPAY_PRD_${order._id}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
      await Transaction.create([{
        reference: paymentReference,
        type: 'payment',
        from: { userId: order.buyer, userModel: 'Buyer', walletId: buyerWallet._id },
        to: { userId: PLATFORM_WALLET_ID, userModel: 'Platform', ...(platformWallet ? { walletId: platformWallet._id } : {}) },
        amount: totalAmount,
        breakdown: { subtotal: order.subtotal, deliveryFee: order.deliveryFee || 0, productCommission: order.productCommission || 0, buyerPlatformFee: order.buyerPlatformFee || 0, platformFee, sellerPayout, totalAmount, promotionalCreditApplied: promotionalCredit.applied, cashPaidFromWallet: walletCharge, promotionalCreditRedemptions: promotionalCredit.redemptions, currency: order.currency },
        balances: { before: buyerBalanceBefore, after: buyerWalletAfter },
        productOrderId: order._id,
        gateway: { name: 'internal', reference: paymentReference },
        status: 'completed',
        description: `Wallet payment for product order ${order.orderNumber}`,
        paidAt: paymentTime,
        completedAt: paymentTime,
        metadata: { type: 'product_order', orderNumber: order.orderNumber, paymentMethod: 'wallet', escrowStatus: 'held', promotionalCreditApplied: promotionalCredit.applied, cashPaidFromWallet: walletCharge, promotionalCreditRedemptions: promotionalCredit.redemptions },
      }], { session, ordered: true });
      await Transaction.create([{
        reference: `PESC_${order._id}`,
        type: 'escrow_hold',
        from: { userId: PLATFORM_WALLET_ID, userModel: 'Platform' },
        to: { userId: order.seller, userModel: order.sellerModel, walletId: sellerWallet._id },
        amount: sellerPayout,
        breakdown: { productSubtotal: order.subtotal, productCommission: order.productCommission || 0, deliveryFee: order.deliveryFee || 0, sellerPayout },
        productOrderId: order._id,
        status: 'completed',
        description: `Seller proceeds held for product order ${order.orderNumber}`,
        completedAt: paymentTime,
        metadata: { type: 'product_order', orderNumber: order.orderNumber },
      }], { session, ordered: true });
      const platformTransactions = [];
      if (order.productCommission > 0) platformTransactions.push({
        reference: `PCOM_${order._id}`,
        type: 'commission',
        from: { userId: order.seller, userModel: order.sellerModel },
        to: { userId: PLATFORM_WALLET_ID, userModel: 'Platform', walletId: platformWallet._id },
        amount: order.productCommission,
        productOrderId: order._id,
        status: 'completed',
        description: `10% product commission for order ${order.orderNumber}`,
        completedAt: paymentTime,
        metadata: { type: 'product_order', orderNumber: order.orderNumber },
      });
      if (order.buyerPlatformFee > 0) platformTransactions.push({
        reference: `PFLAT_${order._id}`,
        type: 'platform_fee',
        from: { userId: order.buyer, userModel: 'Buyer' },
        to: { userId: PLATFORM_WALLET_ID, userModel: 'Platform', walletId: platformWallet._id },
        amount: order.buyerPlatformFee,
        productOrderId: order._id,
        status: 'completed',
        description: `Flat buyer platform fee for product order ${order.orderNumber}`,
        completedAt: paymentTime,
        metadata: { type: 'product_order', orderNumber: order.orderNumber },
      });
      if (platformTransactions.length) await Transaction.create(platformTransactions, { session, ordered: true });
    });

    paidOrder = await ProductOrder.findById(order._id).lean();
    await notify('notifyUser', order.buyer, {
      type: 'product_order_paid',
      title: 'Product order paid',
      message: `Wallet payment confirmed for ${order.orderNumber}. Items: ${formatOrderItems(order)}. Total paid: ${formatOrderAmount(order.totalAmount)}. The seller will prepare your order.`,
      data: { ...getOrderNotificationData(paidOrder || order), paidAt: paidOrder?.paidAt || new Date(), paymentMethod: 'wallet' },
    });
    await notifySellerOfPaidOrder(order._id, order.sellerModel);
    const buyerWallet = await Wallet.findOne({ ownerId: order.buyer, ownerModel: 'Buyer' }).lean();
    return res.status(200).json({
      success: true,
      message: 'Product order paid from wallet; seller funds are held until delivery or pickup is confirmed',
      data: { order: paidOrder, walletBalance: buyerWalletAfter || buyerWallet?.balance },
    });
  } catch (error) {
    console.error('Product order wallet payment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to pay for product order from wallet',
      ...(error.code ? { code: error.code } : {}),
      ...(error.details ? { data: error.details } : {}),
    });
  } finally {
    await session.endSession();
  }
};

const getMyOrders = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    if (status && !PRODUCT_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${PRODUCT_ORDER_STATUSES.join(', ')}` });
    }
    const filter = req.user.role === 'buyer'
      ? { buyer: req.user.id }
      : { seller: req.user.id, status: { $ne: 'pending_payment' } };
    if (status) {
      if (req.user.role === 'buyer') {
        filter.status = status;
      } else {
        delete filter.status;
        filter.$and = [{ status: { $ne: 'pending_payment' } }, { status }];
      }
    }
    const [orders, total] = await Promise.all([
      ProductOrder.find(filter).populate('buyer', 'fullName email').populate('seller', 'fullName BusinessName').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ProductOrder.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    console.error('List product orders error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch product orders' });
  }
};

const getAllOrdersForAdmin = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    if (status && !PRODUCT_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${PRODUCT_ORDER_STATUSES.join(', ')}` });
    }
    const filter = status ? { status } : {};
    const [orders, total] = await Promise.all([
      ProductOrder.find(filter)
        .populate('buyer', 'fullName email phoneNumber')
        .populate('seller', 'fullName BusinessName email phoneNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ProductOrder.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    console.error('Admin product order list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch product orders' });
  }
};

const updateFulfillment = async (req, res) => {
  const { id } = req.params;
  const { status, trackingNumber, note } = req.body || {};
  const allowed = ['processing', 'shipped', 'delivered', 'ready_for_pickup'];
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  if (!allowed.includes(status)) return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
  try {
    const order = await ProductOrder.findOne({ _id: id, seller: req.user.id, sellerModel: req.user.role === 'provider' ? 'Provider' : 'Business' });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const validNext = order.status === 'paid' && status === 'processing'
      || order.status === 'processing' && (status === 'shipped' || status === 'ready_for_pickup')
      || order.status === 'shipped' && status === 'delivered';
    if (!validNext || (['shipped', 'delivered'].includes(status) && order.fulfillmentType !== 'delivery') || (status === 'ready_for_pickup' && order.fulfillmentType !== 'pickup')) {
      return res.status(409).json({ success: false, message: 'This fulfillment status is not valid for the order' });
    }
    order.status = status;
    if (status === 'shipped' && typeof trackingNumber === 'string') order.set('trackingNumber', trackingNumber.trim());
    if (status === 'delivered') order.set('deliveredAt', new Date());
    if (typeof note === 'string' && note.trim()) order.set('sellerNote', note.trim());
    await order.save();
    const message = status === 'shipped'
      ? `Order ${order.orderNumber} has shipped${trackingNumber ? ` (tracking: ${trackingNumber})` : ''}. The seller will mark it delivered when it reaches you.`
      : status === 'delivered'
        ? `The seller marked order ${order.orderNumber} as delivered. Please confirm delivery in the app to release payment.`
        : status === 'ready_for_pickup'
          ? `Order ${order.orderNumber} is ready for pickup.`
          : `Order ${order.orderNumber} is being prepared.`;
    const fulfillmentDetails = order.fulfillmentType === 'delivery'
      ? `Delivery address: ${order.deliveryAddress?.address || 'See order details'}; delivery fee: ${formatOrderAmount(order.deliveryFee)}.`
      : `Pickup${order.pickupNote ? ` note: ${order.pickupNote}` : ''}.`;
    const detailedMessage = `${message} Items: ${formatOrderItems(order)}. Item subtotal: ${formatOrderAmount(order.subtotal)}; ${fulfillmentDetails} Total paid, including the buyer platform fee: ${formatOrderAmount(order.totalAmount)}.`;
    await notify('notifyUser', order.buyer, {
      type: status === 'delivered' ? 'product_order_delivered' : 'product_order_updated',
      title: status === 'delivered' ? 'Seller marked order delivered' : status === 'ready_for_pickup' ? 'Order ready for pickup' : 'Product order update',
      message: detailedMessage,
      data: getOrderNotificationData(order.toObject()),
    });
    return res.status(200).json({ success: true, message: 'Order fulfillment updated', data: order });
  } catch (error) {
    console.error('Product fulfillment update error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update order fulfillment' });
  }
};

const disputeDelivery = async (req, res) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  if (!reason) return res.status(400).json({ success: false, message: 'reason is required' });
  if (reason.length > 2000) return res.status(400).json({ success: false, message: 'reason must be 2000 characters or fewer' });

  try {
    let order = await ProductOrder.findOne({ _id: id, buyer: req.user.id }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.fulfillmentType !== 'delivery') return res.status(409).json({ success: false, message: 'This endpoint is only for delivery orders' });

    const alreadyDisputed = order.status === 'disputed';
    if (alreadyDisputed) {
      if (String(order.disputeRaisedBy) !== String(req.user.id) || order.disputeReason !== reason) {
        return res.status(409).json({ success: false, message: 'A dispute has already been filed for this order' });
      }
      if (order.disputeAdminEmailSentAt) {
        return res.status(200).json({ success: true, message: 'Delivery dispute was already submitted', data: { orderId: order._id, orderNumber: order.orderNumber, status: order.status, disputeRaisedAt: order.disputeRaisedAt, adminEmailsSent: true } });
      }
    } else {
      if (order.status !== 'delivered' || order.buyerConfirmedAt || order.escrowReleasedAt) {
        return res.status(409).json({ success: false, message: 'You can dispute delivery after the seller marks the order delivered and before confirming it' });
      }
      order = await ProductOrder.findOneAndUpdate(
        { _id: order._id, buyer: req.user.id, status: 'delivered', buyerConfirmedAt: null, escrowReleasedAt: null, disputeRaisedAt: null },
        { $set: { status: 'disputed', disputeRaisedAt: new Date(), disputeRaisedBy: req.user.id, disputeReason: reason } },
        { new: true },
      ).lean();
      if (!order) return res.status(409).json({ success: false, message: 'Order state changed; refresh the order and try again' });
    }

    const Seller = order.sellerModel === 'Business' ? Business : Provider;
    const [buyer, seller, admins] = await Promise.all([
      Buyer.findById(order.buyer).select('fullName email phoneNumber').lean(),
      Seller.findById(order.seller).select('fullName BusinessName email phoneNumber').lean(),
      Admin.find({ adminRole: 'super_admin', emailVerified: true, isActive: { $ne: false } }).select('email fullName').lean(),
    ]);
    const emailData = {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      reason,
      buyerName: buyer?.fullName || 'Not provided',
      buyerEmail: buyer?.email || 'Not provided',
      buyerPhone: buyer?.phoneNumber || order.deliveryAddress?.phone || '',
      sellerName: seller?.fullName || seller?.BusinessName || 'Not provided',
      sellerEmail: seller?.email || 'Not provided',
      sellerType: order.sellerType,
      items: order.items,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee || 0,
      totalAmount: order.totalAmount,
      deliveryAddress: order.deliveryAddress || {},
      trackingNumber: order.trackingNumber,
      deliveredAt: order.deliveredAt ? new Date(order.deliveredAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }) : 'Not provided',
      disputeRaisedAt: new Date(order.disputeRaisedAt || Date.now()).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }),
      adminDashboardUrl: `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/admin`,
    };
    const emailResults = await Promise.allSettled(admins.map((admin) => sendProductDeliveryDisputeEmail(admin.email, emailData)));
    emailResults.forEach((result, index) => {
      if (result.status === 'rejected') console.error(`Product delivery dispute email failed for ${admins[index].email}:`, result.reason);
    });
    const adminEmailsSent = admins.length > 0 && emailResults.every((result) => result.status === 'fulfilled');
    if (adminEmailsSent) {
      await ProductOrder.updateOne({ _id: order._id, status: 'disputed', disputeAdminEmailSentAt: null }, { $set: { disputeAdminEmailSentAt: new Date() } });
    }

    await notify('notifyUser', order.buyer, {
      type: 'product_order_updated',
      title: 'Delivery dispute submitted',
      message: `Your dispute for order ${order.orderNumber} has been submitted. Our team will review it; the seller's payout remains on hold.`,
      data: { ...getOrderNotificationData(order), disputeReason: reason, disputeRaisedAt: order.disputeRaisedAt, status: 'disputed' },
    });
    const updatedOrder = await ProductOrder.findById(order._id).lean();
    return res.status(alreadyDisputed ? 200 : 201).json({
      success: true,
      message: adminEmailsSent ? 'Delivery dispute submitted and super admins notified' : 'Delivery dispute submitted; admin email notification could not be confirmed',
      data: { order: updatedOrder, adminEmailsSent },
    });
  } catch (error) {
    console.error('Product delivery dispute error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit delivery dispute' });
  }
};

const confirmDelivery = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  const session = await mongoose.startSession();
  try {
    const order = await ProductOrder.findOne({ _id: id, buyer: req.user.id }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status === 'completed' && order.escrowReleasedAt) {
      return res.status(200).json({ success: true, message: 'Delivery was already confirmed and seller funds released', data: order });
    }
    const canConfirmDelivery = order.fulfillmentType === 'delivery' && order.status === 'delivered';
    const canConfirmPickup = order.fulfillmentType === 'pickup' && order.status === 'ready_for_pickup';
    if (!canConfirmDelivery && !canConfirmPickup) {
      return res.status(409).json({ success: false, message: order.fulfillmentType === 'delivery' ? 'Seller must mark the order delivered before you can confirm delivery' : 'Order must be ready for pickup before you can confirm collection' });
    }
    const sellerPayout = Number(order.sellerPayout ?? order.subtotal);
    await session.withTransaction(async () => {
      const confirmedAt = new Date();
      const updated = await ProductOrder.findOneAndUpdate(
        { _id: order._id, status: order.status, escrowReleasedAt: null },
        { $set: { status: 'completed', ...(canConfirmPickup ? { deliveredAt: confirmedAt } : {}), buyerConfirmedAt: confirmedAt, escrowReleasedAt: confirmedAt } },
        { new: true, session },
      );
      if (!updated) throw new Error('Order delivery has already been confirmed');
      const wallet = await Wallet.findOneAndUpdate(
        { ownerId: order.seller, ownerModel: order.sellerModel, 'balance.pending': { $gte: sellerPayout } },
        { $inc: { 'balance.pending': -sellerPayout, 'balance.available': sellerPayout, totalEarnings: sellerPayout }, $set: { lastTransactionAt: new Date() } },
        { new: true, session },
      );
      if (!wallet) throw new Error('Could not release the seller escrow balance');
      await Transaction.create([{
        reference: `PREL_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        type: 'escrow_release',
        to: { userId: order.seller, userModel: order.sellerModel, walletId: wallet._id },
        amount: sellerPayout,
        breakdown: { productSubtotal: order.subtotal, productCommission: order.productCommission || 0, deliveryFee: order.deliveryFee || 0, sellerPayout },
        productOrderId: order._id,
        status: 'completed',
        description: `Seller proceeds released for delivered product order ${order.orderNumber}`,
        completedAt: new Date(),
        metadata: { type: 'product_order', orderNumber: order.orderNumber },
      }], { session, ordered: true });
    });
    const sellerMethod = order.sellerModel === 'Business' ? 'notifyBusiness' : 'notifyProvider';
    const buyer = await Buyer.findById(order.buyer).select('fullName phoneNumber').lean();
    const itemsSummary = formatOrderItems(order);
    const sellerOrderAmount = order.subtotal + (order.deliveryFee || 0);
    const sellerOrderAmountLabel = order.fulfillmentType === 'delivery' ? 'Items + delivery fee' : 'Items subtotal';
    const fulfillmentDetails = order.fulfillmentType === 'delivery'
      ? `Delivery address: ${order.deliveryAddress?.address || 'See order details'}. Delivery fee: ${formatOrderAmount(order.deliveryFee)}.`
      : `Pickup${order.pickupNote ? ` note: ${order.pickupNote}` : ''}.`;
    await notify(sellerMethod, order.seller, {
      type: 'product_order_updated',
      title: 'Buyer confirmed order',
      message: `${buyer?.fullName || 'The buyer'} confirmed order ${order.orderNumber}. Items: ${itemsSummary}. ${sellerOrderAmountLabel}: ${formatOrderAmount(sellerOrderAmount)}. ${fulfillmentDetails} Your payout of ${formatOrderAmount(sellerPayout)} has been released to your wallet.`,
      data: {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        buyerName: buyer?.fullName || null,
        buyerPhoneNumber: buyer?.phoneNumber || order.deliveryAddress?.phone || null,
        items: order.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
        fulfillmentType: order.fulfillmentType,
        deliveryAddress: order.fulfillmentType === 'delivery' ? order.deliveryAddress : null,
        pickupNote: order.pickupNote || null,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee || 0,
        orderAmountExcludingBuyerPlatformFee: sellerOrderAmount,
        productCommission: order.productCommission || 0,
        buyerPlatformFee: order.buyerPlatformFee || 0,
        sellerPayout,
        currency: order.currency,
        buyerConfirmedAt: new Date(),
        status: 'completed',
      },
    });
    return res.status(200).json({ success: true, message: 'Delivery confirmed and seller funds released', data: await ProductOrder.findById(order._id).lean() });
  } catch (error) {
    console.error('Confirm product delivery error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to confirm delivery' });
  } finally {
    await session.endSession();
  }
};

module.exports = { getCatalog, createDeliveryQuote, createCheckout, verifyCheckout, payProductOrderFromWallet, getMyOrders, getAllOrdersForAdmin, updateFulfillment, disputeDelivery, confirmDelivery };
