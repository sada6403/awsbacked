const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MemberSchema = new mongoose.Schema({
    name: String,
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor' },
    branchId: String
});
const FieldVisitorSchema = new mongoose.Schema({
    name: String,
    userId: String,
    branchId: String
});

const Member = mongoose.model('Member', MemberSchema);
const FieldVisitor = mongoose.model('FieldVisitor', FieldVisitorSchema);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Find all field visitors
        const fvs = await FieldVisitor.find({}).lean();
        console.log('--- Field Visitors ---');
        fvs.forEach(fv => {
            console.log(`ID: ${fv._id}, Name: ${fv.name}, Code: ${fv.userId}, Branch: ${fv.branchId}`);
        });

        // Find members matching FV-JS
        const members = await Member.find({ name: /FV-JS/ }).limit(5).populate('fieldVisitorId').lean();
        console.log('--- FOUND MEMBERS ---');
        members.forEach(m => {
            const fvId = m.fieldVisitorId ? m.fieldVisitorId._id : 'NULL';
            const fvUserId = m.fieldVisitorId ? m.fieldVisitorId.userId : 'NULL';
            console.log(`M: ${m.name} | FV_ID: ${fvId} | FV_Code: ${fvUserId}`);
        });

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

connectDB();
