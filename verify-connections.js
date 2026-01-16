const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');
const Member = require('./models/Member');
const FieldVisitor = require('./models/FieldVisitor');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://dassanayakend:NnBDrcaP3iWjrATj@nf-farming.vxz8y.mongodb.net/nf-farming-db?retryWrites=true&w=majority';

async function verifyConnections() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all records
        const transactions = await Transaction.find().lean();
        const members = await Member.find().lean();
        const fieldVisitors = await FieldVisitor.find().lean();

        console.log('📊 Database Overview:');
        console.log(`- Total Transactions: ${transactions.length}`);
        console.log(`- Total Members: ${members.length}`);
        console.log(`- Total Field Visitors: ${fieldVisitors.length}\n`);

        // Create ID sets for quick lookup
        const memberIds = new Set(members.map(m => m._id.toString()));
        const fieldVisitorIds = new Set(fieldVisitors.map(fv => fv._id.toString()));

        // Check Transaction connections
        console.log('🔍 Checking Transaction Connections:\n');
        
        let txWithValidMember = 0;
        let txWithInvalidMember = 0;
        let txWithValidFV = 0;
        let txWithInvalidFV = 0;
        
        const orphanedTransactions = [];

        for (const tx of transactions) {
            let hasIssue = false;
            
            // Check member connection
            const memberIdStr = tx.memberId?.toString();
            if (!memberIdStr || !memberIds.has(memberIdStr)) {
                txWithInvalidMember++;
                hasIssue = true;
            } else {
                txWithValidMember++;
            }

            // Check field visitor connection
            const fvIdStr = tx.fieldVisitorId?.toString();
            if (!fvIdStr || !fieldVisitorIds.has(fvIdStr)) {
                txWithInvalidFV++;
                hasIssue = true;
            } else {
                txWithValidFV++;
            }

            if (hasIssue) {
                orphanedTransactions.push({
                    billNumber: tx.billNumber,
                    memberId: memberIdStr || 'MISSING',
                    fieldVisitorId: fvIdStr || 'MISSING',
                    date: tx.date,
                    amount: tx.totalAmount
                });
            }
        }

        console.log(`✅ Transactions with valid Member: ${txWithValidMember}`);
        console.log(`❌ Transactions with invalid/missing Member: ${txWithInvalidMember}`);
        console.log(`✅ Transactions with valid Field Visitor: ${txWithValidFV}`);
        console.log(`❌ Transactions with invalid/missing Field Visitor: ${txWithInvalidFV}\n`);

        if (orphanedTransactions.length > 0) {
            console.log('⚠️  Orphaned Transactions (invalid references):');
            orphanedTransactions.slice(0, 5).forEach(tx => {
                console.log(`  - ${tx.billNumber}: Member=${tx.memberId}, FV=${tx.fieldVisitorId}`);
            });
            if (orphanedTransactions.length > 5) {
                console.log(`  ... and ${orphanedTransactions.length - 5} more\n`);
            }
        }

        // Check Member connections
        console.log('\n🔍 Checking Member Connections:\n');
        
        let membersWithValidFV = 0;
        let membersWithInvalidFV = 0;
        const orphanedMembers = [];

        for (const member of members) {
            const fvIdStr = member.fieldVisitorId?.toString();
            if (!fvIdStr || !fieldVisitorIds.has(fvIdStr)) {
                membersWithInvalidFV++;
                orphanedMembers.push({
                    name: member.name,
                    memberCode: member.memberCode,
                    fieldVisitorId: fvIdStr || 'MISSING'
                });
            } else {
                membersWithValidFV++;
            }
        }

        console.log(`✅ Members with valid Field Visitor: ${membersWithValidFV}`);
        console.log(`❌ Members with invalid/missing Field Visitor: ${membersWithInvalidFV}\n`);

        if (orphanedMembers.length > 0) {
            console.log('⚠️  Orphaned Members (invalid field visitor):');
            orphanedMembers.slice(0, 5).forEach(m => {
                console.log(`  - ${m.name} (${m.memberCode}): FV=${m.fieldVisitorId}`);
            });
            if (orphanedMembers.length > 5) {
                console.log(`  ... and ${orphanedMembers.length - 5} more\n`);
            }
        }

        // Check Field Visitor details
        console.log('\n📋 Field Visitor Details:\n');
        for (const fv of fieldVisitors) {
            const fvMembers = members.filter(m => m.fieldVisitorId?.toString() === fv._id.toString());
            const fvTransactions = transactions.filter(tx => tx.fieldVisitorId?.toString() === fv._id.toString());
            
            console.log(`👤 ${fv.name || fv.fullName} (${fv.userId}):`);
            console.log(`   - Members: ${fvMembers.length}`);
            console.log(`   - Transactions: ${fvTransactions.length}`);
            
            if (fvMembers.length > 0) {
                console.log(`   - Member Names: ${fvMembers.map(m => m.name).join(', ')}`);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY:');
        console.log('='.repeat(60));
        
        if (orphanedTransactions.length === 0 && orphanedMembers.length === 0) {
            console.log('✅ All connections are valid!');
        } else {
            console.log(`⚠️  Found ${orphanedTransactions.length} orphaned transactions`);
            console.log(`⚠️  Found ${orphanedMembers.length} orphaned members`);
            console.log('\n💡 Recommendation: Clean up orphaned records or fix references');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

verifyConnections();
