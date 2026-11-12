const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('./product.model');
const ProductOrder = require('./productOrder.model');
const Transaction = require('../transactions/transaction.model');
const Wallet = require('../wallet/Wallet.model');
const Buyer = require('../../../models/ServiceUser');
const notificationService = require('../../services/notification.service');

const paystackBaseURL = 'https://api.paystack.co';
const paystackHeaders = () => ({ Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` });
const notify = async (method, id, data) => {
  try { await notificationService[method](id, data); }
  catch (error) { console.error('Product order notification failed:', error.message); }
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
  try {
    const { items, fulfillmentType, deliveryAddress, pickupNote } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 30) {
      return res.status(400).json({ success: false, message: 'Provide between 1 and 30 product items' });
    }
    if (!['delivery', 'pickup'].includes(fulfillmentType)) {
      return res.status(400).json({ success: false, message: 'fulfillmentType must be delivery or pickup' });
    }
    if (fulfillmentType === 'delivery' && (!deliveryAddress || typeof deliveryAddress.address !== 'string' || !deliveryAddress.address.trim() || typeof deliveryAddress.city !== 'string' || !deliveryAddress.city.trim() || typeof deliveryAddress.state !== 'string' || !deliveryAddress.state.trim() || typeof deliveryAddress.phone !== 'string' || !deliveryAddress.phone.trim())) {
      return res.status(400).json({ success: false, message: 'Delivery requires recipient phone, address, city, and state' });
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
    const first = products[0];
    if (products.some((product) => String(product.owner) !== String(first.owner) || product.ownerType !== first.ownerType || product.currency !== 'NGN')) {
      return res.status(400).json({ success: false, message: 'An order must contain NGN products from one seller' });
    }
    const orderItems = products.map((product) => {
      const quantity = quantities.get(String(product._id));
      return { product: product._id, name: product.name, productImage: product.productImage || null, quantity, unitPrice: product.price, lineTotal: product.price * quantity };
    });
    const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    if (!Number.isFinite(subtotal) || subtotal <= 0) return res.status(400).json({ success: false, message: 'Order total must be greater than zero' });

    const buyer = await Buyer.findById(req.user.id).select('email fullName');
    if (!buyer?.email) return res.status(400).json({ success: false, message: 'A buyer email is required for checkout' });
    const paymentReference = `PRD_${Date.now()}_${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    order = await ProductOrder.create({
      orderNumber: `SGP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      buyer: buyer._id,
      seller: first.owner,
      sellerModel: first.ownerModel,
      sellerType: first.ownerType,
      items: orderItems,
      fulfillmentType,
      deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress : undefined,
      pickupNote: fulfillmentType === 'pickup' && typeof pickupNote === 'string' ? pickupNote.trim() : undefined,
      subtotal,
      currency: 'NGN',
      paymentReference,
    });

    const payment = await axios.post(`${paystackBaseURL}/transaction/initialize`, {
      email: buyer.email,
      amount: Math.round(subtotal * 100),
      currency: 'NGN',
      reference: paymentReference,
      callback_url: `${process.env.FRONTEND_URL}/product-orders/callback`,
      metadata: {
        type: 'product_order', orderId: String(order._id), orderNumber: order.orderNumber,
        buyerId: String(buyer._id), sellerId: String(first.owner), sellerModel: first.ownerModel,
        custom_fields: [{ display_name: 'Order Number', variable_name: 'order_number', value: order.orderNumber }],
      },
    }, { headers: { ...paystackHeaders(), 'Content-Type': 'application/json' } });
    if (!payment.data?.status) throw new Error('Paystack did not initialize this payment');
    return res.status(201).json({
      success: true,
      message: 'Product order created; complete payment to confirm it',
      data: { order, authorizationUrl: payment.data.data.authorization_url, accessCode: payment.data.data.access_code, reference: payment.data.data.reference },
    });
  } catch (error) {
    if (order?._id) await ProductOrder.deleteOne({ _id: order._id, status: 'pending_payment' }).catch(() => {});
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
    if (order.status !== 'pending_payment') return res.status(200).json({ success: true, message: 'Order payment already verified', data: order });
    const verified = await axios.get(`${paystackBaseURL}/transaction/verify/${encodeURIComponent(order.paymentReference)}`, { headers: paystackHeaders() });
    const payment = verified.data?.data;
    if (!verified.data?.status || payment?.status !== 'success' || Number(payment.amount) !== Math.round(order.subtotal * 100) || payment.currency !== order.currency || payment.reference !== order.paymentReference || String(payment.metadata?.orderId) !== String(order._id)) {
      return res.status(400).json({ success: false, message: 'Payment is not successful or does not match this order' });
    }

    await session.withTransaction(async () => {
      const updated = await ProductOrder.findOneAndUpdate({ _id: order._id, status: 'pending_payment' }, { $set: { status: 'paid', paidAt: new Date() } }, { new: true, session });
      if (!updated) return;
      const wallet = await Wallet.findOneAndUpdate(
        { ownerId: order.seller, ownerModel: order.sellerModel },
        { $inc: { 'balance.pending': order.subtotal, 'balance.total': order.subtotal }, $set: { lastTransactionAt: new Date() }, $setOnInsert: { currency: order.currency } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session },
      );
      await Transaction.create([{
        reference: order.paymentReference,
        type: 'payment',
        from: { userId: order.buyer, userModel: 'Buyer' },
        to: { userId: order.seller, userModel: order.sellerModel, walletId: wallet._id },
        amount: order.subtotal,
        breakdown: { subtotal: order.subtotal, totalAmount: order.subtotal, sellerReceives: order.subtotal, currency: order.currency },
        productOrderId: order._id,
        gateway: { name: 'paystack', reference: order.paymentReference, response: payment },
        status: 'completed',
        description: `Payment for product order ${order.orderNumber}`,
        completedAt: new Date(),
        metadata: { type: 'product_order', orderNumber: order.orderNumber, escrowStatus: 'held' },
      }], { session });
    });
    const paidOrder = await ProductOrder.findById(order._id).lean();
    await notify('notifyUser', order.buyer, { type: 'product_order_paid', title: 'Product order paid', message: `Payment for order ${order.orderNumber} is confirmed.`, data: { orderId: order._id, orderNumber: order.orderNumber } });
    const method = order.sellerModel === 'Business' ? 'notifyBusiness' : 'notifyProvider';
    await notify(method, order.seller, { type: 'product_order_received', title: 'New product order', message: `Order ${order.orderNumber} has been paid. Prepare it for ${order.fulfillmentType}.`, data: { orderId: order._id, orderNumber: order.orderNumber } });
    return res.status(200).json({ success: true, message: 'Product order payment verified', data: paidOrder });
  } catch (error) {
    console.error('Product payment verification error:', error.response?.data || error);
    return res.status(500).json({ success: false, message: error.response?.data?.message || 'Failed to verify product payment' });
  } finally {
    await session.endSession();
  }
};

const getMyOrders = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = req.user.role === 'buyer'
      ? { buyer: req.user.id }
      : { seller: req.user.id, status: { $ne: 'pending_payment' } };
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

const updateFulfillment = async (req, res) => {
  const { id } = req.params;
  const { status, trackingNumber, note } = req.body || {};
  const allowed = ['processing', 'shipped', 'ready_for_pickup'];
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  if (!allowed.includes(status)) return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
  try {
    const order = await ProductOrder.findOne({ _id: id, seller: req.user.id, sellerModel: req.user.role === 'provider' ? 'Provider' : 'Business' });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const validNext = order.status === 'paid' && status === 'processing'
      || order.status === 'processing' && (status === 'shipped' || status === 'ready_for_pickup')
      || order.status === 'shipped' && status === 'shipped';
    if (!validNext || (status === 'shipped' && order.fulfillmentType !== 'delivery') || (status === 'ready_for_pickup' && order.fulfillmentType !== 'pickup')) {
      return res.status(409).json({ success: false, message: 'This fulfillment status is not valid for the order' });
    }
    order.status = status;
    if (status === 'shipped' && typeof trackingNumber === 'string') order.set('trackingNumber', trackingNumber.trim());
    if (typeof note === 'string' && note.trim()) order.set('sellerNote', note.trim());
    await order.save();
    await notify('notifyUser', order.buyer, { type: 'product_order_updated', title: 'Product order update', message: status === 'shipped' ? `Order ${order.orderNumber} has shipped${trackingNumber ? ` (tracking: ${trackingNumber})` : ''}.` : status === 'ready_for_pickup' ? `Order ${order.orderNumber} is ready for pickup.` : `Order ${order.orderNumber} is being prepared.`, data: { orderId: order._id, orderNumber: order.orderNumber, status } });
    return res.status(200).json({ success: true, message: 'Order fulfillment updated', data: order });
  } catch (error) {
    console.error('Product fulfillment update error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update order fulfillment' });
  }
};

const confirmDelivery = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  const session = await mongoose.startSession();
  try {
    const order = await ProductOrder.findOne({ _id: id, buyer: req.user.id }).lean();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['shipped', 'ready_for_pickup'].includes(order.status)) return res.status(409).json({ success: false, message: 'Order is not ready to be marked delivered' });
    await session.withTransaction(async () => {
      const updated = await ProductOrder.findOneAndUpdate({ _id: order._id, status: order.status, escrowReleasedAt: null }, { $set: { status: 'delivered', deliveredAt: new Date(), escrowReleasedAt: new Date() } }, { new: true, session });
      if (!updated) throw new Error('Order delivery has already been confirmed');
      const wallet = await Wallet.findOneAndUpdate(
        { ownerId: order.seller, ownerModel: order.sellerModel, 'balance.pending': { $gte: order.subtotal } },
        { $inc: { 'balance.pending': -order.subtotal, 'balance.available': order.subtotal, totalEarnings: order.subtotal }, $set: { lastTransactionAt: new Date() } },
        { new: true, session },
      );
      if (!wallet) throw new Error('Could not release the seller escrow balance');
      await Transaction.create([{
        reference: `PREL_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        type: 'escrow_release',
        to: { userId: order.seller, userModel: order.sellerModel, walletId: wallet._id },
        amount: order.subtotal,
        productOrderId: order._id,
        status: 'completed',
        description: `Escrow released for delivered product order ${order.orderNumber}`,
        completedAt: new Date(),
        metadata: { type: 'product_order', orderNumber: order.orderNumber },
      }], { session });
    });
    const sellerMethod = order.sellerModel === 'Business' ? 'notifyBusiness' : 'notifyProvider';
    await notify(sellerMethod, order.seller, { type: 'product_order_delivered', title: 'Order delivered', message: `The buyer confirmed order ${order.orderNumber}. Funds have been released to your wallet.`, data: { orderId: order._id, orderNumber: order.orderNumber } });
    return res.status(200).json({ success: true, message: 'Delivery confirmed and seller funds released', data: await ProductOrder.findById(order._id).lean() });
  } catch (error) {
    console.error('Confirm product delivery error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to confirm delivery' });
  } finally {
    await session.endSession();
  }
};

module.exports = { getCatalog, createCheckout, verifyCheckout, getMyOrders, updateFulfillment, confirmDelivery };
