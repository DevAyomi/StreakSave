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
const allowedOrigins = [
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : null,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000'
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        const normalizedOrigin = origin.replace(/\/$/, '');
        if (allowedOrigins.includes(normalizedOrigin)) {
            callback(null, true);
        } else {
            console.log(`CORS blocked for origin: ${origin}`);
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
