const onlyRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: `${role} access only` });
    }
    if (role === "admin") {
      const adminRole = req.user.adminRole || "operations_admin";
      const path = req.path.toLowerCase();
      let permittedRole;
      if (path.includes("/kyc/")) permittedRole = "verification_admin";
      else if (path.includes("payment") || path.includes("transaction") || path.includes("payout") || path.includes("balance") || path.includes("platform-fee")) permittedRole = "finance_admin";
      else if (path.includes("complaint") || path.includes("dispute") || path.includes("cancellation")) permittedRole = "support_admin";
      else if (path.includes("booking") || path.includes("provider") || path.includes("online-") || path.includes("dispatch") || path.includes("ride")) permittedRole = "operations_admin";
      const permissions = {
        verification_admin: permittedRole === "verification_admin",
        operations_admin: permittedRole === "operations_admin",
        support_admin: permittedRole === "support_admin",
        finance_admin: permittedRole === "finance_admin",
      };
      const allowed = adminRole === "super_admin" || Boolean(permissions[adminRole]);
      if (!allowed) return res.status(403).json({ message: "Insufficient admin permissions" });
    }
    next();
  };
};

module.exports = onlyRole;



