require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nf_farming';

async function viewDatabase() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('\n✅ Connected to MongoDB\n');

        const db = mongoose.connection.db;
        
        // Get all collections
        const collections = await db.listCollections().toArray();
        
        for (const collectionInfo of collections) {
            const collectionName = collectionInfo.name;
            const collection = db.collection(collectionName);
            
            const count = await collection.countDocuments();
            console.log(`\n📊 Collection: ${collectionName} (${count} documents)`);
            console.log('═'.repeat(80));
            
            const documents = await collection.find({}).toArray();
            if (documents.length > 0) {
                console.log(JSON.stringify(documents, null, 2));
            } else {
                console.log('(empty collection)');
            }
        }
        
        console.log('\n✅ Database view complete\n');
        await mongoose.connection.close();
        process.exit(0);
        
    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
    }
}

viewDatabase();
