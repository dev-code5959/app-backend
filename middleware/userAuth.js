const jwt = require("jsonwebtoken");

/**
 * userAuth Middleware
 * - Supports both JWT payload formats:
 *   A) { id, role }
 *   B) { user: { id, role } }
 * - Reads token from:
 *   Authorization: Bearer <token>
 *   OR x-auth-token: <token>
 * - Attaches: req.user = { id, role }
 */

function getToken(req) {
  const authHeader = req.headers.authorization || req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return req.header("x-auth-token") || null;
}

function extractUser(decoded) {
  // Format A: { id, role }
  if (decoded?.id) {
    return { id: decoded.id, role: decoded.role };
  }

  // Format B: { user: { id, role } }
  if (decoded?.user?.id) {
    return { id: decoded.user.id, role: decoded.user.role };
  }

  // Some projects use _id
  if (decoded?.user?._id) {
    return { id: decoded.user._id, role: decoded.user.role };
  }

  return null;
}

const userAuth = (req, res, next) => {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = extractUser(decoded);
    if (!user?.id) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.user = user; // { id, role }
    return next();
  } catch (error) {
    console.error("JWT Auth Error:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = userAuth;
