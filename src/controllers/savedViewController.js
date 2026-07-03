const SavedView = require('../models/SavedView');

/**
 * @desc    Get all saved views for a workspace
 * @route   GET /api/saved-views
 * @access  Private
 */
const listViews = async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const views = await SavedView.find({ workspace_id: workspaceId }).sort({ name: 1 });
    res.status(200).json({ success: true, views });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Create a new saved view
 * @route   POST /api/saved-views
 * @access  Private
 */
const createView = async (req, res) => {
  try {
    const { workspaceId, name, filters } = req.body;
    if (!workspaceId || !name) {
      return res.status(400).json({ message: 'Workspace ID and name are required' });
    }

    const view = await SavedView.create({
      workspace_id: workspaceId,
      name,
      filters: filters || {},
      created_by: req.user._id
    });

    res.status(201).json({ success: true, view });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Update a saved view
 * @route   PUT /api/saved-views/:id
 * @access  Private
 */
const updateView = async (req, res) => {
  try {
    const view = await SavedView.findById(req.params.id);
    if (!view) {
      return res.status(404).json({ message: 'Saved view not found' });
    }

    const { name, filters } = req.body;

    if (name !== undefined) view.name = name;
    if (filters !== undefined) view.filters = filters;

    await view.save();
    res.status(200).json({ success: true, view });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Delete a saved view
 * @route   DELETE /api/saved-views/:id
 * @access  Private
 */
const deleteView = async (req, res) => {
  try {
    const view = await SavedView.findById(req.params.id);
    if (!view) {
      return res.status(404).json({ message: 'Saved view not found' });
    }

    await view.deleteOne();
    res.status(200).json({ success: true, message: 'Saved view deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  listViews,
  createView,
  updateView,
  deleteView
};
