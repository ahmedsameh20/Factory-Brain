const express = require("express");
const router = express.Router();
const mlService = require("../services/ml.service");

router.post("/predict", async (req, res) => {
  const result = await mlService.predict(req.body);
  res.json(result);
});

module.exports = router;
