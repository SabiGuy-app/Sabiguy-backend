class PricingService {
  constructor() {
    // Base pricing configuration (customize as needed)
    this.pricingRates = {
      // Transport/Logistics rates per km
      transport: {
        baseRate: 500,      // Base fee (NGN)
        perKmRate: 100,     // Per kilometer rate
        minimumCharge: 1000 // Minimum charge
      },
      logistics: {
        baseRate: 800,
        perKmRate: 150,
        minimumCharge: 1500
      },
      delivery: {
        baseRate: 400,
        perKmRate: 80,
        minimumCharge: 800
      },
      courier: {
        baseRate: 350,
        perKmRate: 75,
        minimumCharge: 700
      },
      moving: {
        baseRate: 2000,
        perKmRate: 200,
        minimumCharge: 5000
      },
      taxi: {
        baseRate: 500,
        perKmRate: 120,
        minimumCharge: 1000
      },
      ride: {
        baseRate: 400,
        perKmRate: 100,
        minimumCharge: 800
      }
    };
  }

  calculateTransportPrice(distance, serviceType) {
    // Determine which rate category to use
    const category = this.getTransportCategory(serviceType);
    const rates = this.pricingRates[category] || this.pricingRates.transport;

    // Calculate price: base rate + (distance * per km rate)
    let price = rates.baseRate + (distance * rates.perKmRate);

    // Apply minimum charge
    if (price < rates.minimumCharge) {
      price = rates.minimumCharge;
    }

    // Round to nearest 50 (optional, for cleaner pricing)
    price = Math.ceil(price / 50) * 50;

    return price;
  }

  getTransportCategory(serviceType) {
    const type = serviceType.toLowerCase();
    
    for (const [key, value] of Object.entries(this.pricingRates)) {
      if (type.includes(key)) {
        return key;
      }
    }
    
    return 'transport'; // Default
  }

  // Calculate platform service fee (e.g., 10%)
  calculateServiceFee(amount, percentage = 10) {
    return Math.round((amount * percentage) / 100);
  }

  // Calculate total with service fee
  calculateTotalAmount(agreedPrice, serviceFeePercentage = 10) {
    const serviceFee = this.calculateServiceFee(agreedPrice, serviceFeePercentage);
    return agreedPrice + serviceFee;
  }
}

module.exports = new PricingService();