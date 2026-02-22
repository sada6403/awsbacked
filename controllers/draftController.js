const Draft = require('../models/Draft');

// @desc    Save or Update a Registration Draft
// @route   POST /api/drafts
// @access  Private (Manager)
const saveDraft = async (req, res) => {
    try {
        const { type, data, lastStep, draftId } = req.body;
        const userId = req.user._id;

        if (!type || !data) {
            return res.status(400).json({ success: false, message: 'Type and data are required' });
        }

        let draft;
        if (draftId) {
            // Update existing draft
            draft = await Draft.findOneAndUpdate(
                { _id: draftId, userId },
                { data, lastStep, updatedAt: Date.now() },
                { new: true }
            );
            if (!draft) {
                return res.status(404).json({ success: false, message: 'Draft not found' });
            }
        } else {
            // Create new draft
            draft = new Draft({
                userId,
                type,
                data,
                lastStep
            });
            await draft.save();
        }

        res.status(200).json({ success: true, message: 'Draft saved successfully', data: draft });
    } catch (error) {
        console.error('Save Draft Error:', error);
        res.status(500).json({ success: false, message: 'Failed to save draft' });
    }
};

// @desc    Get all drafts for the logged-in manager
// @route   GET /api/drafts
// @access  Private (Manager)
const getMyDrafts = async (req, res) => {
    try {
        const userId = req.user._id;
        const drafts = await Draft.find({ userId }).sort({ updatedAt: -1 });
        res.status(200).json({ success: true, count: drafts.length, data: drafts });
    } catch (error) {
        console.error('Get Drafts Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch drafts' });
    }
};

// @desc    Get a specific draft
// @route   GET /api/drafts/:draftId
// @access  Private (Manager)
const getDraftDetails = async (req, res) => {
    try {
        const userId = req.user._id;
        const { draftId } = req.params;

        const draft = await Draft.findOne({ _id: draftId, userId });
        if (!draft) {
            return res.status(404).json({ success: false, message: 'Draft not found' });
        }

        res.status(200).json({ success: true, data: draft });
    } catch (error) {
        console.error('Get Draft Details Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch draft details' });
    }
};

// @desc    Delete a draft
// @route   DELETE /api/drafts/:draftId
// @access  Private (Manager)
const deleteDraft = async (req, res) => {
    try {
        const userId = req.user._id;
        const { draftId } = req.params;

        const draft = await Draft.findOneAndDelete({ _id: draftId, userId });
        if (!draft) {
            return res.status(404).json({ success: false, message: 'Draft not found' });
        }

        res.status(200).json({ success: true, message: 'Draft deleted successfully' });
    } catch (error) {
        console.error('Delete Draft Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete draft' });
    }
};

module.exports = {
    saveDraft,
    getMyDrafts,
    getDraftDetails,
    deleteDraft
};
