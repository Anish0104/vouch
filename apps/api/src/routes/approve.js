const express = require('express');
const { approvePendingAction, rejectPendingAction } = require('../services/approvalHandlers');
const { verifyUserAccessToken } = require('../middleware/verifyUserAccessToken');

const router = express.Router();

router.post('/approve/:auditId', verifyUserAccessToken, approvePendingAction);
router.post('/reject/:auditId', verifyUserAccessToken, rejectPendingAction);

module.exports = router;
