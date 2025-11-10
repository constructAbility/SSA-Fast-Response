const mongoose= require('mongoose')
const Work = require("../model/work");
const User = require("../model/user");
const Booking=require("../model/BookOrder")
const axios = require("axios");
const AdminNotification=require('../model/adminnotification')
const Notification=require('../model/Notification')
exports.getAdminNotifications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};

    const notifications = await AdminNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("work", "serviceType status location")
      .populate("technician", "name email phone");

    if (!notifications.length) {
      return res
        .status(200)
        .json({ message: "No notifications found", notifications: [] });
    }

    res.status(200).json({
      message: "Admin notifications fetched successfully",
      count: notifications.length,
      notifications,
    });
  } catch (err) {
    console.error("Get Admin Notifications Error:", err.message);
    res
      .status(500)
      .json({ message: "Server error while fetching notifications" });
  }
};

// ✅ 2. Mark a notification as seen or unseen (for testing toggle)
exports.markNotificationSeen = async (req, res) => {
  try {
    const { id } = req.params;
    const seenValue = req.body.seen ?? true;

    const notification = await AdminNotification.findByIdAndUpdate(
      id,
      { seen: seenValue },
      { new: true }
    );

    if (!notification)
      return res.status(404).json({ message: "Notification not found" });

    res
      .status(200)
      .json({ message: "Notification seen status updated", notification });
  } catch (err) {
    console.error("Mark Seen Error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ 3. Technician raises an issue during work
exports.raiseWorkIssue = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { workId, issueType, remarks } = req.body;
    const technicianId = req.user?._id || req.body.technicianId; // fallback for testing

    const work = await Work.findById(workId).session(session);
    if (!work) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Work not found" });
    }

    // 🧩 Update work issue info and status
    switch (issueType) {
      case "need_parts":
        work.status = "onhold_parts";
        break;
      case "need_specialist":
        work.status = "escalated";
        break;
      case "customer_unavailable":
        work.status = "rescheduled";
        break;
      default:
        work.status = "inprogress";
    }

    work.issueType = issueType || "other";
    work.remarks = remarks || "";
    await work.save({ session });

    // 🧩 Create admin notification
    const [notification] = await AdminNotification.create(
      [
        {
          type: "work_issue",
          message: `Issue raised for work ${work._id}`,
          work: work._id,
          technician: technicianId,
          issueType,
          remarks,
        },
      ],
      { session }
    );

    // Link notification to work
    work.adminNotification = notification._id;
    await work.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Issue raised successfully and admin notified.",
      work,
      notification,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Raise Work Issue Error:", error.message);
    res.status(500).json({ message: "Server error while raising issue" });
  }
};

// 4. Admin resolves an issue and updates related Work
exports.resolveNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await AdminNotification.findById(id);
    if (!notification)
      return res.status(404).json({ message: "Notification not found" });

    // Update notification
    notification.status = "resolved";
    notification.seen = true;
    notification.updatedAt = new Date();
    await notification.save();

    // Reset related work status
    await Work.findByIdAndUpdate(notification.work, {
      issueType: null,
      status: "inprogress",
    });

    res.status(200).json({
      message: "Notification resolved and work status updated",
      notification,
    });
  } catch (err) {
    console.error("Resolve Notification Error:", err.message);
    res.status(500).json({ message: "Server error while resolving notification" });
  }
};





exports.sendNotification = async (userId, role, title, message, type = "info", link = "") => {
  try {
    const notification = new Notification({
      user: userId,
      role,
      title,
      message,
      type,
      link,
    });
    await notification.save();
    return notification;
  } catch (err) {
    console.error("❌ Notification Error:", err);
  }
};