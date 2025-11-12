const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require("passport");
const session = require("express-session"); //  Needed for Google OAuth sessions

dotenv.config();
const app = express();

// ✅ Passport config (Google login)
require("./config/passport");

// ✅ Middlewares
app.use(cors({
  origin: ["http://localhost:5173"], // frontend origin (change if needed)
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Session Middleware (required by Passport)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
  })
);

// ✅ Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// ✅ Routes
app.use('/auth', require('./routes/authRoute')); // 🔹 Google + normal auth routes
app.use('/api', require('./routes/work'));
app.use('/api', require('./routes/admin'));
app.use('/otp',require('./routes/otpRoutes'))
app.use('/forget',require('./routes/forgotpassword'))
app.use('/service',require('./routes/service'))



// ✅ MongoDB Connection (unchanged)
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB connection error:', err));

// ✅ Health check route
app.get('/', (req, res) => {
  res.send('🚀 Server running fine with Google OAuth enabled!');
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
