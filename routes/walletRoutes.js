const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/balance', walletController.getWalletBalance);
router.get('/history', walletController.getWalletHistory);
router.post('/input', walletController.inputCash);
router.post('/transfer', walletController.transferCash);
router.post('/transfer-to-company', walletController.transferToCompany);
router.get('/company-transfers', walletController.getCompanyTransfers);
router.put('/company-transfers/:id', walletController.updateCompanyTransfer);
router.patch('/transfer-to-company/:id/approve', walletController.approveCompanyTransfer);

// Requests
router.post('/request', walletController.requestCash);
router.get('/requests', walletController.getWalletRequests);
router.post('/requests/:id/approve', walletController.approveWalletRequest);
router.post('/requests/:id/reject', walletController.rejectWalletRequest);

// Donor OTP Flow
router.post('/donor/send-otp', walletController.sendDonorOTP);
router.post('/donor/verify-and-add', walletController.verifyDonorOTPAndAddCash);

module.exports = router;
