
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const getTokenFromHeader = (req) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.split(" ")[1];
};

const userAuth = async (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: "Authorization token required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET); // {id, role}
    const user = await User.findById(decoded.id).select("-password");

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = { id: user._id.toString(), role: user.role || "user" };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: "Authorization token required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET); // {id, role}

    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "User not found" });

    if ((user.role || "user") !== "admin") {
      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    req.user = { id: user._id.toString(), role: "admin" };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = { userAuth, adminAuth };
