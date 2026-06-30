const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

const dbPath = path.join(__dirname, 'database_store_v8.json');

let donationsDB = [];
let expensesDB = [];
let studentsDB = [];
let usersDB = [
    {user: "accounts", pass: "admin123", role: "admin"},
    {user: "welfare1", pass: "user123", role: "user"},
    {user: "welfare2", pass: "user123", role: "user"},
    {user: "welfare3", pass: "user123", role: "user"}
];

let dynamicConfig = {
    departments: ["Food/Ration", "Clothes", "General Fund", "Kafalat", "Makatib e Qurania", "Medical Aid", "Water Project", "Emergency Relief", "Education Support", "Sadqa e Jaria"],
    categories: ["Zakat", "Sadqa", "Atia", "Kafalat Fixed"],
    expenseSources: ["Cash Account", "Bank Account", "Petty Cash"],
    expenseAreas: ["Karachi Central", "Lyari", "Orangi Town", "Korangi", "Malir"]
};

function loadLocalDatabase() {
    if (fs.existsSync(dbPath)) {
        try {
            const rawData = fs.readFileSync(dbPath);
            const parsed = JSON.parse(rawData);
            donationsDB = parsed.donations || [];
            expensesDB = parsed.expenses || [];
            studentsDB = parsed.students || [];
            if(parsed.users && parsed.users.length > 0) usersDB = parsed.users;
            if(parsed.dynamicConfig) dynamicConfig = parsed.dynamicConfig;
            console.log("--> Al Khalil Database Map Loaded Successfully!");
        } catch (e) { console.log("Fresh initialization..."); }
    }
}

function saveLocalDatabase() {
    const dataToSave = { donations: donationsDB, expenses: expensesDB, students: studentsDB, users: usersDB, dynamicConfig };
    fs.writeFileSync(dbPath, JSON.stringify(dataToSave, null, 2));
}

loadLocalDatabase();

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'dashboard.html')); });
app.get('/api/settings/config', (req, res) => { res.json(dynamicConfig); });

app.post('/api/settings/config/add', (req, res) => {
    const { type, value } = req.body;
    if(dynamicConfig[type] && !dynamicConfig[type].includes(value)) {
        dynamicConfig[type].push(value);
        saveLocalDatabase();
    }
    res.json({ success: true, config: dynamicConfig });
});

app.post('/api/donations', (req, res) => {
    loadLocalDatabase();
    const d = req.body;
    const cleanUser = d.nodeUser ? d.nodeUser.toUpperCase() : "NX";
    
    let genCount = donationsDB.filter(x => x.slipNo && x.slipNo.startsWith('GEN-')).length;
    let sponCount = donationsDB.filter(x => x.slipNo && x.slipNo.startsWith('SPON-')).length;
    let donorCount = [...new Set(donationsDB.map(x => x.donorCode))].length;

    let finalSlipNo = d.slipMode === "Manual" ? d.manualSlipNo : 
        (d.department === "Kafalat" ? `SPON-${cleanUser}-${5001 + sponCount}` : `GEN-${cleanUser}-${1001 + genCount}`);
    
    let finalDonorCode = d.donorCode || `DONOR-${cleanUser}-${7001 + donorCount}`;

    const record = {
        signatureId: "DON-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
        slipNo: finalSlipNo, donorCode: finalDonorCode, name: d.donorName || "Anonymous Donor",
        department: d.department, amount: parseFloat(d.amount) || 0,
        category: d.category, payMode: d.payMode, bankName: d.bankName || "-",
        bankTid: d.bankTid || "-", date: d.date, remarks: d.remarks || "",
        allocatedStudents: d.allocatedStudents || []
    };

    if(d.allocatedStudents && d.allocatedStudents.length > 0) {
        d.allocatedStudents.forEach(stuId => {
            let matchStu = studentsDB.find(s => s.signatureId === stuId);
            if(matchStu) {
                matchStu.allottedDonorCode = finalDonorCode;
                matchStu.allottedDonorName = d.donorName;
            }
        });
    }

    donationsDB.push(record);
    saveLocalDatabase();
    res.json({ success: true, data: record });
});

app.post('/api/expenses', (req, res) => {
    loadLocalDatabase();
    const e = req.body;
    const record = {
        signatureId: "EXP-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
        title: e.title, description: e.description || "", department: e.department, 
        area: e.area, source: e.source, amount: parseFloat(e.amount) || 0, date: e.date
    };
    expensesDB.push(record);
    saveLocalDatabase();
    res.json({ success: true, data: record });
});

app.get('/api/students/list', (req, res) => { loadLocalDatabase(); res.json({ students: studentsDB }); });

app.post('/api/students', (req, res) => {
    loadLocalDatabase();
    const s = req.body;
    studentsDB.push({ 
        signatureId: "STU-" + Date.now() + Math.floor(Math.random() * 100), 
        name: s.name, class: s.class, school: s.school, 
        allottedDonorCode: null, allottedDonorName: null 
    });
    saveLocalDatabase();
    res.json({ success: true });
});

app.post('/api/students/deallocate', (req, res) => {
    loadLocalDatabase();
    const { studentId } = req.body;
    let matchStu = studentsDB.find(s => s.signatureId === studentId);
    if(matchStu) {
        matchStu.allottedDonorCode = null;
        matchStu.allottedDonorName = null;
        saveLocalDatabase();
        res.json({ success: true });
    } else { res.json({ success: false }); }
});

app.get('/api/donors/master-list', (req, res) => {
    loadLocalDatabase();
    let trackingDonors = {};
    donationsDB.forEach(d => {
        if(!trackingDonors[d.donorCode]) { trackingDonors[d.donorCode] = { code: d.donorCode, name: d.name, department: d.department, category: d.category, total: 0 }; }
        trackingDonors[d.donorCode].total += d.amount;
    });
    res.json({ donors: Object.values(trackingDonors) });
});

app.get('/api/reports/engine', (req, res) => {
    loadLocalDatabase();
    const { dept } = req.query;
    let target = [];
    donationsDB.forEach(d => {
        if(dept === 'All' || d.department === dept) { target.push({ date: d.date, ref: d.slipNo, profile: d.name, dept: d.department, type: d.category, mode: d.payMode, income: d.amount, expense: 0 }); }
    });
    expensesDB.forEach(e => {
        if(dept === 'All' || e.department === dept) { target.push({ date: e.date, ref: "EXP-LOG", profile: e.title, dept: e.department, type: e.description, mode: e.source, income: 0, expense: e.amount }); }
    });
    res.json({ records: target.sort((a,b) => new Date(b.date) - new Date(a.date)) });
});

app.get('/api/reports/summary', (req, res) => {
    loadLocalDatabase();
    
    let cashInc = donationsDB.filter(d => d.payMode === 'Cash').reduce((sum, d) => sum + d.amount, 0);
    let bankInc = donationsDB.filter(d => d.payMode === 'Bank').reduce((sum, d) => sum + d.amount, 0);
    let totalInc = cashInc + bankInc;

    let cashExp = expensesDB.filter(e => e.source.includes('Cash')).reduce((sum, e) => sum + e.amount, 0);
    let bankExp = expensesDB.filter(e => e.source.includes('Bank')).reduce((sum, e) => sum + e.amount, 0);
    let totalExp = expensesDB.reduce((sum, e) => sum + e.amount, 0);

    let assignedStudents = studentsDB.filter(s => s.allottedDonorCode !== null).length;
    let unassignedStudents = studentsDB.filter(s => s.allottedDonorCode === null).length;
    let totalUniqueDonors = [...new Set(donationsDB.map(x => x.donorCode))].length;

    const deptLedgerSummary = {};
    dynamicConfig.departments.forEach(dept => { deptLedgerSummary[dept] = { income: 0, expense: 0, remaining: 0 }; });
    donationsDB.forEach(d => { if(deptLedgerSummary[d.department]) deptLedgerSummary[d.department].income += d.amount; });
    expensesDB.forEach(e => { if(deptLedgerSummary[e.department]) deptLedgerSummary[e.department].expense += e.amount; });
    Object.keys(deptLedgerSummary).forEach(k => { deptLedgerSummary[k].remaining = deptLedgerSummary[k].income - deptLedgerSummary[k].expense; });

    let pendingDonorsFeed = donationsDB.filter(d => d.remarks.toLowerCase().includes('pending')).map(d => ({ name: d.name, ref: d.slipNo }));

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

app.listen(5000, () => { console.log("Al Khalil Main Node Hub running on Port 5000"); });