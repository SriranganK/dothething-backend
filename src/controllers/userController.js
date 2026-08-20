const bcrypt = require('bcryptjs');
const User = require('../models/User');

const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const { name, email, designation, company, phone, department, location, timezone, status, twoFactorEnabled } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: 'Name and email are required',
      });
    }

    const existingUser = await User.findOne({
      email,
      _id: { $ne: userId },
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'Email already in use',
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        designation: designation !== undefined ? designation.trim() : undefined,
        company: company !== undefined ? company.trim() : undefined,
        phone: phone !== undefined ? phone.trim() : undefined,
        department: department !== undefined ? department.trim() : undefined,
        location: location !== undefined ? location.trim() : undefined,
        timezone: timezone !== undefined ? timezone.trim() : undefined,
        status: status !== undefined ? status.trim() : undefined,
        twoFactorEnabled: twoFactorEnabled !== undefined ? twoFactorEnabled : undefined,
      },
      {
        returnDocument: 'after',
      }
    ).select('-password');

    res.status(200).json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Server error',
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters',
      });
    }

    const user = await User.findById(userId).select('+password');
    console.log(user)
    const isMatch = await bcrypt.compareSync(
      currentPassword,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword

    await user.save();

    res.status(200).json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Server error',
    });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }
    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Server error',
    });
  }
};

const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(200).json({ users: [] });
    }
    const queryRegex = new RegExp(q.trim(), 'i');
    const users = await User.find({
      $or: [{ name: queryRegex }, { email: queryRegex }],
    })
      .select('name email _id')
      .limit(10)
      .lean();

    return res.status(200).json({ users });
  } catch (error) {
    console.error('Error searching users:', error);
    return res.status(500).json({ message: 'Server error searching users' });
  }
};

module.exports = {
  updateProfile,
  changePassword,
  getUserProfile,
  searchUsers,
};