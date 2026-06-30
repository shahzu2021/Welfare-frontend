const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose'); // <-- 1. MongoDB Mongoose add kiya

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

// ==========================================
// 2. MONGODB CONNECTION SETTINGS
// ==========================================
const mongoURI = 'mongodb+srv://shahzu2021_db_user:Mcb29216@cluster0.pumfhc5.mongodb.net/?appName=Cluster0';
mongoose.connect(mongoURI)
  .then(() => console.log("--> Al Khalil Cloud Database Connected Successfully!"))
  .catch(err => console.error("Database Connection Error:", err));

// ==========================================
// 3. MONGODB SCHEMAS & MODELS (No More Local JSON Files!)
// ==========================================
const Donation = mongoose.model('Donation', new mongoose.Schema({
    signatureId: String, slipNo: String, donorCode: String, name: String,
    department: String, amount: Number, category: String, payMode: String,
    bankName: String, bankTid: String, date: String, remarks: String,
    allocatedStudents: [String]
}));

const Expense = mongoose.model('Expense', new mongoose.Schema({
    signatureId: String, title: String, description: String, department: String, 
    area: String, source: String, amount: Number, date: String
}));

const Student = mongoose.model('Student', new mongoose.Schema({
    signatureId: String, name: String, class: String, school: String, 
    allottedDonorCode: String, allottedDonorName: String 
}));

const Config = mongoose.model('Config', new mongoose.Schema({
    departments: [String], categories: [String], expenseSources: [String], expenseAreas: [String]
}));

// Default configurations agar database bilkul khali ho
const initialConfig = {
    departments: ["Food/Ration", "Clothes", "General Fund", "Kafalat", "Makatib e Qurania", "Medical Aid", "Water Project", "Emergency Relief", "Education Support", "Sadqa e Jaria"],
    categories: ["Zakat", "Sadqa", "Atia", "Kafalat Fixed"],
    expenseSources: ["Cash Account", "Bank Account", "Pet Petty Cash"],
    expenseAreas: ["Karachi Central", "Lyari", "Orangi Town", "Korangi", "Malir"]
};

async function getOrCreateConfig() {
    let conf = await Config.findOne();
    if (!conf) {
        conf = await Config.create(initialConfig);
    }
    return conf;
}

// ==========================================
// 4. API ROUTING WITH ASYNC/AWAIT
// ==========================================
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'dashboard.html')); });

app.get('/api/settings/config', async (req, res) => {
    const config = await getOrCreateConfig();
    res.json(config);
});

app.post('/api/settings/config/add', async (req, res) => {
    const { type, value } = req.body;
    let config = await getOrCreateConfig();
    if(config[type] && !config[type].includes(value)) {
        config[type].push(value);
        await config.save();
    }
    res.json({ success: true, config });
});

app.post('/api/donations', async (req, res) => {
    const d = req.body;
    const cleanUser = d.nodeUser ? d.nodeUser.toUpperCase() : "NX";
    
    // Database se counts nikalna automated numeric tracking ke liye
    const allDonations = await Donation.find({});
    let genCount = allDonations.filter(x => x.slipNo && x.slipNo.startsWith('GEN-')).length;
    let sponCount = allDonations.filter(x => x.slipNo && x.slipNo.startsWith('SPON-')).length;
    let donorCount = [...new Set(allDonations.map(x => x.donorCode))].length;

    let finalSlipNo = d.slipMode === "Manual" ? d.manualSlipNo : 
        (d.department === "Kafalat" ? `SPON-${cleanUser}-${5001 + sponCount}` : `GEN-${cleanUser}-${1001 + genCount}`);
    
    let finalDonorCode = d.donorCode || `DONOR-${cleanUser}-${7001 + donorCount}`;

    const recordData = {
        signatureId: "DON-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
        slipNo: finalSlipNo, donorCode: finalDonorCode, name: d.donorName || "Anonymous Donor",
        department: d.department, amount: parseFloat(d.amount) || 0,
        category: d.category, payMode: d.payMode, bankName: d.bankName || "-",
        bankTid: d.bankTid || "-", date: d.date, remarks: d.remarks || "",
        allocatedStudents: d.allocatedStudents || []
    };

    // Agar students assign hue hain to unhe background me update karna
    if(d.allocatedStudents && d.allocatedStudents.length > 0) {
        await Student.updateMany(
            { signatureId: { $in: d.allocatedStudents } },
            { $set: { allottedDonorCode: finalDonorCode, allottedDonorName: d.donorName || "Anonymous Donor" } }
        );
    }

    const savedRecord = await Donation.create(recordData);
    res.json({ success: true, data: savedRecord });
});

app.post('/api/expenses', async (req, res) => {
    const e = req.body;
    const record = await Expense.create({
        signatureId: "EXP-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
        title: e.title, description: e.description || "", department: e.department, 
        area: e.area, source: e.source, amount: parseFloat(e.amount) || 0, date: e.date
    });
    res.json({ success: true, data: record });
});

app.get('/api/students/list', async (req, res) => { 
    const list = await Student.find({});
    res.json({ students: list }); 
});

app.post('/api/students', async (req, res) => {
    const s = req.body;
    await Student.create({ 
        signatureId: "STU-" + Date.now() + Math.floor(Math.random() * 100), 
        name: s.name, class: s.class, school: s.school, 
        allottedDonorCode: null, allottedDonorName: null 
    });
    res.json({ success: true });
});

app.post('/api/students/deallocate', async (req, res) => {
    const { studentId } = req.body;
    let result = await Student.findOneAndUpdate(
        { signatureId: studentId },
        { $set: { allottedDonorCode: null, allottedDonorName: null } }
    );
    if(result) { res.json({ success: true }); } 
    else { res.json({ success: false }); }
});

app.get('/api/donors/master-list', async (req, res) => {
    const donations = await Donation.find({});
    let trackingDonors = {};
    donations.forEach(d => {
        if(!trackingDonors[d.donorCode]) { 
            trackingDonors[d.donorCode] = { code: d.donorCode, name: d.name, department: d.department, category: d.category, total: 0 }; 
        }
        trackingDonors[d.donorCode].total += d.amount;
    });
    res.json({ donors: Object.values(trackingDonors) });
});

app.get('/api/reports/engine', async (req, res) => {
    const { dept } = req.query;
    const donations = await Donation.find({});
    const expenses = await Expense.find({});
    let target = [];

    donations.forEach(d => {
        if(dept === 'All' || d.department === dept) { 
            target.push({ date: d.date, ref: d.slipNo, profile: d.name, dept: d.department, type: d.category, mode: d.payMode, income: d.amount, expense: 0 }); 
        }
    });
    expenses.forEach(e => {
        if(dept === 'All' || e.department === dept) { 
            target.push({ date: e.date, ref: "EXP-LOG", profile: e.title, dept: e.department, type: e.description, mode: e.source, income: 0, expense: e.amount }); 
        }
    });
    res.json({ records: target.sort((a,b) => new Date(b.date) - new Date(a.date)) });
});

app.get('/api/reports/summary', async (req, res) => {
    const donations = await Donation.find({});
    const expenses = await Expense.find({});
    const students = await Student.find({});
    const config = await getOrCreateConfig();
    
    let cashInc = donations.filter(d => d.payMode === 'Cash').reduce((sum, d) => sum + d.amount, 0);
    let bankInc = donations.filter(d => d.payMode === 'Bank').reduce((sum, d) => sum + d.amount, 0);
    let totalInc = cashInc + bankInc;

    let cashExp = expenses.filter(e => e.source && e.source.includes('Cash')).reduce((sum, e) => sum + e.amount, 0);
    let bankExp = expenses.filter(e => e.source && e.source.includes('Bank')).reduce((sum, e) => sum + e.amount, 0);
    let totalExp = expenses.reduce((sum, e) => sum + e.amount, 0);

    let assignedStudents = students.filter(s => s.allottedDonorCode !== null).length;
    let unassignedStudents = students.filter(s => s.allottedDonorCode === null).length;
    let totalUniqueDonors = [...new Set(donations.map(x => x.donorCode))].length;

    const deptLedgerSummary = {};
    config.departments.forEach(dept => { deptLedgerSummary[dept] = { income: 0, expense: 0, remaining: 0 }; });
    donations.forEach(d => { if(deptLedgerSummary[d.department]) deptLedgerSummary[d.department].income += d.amount; });
    expenses.forEach(e => { if(deptLedgerSummary[e.department]) deptLedgerSummary[e.department].expense += e.amount; });
    Object.keys(deptLedgerSummary).forEach(k => { deptLedgerSummary[k].remaining = deptLedgerSummary[k].income - deptLedgerSummary[k].expense; });

    let pendingDonorsFeed = donations.filter(d => d.remarks && d.remarks.toLowerCase().includes('pending')).map(d => ({ name: d.name, ref: d.slipNo }));

    res.json({
        success: true,
        data: {
            totalIncome: totalInc, totalExpense: totalExp,
            incomeCash: cashInc, incomeBank: bankInc,
            assignedStudents, unassignedStudents,
            totalDonors: totalUniqueDonors,
            deptLedgerSummary, pendingDonorsFeed
        }
    });
});

// Port Vercel ke mutabiq dynamic rakha hai
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => { console.log(`Al Khalil Main Node Hub running on Port ${PORT}`); });