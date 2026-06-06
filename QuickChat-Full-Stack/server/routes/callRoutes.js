import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { getCallHistory, getCallDetails } from "../controllers/callController.js";

const router = express.Router();

// Get paginated call history for the logged-in user
router.get("/history", protectRoute, getCallHistory);

// Get details for a specific call by callId (UUID)
router.get("/:callId", protectRoute, getCallDetails);

export default router;
