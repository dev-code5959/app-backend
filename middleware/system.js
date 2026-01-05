const Settings = require("../models/Settings");

async function requireTasksEnabled(req, res, next) {
  const settings = await Settings.findOne().lean();

  if (settings?.offday) {
    return res.status(403).json({ message: "Tasks are OFF today (Offday mode)." });
  }
  if (settings?.tasksDisabled) {
    return res.status(403).json({ message: "Tasks are disabled by admin today." });
  }

  next();
}

module.exports = { requireTasksEnabled };
