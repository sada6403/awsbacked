const express = require('express');
const router = express.Router();
const {
    saveDraft,
    getMyDrafts,
    getDraftDetails,
    deleteDraft
} = require('../controllers/draftController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/', protect, authorize('manager', 'field_visitor'), saveDraft);
router.get('/', protect, authorize('manager', 'field_visitor'), getMyDrafts);
router.get('/:draftId', protect, authorize('manager', 'field_visitor'), getDraftDetails);
router.delete('/:draftId', protect, authorize('manager', 'field_visitor'), deleteDraft);

module.exports = router;
