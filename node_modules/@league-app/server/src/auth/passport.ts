import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { query } from '../db';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackURL: '/auth/google/callback',
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const displayName = profile.displayName ?? '';
        const email = profile.emails?.[0]?.value ?? '';

        // Upsert user: insert or update display_name and email on conflict
        const result = await query<{
          id: string;
          google_id: string;
          display_name: string;
          email: string;
        }>(
          `INSERT INTO users (google_id, display_name, email)
           VALUES ($1, $2, $3)
           ON CONFLICT (google_id)
           DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email
           RETURNING id, google_id, display_name, email`,
          [googleId, displayName, email]
        );

        const row = result.rows[0];
        const user: Express.User = {
          id: row.id,
          displayName: row.display_name,
          email: row.email,
        };

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const result = await query<{
      id: string;
      display_name: string;
      email: string;
    }>(
      `SELECT id, display_name, email FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return done(null, false);
    }

    const row = result.rows[0];
    const user: Express.User = {
      id: row.id,
      displayName: row.display_name,
      email: row.email,
    };

    return done(null, user);
  } catch (err) {
    return done(err as Error);
  }
});

export default passport;
