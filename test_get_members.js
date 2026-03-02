const mongoose = require('mongoose');
const Member = require('./models/Member');
const ExtraMember = require('./models/ExtraMember');
const Transaction = require('./models/Transaction');
require('dotenv').config();

async function testGetMembers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const userId = '6978bcb12f5c5781b4bc27fb'; // JHONE
        const userOid = new mongoose.Types.ObjectId(userId);

        const extraMatch = { collectedBy: userOid };
        const memberMatch = { fieldVisitorId: userOid };

        const fetchWithTxs = async (Model, match) => {
            console.time(`fetchWithTxs_${Model.modelName}`);
            const result = await Model.aggregate([
                { $match: match },
                { $sort: { [Model.modelName === 'Member' ? 'registeredAt' : 'collectedAt']: -1 } },
                { $limit: 100 },
                {
                    $project: {
                        profileImage: 0,
                        signatureImage: 0,
                        idFrontImage: 0,
                        idBackImage: 0,
                        biometricData: 0
                    }
                },
                {
                    $lookup: {
                        from: 'transactions',
                        localField: '_id',
                        foreignField: 'memberId',
                        as: 'txs'
                    }
                }
            ]);
            console.timeEnd(`fetchWithTxs_${Model.modelName}`);
            return result;
        };

        const [extraResults, memberResults] = await Promise.all([
            fetchWithTxs(ExtraMember, extraMatch),
            fetchWithTxs(Member, memberMatch)
        ]);

        console.log(`Extra Results: ${extraResults.length}`);
        console.log(`Member Results: ${memberResults.length}`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

testGetMembers();
