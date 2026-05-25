const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'role' },
  role: { type: String, enum: ['Manager', 'FieldVisitor'], required: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
  loginTime: { type: Date, required: true },
  logoutTime: { type: Date },
  workingHours: { type: Number }, // in hours
  location: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String }
  },
  status: { type: String, enum: ['Present', 'Absent', 'Late'], default: 'Present' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
