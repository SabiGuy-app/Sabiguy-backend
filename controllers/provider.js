const Provider = require ('../models/ServiceProvider');



exports.ProfileInfo = async (req, res) => {
  try {
    const { gender, city, address, accountType, ninSlip,radius, allowAnywhere
 } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.gender = gender
    provider.city = city 
    provider.address = address 
    provider.accountType = accountType 
    provider.ninSlip = ninSlip
    provider.radius = radius
    provider.allowAnywhere = allowAnywhere


    await provider.save();

    res.status(200).json({
      success: true,
      message: "Profile info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.BusinessInfo = async (req, res) => {
  try {
    const { BusinessName, regNumber, BusinessAddress, cacFile } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.BusinessName = BusinessName
    provider.regNumber = regNumber 
    provider.BusinessAddress = BusinessAddress 
    provider.cacFile = cacFile

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Business info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Business update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



exports.JobAndService = async (req, res) => {
  try {
    const { job, service } = req.body;
    const providerId = req.user.id; 

    if (!job && !service) {
      return res.status(400).json({ message: "Please provide job or service data" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    if (job) {
      if (!Array.isArray(job)) {
        return res.status(400).json({ message: "Job must be an array" });
      }

      provider.job = job.map((item) => ({
        service: item.service,
        title: item.title,
        tagLine: item.tagLine,
      }));
    }

    if (service) {
      if (!Array.isArray(service)) {
        return res.status(400).json({ message: "Service must be an array" });
      }

      provider.service = service.map((item) => ({
        serviceName: item.serviceName,
        pricingModel: item.pricingModel,
        price: item.price,
      }));
    }

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Provider job/service info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.workVisuals = async (req, res) => {
  try {
    const { workVisuals } = req.body;
    const providerId = req.user.id; 

    // if (!job && !service) {
    //   return res.status(400).json({ message: "Please provide job or service data" });
    // }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

      if (!Array.isArray(workVisuals)) {
        return res.status(400).json({ message: "Work visuals must be an array" });
      }

       provider.workVisuals = workVisuals.map((item) => ({
      pictures: Array.isArray(item.pictures) ? item.pictures : [],
      videos: Array.isArray(item.videos) ? item.videos : [],
    }));
    
    await provider.save();

    res.status(200).json({
      success: true,
      message: "Work visuals updated successfully",
      data: provider.workVisuals,
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.BankInfo = async (req, res) => {
  try {
    const { accountName, accountNumber, bankName } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.accountName = accountName
    provider.accountNumber = accountNumber 
    provider.bankName = bankName 

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Account info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Account update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
exports.WorkVisuals = async (req, res) => {
  try {
    const { workVisuals } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.workVisuals = workVisuals
    

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Account info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Account update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.setProfilePicture = async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const providerId = req.user.id; // from your auth middleware

    if (!imageUrl) {
      return res.status(400).json({ message: "Image URL is required" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    // Update the provider's profile picture
    provider.profilePicture = imageUrl;
    await provider.save();

    res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profilePicture: provider.profilePicture,
    });
  } catch (err) {
    console.error("Profile picture error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
