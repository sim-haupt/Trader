const asyncHandler = require("../middleware/async-handler");
const journalService = require("../services/journal.service");

const listJournalDays = asyncHandler(async (req, res) => {
  const days = await journalService.listJournalDays(req.user);

  res.status(200).json({
    success: true,
    data: days
  });
});

const getUsdEurRates = asyncHandler(async (req, res) => {
  const rates = await journalService.getUsdEurRates(req.validatedQuery.days);

  res.status(200).json({
    success: true,
    data: rates
  });
});

const updateJournalDay = asyncHandler(async (req, res) => {
  const day = await journalService.updateJournalDay(
    req.user,
    req.validatedParams.dayKey,
    req.validatedBody
  );

  res.status(200).json({
    success: true,
    data: day
  });
});

module.exports = {
  listJournalDays,
  getUsdEurRates,
  updateJournalDay
};
