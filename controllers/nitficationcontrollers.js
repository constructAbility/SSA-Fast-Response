
const mongoose= require('mongoose')
const Notification = require("../model/Notification");


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
    console.error(" Notification Error:", err);
  }
};