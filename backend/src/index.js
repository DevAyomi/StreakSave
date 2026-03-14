const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const streakRoutes = require('./routes/streakRoutes');
const walletRoutes = require('./routes/walletRoutes');
const statsRoutes = require('./routes/statsRoutes');
const { syncEvents } = require('./services/syncService');
const { monitorManagedWallets } = require('./services/monitorService');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'].filter(Boolean);
app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/streak', streakRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api', statsRoutes);

app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
    syncEvents().catch(console.error);
    monitorManagedWallets().catch(console.error);
});
