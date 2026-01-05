// routes/adminNotices.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const userAuth = require("../middleware/userAuth");
const adminAuth = require("../middleware/adminAuth");

const Notice = require("../models/Notice");

// ✅ ADMIN: list all notices (active + inactive)
router.get("/", userAuth, adminAuth, async (req, res) => {
  try {
    const list = await Notice.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ notices: list });
  } catch (err) {
    console.error("ADMIN NOTICE LIST ERROR:", err);
    res.status(500).json({ message: "Failed to load notices" });
  }
});

// ✅ ADMIN: create notice
router.post("/", userAuth, adminAuth, async (req, res) => {
  try {
    const { title, message, type, isActive, startAt, endAt } = req.body || {};

    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    const doc = await Notice.create({
      title: String(title).trim(),
      message: String(message).trim(),
      type: ["info", "warning", "success", "danger"].includes(type) ? type : "info",
      isActive: typeof isActive === "boolean" ? isActive : true,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      createdBy: new mongoose.Types.ObjectId(req.user.id),
    });

    res.status(201).json({ message: "Notice created", notice: doc });
  } catch (err) {
    console.error("ADMIN NOTICE CREATE ERROR:", err);
    res.status(500).json({ message: "Failed to create notice" });
  }
});

// ✅ ADMIN: update notice
router.put("/:id", userAuth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const patch = {};
    if (req.body?.title != null) patch.title = String(req.body.title).trim();
    if (req.body?.message != null) patch.message = String(req.body.message).trim();
    if (req.body?.type != null) {
      patch.type = ["info", "warning", "success", "danger"].includes(req.body.type) ? req.body.type : "info";
    }
    if (typeof req.body?.isActive === "boolean") patch.isActive = req.body.isActive;

    if (req.body?.startAt !== undefined) patch.startAt = req.body.startAt ? new Date(req.body.startAt) : null;
    if (req.body?.endAt !== undefined) patch.endAt = req.body.endAt ? new Date(req.body.endAt) : null;

    const updated = await Notice.findByIdAndUpdate(id, patch, { new: true });
    if (!updated) return res.status(404).json({ message: "Notice not found" });

    res.json({ message: "Notice updated", notice: updated });
  } catch (err) {
    console.error("ADMIN NOTICE UPDATE ERROR:", err);
    res.status(500).json({ message: "Failed to update notice" });
  }
});

// ✅ ADMIN: delete notice
router.delete("/:id", userAuth, adminAuth, async (req, res) => {
  try {
    const deleted = await Notice.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Notice not found" });

    res.json({ message: "Notice deleted" });
  } catch (err) {
    console.error("ADMIN NOTICE DELETE ERROR:", err);
    res.status(500).json({ message: "Failed to delete notice" });
  }
});

module.exports = router;
