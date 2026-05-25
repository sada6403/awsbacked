const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const Task = require('../../models/Task');

// @route   GET /api/admin/tasks
// @desc    Get all tasks
router.get('/', adminOnly, checkPermission('Tasks', 'view'), async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('assignedTo', 'name role')
      .populate('branch', 'name')
      .sort({ dueDate: 1 });
    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Fetch Tasks Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/tasks
// @desc    Create a task
router.post('/', adminOnly, checkPermission('Tasks', 'create'), auditLog('Tasks', 'CREATE'), async (req, res) => {
  try {
    const newTask = new Task({
      ...req.body,
      createdBy: req.adminUser.id
    });
    const savedTask = await newTask.save();
    res.status(201).json({ success: true, data: savedTask });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/admin/tasks/:id
// @desc    Update a task
router.put('/:id', adminOnly, checkPermission('Tasks', 'edit'), auditLog('Tasks', 'UPDATE'), async (req, res) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedTask) return res.status(404).json({ message: 'Task not found' });
    res.json({ success: true, data: updatedTask });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   DELETE /api/admin/tasks/:id
// @desc    Delete a task
router.delete('/:id', adminOnly, checkPermission('Tasks', 'delete'), auditLog('Tasks', 'DELETE'), async (req, res) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) return res.status(404).json({ message: 'Task not found' });
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
