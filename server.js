const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require("passport");
const session = require("express-session");
const http = require("http");         
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const server = http.createServer(app);

// ✅ SOCKET.IO Setup
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    credentials: true,
  },
});

let techSockets = {};

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);


  socket.on("join-tech", (technicianId) => {
    techSockets[technicianId] = socket.id;
    console.log(`👨‍🔧 Technician ${technicianId} connected → ${socket.id}`);
  });

  socket.on("tech-location", (data) => {
    const { technicianId, lat, lng } = data;

    io.emit(`track-${technicianId}`, { lat, lng, time: Date.now() });
  });


  socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected", socket.id);
    Object.keys(techSockets).forEach((id) => {
      if (techSockets[id] === socket.id) delete techSockets[id];
    });
  });
});


require("./config/passport");


app.use(cors({
  origin: ["http://localhost:5173"],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
  })
);


app.use(passport.initialize());
app.use(passport.session());


app.use('/auth', require('./routes/authRoute'));
app.use('/api', require('./routes/work'));
app.use('/api', require('./routes/admin'));
app.use('/otp', require('./routes/otpRoutes'));
app.use('/forget', require('./routes/forgotpassword'));
app.use('/service', require('./routes/service'));
app.use('/technicaian', require('./routes/technicianRoutes'));
app.get("/pay/:billId", async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.billId);
    if (!bill) return res.status(404).send("Bill not found");

    return res.redirect(bill.upiUri); // Redirect to UPI App
  } catch (e) {
    res.status(500).send("Server Error");
  }
});


mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log(' MongoDB connected'))
  .catch(err => console.log(' MongoDB connection error:', err));


app.get('/', (req, res) => {
  res.send('Server running with Google OAuth + Socket.io!');
});


app.use((err, req, res, next) => {
  console.error(' Error:', err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});


const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`--Server + Socket.io running on port ${PORT}`);
});
