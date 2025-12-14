import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createParkingController } from "./controllers/index.js";
import { getDefaultNetwork } from "./config.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const network = getDefaultNetwork();

app.use(cors());
app.use(express.json());

const parkingController = createParkingController(network);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", service: "sui-parking-api" });
});

// Info
app.get("/api/info", parkingController.getInfo);

// --- Slots ---
app.get("/api/slots", parkingController.getSlots);
app.post("/api/slots/query", parkingController.getSlots); // Backwards compatibility for AI agent
// IMPORTANT: More specific routes must come before general ones
app.get("/api/slots/by-owner/:address", parkingController.getUserSlots);
app.get("/api/slots/:id/quote", parkingController.getPriceQuote);
app.get("/api/slots/:id", parkingController.getSlot);
app.post("/api/slots", parkingController.createSlot);

// --- Drivers ---
app.get("/api/drivers/:id", parkingController.getDriverProfile);
app.get(
  "/api/drivers/by-address/:address",
  parkingController.getDriverProfileByAddress
);
app.post("/api/drivers/register", parkingController.registerDriver);

// --- Owners ---
app.get("/api/owners/:id", parkingController.getOwnerProfile);
app.get(
  "/api/owners/by-address/:address",
  parkingController.getOwnerProfileByAddress
);
app.post("/api/owners/register", parkingController.registerOwner);

// --- Reservations ---
// IMPORTANT: More specific routes must come before general ones
app.get("/api/reservations/by-user/:address", parkingController.getUserReservations);
app.post("/api/reservations/:id/check-in", parkingController.checkIn);
app.post("/api/reservations/:id/check-out", parkingController.checkOut);
app.get("/api/reservations/:id", parkingController.getReservation);
app.post("/api/reservations", parkingController.createReservation);

// --- Escrows ---
app.get("/api/escrows/:id", parkingController.getEscrow);
app.post("/api/escrows/lock", parkingController.lockFunds);
app.post("/api/escrows/:id/mark-used", parkingController.markUsed);
app.post("/api/escrows/:id/settle", parkingController.settle);
app.post("/api/escrows/:id/dispute", parkingController.openDispute);

// ===========================================================================
// START SERVER
// ===========================================================================

app.listen(PORT, () => {
  console.log(`Sui Parking API server running on port ${PORT}`);
  console.log(`   Network: ${network}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Info:    http://localhost:${PORT}/api/info`);
});

export default app;
