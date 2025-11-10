const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.cloud_n,
  api_key: process.env.api_k,
  api_secret: process.env.api_se,
});

exports.uploadToCloudinary = async (filePath, folder = "uploads") => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: "auto", // auto-detect image, video, etc.
    });
    return result; // contains secure_url, public_id, etc.
  } catch (err) {
    console.error("❌ Cloudinary upload error:", err.message);
    throw new Error("Cloudinary upload failed");
  }
};


exports.deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (err) {
    console.error("❌ Cloudinary delete error:", err.message);
    throw new Error("Cloudinary deletion failed");
  }
};
