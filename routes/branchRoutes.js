const express = require('express');
const router = express.Router();
const { getBranches, createBranch, updateBranch } = require('../controllers/branchController');

router.get('/', getBranches);
router.post('/', createBranch);
router.put('/:id', updateBranch);

module.exports = router;
