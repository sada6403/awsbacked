const Note = require('../models/Note');

// @desc    Get all notes for logged-in field visitor
// @route   GET /api/notes
// @access  Private (field visitor only)
const getMyNotes = async (req, res) => {
    try {
        const fieldVisitorId = req.user?._id;
        if (!fieldVisitorId) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const notes = await Note.find({ fieldVisitorId })
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, count: notes.length, data: notes });
    } catch (error) {
        console.error('[getMyNotes] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch notes', error: error.message });
    }
};

// @desc    Create a new note
// @route   POST /api/notes
// @access  Private (field visitor only)
const createNote = async (req, res) => {
    try {
        const fieldVisitorId = req.user?._id;
        if (!fieldVisitorId) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const { title, noteText, category } = req.body;

        if (!title || !noteText) {
            return res.status(400).json({ success: false, message: 'Title and note text are required' });
        }

        const note = new Note({
            fieldVisitorId,
            branchId: req.user.branchId,
            title: title.trim(),
            noteText: noteText.trim(),
            category: category || 'observation'
        });

        await note.save();

        res.status(201).json({ success: true, data: note });
    } catch (error) {
        console.error('[createNote] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to create note', error: error.message });
    }
};

// @desc    Update a note
// @route   PUT /api/notes/:id
// @access  Private (field visitor only, own notes)
const updateNote = async (req, res) => {
    try {
        const fieldVisitorId = req.user?._id;
        const noteId = req.params.id;

        const note = await Note.findOne({ _id: noteId, fieldVisitorId });

        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found or not authorized' });
        }

        const { title, noteText, category } = req.body;

        if (title) note.title = title.trim();
        if (noteText) note.noteText = noteText.trim();
        if (category) note.category = category;
        note.updatedAt = Date.now();

        await note.save();

        res.json({ success: true, data: note });
    } catch (error) {
        console.error('[updateNote] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to update note', error: error.message });
    }
};

// @desc    Delete a note
// @route   DELETE /api/notes/:id
// @access  Private (field visitor only, own notes)
const deleteNote = async (req, res) => {
    try {
        const fieldVisitorId = req.user?._id;
        const noteId = req.params.id;

        const note = await Note.findOne({ _id: noteId, fieldVisitorId });

        if (!note) {
            return res.status(404).json({ success: false, message: 'Note not found or not authorized' });
        }

        await note.deleteOne();

        res.json({ success: true, message: 'Note deleted successfully' });
    } catch (error) {
        console.error('[deleteNote] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to delete note', error: error.message });
    }
};

module.exports = { getMyNotes, createNote, updateNote, deleteNote };
