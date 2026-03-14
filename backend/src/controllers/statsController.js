const pool = require('../config/db');

exports.getLeaderboard = async (req, res) => {
    try {
        const query = `
            SELECT 
                u.wallet_address, 
                u.username, 
                SUM(d.amount::float) as total_savings, 
                d.token_symbol, 
                COUNT(d.tx_hash) as weeks,
                d.streak_id,
                COALESCE(sg.goal_description, 'Unnamed Plan') as goal_description
            FROM users u
            JOIN deposit_history d ON u.wallet_address = d.wallet_address
            LEFT JOIN streak_goals sg ON u.wallet_address = sg.wallet_address AND d.streak_id = sg.streak_id
            WHERE sg.is_withdrawn = FALSE OR sg.is_withdrawn IS NULL
            GROUP BY u.wallet_address, u.username, d.token_symbol, d.streak_id, sg.goal_description
            ORDER BY total_savings DESC
            LIMIT 20;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const tvlQuery = `
            SELECT COALESCE(SUM(CASE WHEN token_symbol = 'USDT' THEN amount::float ELSE 0 END), 0) as usdt_tvl,
                   COALESCE(SUM(CASE WHEN token_symbol = 'INJ' THEN amount::float ELSE 0 END), 0) as inj_tvl,
                   COUNT(DISTINCT wallet_address) as active_savers,
                   COUNT(*) as total_deposits
            FROM deposit_history;
        `;
        const result = await pool.query(tvlQuery);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
};
