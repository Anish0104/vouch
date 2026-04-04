const express = require('express');
const { approvePendingAction, rejectPendingAction } = require('../services/approvalHandlers');

const router = express.Router();

router.post('/approve/:auditId', approvePendingAction);
router.post('/reject/:auditId', rejectPendingAction);

module.exports = router;
