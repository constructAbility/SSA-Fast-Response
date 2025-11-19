const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const { protect } = require("../middelware/authMiddelware");
const {
  registerClient,
  registerTechnician,
  login,
  verifyEmail,
  getProfile,
} = require("../controllers/authController");

const router = express.Router();

// -------------------- Normal register/login --------------------
router.post("/client-register", registerClient);
router.post("/technician-register", registerTechnician);
router.post("/login", login);
router.post("/verify-otp", verifyEmail);
router.get("/profile", protect, getProfile);

// -------------------- GOOGLE LOGIN (CLIENT ONLY) --------------------
router.get(
  "/google",
  (req, res, next) => {
    const role = req.query.role || "client";
    if (role !== "client") {
      return res
        .status(403)
        .json({ message: "Google login allowed only for clients" });
    }
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// --- CLEAN CALLBACK ---
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure" }),
  async (req, res) => {
    try {
      const { user, token } = req.user; // Strategy already returns these

      if (!user || !token) {
        return res
          .status(500)
          .json({ message: "Google login failed: user/token missing" });
      }

      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:5173";

      return res.redirect(`${frontendUrl}/?token=${token}`);
    } catch (err) {
      console.error("Google Callback Error:", err);
      res.status(500).json({ message: "Server error during Google login" });
    }
  }
);

// -------------------- FACEBOOK LOGIN (CLIENT ONLY) --------------------
router.get(
  "/facebook",
  (req, res, next) => {
    const role = req.query.role || "client";
    if (role !== "client") {
      return res
        .status(403)
        .json({ message: "Facebook login allowed only for clients" });
    }
    next();
  },
  passport.authenticate("facebook", { scope: ["email"] })
);

// --- CLEAN FACEBOOK CALLBACK ---
router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/auth/failure" }),
  async (req, res) => {
    try {
      const { user, token } = req.user; // Strategy returns final user + jwt

      if (!user || !token) {
        return res
          .status(500)
          .json({ message: "Facebook login failed: user/token missing" });
      }

      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:5173";

      return res.redirect(`${frontendUrl}/?token=${token}`);
    } catch (err) {
      console.error("Facebook Callback Error:", err);
      res.status(500).json({ message: "Server error during Facebook login" });
    }
  }
);

// -------------------- FAILURE ROUTE --------------------
router.get("/failure", (req, res) => {
  res.status(401).json({ message: "❌ Authentication failed" });
});

module.exports = router;
