const jwt = require('jsonwebtoken');

const generateToken = (id, role, branchId) => {
    return jwt.sign({ id, role, branchId }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

module.exports = generateToken;
