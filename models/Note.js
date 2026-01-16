const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema(
  {
    fieldVisitorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FieldVisitor',
      required: true,
      index: true,
    },
    branchId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    noteText: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['observation', 'reminder', 'report', 'other'],
      default: 'observation',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Note', NoteSchema);
