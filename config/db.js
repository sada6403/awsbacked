const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const useLocal = process.env.DB_PREFERENCE === 'local';
        const uri = useLocal
            ? (process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/nf-farming')
            : (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nf-farming');

        console.log(`>>> Connecting to ${useLocal ? 'LOCAL' : 'REMOTE'} MongoDB...`);
        const conn = await mongoose.connect(uri, { autoIndex: false });
        console.log(`MongoDB Connected to ${useLocal ? 'LOCAL VPS' : 'MongoDB Atlas'}!`);

        // Drop legacy branchCode index if exists (one-time cleanup)
        try {
            await conn.connection.db.collection('branchproducts').dropIndex('branchCode_1_productId_1');
            console.log('Dropped legacy branchCode index');
        } catch (_) {}

        // Ensure correct indexes
        await mongoose.connection.syncIndexes();
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
