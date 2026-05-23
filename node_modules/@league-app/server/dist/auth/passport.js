"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const db_1 = require("../db");
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackURL: '/auth/google/callback',
}, async (_accessToken, _refreshToken, profile, done) => {
    try {
        const googleId = profile.id;
        const displayName = profile.displayName ?? '';
        const email = profile.emails?.[0]?.value ?? '';
        // Upsert user: insert or update display_name and email on conflict
        const result = await (0, db_1.query)(`INSERT INTO users (google_id, display_name, email)
           VALUES ($1, $2, $3)
           ON CONFLICT (google_id)
           DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email
           RETURNING id, google_id, display_name, email`, [googleId, displayName, email]);
        const row = result.rows[0];
        const user = {
            id: row.id,
            displayName: row.display_name,
            email: row.email,
        };
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
}));
passport_1.default.serializeUser((user, done) => {
    done(null, user.id);
});
passport_1.default.deserializeUser(async (id, done) => {
    try {
        const result = await (0, db_1.query)(`SELECT id, display_name, email FROM users WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return done(null, false);
        }
        const row = result.rows[0];
        const user = {
            id: row.id,
            displayName: row.display_name,
            email: row.email,
        };
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
});
exports.default = passport_1.default;
//# sourceMappingURL=passport.js.map