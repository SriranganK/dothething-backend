const Label = require('../models/Label');
const TaskLabel = require('../models/TaskLabel');

/**
 * @desc    Get all labels for a workspace
 * @route   GET /api/labels
 * @access  Private
 */
const listLabels = async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const labels = await Label.find({ workspace_id: workspaceId }).sort({ name: 1 });
    res.status(200).json({ success: true, labels });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Create a new label
 * @route   POST /api/labels
 * @access  Private
 */
const createLabel = async (req, res) => {
  try {
    const { workspaceId, name, color, description } = req.body;
    if (!workspaceId || !name) {
      return res.status(400).json({ message: 'Workspace ID and name are required' });
    }

    // Check if label name already exists in this workspace
    const existingLabel = await Label.findOne({ workspace_id: workspaceId, name: name.trim() });
    if (existingLabel) {
      return res.status(400).json({ message: 'A label with this name already exists in this workspace' });
    }

    const label = await Label.create({
      workspace_id: workspaceId,
      name: name.trim(),
      color: color || '#3b82f6',
      description: description || ''
    });

    res.status(201).json({ success: true, label });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Update a label
 * @route   PUT /api/labels/:id
 * @access  Private
 */
const updateLabel = async (req, res) => {
  try {
    const label = await Label.findById(req.params.id);
    if (!label) {
      return res.status(404).json({ message: 'Label not found' });
    }

    const { name, color, description } = req.body;

    if (name !== undefined) {
      // Check if renamed label already exists
      const existingLabel = await Label.findOne({
        workspace_id: label.workspace_id,
        name: name.trim(),
        _id: { $ne: label._id }
      });
      if (existingLabel) {
        return res.status(400).json({ message: 'A label with this name already exists' });
      }
      label.name = name.trim();
    }

    if (color !== undefined) label.color = color;
    if (description !== undefined) label.description = description;

    await label.save();
    res.status(200).json({ success: true, label });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Delete a label
 * @route   DELETE /api/labels/:id
 * @access  Private
 */
const deleteLabel = async (req, res) => {
  try {
    const label = await Label.findById(req.params.id);
    if (!label) {
      return res.status(404).json({ message: 'Label not found' });
    }

    // Delete task relationships first
    await TaskLabel.deleteMany({ label_id: label._id });
    await label.deleteOne();

    res.status(200).json({ success: true, message: 'Label deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel
};
