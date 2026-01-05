// middleware/adminAuth.js
const User = require("../models/User");

module.exports = async function adminAuth(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(userId).select("role");
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    next();
  } catch (err) {
    return res.status(500).json({ message: "Admin auth failed" });
  }
};
