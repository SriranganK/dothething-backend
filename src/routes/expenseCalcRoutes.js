const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  getBoards,
  createBoard,
  joinBoard,
  inviteMember,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteBoard
} = require('../controllers/expenseCalcController');

// All routes require authentication
router.route('/boards')
  .get(protect, getBoards)
  .post(protect, createBoard);

router.route('/boards/:boardId')
  .delete(protect, deleteBoard);

router.route('/boards/:boardId/join')
  .post(protect, joinBoard);

router.route('/boards/:boardId/invite')
  .post(protect, inviteMember);

router.route('/boards/:boardId/transactions')
  .get(protect, getTransactions)
  .post(protect, createTransaction);

router.route('/boards/:boardId/transactions/:transactionId')
  .put(protect, updateTransaction)
  .delete(protect, deleteTransaction);

module.exports = router;
